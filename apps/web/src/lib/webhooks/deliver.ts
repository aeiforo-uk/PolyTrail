import 'server-only';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { webhookDeliveries, webhookEndpoints } from '@/lib/db/schema';
import { SIGNATURE_HEADER, EVENT_HEADER, DELIVERY_HEADER, signWebhook } from './signature';
import type { WebhookPayload } from './events';

/**
 * Delivery.
 *
 * Retries follow a fixed schedule rather than a doubling loop in memory,
 * because the process that sent the first attempt is gone by the time the
 * second is due — this runs on a serverless platform, and an in-process
 * `setTimeout` chain is a retry policy that only works on a laptop. The
 * schedule is stored implicitly: an attempt's row records when it happened and
 * which attempt it was, and `dueDeliveries` reconstructs what is owed.
 *
 * Six attempts over roughly eight hours. Past that, an endpoint is either
 * misconfigured or its owner has stopped caring, and continuing to retry is
 * just an outbound request loop nobody reads.
 */

/** Seconds to wait after attempt *n* before attempt *n+1*. */
const BACKOFF_SECONDS = [60, 300, 1_800, 7_200, 21_600] as const;
export const MAX_ATTEMPTS = BACKOFF_SECONDS.length + 1;

/** Consecutive failures across deliveries before an endpoint is switched off. */
export const FAILURE_BUDGET = 10;

const TIMEOUT_MS = 10_000;

/** Ignore anything older than this when looking for outstanding retries. */
const RETRY_HORIZON_MS = 24 * 3_600_000;

export interface EndpointRow {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  consecutiveFailures: number;
}

export interface DeliveryOutcome {
  ok: boolean;
  status: number | null;
  error: string | null;
  attempt: number;
  /** Seconds until the next attempt, or null when there will not be one. */
  retryInSeconds: number | null;
}

export async function deliver(
  endpoint: EndpointRow,
  payload: WebhookPayload,
  attempt = 1,
): Promise<DeliveryOutcome> {
  // Serialised once and signed over the exact bytes sent, because a receiver
  // that re-serialises before verifying gets a different string and a failed
  // signature. The verification recipe in `signature.ts` says so explicitly.
  const body = JSON.stringify(payload);

  let status: number | null = null;
  let error: string | null = null;

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Polytrail-Webhooks/1.0',
        [SIGNATURE_HEADER]: signWebhook(endpoint.secret, body),
        [EVENT_HEADER]: payload.type,
        [DELIVERY_HEADER]: payload.id,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    });
    status = response.status;
    if (!response.ok) {
      // Read a little of the body: an endpoint that answers 400 usually says
      // why, and that sentence is what makes the delivery log worth opening.
      error = (await response.text().catch(() => '')).slice(0, 500) || `HTTP ${response.status}`;
    }
  } catch (cause) {
    error = describeFailure(cause);
  }

  const ok = status !== null && status >= 200 && status < 300;
  const retryInSeconds = ok ? null : (BACKOFF_SECONDS[attempt - 1] ?? null);

  await db.insert(webhookDeliveries).values({
    endpointId: endpoint.id,
    event: payload.type,
    payload: payload as unknown as Record<string, unknown>,
    responseStatus: status,
    error,
    attempt,
    deliveredAt: ok ? new Date() : null,
  });

  if (ok) {
    await db
      .update(webhookEndpoints)
      .set({ consecutiveFailures: 0, lastDeliveryAt: new Date() })
      .where(eq(webhookEndpoints.id, endpoint.id));
  } else {
    const failures = endpoint.consecutiveFailures + 1;
    await db
      .update(webhookEndpoints)
      .set({
        consecutiveFailures: failures,
        lastDeliveryAt: new Date(),
        // Switched off, not deleted. The endpoint, its events and its delivery
        // history stay visible in the console so the owner can see what broke
        // and turn it back on once they have fixed it.
        ...(failures >= FAILURE_BUDGET ? { active: false } : {}),
      })
      .where(eq(webhookEndpoints.id, endpoint.id));
  }

  return { ok, status, error, attempt, retryInSeconds };
}

export interface DueDelivery {
  endpoint: EndpointRow;
  payload: WebhookPayload;
  nextAttempt: number;
}

/**
 * Deliveries owed a retry right now.
 *
 * Reconstructed rather than queued, because the schema records attempts and
 * not intentions. The cost is this scan: recent rows for active endpoints,
 * grouped in memory by delivery ID to find the latest attempt of each. It is
 * bounded by `scanLimit` and by a 24-hour horizon, which is fine at the volumes
 * a passport platform generates. A `next_attempt_at` column would turn it into
 * an index lookup, and is the right change if this ever gets hot.
 */
export async function dueDeliveries(scanLimit = 500): Promise<DueDelivery[]> {
  const rows = await db
    .select({
      deliveryId: webhookDeliveries.id,
      attempt: webhookDeliveries.attempt,
      payload: webhookDeliveries.payload,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
      endpointId: webhookEndpoints.id,
      tenantId: webhookEndpoints.tenantId,
      url: webhookEndpoints.url,
      secret: webhookEndpoints.secret,
      consecutiveFailures: webhookEndpoints.consecutiveFailures,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(
      and(
        eq(webhookEndpoints.active, true),
        gt(webhookDeliveries.createdAt, new Date(Date.now() - RETRY_HORIZON_MS)),
      ),
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(scanLimit);

  // Rows arrive newest first, so the first row seen for a delivery ID is its
  // latest attempt and every later row for that ID can be ignored.
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const deliveryId = readDeliveryId(row.payload);
    if (!deliveryId || latest.has(deliveryId)) continue;
    latest.set(deliveryId, row);
  }

  const now = Date.now();
  const due: DueDelivery[] = [];

  for (const row of latest.values()) {
    if (row.deliveredAt) continue;
    if (row.attempt >= MAX_ATTEMPTS) continue;
    const wait = BACKOFF_SECONDS[row.attempt - 1];
    if (wait === undefined) continue;
    if (row.createdAt.getTime() + wait * 1000 > now) continue;

    due.push({
      endpoint: {
        id: row.endpointId,
        tenantId: row.tenantId,
        url: row.url,
        secret: row.secret,
        consecutiveFailures: row.consecutiveFailures,
      },
      payload: row.payload as unknown as WebhookPayload,
      nextAttempt: row.attempt + 1,
    });
  }

  return due;
}

/** Retry everything that is due. Returns a count of each outcome. */
export async function drainDueDeliveries(scanLimit = 500) {
  const due = await dueDeliveries(scanLimit);
  let delivered = 0;
  let failed = 0;

  for (const item of due) {
    const outcome = await deliver(item.endpoint, item.payload, item.nextAttempt);
    if (outcome.ok) delivered += 1;
    else failed += 1;
  }

  return { attempted: due.length, delivered, failed };
}

function readDeliveryId(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'id' in payload) {
    const id = (payload as { id: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/**
 * A failure message the endpoint's owner can act on. `fetch` throws `TypeError:
 * fetch failed` for DNS, TLS and connection refusals alike, which tells nobody
 * anything, so the underlying cause is unwrapped.
 */
function describeFailure(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === 'TimeoutError') {
    return `No response within ${TIMEOUT_MS / 1000}s.`;
  }
  if (cause instanceof Error) {
    const inner = (cause as { cause?: unknown }).cause;
    if (inner instanceof Error) return `${cause.message}: ${inner.message}`;
    return cause.message;
  }
  return String(cause);
}
