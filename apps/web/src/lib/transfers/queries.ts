import 'server-only';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db/client';
import { passportTransfers, passports, products, tenants, users } from '@/lib/db/schema';
import { normalizeDppId } from '@/lib/passport/identifier';
import { expireStaleTransfers } from './service';
import type { TransferDetail, TransferReason, TransferStatus, TransferSummary } from './types';

/**
 * Reads for the console.
 *
 * Every query is bounded by the tenant on both sides of the relationship —
 * `from_tenant_id` for what we sent, `to_tenant_id` for what we were offered.
 * A transfer is the one record in this product that two workspaces legitimately
 * share, so "scope by tenant" means scope by *either* party, never by neither.
 */

const fromTenant = alias(tenants, 'from_tenant');
const toTenant = alias(tenants, 'to_tenant');
const initiator = alias(users, 'initiator');
const completer = alias(users, 'completer');

const SUMMARY_COLUMNS = {
  id: passportTransfers.id,
  dppId: passports.dppId,
  productName: products.name,
  reason: passportTransfers.reason,
  status: passportTransfers.status,
  note: passportTransfers.note,
  fromTenantId: passportTransfers.fromTenantId,
  fromLegalName: fromTenant.legalName,
  fromTradeName: fromTenant.tradeName,
  toTenantId: passportTransfers.toTenantId,
  toLegalName: toTenant.legalName,
  toTradeName: toTenant.tradeName,
  toEmail: passportTransfers.toEmail,
  initiatedAt: passportTransfers.initiatedAt,
  initiatedByName: initiator.name,
  expiresAt: passportTransfers.expiresAt,
  completedAt: passportTransfers.completedAt,
  completedByName: completer.name,
  rejectionReason: passportTransfers.rejectionReason,
} as const;

type SummaryRow = {
  [K in keyof typeof SUMMARY_COLUMNS]: K extends 'initiatedAt' | 'expiresAt' | 'completedAt'
    ? Date | null
    : string | null;
};

function toSummary(row: SummaryRow, tenantId: string): TransferSummary {
  return {
    id: row.id!,
    dppId: row.dppId!,
    productName: row.productName,
    reason: row.reason as TransferReason,
    status: row.status as TransferStatus,
    note: row.note,
    fromTenantId: row.fromTenantId!,
    fromTenantName: row.fromTradeName ?? row.fromLegalName ?? 'Unknown workspace',
    toTenantId: row.toTenantId,
    toTenantName: row.toTradeName ?? row.toLegalName ?? null,
    toEmail: row.toEmail,
    initiatedAt: (row.initiatedAt as Date).toISOString(),
    initiatedByName: row.initiatedByName,
    expiresAt: (row.expiresAt as Date | null)?.toISOString() ?? null,
    completedAt: (row.completedAt as Date | null)?.toISOString() ?? null,
    completedByName: row.completedByName,
    rejectionReason: row.rejectionReason,
    outgoing: row.fromTenantId === tenantId,
  };
}

function baseQuery() {
  return db
    .select(SUMMARY_COLUMNS)
    .from(passportTransfers)
    .innerJoin(passports, eq(passports.id, passportTransfers.passportId))
    .innerJoin(fromTenant, eq(fromTenant.id, passportTransfers.fromTenantId))
    .leftJoin(toTenant, eq(toTenant.id, passportTransfers.toTenantId))
    .leftJoin(products, eq(products.id, passports.productId))
    .leftJoin(initiator, eq(initiator.id, passportTransfers.initiatedBy))
    .leftJoin(completer, eq(completer.id, passportTransfers.completedBy));
}

export interface TransferLists {
  outgoing: TransferSummary[];
  incoming: TransferSummary[];
  /** Offers still waiting on somebody, for the tile counts. */
  openOutgoing: number;
  openIncoming: number;
}

