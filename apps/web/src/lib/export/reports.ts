import 'server-only';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents, passportVersions, passports, products } from '@/lib/db/schema';
import { passportUrl } from '@/lib/passport/identifier';
import { toCsv, type CsvColumn } from './csv';

/**
 * The two CSV exports a compliance team actually asks for: what have we got,
 * and what happened to it.
 */

export interface PassportExportRow {
  dppId: string;
  productName: string | null;
  styleNumber: string | null;
  sku: string | null;
  gtin: string | null;
  colourName: string | null;
  size: string | null;
  scope: string;
  status: string;
  completeness: number;
  currentVersion: number;
  publishedVersion: number | null;
  dataHash: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

const PASSPORT_COLUMNS: readonly CsvColumn<PassportExportRow>[] = [
  { key: 'dppId', header: 'Passport ID', value: (r) => r.dppId },
  { key: 'url', header: 'Public URL', value: (r) => passportUrl(r.dppId) },
  { key: 'productName', header: 'Product', value: (r) => r.productName },
  { key: 'styleNumber', header: 'Style number', value: (r) => r.styleNumber },
  { key: 'sku', header: 'SKU', value: (r) => r.sku },
  { key: 'gtin', header: 'GTIN', value: (r) => r.gtin },
  { key: 'colourName', header: 'Colour', value: (r) => r.colourName },
  { key: 'size', header: 'Size', value: (r) => r.size },
  { key: 'scope', header: 'Granularity', value: (r) => r.scope },
  { key: 'status', header: 'Status', value: (r) => r.status },
  { key: 'completeness', header: 'Completeness %', value: (r) => r.completeness },
  { key: 'currentVersion', header: 'Current version', value: (r) => r.currentVersion },
  { key: 'publishedVersion', header: 'Published version', value: (r) => r.publishedVersion },
  // The digest a regulator would compare against a registry entry. Without it
  // the export is a list of names, not evidence.
  { key: 'dataHash', header: 'Current data hash (SHA-256 over JCS)', value: (r) => r.dataHash },
  { key: 'publishedAt', header: 'Published at', value: (r) => r.publishedAt },
  { key: 'updatedAt', header: 'Last changed', value: (r) => r.updatedAt },
];

export interface PassportExportFilter {
  status?: string;
  updatedSince?: Date;
  limit?: number;
}

export async function loadPassportExportRows(
  tenantId: string,
  filter: PassportExportFilter = {},
): Promise<PassportExportRow[]> {
  const conditions = [eq(passports.tenantId, tenantId), isNull(passports.deletedAt)];
  if (filter.status) {
    conditions.push(eq(passports.status, filter.status as typeof passports.$inferSelect.status));
  }
  if (filter.updatedSince) conditions.push(gt(passports.updatedAt, filter.updatedSince));

  return db
    .select({
      dppId: passports.dppId,
      productName: products.name,
      styleNumber: products.styleNumber,
      sku: passports.sku,
      gtin: passports.gtin,
      colourName: passports.colourName,
      size: passports.size,
      scope: passports.scope,
      status: passports.status,
      completeness: passports.completeness,
      currentVersion: passports.currentVersion,
      publishedVersion: passports.publishedVersion,
      dataHash: sql<string | null>`(
        select ${passportVersions.dataHash}
        from ${passportVersions}
        where ${passportVersions.passportId} = ${passports.id}
          and ${passportVersions.version} = ${passports.currentVersion}
      )`,
      publishedAt: passports.publishedAt,
      updatedAt: passports.updatedAt,
    })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(...conditions))
    .orderBy(desc(passports.updatedAt))
    .limit(filter.limit ?? 5_000);
}

export async function exportPassportsCsv(
  tenantId: string,
  filter: PassportExportFilter = {},
): Promise<string> {
  return toCsv(PASSPORT_COLUMNS, await loadPassportExportRows(tenantId, filter));
}

export interface AuditExportRow {
  sequence: number;
  recordedAt: string;
  actorLabel: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata: Record<string, unknown> | null;
  previousHash: string;
  entryHash: string;
  ip: string | null;
}

const AUDIT_COLUMNS: readonly CsvColumn<AuditExportRow>[] = [
  { key: 'sequence', header: 'Sequence', value: (r) => r.sequence },
  { key: 'recordedAt', header: 'Recorded at', value: (r) => r.recordedAt },
  { key: 'actorLabel', header: 'Actor', value: (r) => r.actorLabel },
  { key: 'action', header: 'Action', value: (r) => r.action },
  { key: 'subjectType', header: 'Subject type', value: (r) => r.subjectType },
  { key: 'subjectId', header: 'Subject', value: (r) => r.subjectId },
  { key: 'metadata', header: 'Detail', value: (r) => r.metadata },
  // Both hashes, so the chain can be re-verified from the CSV alone by anyone
  // who has the algorithm — which is the point of exporting an audit log at all.
  { key: 'previousHash', header: 'Previous hash', value: (r) => r.previousHash },
  { key: 'entryHash', header: 'Entry hash', value: (r) => r.entryHash },
  { key: 'ip', header: 'IP', value: (r) => r.ip },
];

export async function loadAuditExportRows(
  tenantId: string,
  limit = 5_000,
): Promise<AuditExportRow[]> {
  return db
    .select({
      sequence: auditEvents.sequence,
      recordedAt: auditEvents.recordedAt,
      actorLabel: auditEvents.actorLabel,
      action: auditEvents.action,
      subjectType: auditEvents.subjectType,
      subjectId: auditEvents.subjectId,
      metadata: auditEvents.metadata,
      previousHash: auditEvents.previousHash,
      entryHash: auditEvents.entryHash,
      ip: auditEvents.ip,
    })
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId))
    // Oldest first: the chain only verifies in the order it was written.
    .orderBy(asc(auditEvents.sequence))
    .limit(limit);
}

export async function exportAuditCsv(tenantId: string, limit = 5_000): Promise<string> {
  return toCsv(AUDIT_COLUMNS, await loadAuditExportRows(tenantId, limit));
}
