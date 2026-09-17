/**
 * Webhook events.
 *
 * The set is small and closed on purpose. An event per database write produces
 * a feed nobody can subscribe to selectively and nobody can reason about; these
 * five are the moments an external system genuinely has to react to — a
 * passport becoming publicly resolvable, its content changing after that, it
 * being pulled from the market, a credential being signed over it, and a
 * supplier returning data someone is waiting on.
 */
export const WEBHOOK_EVENTS = [
  'passport.published',
  'passport.updated',
  'passport.recalled',
  'credential.issued',
  'data_request.submitted',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const EVENT_DESCRIPTIONS: Record<WebhookEvent, string> = {
  'passport.published':
    'A passport became resolvable at its public URL. Carries the DPP ID, version and canonical hash.',
  'passport.updated':
    'A new version was written to a passport that is already published. The public URL now serves different content.',
  'passport.recalled':
    'A product was recalled. Carries the severity and the instructions shown to owners. Act on this one.',
  'credential.issued': 'A verifiable credential was signed over a passport version.',
  'data_request.submitted': 'A supplier submitted their answers to a data request.',
};

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/**
 * The delivered body.
 *
 * `id` is stable across retries so a receiver can deduplicate — at-least-once
 * delivery is the only honest guarantee over HTTP, and a receiver that is not
 * told which deliveries are the same event has no way to be idempotent.
 */
export interface WebhookPayload {
  id: string;
  type: WebhookEvent;
  createdAt: string;
  tenantId: string;
  data: Record<string, unknown>;
}
