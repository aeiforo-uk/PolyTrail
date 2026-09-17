import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { importJobs, tenants, users } from '@/lib/db/schema';
import type { Mapping } from '@/lib/import/infer';
import { loadCatalogue, type RowResult } from '@/lib/import/run';
import { ROW_KEY, validateRows, type SourceRow, type ValidatedRow } from '@/lib/import/validate';

/**
 * Reads for the import screens.
 *
 * Every statement filters on `tenantId`. An import job holds a brand's entire
 * unreleased catalogue; a missing predicate here is the worst kind of bug this
 * product can have.
 */

/** Failing rows sent to the browser at once. Beyond this, fix and re-check. */
export const REVIEW_ROW_LIMIT = 200;

/**
 * Passing rows sent through for spot-checking.
 *
 * Small on purpose. The point of the preview is "does the first handful look
 * like what I think I uploaded", not a second copy of the spreadsheet.
 */
export const PREVIEW_ROW_LIMIT = 50;

export interface ImportJobSummary {
  id: string;
  filename: string;
  source: string;
  status: string;
  totalRows: number;
  succeededRows: number;
  failedRows: number;
  createdAt: Date;
  completedAt: Date | null;
  createdByName: string | null;
}

export async function listImportJobs(tenantId: string, limit = 50): Promise<ImportJobSummary[]> {
  return db
    .select({
      id: importJobs.id,
      filename: importJobs.filename,
      source: importJobs.source,
      status: importJobs.status,
      totalRows: importJobs.totalRows,
      succeededRows: importJobs.succeededRows,
      failedRows: importJobs.failedRows,
      createdAt: importJobs.createdAt,
      completedAt: importJobs.completedAt,
      createdByName: users.name,
    })
    .from(importJobs)
    .leftJoin(users, eq(users.id, importJobs.createdBy))
    .where(eq(importJobs.tenantId, tenantId))
    .orderBy(desc(importJobs.createdAt))
    .limit(limit);
}

export async function getImportJob(tenantId: string, jobId: string) {
  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)))
    .limit(1);
  return job ?? null;
}

export async function getBrandName(tenantId: string): Promise<string | undefined> {
  const [tenant] = await db
    .select({ legalName: tenants.legalName })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return tenant?.legalName;
}

export interface ReviewRow {
  index: number;
  line: number;
  cells: Record<string, string>;
  /** Errors keyed by column header, for the cell they belong under. */
  errors: Record<string, string[]>;
  /** Errors that belong to no column — a required field nobody mapped. */
  rowErrors: string[];
  warnings: Record<string, string[]>;
}

export interface ReviewCounts {
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
  warning: number;
}

/**
 * A passing row, reduced to the few columns that say which product it is.
 *
 * Deliberately not a `ReviewRow`: a wide PLM export is eighty columns, and
 * shipping eighty values for fifty rows to preview three is a payload nobody
 * asked for.
 */
export interface PreviewRow {
  index: number;
  line: number;
  values: Record<string, string>;
  /** For an update, the identifier that matched an existing passport. */
  matchedBy?: string;
}

export interface ReviewData {
  headers: string[];
  mapping: Mapping;
  counts: ReviewCounts;
  /** Only the rows that will not go. The rest need no attention. */
  failing: ReviewRow[];
  failingTotal: number;
  /** Rows carrying warnings but no errors, so the operator can spot-check. */
  inferred: ReviewRow[];
  unmappedColumns: string[];
  unkeyedCount: number;
  /** Columns that carry at least one error, so the grid can show only those. */
  errorColumns: string[];
  /** Columns that identify a row, for the preview tables. */
  previewColumns: string[];
  /** First few rows of each outcome, so each counter leads somewhere. */
  creating: PreviewRow[];
  updating: PreviewRow[];
  skipping: PreviewRow[];
}

/**
 * Work out what pressing "import" would actually do.
 *
 * Create versus update is decided against the workspace's own catalogue rather
 * than guessed, because "will update 1,940 passports" and "will create 1,940
 * passports" are very different sentences to read before committing.
 */
