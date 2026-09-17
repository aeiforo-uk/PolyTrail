import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { attachment } from '@/lib/export/csv';
import { collectFailures, failuresToCsv } from '@/lib/import/export';
import { getImportJob, reviewJob } from '../../queries';

/**
 * The failures, as a file.
 *
 * Served as a download rather than assembled in the browser so the operator
 * gets a real file with a real name to forward to whoever owns the data — which
 * is usually not the person who ran the import.
 *
 * A job that has not been run yet has no stored results, so the failures are
 * computed from a fresh validation instead. Either way the file is the rows
 * that will not go in, with their reasons beside them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await getSession();
  if (!session?.tenantId) return new NextResponse('Sign in to continue.', { status: 401 });

  const { jobId } = await params;
  const job = await getImportJob(session.tenantId, jobId);
  if (!job) return new NextResponse('That import does not exist.', { status: 404 });

  const rows = (job.rows ?? []) as Array<Record<string, string>>;
  const headers = Object.keys(rows[0] ?? {});

  let csv: string;
  if (job.results && job.results.length > 0) {
    csv = failuresToCsv(headers, collectFailures(rows, job.results));
  } else {
    const review = await reviewJob(session.tenantId, jobId);
    if (!review) return new NextResponse('That import does not exist.', { status: 404 });
    csv = failuresToCsv(
      headers,
      review.failing.map((row) => ({
        line: row.line,
        cells: row.cells,
        errors: { ...row.errors, ...(row.rowErrors.length > 0 ? { _row: row.rowErrors } : {}) },
      })),
    );
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': attachment(`${baseName(job.filename)}-failures.csv`),
      'Cache-Control': 'no-store',
    },
  });
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'import';
}