export async function listTransfers(tenantId: string, limit = 100): Promise<TransferLists> {
  // Expiry is settled before the list is read, so a link that stopped working
  // last night is not still described as awaiting a decision this morning.
  await expireStaleTransfers(tenantId);

  const rows = await baseQuery()
    .where(
      or(
        eq(passportTransfers.fromTenantId, tenantId),
        eq(passportTransfers.toTenantId, tenantId),
      ),
    )
    .orderBy(desc(passportTransfers.initiatedAt))
    .limit(limit);

  const all = rows.map((row) => toSummary(row as SummaryRow, tenantId));
  const outgoing = all.filter((transfer) => transfer.outgoing);
  const incoming = all.filter((transfer) => !transfer.outgoing);

  return {
    outgoing,
    incoming,
    openOutgoing: outgoing.filter((transfer) => transfer.status === 'initiated').length,
    openIncoming: incoming.filter((transfer) => transfer.status === 'initiated').length,
  };
}

export async function getTransfer(
  tenantId: string,
  transferId: string,
): Promise<TransferDetail | null> {
  const [row] = await baseQuery()
    .where(
      and(
        eq(passportTransfers.id, transferId),
        or(
          eq(passportTransfers.fromTenantId, tenantId),
          eq(passportTransfers.toTenantId, tenantId),
        ),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [documents] = await db
    .select({
      transferCredential: passportTransfers.transferCredential,
      acceptanceCredential: passportTransfers.acceptanceCredential,
      metadata: passportTransfers.metadata,
    })
    .from(passportTransfers)
    .where(eq(passportTransfers.id, transferId))
    .limit(1);

  return {
    ...toSummary(row as SummaryRow, tenantId),
    transferCredential: documents?.transferCredential ?? null,
    acceptanceCredential: documents?.acceptanceCredential ?? null,
    metadata: documents?.metadata ?? {},
  };
}

export interface TransferablePassportOption {
  dppId: string;
  productName: string | null;
  status: string;
  transferInFlight: boolean;
}

/**
 * Passports this workspace currently owns and could hand over.
 *
 * Filtered on `owner_tenant_id`, coalesced to `tenant_id` for rows written
 * before ownership was modelled — ownership is the question here, not who
 * created the record.
 */
export async function listOwnedPassports(
  tenantId: string,
  limit = 200,
): Promise<TransferablePassportOption[]> {
  const rows = await db
    .select({
      dppId: passports.dppId,
      productName: products.name,
      status: passports.status,
      inFlight: sql<number>`(
        select count(*) from ${passportTransfers}
        where ${passportTransfers.passportId} = ${passports.id}
          and ${passportTransfers.status} = 'initiated'
      )`.mapWith(Number),
    })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(
      and(
        sql`coalesce(${passports.ownerTenantId}, ${passports.tenantId}) = ${tenantId}`,
        isNull(passports.deletedAt),
      ),
    )
    .orderBy(desc(passports.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    dppId: row.dppId,
    productName: row.productName,
    status: row.status,
    transferInFlight: row.inFlight > 0,
  }));
}

export interface PassportForTransfer {
  id: string;
  dppId: string;
  productName: string | null;
  status: string;
  tenantId: string;
  ownerTenantId: string | null;
  transferInFlight: boolean;
}

export async function getPassportForTransfer(
  dppId: string,
): Promise<PassportForTransfer | null> {
  const [row] = await db
    .select({
      id: passports.id,
      dppId: passports.dppId,
      productName: products.name,
      status: passports.status,
      tenantId: passports.tenantId,
      ownerTenantId: passports.ownerTenantId,
      inFlight: sql<number>`(
        select count(*) from ${passportTransfers}
        where ${passportTransfers.passportId} = ${passports.id}
          and ${passportTransfers.status} = 'initiated'
      )`.mapWith(Number),
    })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(eq(passports.dppId, normalizeDppId(dppId)), isNull(passports.deletedAt)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    dppId: row.dppId,
    productName: row.productName,
    status: row.status,
    tenantId: row.tenantId,
    ownerTenantId: row.ownerTenantId,
    transferInFlight: row.inFlight > 0,
  };
}

/** Every transfer recorded against one passport, oldest first, for the timeline. */
export async function listTransfersForPassport(
  tenantId: string,
  passportId: string,
): Promise<TransferSummary[]> {
  const rows = await baseQuery()
    .where(
      and(
        eq(passportTransfers.passportId, passportId),
        or(
          eq(passportTransfers.fromTenantId, tenantId),
          eq(passportTransfers.toTenantId, tenantId),
        ),
      ),
    )
    .orderBy(passportTransfers.initiatedAt);

  return rows.map((row) => toSummary(row as SummaryRow, tenantId));
}
