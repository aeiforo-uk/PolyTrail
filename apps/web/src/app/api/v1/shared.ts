import 'server-only';
import { and, desc, eq, isNull, lt, or, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { passportVersions, passports, products } from '@/lib/db/schema';
import { notFound } from '@/lib/api/errors';
import { normalizeDppId, passportUrl } from '@/lib/passport/identifier';
import type { PassportPayload } from '@/lib/passport/schema';

/**
 * Reads shared by the v1 routes.
 *
 * Every function here takes `tenantId` first and filters on it. In a
 * shared-schema database that predicate is the only thing standing between one
 * brand's line sheet and another's, so it is not optional and not inferred.
 */

export interface PassportResource {
  id: string;
  dppId: string;
  passportUrl: string;
  productName: string | null;
  styleNumber: string | null;
  status: string;
  scope: string;
  gtin: string | null;
  serialNumber: string | null;
  batchNumber: string | null;
  sku: string | null;
  colourName: string | null;
  size: string | null;
  version: number;
  publishedVersion: number | null;
  completeness: number;
  dataHash: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The API's representation of a passport. Deliberately not the database row:
 * internal IDs, soft-delete state and tenant keys stay inside.
 */
export function toResource(row: {
  id: string;
  dppId: string;
  productName: string | null;
  styleNumber: string | null;
  status: string;
  scope: string;
  gtin: string | null;
  serialNumber: string | null;
  batchNumber: string | null;
  sku: string | null;
  colourName: string | null;
  size: string | null;
  currentVersion: number;
  publishedVersion: number | null;
  completeness: number;
  dataHash: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PassportResource {
  return {
    id: row.id,
    dppId: row.dppId,
    passportUrl: passportUrl(row.dppId),
    productName: row.productName,
    styleNumber: row.styleNumber,
    status: row.status,
    scope: row.scope,
    gtin: row.gtin,
    serialNumber: row.serialNumber,
    batchNumber: row.batchNumber,
    sku: row.sku,
    colourName: row.colourName,
    size: row.size,
    version: row.currentVersion,
    publishedVersion: row.publishedVersion,
    completeness: row.completeness,
    dataHash: row.dataHash,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const RESOURCE_SELECT = {
  id: passports.id,
  dppId: passports.dppId,
  productName: products.name,
  styleNumber: products.styleNumber,
  status: passports.status,
  scope: passports.scope,
  gtin: passports.gtin,
  serialNumber: passports.serialNumber,
  batchNumber: passports.batchNumber,
  sku: passports.sku,
  colourName: passports.colourName,
  size: passports.size,
  currentVersion: passports.currentVersion,
  publishedVersion: passports.publishedVersion,
  completeness: passports.completeness,
  dataHash: sql<string | null>`(
    select ${passportVersions.dataHash}
    from ${passportVersions}
    where ${passportVersions.passportId} = ${passports.id}
      and ${passportVersions.version} = ${passports.currentVersion}
  )`,
  publishedAt: passports.publishedAt,
  createdAt: passports.createdAt,
  updatedAt: passports.updatedAt,
} as const;

export async function findPassport(tenantId: string, rawDppId: string): Promise<PassportResource> {
  const dppId = normalizeDppId(rawDppId);
  const [row] = await db
    .select(RESOURCE_SELECT)
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(
      and(eq(passports.tenantId, tenantId), eq(passports.dppId, dppId), isNull(passports.deletedAt)),
    )
    .limit(1);

  if (!row) throw notFound('No passport with that identifier exists in this workspace.');
  return toResource(row);
}

/** The payload of a given version, or of the current one. */
export async function findPayload(
  passportId: string,
  version: number,
): Promise<Partial<PassportPayload>> {
  const [row] = await db
    .select({ payload: passportVersions.payload })
    .from(passportVersions)
    .where(and(eq(passportVersions.passportId, passportId), eq(passportVersions.version, version)))
    .limit(1);
  return (row?.payload ?? {}) as Partial<PassportPayload>;
}

export interface ListFilter {
  status?: string;
  updatedSince?: Date;
  limit: number;
  cursor?: string;
}

export interface ListResult {
  data: PassportResource[];
  nextCursor: string | null;
}

/**
 * Keyset pagination on `(updatedAt, id)`.
 *
 * Offsets are wrong for this list: passports are ordered by last change, so
 * anything edited while a client is paging moves to the front and pushes a row
 * across the page boundary the client already passed. It is silently skipped.
 * A keyset cursor cannot skip, and `id` breaks ties so two passports saved in
 * the same millisecond still order deterministically.
 */
export async function listPassportsPage(
  tenantId: string,
  filter: ListFilter,
): Promise<ListResult> {
  const conditions = [eq(passports.tenantId, tenantId), isNull(passports.deletedAt)];

  if (filter.status) {
    conditions.push(eq(passports.status, filter.status as typeof passports.$inferSelect.status));
  }
  if (filter.updatedSince) conditions.push(gt(passports.updatedAt, filter.updatedSince));

  const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
  if (cursor) {
    conditions.push(
      or(
        lt(passports.updatedAt, cursor.updatedAt),
        and(eq(passports.updatedAt, cursor.updatedAt), lt(passports.id, cursor.id)),
      )!,
    );
  }

  // One more than asked for, so "is there another page?" is answered by the
  // query rather than by a second count that races with it.
  const rows = await db
    .select(RESOURCE_SELECT)
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(...conditions))
    .orderBy(desc(passports.updatedAt), desc(passports.id))
    .limit(filter.limit + 1);

  const page = rows.slice(0, filter.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > filter.limit && last ? encodeCursor(last.updatedAt, last.id) : null;

  return { data: page.map(toResource), nextCursor };
}

function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

/**
 * A malformed cursor is ignored rather than rejected. A client that mangles it
 * gets the first page — recoverable — instead of a 400 it has no way to act on,
 * and the cursor is opaque so there is nothing to protect by validating it.
 */
function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const updatedAt = new Date(iso);
    return Number.isNaN(updatedAt.getTime()) ? null : { updatedAt, id };
  } catch {
    return null;
  }
}
