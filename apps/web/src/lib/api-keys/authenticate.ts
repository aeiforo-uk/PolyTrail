import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/lib/db/client';
import { apiKeys, users } from '@/lib/db/schema';
import { timingSafeEqual } from '@/lib/crypto/canonical';
import { forbidden, unauthorized } from '@/lib/api/errors';
import type { Role } from '@/lib/auth/roles';
import { fingerprint, looksLikeApiKey, DISPLAY_PREFIX_LENGTH } from './mint';
import { hasScopes, type ApiScope } from './scopes';

/**
 * The identity behind an API request.
 *
 * A key acts *on behalf of the person who minted it*, the way a personal access
 * token does. That is what makes the audit chain answerable: every write the
 * API performs is attributable to a named human who still holds a role in the
 * workspace, not to an anonymous integration. The cost is that revoking a
 * user's access must also invalidate their keys, which `resolveActor` enforces
 * by refusing to act for a deleted or suspended user.
 */
export interface ApiPrincipal {
  keyId: string;
  tenantId: string;
  keyName: string;
  scopes: readonly string[];
  /** The user the key acts for. `null` when the creator is gone — reads only. */
  actor: { userId: string; name: string; email: string; role: Role } | null;
}

/** Only touch `last_used_at` when it is this stale, to avoid a write per request. */
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Authenticate an API request.
 *
 * Accepts `Authorization: Bearer <key>` and, for clients that cannot set an
 * Authorization header, `X-API-Key`. Throws an `ApiError` — never returns a
 * partial or anonymous principal, so a route cannot forget to check.
 */
export async function authenticateApiKey(request: Request): Promise<ApiPrincipal> {
  const presented = extractKey(request);
  if (!presented) {
    throw unauthorized(
      'Provide an API key as `Authorization: Bearer pt_live_…`. Create one in the console under Developers.',
    );
  }

  if (!looksLikeApiKey(presented)) {
    throw unauthorized('That is not a Polytrail API key. Keys begin with `pt_live_`.');
  }

  // Look up by the display prefix, not by the hash, so the secret comparison
  // happens here in constant time rather than inside an index probe whose
  // timing we do not control. The prefix is only 24 bits of entropy, so this
  // can return more than one row across the estate; every candidate is compared.
  const candidates = await db
    .select({
      id: apiKeys.id,
      tenantId: apiKeys.tenantId,
      name: apiKeys.name,
      keyHash: apiKeys.keyHash,
      scopes: apiKeys.scopes,
      createdBy: apiKeys.createdBy,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.prefix, presented.slice(0, DISPLAY_PREFIX_LENGTH)));

  const offered = fingerprint(presented);
  let matched: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    // No early break: comparing every candidate keeps the work constant in the
    // number of rows as well as in the bytes.
    if (timingSafeEqual(candidate.keyHash, offered)) matched = candidate;
  }

  if (!matched) throw unauthorized('That API key is not recognised.');

  if (matched.revokedAt) {
    throw unauthorized('That API key was revoked. Create a new one in the console.');
  }
  if (matched.expiresAt && matched.expiresAt.getTime() <= Date.now()) {
    throw unauthorized(
      `That API key expired on ${matched.expiresAt.toISOString().slice(0, 10)}. Create a new one in the console.`,
    );
  }

  const actor = matched.createdBy ? await resolveActor(matched.createdBy, matched.tenantId) : null;

  const stale =
    !matched.lastUsedAt || Date.now() - matched.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS;
  if (stale) {
    const keyId = matched.id;
    const touch = async () => {
      try {
        await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
      } catch (error) {
        console.error('[api-keys] could not record last use', { keyId, error });
      }
    };
    try {
      // Runs after the response is flushed. "When was this key last used" is
      // operational nicety; it must never add latency to, or fail, a request.
      after(touch);
    } catch {
      // `after` needs a request scope. Called from a script or a test there is
      // none, and the update is simply not worth waiting for either way.
      void touch();
    }
  }

  return {
    keyId: matched.id,
    tenantId: matched.tenantId,
    keyName: matched.name,
    scopes: matched.scopes,
    actor,
  };
}

/** Throw unless the key holds every scope the operation declares. */
export function requireScopes(principal: ApiPrincipal, required: readonly ApiScope[]): void {
  if (hasScopes(principal.scopes, required)) return;
  const missing = required.filter((scope) => !principal.scopes.includes(scope));
  throw forbidden(
    `This API key is missing the ${missing.map((s) => `\`${s}\``).join(' and ')} scope. Scopes are fixed when a key is created; mint a new key with the scopes you need.`,
  );
}

/**
 * Writes need a live human to attribute them to. A key whose creator has left
 * keeps working for reads — breaking a retailer's nightly sync because someone
 * changed jobs is worse than the stale attribution — but cannot mutate.
 */
export function requireActor(principal: ApiPrincipal) {
  if (!principal.actor) {
    throw forbidden(
      'This API key can no longer write, because the person who created it no longer has access to the workspace. Mint a replacement key.',
    );
  }
  return principal.actor;
}

async function resolveActor(userId: string, tenantId: string): Promise<ApiPrincipal['actor']> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)))
    .limit(1);

  if (!row || row.status !== 'active') return null;
  return { userId: row.id, name: row.name, email: row.email, role: row.role };
}

function extractKey(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization) {
    const [scheme, ...rest] = authorization.split(' ');
    if (scheme?.toLowerCase() === 'bearer') return rest.join(' ').trim() || null;
    return null;
  }
  return request.headers.get('x-api-key')?.trim() || null;
}
