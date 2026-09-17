'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '@/lib/api/errors';
import { getSession } from '@/lib/auth/session';
import { canImport } from '@/lib/import/access';
import { db } from '@/lib/db/client';
import { importJobs } from '@/lib/db/schema';
import { parseCsv } from '@/lib/import/csv';
import { inferMapping, toMapping, type Mapping } from '@/lib/import/infer';
import { isImportable } from '@/lib/import/targets';
import { runImport } from '@/lib/import/run';
import { getImportJob, reviewJob, type ReviewData } from './queries';

import type { UploadState } from './state';

/**
 * Mutations for the import flow.
 *
 * The one rule running through all of them: nothing destructive happens
 * without the operator having seen what it would do. Upload parses and stops;
 * mapping saves and stops; only `startImport` writes a passport.
 */

/** Rows accepted from one file. Above this, split the file. */
const MAX_ROWS = 5_000;

/**
 * Server Actions carry a 1 MB body by default, and a wide catalogue export
 * passes that at around three thousand rows. Checked here so the operator gets
 * a sentence rather than a failed request; raising it needs
 * `experimental.serverActions.bodySizeLimit` in `next.config.ts`.
 */
const MAX_BYTES = 900_000;

export async function uploadCsvAction(
  _state: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await getSession();
  if (!session?.tenantId) return { status: 'error', message: 'Your session has expired. Sign in again.' };
  if (!canImport(session)) {
    return { status: 'error', message: 'Your role cannot import product data.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choose a CSV file to import.' };
  }
  if (file.size > MAX_BYTES) {
    return {
      status: 'error',
      message: `That file is ${Math.round(file.size / 1024)} KB. The limit is ${Math.round(MAX_BYTES / 1024)} KB — split it, or pull the data through a connector instead.`,
    };
  }

  const text = await file.text();
  const parsed = parseCsv(text, { maxRows: MAX_ROWS });

  if (parsed.headers.length === 0) {
    return { status: 'error', message: 'That file has no header row, so there are no columns to map.' };
  }
  if (parsed.rows.length === 0) {
    return { status: 'error', message: 'That file has a header row and nothing under it.' };
  }

  const mapping = toMapping(inferMapping(parsed.headers));

  const [job] = await db
    .insert(importJobs)
    .values({
      tenantId: session.tenantId,
      filename: file.name,
      source: 'csv',
      status: 'mapping',
      mapping,
      rows: parsed.rows.map((row) => row.cells),
      totalRows: parsed.rows.length,
      createdBy: session.userId,
    })
    .returning({ id: importJobs.id });

  revalidatePath('/console/imports');
  redirect(`/console/imports/${job!.id}`);
}

export interface MappingResult {
  ok: boolean;
  message?: string;
}

/**
 * Store the column mapping and move the job to review.
 *
 * Paths are checked against the registry rather than trusted, because the
 * mapping arrives from a browser and a path that is not an importable field
 * would otherwise be written into every row's payload and rejected two hundred
 * times over.
 */
export async function saveMappingAction(jobId: string, mapping: Mapping): Promise<MappingResult> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, message: 'Your session has expired.' };
  if (!canImport(session)) return { ok: false, message: 'Your role cannot import product data.' };

  const job = await getImportJob(session.tenantId, jobId);
  if (!job) return { ok: false, message: 'That import does not exist.' };
  if (job.status === 'completed' || job.status === 'cancelled') {
    return { ok: false, message: 'That import has finished. Start a new one to change the mapping.' };
  }

  const clean: Mapping = {};
  for (const [header, path] of Object.entries(mapping)) {
    if (typeof path !== 'string' || path === '') continue;
    if (!isImportable(path)) return { ok: false, message: `"${path}" is not a field a passport carries.` };
    clean[header] = path;
  }

  if (Object.keys(clean).length === 0) {
    return { ok: false, message: 'Map at least one column before continuing.' };
  }

  await db
    .update(importJobs)
    .set({ mapping: clean, status: 'ready' })
    .where(and(eq(importJobs.tenantId, session.tenantId), eq(importJobs.id, jobId)));

  revalidatePath(`/console/imports/${jobId}`);
  return { ok: true };
}

export interface FixResult {
  ok: boolean;
  message?: string;
  review?: ReviewData;
}

/**
 * Apply corrections made in the review grid and re-check.
 *
 * The fixes are written back into the job's stored rows rather than held in
 * the browser, so the correction survives a reload, is what the import
 * actually uses, and is visible in the failures export if it still does not
 * pass. Fixing a row in place and re-validating without re-uploading is the
 * whole point of the review step.
 */
export async function applyFixesAction(
  jobId: string,
  fixes: Array<{ index: number; cells: Record<string, string> }>,
): Promise<FixResult> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, message: 'Your session has expired.' };
  if (!canImport(session)) return { ok: false, message: 'Your role cannot import product data.' };

  const job = await getImportJob(session.tenantId, jobId);
  if (!job) return { ok: false, message: 'That import does not exist.' };
  if (job.status === 'completed' || job.status === 'cancelled') {
    return { ok: false, message: 'That import has finished.' };
  }

  const rows = [...((job.rows ?? []) as Array<Record<string, string>>)];
  const headers = new Set(Object.keys(rows[0] ?? {}));

  for (const fix of fixes) {
    const row = rows[fix.index];
    if (!row) continue;
    const next = { ...row };
    for (const [header, value] of Object.entries(fix.cells)) {
      // Only columns the file actually has. A browser may send anything.
      if (headers.has(header)) next[header] = String(value ?? '').trim();
    }
    rows[fix.index] = next;
  }

  await db
    .update(importJobs)
    .set({ rows })
    .where(and(eq(importJobs.tenantId, session.tenantId), eq(importJobs.id, jobId)));

  const review = await reviewJob(session.tenantId, jobId);
  revalidatePath(`/console/imports/${jobId}`);
  return review ? { ok: true, review } : { ok: false, message: 'That import does not exist.' };
}

export interface RunState {
  ok: boolean;
  message?: string;
  succeeded?: number;
  failed?: number;
  total?: number;
  /** True when rows remain and the action should be called again. */
  more?: boolean;
}

/** Import one batch. Large files come back for another pass. */
export async function startImportAction(jobId: string): Promise<RunState> {
  const session = await getSession();
  if (!session?.tenantId) return { ok: false, message: 'Your session has expired.' };
  if (!canImport(session)) return { ok: false, message: 'Your role cannot import product data.' };

  try {
    const outcome = await runImport(session, jobId);
    revalidatePath(`/console/imports/${jobId}`);
    revalidatePath('/console/passports');
    return {
      ok: true,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
      total: outcome.total,
      more: outcome.more,
    };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.message };
    throw error;
  }
}

export async function cancelImportAction(jobId: string): Promise<void> {
  const session = await getSession();
  if (!session?.tenantId || !canImport(session)) return;

  await db
    .update(importJobs)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(and(eq(importJobs.tenantId, session.tenantId), eq(importJobs.id, jobId)));

  revalidatePath('/console/imports');
  redirect('/console/imports');
}

/** Send a job back to mapping so the columns can be changed and re-checked. */
export async function reopenMappingAction(jobId: string): Promise<void> {
  const session = await getSession();
  if (!session?.tenantId || !canImport(session)) return;

  await db
    .update(importJobs)
    .set({ status: 'mapping' })
    .where(and(eq(importJobs.tenantId, session.tenantId), eq(importJobs.id, jobId)));

  revalidatePath(`/console/imports/${jobId}`);
}
