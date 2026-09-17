import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError, conflict, forbidden, notFound } from '@/lib/api/errors';
import type { Session } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { importJobs, passportVersions, passports, products, tenants } from '@/lib/db/schema';
import { createPassport, savePassportPayload } from '@/lib/passport/service';
import type { PassportPayload } from '@/lib/passport/schema';
import { isEditable, type PassportStatus } from '@/lib/passport/state';
import { deepMerge, type Json } from './paths';
import { ROW_KEY, validateRows, type MatchKey, type SourceRow } from './validate';
import type { Mapping } from './infer';

/**
 * Running an import.
 *
 * Three properties matter more than throughput:
 *
 *   1. **Partial success is normal.** Two thousand styles arrive and forty have
 *      a bad GTIN. Row 40 failing must not stop row 41, and the run must finish
 *      with 1,960 passports and a list of forty problems — not with nothing.
 *   2. **Re-running is safe.** Each row records the passport it produced, so a
 *      second run updates that passport rather than minting a duplicate. Where
 *      no record exists, the row's own identifier is matched against the
 *      catalogue. A brand that fixes forty rows and presses the button again
 *      must not end up with forty extra passports.
 *   3. **Every write goes through the passport service.** Versioning, audit,
 *      quota and validation live there. An importer that writes to the tables
 *      directly is an importer that produces passports with no history.
 */

/** Per-row outcome, in the shape `import_jobs.results` declares. */
export interface RowResult {
  ok: boolean;
  dppId?: string;
  errors?: Record<string, string[]>;
}

export interface RunOptions {
  /**
   * Rows to process before returning. A run over a large file is resumed by
   * calling again; a serverless request that runs out of time mid-import would
   * otherwise leave the job wedged in `importing` with no record of how far it
   * got.
   */
  batchSize?: number;
}

export interface RunOutcome {
  jobId: string;
  status: 'importing' | 'completed' | 'failed';
  processed: number;
  succeeded: number;
  failed: number;
  total: number;
  /** True when rows remain and `runImport` should be called again. */
  more: boolean;
}

const DEFAULT_BATCH = 200;

export async function runImport(
  session: Session,
  jobId: string,
  options: RunOptions = {},
): Promise<RunOutcome> {
  const tenantId = requireTenant(session);

  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)))
    .limit(1);

  if (!job) throw notFound('That import does not exist.');
  if (job.status === 'completed' || job.status === 'cancelled') {
    throw conflict('That import has already finished. Start a new one to import again.');
  }
  if (job.status === 'uploaded' || job.status === 'mapping') {
    throw conflict('Map the columns before running the import.');
  }

  const rows = (job.rows ?? []) as Array<Record<string, string>>;
  const mapping = (job.mapping ?? {}) as Mapping;
  const results: RowResult[] = [...(job.results ?? [])];

  const [tenant] = await db
    .select({ legalName: tenants.legalName })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const source: SourceRow[] = rows.map((cells, index) => ({ line: index + 2, cells }));
  const summary = validateRows(source, mapping, {
    defaultBrandName: tenant?.legalName,
    headers: Object.keys(rows[0] ?? {}),
  });

  const catalogue = await loadCatalogue(tenantId);

  await db
    .update(importJobs)
    .set({ status: 'importing', totalRows: rows.length })
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)));

  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  let processed = 0;
  let more = false;

  for (const row of summary.rows) {
    // A row already imported by an earlier batch of this same run is left
    // alone, which is what makes resuming cheap and re-running idempotent.
    if (results[row.index]?.ok) continue;
    if (processed >= batchSize) {
      more = true;
      break;
    }
    processed++;

    if (row.empty) {
      results[row.index] = {
        ok: false,
        errors: { [ROW_KEY]: ['Every mapped column in this row is blank.'] },
      };
      continue;
    }

    if (!row.payload) {
      results[row.index] = { ok: false, errors: row.errors };
      continue;
    }

    try {
      const dppId = await writeRow(session, {
        payload: row.payload,
        matchKey: row.matchKey,
        previousDppId: results[row.index]?.dppId,
        catalogue,
      });
      results[row.index] = { ok: true, dppId };
      // Keep the in-memory catalogue current so two rows carrying the same
      // SKU update one passport instead of racing to create two.
      if (row.matchKey) catalogue.set(keyOf(row.matchKey), dppId);
    } catch (error) {
      results[row.index] = { ok: false, errors: errorsFrom(error) };
    }
  }

  const succeeded = results.filter((result) => result?.ok).length;
  const failed = results.filter((result) => result && !result.ok).length;
  const status = more ? ('importing' as const) : ('completed' as const);

  await db
    .update(importJobs)
    .set({
      status,
      results,
      totalRows: rows.length,
      succeededRows: succeeded,
      failedRows: failed,
      ...(more ? {} : { completedAt: new Date() }),
    })
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)));

  return {
    jobId,
    status,
    processed,
    succeeded,
    failed,
    total: rows.length,
    more,
  };
}

