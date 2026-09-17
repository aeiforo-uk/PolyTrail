import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { canImport } from '@/lib/import/access';
import { inferMapping, type Mapping } from '@/lib/import/infer';
import { IMPORT_TARGETS } from '@/lib/import/targets';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { getImportJob, resultRows, reviewJob } from '../queries';
import { ImportStatus } from '../import-status';
import { Stepper } from '../stepper';
import { MappingStep, type MappingColumn } from './mapping-step';
import { ResultsPanel } from './results-panel';
import { ReviewStep } from './review-step';

/** Sample values shown per column in the mapping step. */
const SAMPLE_COUNT = 2;

export default async function ImportJobPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!canImport(session)) redirect('/console');

  const { jobId } = await params;
  const job = await getImportJob(session.tenantId, jobId);
  if (!job) notFound();

  const rows = (job.rows ?? []) as Array<Record<string, string>>;
  const headers = Object.keys(rows[0] ?? {});
  const stored = (job.mapping ?? {}) as Mapping;

  const finished = job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed';
  const step = finished ? 'review' : job.status === 'mapping' || job.status === 'uploaded' ? 'mapping' : 'review';

  return (
    <>
      <PageHeader
        title={job.filename}
        description={`${job.totalRows.toLocaleString('en-GB')} ${job.totalRows === 1 ? 'row' : 'rows'} and ${headers.length} ${headers.length === 1 ? 'column' : 'columns'}, read from ${job.source === 'api' ? 'a connector' : 'a file'}. Nothing is written until you press import.`}
        actions={
          <>
            <ImportStatus status={job.status} />
            <Button asChild variant="ghost" size="sm">
              <Link href="/console/imports">
                <ArrowLeft aria-hidden />
                All imports
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <Stepper current={step} />

        {finished || job.status === 'importing' ? (
          <ResultsPanel
            jobId={job.id}
            status={job.status}
            total={job.totalRows}
            succeeded={job.succeededRows}
            failed={job.failedRows}
            rows={resultRows(rows, job.results ?? [], stored)}
          />
        ) : step === 'mapping' ? (
          <MappingStep
            jobId={job.id}
            columns={columnsFor(headers, rows, stored)}
            rowCount={rows.length}
            targets={IMPORT_TARGETS.map((target) => ({
              path: target.path,
              label: target.label,
              basis: target.basis,
              section: target.sectionLabel,
              required: target.required,
            }))}
          />
        ) : (
          <ReviewStepLoader tenantId={session.tenantId} jobId={job.id} />
        )}
      </div>
    </>
  );
}

async function ReviewStepLoader({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  const review = await reviewJob(tenantId, jobId);
  if (!review) notFound();
  return <ReviewStep jobId={jobId} review={review} />;
}

/**
 * Build the mapping cards.
 *
 * The stored mapping wins over a fresh guess, so re-opening the step shows what
 * the operator chose rather than silently re-guessing over the top of it.
 */
function columnsFor(
  headers: readonly string[],
  rows: ReadonlyArray<Record<string, string>>,
  stored: Mapping,
): MappingColumn[] {
  const guesses = new Map(inferMapping(headers).map((column) => [column.header, column]));

  return headers.map((header) => {
    const samples: string[] = [];
    let filled = 0;
    for (const row of rows) {
      const value = row[header];
      if (!value || value.trim() === '') continue;
      filled++;
      if (samples.length < SAMPLE_COUNT && !samples.includes(value)) samples.push(value);
    }

    const guess = guesses.get(header);
    const hasStored = Object.prototype.hasOwnProperty.call(stored, header);
    const path = hasStored ? stored[header]! : (guess?.path ?? null);

    return {
      header,
      samples,
      filled,
      path,
      // The guess's own confidence is kept whenever the stored path is still
      // the guessed one, so re-opening the step does not launder "we guessed
      // this" into "you chose this".
      confidence: path && path !== guess?.path ? 'chosen' : (guess?.confidence ?? 'none'),
      alternatives: guess?.alternatives ?? [],
    };
  });
}
