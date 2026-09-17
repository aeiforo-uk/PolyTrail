import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/lib/db/client';
import { webhookEndpoints } from '@/lib/db/schema';
import { deliver, type EndpointRow } from './deliver';
import type { WebhookEvent, WebhookPayload } from './events';

/**
 * Fan an event out to a workspace's subscribed endpoints.
 *
 * Never blocks and never throws into its caller. A publish must not fail
 * because a retailer's staging server is down — the delivery is recorded as
 * failed and retried on the schedule, which is the whole point of having a
 * delivery table. Anything that makes a webhook able to break the operation
 * that emitted it turns an integration into a availability dependency.
 */
export async function dispatchWebhook(
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  let endpoints: EndpointRow[];
  try {
    const rows = await db
      .select({
        id: webhookEndpoints.id,
        tenantId: webhookEndpoints.tenantId,
        url: webhookEndpoints.url,
        secret: webhookEndpoints.secret,
        events: webhookEndpoints.events,
        consecutiveFailures: webhookEndpoints.consecutiveFailures,
      })
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.active, true)));

    // Subscription is filtered here rather than in SQL: a workspace has a
    // handful of endpoints, and an array-containment predicate that silently
    // stops matching after an events-column type change is a worse trade than
    // one line of JavaScript.
    endpoints = rows.filter((row) => row.events.includes(event));
  } catch (error) {
    console.error('[webhooks] could not load endpoints', { tenantId, event, error });
    return;
  }

  if (endpoints.length === 0) return;

  const payload: WebhookPayload = {
    id: `evt_${randomUUID()}`,
    type: event,
    createdAt: new Date().toISOString(),
    tenantId,
    data,
  };

  runAfterResponse(async () => {
    for (const endpoint of endpoints) {
      try {
        await deliver(endpoint, payload);
      } catch (error) {
        console.error('[webhooks] delivery threw', { endpointId: endpoint.id, event, error });
      }
    }
  });
}

/**
 * Run work once the response is on its way.
 *
 * `after` is only available inside a request; the same dispatch helper is
 * called from scripts and from the retry drain, where the fall-back is simply
 * to run it and not wait.
 */
function runAfterResponse(work: () => Promise<void>): void {
  try {
    after(work);
  } catch {
    void work().catch((error) => console.error('[webhooks] background work failed', error));
  }
}
