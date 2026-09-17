import 'server-only';
import type { Session } from '@/lib/auth/session';
import { requireActor, type ApiPrincipal } from './authenticate';

/**
 * Adapt an API principal to the `Session` the passport service expects.
 *
 * The service layer (`lib/passport/service`) takes a `Session` because every
 * mutation it performs has to name an actor and a role in the audit chain. An
 * API key has both — the person who minted it — so rather than forking the
 * service into a session path and a key path, which is how validation and
 * audit rules drift apart, the key is presented as the session of its creator.
 *
 * The key's scopes are checked before this is ever called; the role carried
 * here is what decides whether a state transition is *permitted*, which is a
 * separate question. A key with `passports:publish` minted by a product
 * manager still cannot approve a passport, because the product manager cannot.
 */
export function actingSession(principal: ApiPrincipal): Session {
  const actor = requireActor(principal);
  return {
    userId: actor.userId,
    tenantId: principal.tenantId,
    role: actor.role,
    email: actor.email,
    // Distinguishable in the audit log from the same person working in the
    // console, which matters when someone asks why a passport changed at 03:00.
    name: `${actor.name} (via API key “${principal.keyName}”)`,
  };
}
