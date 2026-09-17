import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { badRequest, conflict, forbidden, notFound } from '@/lib/api/errors';
import type { Session } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { tenants } from '@/lib/db/schema';
import { encryptSecret } from './crypto';
import { CONNECTOR_KINDS, type ConnectorKind, type ConnectorRecord, type ConnectorSummary } from './types';

/**
 * Where connectors are kept.
 *
 * In `tenants.settings.connectors`, keyed by id — not in a table of their own,
 * because `src/lib/db/schema.ts` is not this module's to change. That is a
 * deliberate, temporary compromise and it has costs: no foreign keys, no index,
 * and a row that grows with the number of connectors. A `connectors` table is
 * requested and reported alongside this work.
 *
 * Writes go through `jsonb_set` on a single key rather than reading the
 * settings object and writing it back, so two people adding a connector at the
 * same time do not overwrite each other — and so nothing else stored under
 * `settings` is disturbed.
 *
 * `tenantId` is on every statement here. In a shared-schema database that
 * predicate is the isolation boundary, and there is no second line of defence.
 */

const ROOT = 'connectors';

export interface ConnectorInput {
  kind: ConnectorKind;
  name: string;
  /** Kind-specific configuration. Stored as JSON, so any plain object goes. */
  settings: object;
  /** Plaintext. Encrypted before it touches the database; never stored raw. */
  secret?: string | null;
}

export async function listConnectors(tenantId: string): Promise<ConnectorSummary[]> {
  const records = await readAll(tenantId);
  return records
    .map(toSummary)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Server-only. The returned record carries the encrypted credential. */
export async function getConnector(
  tenantId: string,
  id: string,
): Promise<ConnectorRecord | null> {
  const records = await readAll(tenantId);
  return records.find((record) => record.id === id) ?? null;
}

export async function createConnector(
  session: Session,
  input: ConnectorInput,
): Promise<ConnectorSummary> {
  const tenantId = requireTenant(session);
  const name = input.name.trim();
  if (!name) throw badRequest('Give the connector a name you will recognise in six months.');
  if (!CONNECTOR_KINDS.includes(input.kind)) throw badRequest('Unknown connector type.');

  const existing = await readAll(tenantId);
  if (existing.some((record) => record.name.toLowerCase() === name.toLowerCase())) {
    throw conflict('A connector with that name already exists.');
  }
  if (existing.length >= 25) {
    throw conflict('This workspace has reached its limit of 25 connectors.');
  }

  const record: ConnectorRecord = {
    id: randomUUID(),
    tenantId,
    kind: input.kind,
    name,
    // Settings are a JSON column: the shape belongs to the connector kind, not
    // to the store, which only has to round-trip it.
    settings: { ...input.settings } as Record<string, unknown>,
    secret: input.secret ? encryptSecret(input.secret) : null,
    createdAt: new Date().toISOString(),
    createdBy: session.userId,
    lastTestedAt: null,
    lastTestOk: null,
  };

  await writeOne(tenantId, record);
  return toSummary(record);
}

export interface ConnectorPatch {
  name?: string;
  settings?: object;
  /**
   * `undefined` leaves the stored credential alone, `null` clears it, a string
   * replaces it. A blank form field must not silently wipe a working token.
   */
  secret?: string | null;
}

export async function updateConnector(
  session: Session,
  id: string,
  patch: ConnectorPatch,
): Promise<ConnectorSummary> {
  const tenantId = requireTenant(session);
  const current = await getConnector(tenantId, id);
  if (!current) throw notFound('That connector does not exist.');

  const next: ConnectorRecord = {
    ...current,
    name: patch.name?.trim() || current.name,
    settings: patch.settings ? ({ ...patch.settings } as Record<string, unknown>) : current.settings,
    secret:
      patch.secret === undefined
        ? current.secret
        : patch.secret === null || patch.secret === ''
          ? null
          : encryptSecret(patch.secret),
  };

  await writeOne(tenantId, next);
  return toSummary(next);
}

export async function deleteConnector(session: Session, id: string): Promise<void> {
  const tenantId = requireTenant(session);
  const current = await getConnector(tenantId, id);
  if (!current) throw notFound('That connector does not exist.');

  await db
    .update(tenants)
    .set({
      settings: sql`coalesce(${tenants.settings}, '{}'::jsonb) #- array[${ROOT}, ${id}]`,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

/** Store the outcome of a connection test so the list can show it. */
export async function recordTestOutcome(
  tenantId: string,
  id: string,
  ok: boolean,
): Promise<void> {
  const current = await getConnector(tenantId, id);
  if (!current) return;
  await writeOne(tenantId, { ...current, lastTestedAt: new Date().toISOString(), lastTestOk: ok });
}

async function readAll(tenantId: string): Promise<ConnectorRecord[]> {
  const [row] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!row) throw notFound('Workspace not found.');

  const bag = (row.settings as Record<string, unknown> | null)?.[ROOT];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return [];

  return Object.values(bag as Record<string, unknown>)
    .filter(isConnectorRecord)
    // Settings are stored per tenant, but a record carrying a tenant id that
    // disagrees with the row it was read from is corrupt and is not returned.
    .filter((record) => record.tenantId === tenantId);
}

async function writeOne(tenantId: string, record: ConnectorRecord): Promise<void> {
  await db
    .update(tenants)
    .set({
      settings: sql`jsonb_set(coalesce(${tenants.settings}, '{}'::jsonb), array[${ROOT}, ${record.id}], ${JSON.stringify(record)}::jsonb, true)`,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

/** Strip the credential. Every path out to a client goes through here. */
export function toSummary(record: ConnectorRecord): ConnectorSummary {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    settings: record.settings,
    hasSecret: record.secret !== null,
    createdAt: record.createdAt,
    lastTestedAt: record.lastTestedAt,
    lastTestOk: record.lastTestOk,
  };
}

function isConnectorRecord(value: unknown): value is ConnectorRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ConnectorRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tenantId === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.kind === 'string' &&
    CONNECTOR_KINDS.includes(candidate.kind as ConnectorKind)
  );
}

function requireTenant(session: Session): string {
  if (!session.tenantId) throw forbidden('Your account is not attached to a workspace.');
  return session.tenantId;
}
