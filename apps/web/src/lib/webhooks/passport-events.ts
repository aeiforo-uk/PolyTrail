import 'server-only';
import { dispatchWebhook } from './dispatch';

/**
 * Passport events, in one place.
 *
 * These are called from the v1 API routes today. They belong one layer down —
 * in `lib/passport/service`, alongside the audit entry, so that a publish from
 * the console fires the same webhook as a publish over the API. Until that call
 * is added there, a console publish is not delivered to subscribers, and that
 * is a real gap rather than an acceptable difference.
 *
 * The functions take primitives rather than database rows so that adding the
 * call inside a transaction is a one-line import with no circular dependency
 * back into the webhook layer's own schema use.
 */

export interface PassportEventFacts {
  dppId: string;
  version: number;
  dataHash: string | null;
  status: string;
  productName?: string | null;
  passportUrl: string;
}

export async function emitPassportPublished(
  tenantId: string,
  facts: PassportEventFacts,
): Promise<void> {
  await dispatchWebhook(tenantId, 'passport.published', { ...facts });
}

/**
 * Only fires for a passport that is already public. A draft being edited is
 * not an event any external system is waiting on, and emitting it would make
 * the feed mostly noise from passports nobody can read yet.
 */
export async function emitPassportUpdated(
  tenantId: string,
  facts: PassportEventFacts,
): Promise<void> {
  await dispatchWebhook(tenantId, 'passport.updated', { ...facts });
}

export interface RecallFacts extends PassportEventFacts {
  severity: string | null;
  reason: string | null;
  instructions: string | null;
  recalledAt: string | null;
}

export async function emitPassportRecalled(
  tenantId: string,
  facts: RecallFacts,
): Promise<void> {
  await dispatchWebhook(tenantId, 'passport.recalled', { ...facts });
}

export async function emitDataRequestSubmitted(
  tenantId: string,
  facts: { dataRequestId: string; partnerName: string | null; passportIds: string[] },
): Promise<void> {
  await dispatchWebhook(tenantId, 'data_request.submitted', { ...facts });
}
