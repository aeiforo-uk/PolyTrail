import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { recordAudit } from '@/lib/audit/record';
import { badRequest, notFound } from '@/lib/api/errors';
import type { Session } from '@/lib/auth/session';
import { mintApiKey } from './mint';
import { API_SCOPES, isApiScope, type ApiScope } from './scopes';

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export async function listApiKeys(tenantId: string): Promise<ApiKeySummary[]> {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(desc(apiKeys.createdAt));
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  /** Null means no expiry, which the console warns about rather than forbids. */
  expiresInDays?: number | null;
}

/**
 * Mint a key.
 *
 * Returns the secret exactly once. Nothing downstream — not the audit entry,
 * not the returned row, not a log line — carries anything but the prefix, so
 * losing it genuinely means minting another.
 */
export async function createApiKey(session: Session, input: CreateApiKeyInput) {
  const tenantId = session.tenantId;
  if (!tenantId) throw badRequest('Your account is not attached to a workspace.');

  const name = input.name.trim();
  if (!name) throw badRequest('Give the key a name, so you can tell it from the others later.');
  if (name.length > 255) throw badRequest('That name is too long. Keep it under 255 characters.');

  const scopes = [...new Set(input.scopes)].filter(isApiScope);
  if (scopes.length === 0) {
    throw badRequest(
      `Choose at least one scope. Available scopes: ${API_SCOPES.join(', ')}.`,
    );
  }

  const days = input.expiresInDays ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
    throw badRequest('An expiry must be a whole number of days between 1 and 3650.');
  }
  const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000);

  const minted = mintApiKey();

  const [row] = await db
    .insert(apiKeys)
    .values({
      tenantId,
      name,
      prefix: minted.prefix,
      keyHash: minted.keyHash,
      scopes,
      createdBy: session.userId,
      expiresAt,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      createdAt: apiKeys.createdAt,
      expiresAt: apiKeys.expiresAt,
    });

  await recordAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'api_key.created',
    subjectType: 'api_key',
    subjectId: row!.id,
    metadata: { name, prefix: minted.prefix, scopes, expiresAt: expiresAt?.toISOString() ?? null },
  });

  return { key: minted.key, row: row! };
}

/**
 * Revoke rather than delete. The audit trail refers to key IDs, and a deleted
 * row turns "which key published this?" into an unanswerable question.
 */
export async function revokeApiKey(session: Session, keyId: string) {
  const tenantId = session.tenantId;
  if (!tenantId) throw badRequest('Your account is not attached to a workspace.');

  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix });

  if (!row) throw notFound('That key does not exist, or it was already revoked.');

  await recordAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'api_key.revoked',
    subjectType: 'api_key',
    subjectId: row.id,
    metadata: { name: row.name, prefix: row.prefix },
  });

  return row;
}

export type { ApiScope };