export async function reviewJob(tenantId: string, jobId: string): Promise<ReviewData | null> {
  const job = await getImportJob(tenantId, jobId);
  if (!job) return null;

  const rows = (job.rows ?? []) as Array<Record<string, string>>;
  const mapping = (job.mapping ?? {}) as Mapping;
  const headers = Object.keys(rows[0] ?? {});

  const [brandName, catalogue] = await Promise.all([
    getBrandName(tenantId),
    loadCatalogue(tenantId),
  ]);

  const source: SourceRow[] = rows.map((cells, index) => ({ line: index + 2, cells }));
  const summary = validateRows(source, mapping, { defaultBrandName: brandName, headers });

  const counts: ReviewCounts = {
    total: rows.length,
    create: 0,
    update: 0,
    skip: 0,
    error: 0,
    warning: 0,
  };
  const failing: ReviewRow[] = [];
  const inferred: ReviewRow[] = [];
  const creating: PreviewRow[] = [];
  const updating: PreviewRow[] = [];
  const skipping: PreviewRow[] = [];
  const errorColumns = new Set<string>();
  const previewColumns = previewColumnsFor(mapping, headers);

  for (const row of summary.rows) {
    if (row.empty) {
      counts.skip++;
      if (skipping.length < PREVIEW_ROW_LIMIT) {
        skipping.push(toPreviewRow(row.index, row.line, rows, previewColumns));
      }
      continue;
    }
    if (!row.ok) {
      counts.error++;
      for (const column of Object.keys(row.errors)) errorColumns.add(column);
      if (failing.length < REVIEW_ROW_LIMIT) failing.push(toReviewRow(row, rows));
      continue;
    }

    const existing = row.matchKey
      ? catalogue.get(`${row.matchKey.kind}:${row.matchKey.value}`)
      : undefined;
    if (existing) {
      counts.update++;
      if (updating.length < PREVIEW_ROW_LIMIT) {
        updating.push({
          ...toPreviewRow(row.index, row.line, rows, previewColumns),
          ...(row.matchKey ? { matchedBy: `${row.matchKey.kind} ${row.matchKey.value}` } : {}),
        });
      }
    } else {
      counts.create++;
      if (creating.length < PREVIEW_ROW_LIMIT) {
        creating.push(toPreviewRow(row.index, row.line, rows, previewColumns));
      }
    }

    if (Object.keys(row.warnings).length > 0) {
      counts.warning++;
      if (inferred.length < REVIEW_ROW_LIMIT) inferred.push(toReviewRow(row, rows));
    }
  }

  return {
    headers,
    mapping,
    counts,
    failing,
    failingTotal: counts.error,
    inferred,
    unmappedColumns: summary.unmappedColumns,
    unkeyedCount: summary.unkeyedCount,
    errorColumns: headers.filter((header) => errorColumns.has(header)),
    previewColumns,
    creating,
    updating,
    skipping,
  };
}

/**
 * The columns that say which product a row is, in the order a person reads
 * them. Falls back to the first few columns of the file when nothing that
 * identifies a product has been mapped — a preview with no columns at all is
 * worse than an arbitrary one.
 */
const PREVIEW_PATHS = [
  'identity.styleNumber',
  'identity.sku',
  'identity.gtin',
  'identity.productName',
  'identity.category',
];

function previewColumnsFor(mapping: Mapping, headers: readonly string[]): string[] {
  const chosen = Object.entries(mapping)
    .filter(([, path]) => PREVIEW_PATHS.includes(path))
    .sort(([, a], [, b]) => PREVIEW_PATHS.indexOf(a) - PREVIEW_PATHS.indexOf(b))
    .map(([header]) => header)
    .slice(0, 5);
  return chosen.length > 0 ? chosen : headers.slice(0, 3);
}

function toPreviewRow(
  index: number,
  line: number,
  rows: ReadonlyArray<Record<string, string>>,
  columns: readonly string[],
): PreviewRow {
  const source = rows[index] ?? {};
  const values: Record<string, string> = {};
  for (const column of columns) values[column] = source[column] ?? '';
  return { index, line, values };
}

function toReviewRow(row: ValidatedRow, rows: ReadonlyArray<Record<string, string>>): ReviewRow {
  // Split here rather than in the browser, so the review grid never has to
  // know about the internal key the validator uses for unattributed errors.
  const { [ROW_KEY]: rowErrors = [], ...errors } = row.errors;
  return {
    index: row.index,
    line: row.line,
    cells: rows[row.index] ?? {},
    errors,
    rowErrors,
    warnings: row.warnings,
  };
}

/** The finished job, joined to its rows, for the results screen. */
export interface JobResultRow {
  index: number;
  line: number;
  ok: boolean;
  dppId?: string;
  /** Errors keyed by column header. */
  errors: Record<string, string[]>;
  /** Errors that belong to the row rather than to a column. */
  rowErrors: string[];
  label: string;
}

export function resultRows(
  rows: ReadonlyArray<Record<string, string>>,
  results: ReadonlyArray<RowResult | null | undefined>,
  mapping: Mapping,
): JobResultRow[] {
  const nameColumn = Object.entries(mapping).find(
    ([, path]) => path === 'identity.productName',
  )?.[0];
  const styleColumn = Object.entries(mapping).find(
    ([, path]) => path === 'identity.styleNumber',
  )?.[0];

  return rows.map((cells, index) => {
    const result = results[index];
    const name = nameColumn ? cells[nameColumn] : undefined;
    const style = styleColumn ? cells[styleColumn] : undefined;
    const { [ROW_KEY]: rowErrors = [], ...errors } = result?.errors ?? {};
    return {
      index,
      line: index + 2,
      ok: result?.ok ?? false,
      ...(result?.dppId ? { dppId: result.dppId } : {}),
      errors,
      rowErrors,
      label: [style, name].filter(Boolean).join(' · ') || `Row ${index + 2}`,
    };
  });
}
