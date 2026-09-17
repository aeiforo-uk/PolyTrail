import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { webhookDeliveries, webhookEndpoints } from '@/lib/db/schema';
import { badRequest, notFound } from '@/lib/api/errors';
import { randomToken } from '@/lib/auth/password';
import { recordAudit } from '@/lib/audit/record';
import type { Session } from '@/lib/auth/session';
import { deliver, type DeliveryOutcome } from './deliver';
import { isWebhookEvent, type WebhookEvent, type WebhookPayload } from './events';
import { assertOutboundUrl } from '@/lib/security/outbound-url';

export interface WebhookEndpointSummary {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  lastDeliveryAt: Date | null;
  consecutiveFailures: number;
  createdAt: Date;
}

export async function listWebhookEndpoints(tenantId: string): Promise<WebhookEndpointSummary[]> {
  return db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      description: webhookEndpoints.description,
      events: webhookEndpoints.events,
      active: webhookEndpoints.active,
      lastDeliveryAt: webhookEndpoints.lastDeliveryAt,
      consecutiveFailures: webhookEndpoints.consecutiveFailures,
      createdAt: webhookEndpoints.createdAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.tenantId, tenantId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export interface DeliveryLogRow {
  id: string;
  endpointId: string;
  endpointUrl: string;
  event: string;
  responseStatus: number | null;
  error: string | null;
  attempt: number;
  deliveredAt: Date | null;
  createdAt: Date;
}

export async function listDeliveries(tenantId: string, limit = 50): Promise<DeliveryLogRow[]> {
  return db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      endpointUrl: webhookEndpoints.url,
      event: webhookDeliveries.event,
      responseStatus: webhookDeliveries.responseStatus,
      error: webhookDeliveries.error,
      attempt: webhookDeliveries.attempt,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(eq(webhookEndpoints.tenantId, tenantId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

export interface CreateEndpointInput {
  url: string;
  description?: string;
  events: string[];
}

export interface CreatedEndpoint {
  id: string;
  url: string;
  /**
   * The signing secret, returned once on creation. Stored in the clear because
   * the server has to compute the same HMAC the receiver does — unlike an API
   * key, there is no one-way form of it that still works.
   */
  secret: string;
}

export async function createWebhookEndpoint(
  session: Session,
  input: CreateEndpointInput,
): Promise<CreatedEndpoint> {
  const tenantId = session.tenantId;
  if (!tenantId) throw badRequest('Your account is not attached to a workspace.');

  const url = assertOutboundUrl(input.url, {
    httpsMessage:
      'Webhook endpoints must be HTTPS. A signed payload over plain HTTP is still readable in transit.',
  });

  const events = [...new Set(input.events)].filter(isWebhookEvent);
  if (events.length === 0) {
    throw badRequest('Choose at least one event for this endpoint to receive.');
  }

  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      tenantId,
      url,
      description: input.description?.trim() || null,
      events,
      secret: randomToken(32),
      active: true,
    })
    .returning({ id: webhookEndpoints.id, url: webhookEndpoints.url, secret: webhookEndpoints.secret });

  await recordAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    // There is no `webhook.*` action in the audit vocabulary yet, and inventing
    // one here would fail the enum. An endpoint is workspace configuration, so
    // it is recorded as such with the detail in the metadata.
    action: 'tenant.updated',
    subjectType: 'webhook_endpoint',
    subjectId: row!.id,
    metadata: { change: 'webhook_endpoint.created', url, events },
  });

  return row!;
}

export async function setWebhookEndpointActive(
  session: Session,
  endpointId: string,
  active: boolean,
) {
  const tenantId = session.tenantId;
  if (!tenantId) throw badRequest('Your account is not attached to a workspace.');

  const [row] = await db
    .update(webhookEndpoints)
    // Re-enabling clears the failure count, so a fixed endpoint gets a full
    // budget rather than being switched off again by the next single failure.
    .set({ active, ...(active ? { consecutiveFailures: 0 } : {}) })
    .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.tenantId, tenantId)))
    .returning({ id: webhookEndpoints.id, url: webhookEndpoints.url });

  if (!row) throw notFound('That endpoint does not exist in this workspace.');

  await recordAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'tenant.updated',
    subjectType: 'webhook_endpoint',
    subjectId: row.id,
    metadata: { change: active ? 'webhook_endpoint.enabled' : 'webhook_endpoint.disabled', url: row.url },
  });

  return row;
}

export async function deleteWebhookEndpoint(session: Session, endpointId: string) {
  const tenantId = session.tenantId;
  if (!tenantId) throw badRequest('Your account is not attached to a workspace.');

  const [row] = await db
    .delete(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.tenantId, tenantId)))
    .returning({ id: webhookEndpoints.id, url: webhookEndpoints.url });

  if (!row) throw notFound('That endpoint does not exist in this workspace.');

  await recordAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'tenant.updated',
    subjectType: 'webhook_endpoint',
    subjectId: row.id,
    metadata: { change: 'webhook_endpoint.deleted', url: row.url },
  });

  return row;
}

/**
 * Send a test delivery, synchronously, and report what happened.
 *
 * Synchronous on purpose: the person clicking "send test" is standing in front
 * of their own server logs and wants the status code now. Real events go
 * through `dispatchWebhook`, which does not block.
 */
export async function sendTestDelivery(
  tenantId: string,
  endpointId: string,
): Promise<DeliveryOutcome> {
  const [endpoint] = await db
    .select({
      id: webhookEndpoints.id,
      tenantId: webhookEndpoints.tenantId,
      url: webhookEndpoints.url,
      secret: webhookEndpoints.secret,
      consecutiveFailures: webhookEndpoints.consecutiveFailures,
    })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.tenantId, tenantId)))
    .limit(1);

  if (!endpoint) throw notFound('That endpoint does not exist in this workspace.');

  const payload: WebhookPayload = {
    id: `evt_test_${randomToken(8)}`,
    // Typed as a real event so a receiver's routing code is exercised, with a
    // flag in the body so it cannot be mistaken for an actual publication.
    type: 'passport.published' satisfies WebhookEvent,
    createdAt: new Date().toISOString(),
    tenantId,
    data: {
      test: true,
      dppId: 'TEST000000000000',
      version: 1,
      dataHash: '0x' + '0'.repeat(64),
      note: 'Test delivery from the Polytrail console. No passport was published.',
    },
  };

  return deliver(endpoint, payload);
}

/**
 * Reject anything that is not a plain HTTPS URL to a routable host.
 *
 * A webhook endpoint is an outbound request this server makes on a customer's
 * instruction, which is the classic server-side request forgery shape: without
 * this, a tenant could point an endpoint at `http://169.254.169.254/` and read
 * the cloud metadata service out of their own delivery log.
 */