interface WriteContext {
  payload: PassportPayload;
  matchKey: MatchKey | null;
  previousDppId?: string;
  catalogue: Map<string, string>;
}

/**
 * Create or update one passport.
 *
 * On update the row's payload is merged *over* the stored one rather than
 * replacing it. A file with six columns must not wipe the composition a
 * supplier spent three weeks answering questions about.
 */
async function writeRow(session: Session, context: WriteContext): Promise<string> {
  const existingDppId =
    context.previousDppId ??
    (context.matchKey ? context.catalogue.get(keyOf(context.matchKey)) : undefined);

  if (existingDppId) {
    const current = await currentPayload(session.tenantId!, existingDppId);
    if (!current) throw notFound(`Passport ${existingDppId} no longer exists.`);
    if (!isEditable(current.status)) {
      throw conflict(
        `Passport ${existingDppId} is ${current.status.replace(/_/g, ' ')} and cannot be changed by an import. Return it to draft first.`,
      );
    }
    await savePassportPayload(session, {
      dppId: existingDppId,
      payload: deepMerge(current.payload as unknown as Json, context.payload as unknown as Json),
      changeReason: 'Bulk import',
    });
    return existingDppId;
  }

  const identity = context.payload.identity;
  const passport = await createPassport(session, {
    productName: identity.productName.en,
    category: identity.category,
    styleNumber: identity.styleNumber,
    sku: identity.sku,
    gtin: identity.gtin,
    colourName: identity.colourName,
    size: identity.size,
  });

  // The create only carries the identifiers; this writes everything else the
  // row had, as a second version with its own reason in the audit trail.
  await savePassportPayload(session, {
    dppId: passport.dppId,
    payload: context.payload,
    changeReason: 'Bulk import',
  });

  return passport.dppId;
}

async function currentPayload(tenantId: string, dppId: string) {
  const [row] = await db
    .select({
      status: passports.status,
      payload: passportVersions.payload,
    })
    .from(passports)
    .innerJoin(
      passportVersions,
      and(
        eq(passportVersions.passportId, passports.id),
        eq(passportVersions.version, passports.currentVersion),
      ),
    )
    .where(
      and(eq(passports.tenantId, tenantId), eq(passports.dppId, dppId), isNull(passports.deletedAt)),
    )
    .limit(1);

  if (!row) return null;
  return { status: row.status as PassportStatus, payload: row.payload as PassportPayload };
}

/**
 * Every identifier in the workspace, so create-versus-update is one lookup per
 * row rather than a query. A tenant's catalogue is thousands of rows, not
 * millions; when that stops being true this becomes a per-row indexed read.
 */
export async function loadCatalogue(tenantId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      dppId: passports.dppId,
      gtin: passports.gtin,
      sku: passports.sku,
      styleNumber: products.styleNumber,
    })
    .from(passports)
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(eq(passports.tenantId, tenantId), isNull(passports.deletedAt)));

  const catalogue = new Map<string, string>();
  for (const row of rows) {
    if (row.gtin) setOnce(catalogue, `gtin:${row.gtin}`, row.dppId);
    if (row.sku) setOnce(catalogue, `sku:${row.sku}`, row.dppId);
    if (row.styleNumber) setOnce(catalogue, `styleNumber:${row.styleNumber}`, row.dppId);
  }
  return catalogue;
}

/**
 * First writer wins. A style reference shared by twelve colourways is not a
 * usable key, and quietly pointing an import at the last of the twelve would
 * be worse than pointing it at the first — at least the first is stable.
 */
function setOnce(map: Map<string, string>, key: string, value: string): void {
  if (!map.has(key)) map.set(key, value);
}

function keyOf(matchKey: MatchKey): string {
  return `${matchKey.kind}:${matchKey.value}`;
}

function errorsFrom(error: unknown): Record<string, string[]> {
  if (error instanceof ApiError) {
    return error.errors && Object.keys(error.errors).length > 0
      ? error.errors
      : { [ROW_KEY]: [error.message] };
  }
  return { [ROW_KEY]: [error instanceof Error ? error.message : 'Unknown error.'] };
}

function requireTenant(session: Session): string {
  if (!session.tenantId) throw forbidden('Your account is not attached to a workspace.');
  return session.tenantId;
}
