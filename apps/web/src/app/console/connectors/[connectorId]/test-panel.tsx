'use client';

import * as React from 'react';
import type { TestState } from '../state';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  DownloadCloud,
  PlugZap,
  Trash2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { cn } from '@/lib/utils';
import { deleteConnectorAction, pullConnectorAction, testConnectorAction } from '../actions';

/**
 * Testing and running a connector.
 *
 * The test shows the response body it received, truncated but not cleaned up.
 * An integration screen that reports "connection failed" and hides the 403 and
 * its message costs an afternoon; showing the body costs a scrollbar.
 *
 * The three numbers that decide whether a configuration is right — the status,
 * how long it took, and how many records the selector actually found — are
 * pulled out as figures, because "200 OK, 0 records" is the single most common
 * way a connector is wrong and it is invisible inside a wall of JSON.
 */
export function TestPanel({
  connectorId,
  implemented,
  notImplementedReason,
}: {
  connectorId: string;
  implemented: boolean;
  notImplementedReason: string;
}) {
  const router = useRouter();
  const [test, setTest] = React.useState<TestState | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [pulling, setPulling] = React.useState(false);
  const [pullMessage, setPullMessage] = React.useState<string | null>(null);

  const runTest = async () => {
    setTesting(true);
    setPullMessage(null);
    try {
      setTest(await testConnectorAction(connectorId));
    } finally {
      setTesting(false);
    }
  };

  const runPull = async () => {
    setPulling(true);
    setPullMessage(null);
    try {
      const outcome = await pullConnectorAction(connectorId);
      if (outcome.ok && outcome.jobId) router.push(`/console/imports/${outcome.jobId}`);
      else setPullMessage(outcome.message ?? 'The pull failed.');
    } finally {
      setPulling(false);
    }
  };

  const result = test?.result;
  const found = result?.recordsFound;
  const emptySelector = result?.ok === true && found === 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Test and pull</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            A test fetches one page and shows you exactly what came back, unedited. A pull fetches
            records and parks them as an import you then map and review — it never writes a passport
            on its own.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runTest} loading={testing} variant="secondary" size="sm">
            <PlugZap aria-hidden />
            Test the connection
          </Button>
          <Button onClick={runPull} loading={pulling} size="sm" disabled={!implemented}>
            <DownloadCloud aria-hidden />
            Pull records
          </Button>
          <form
            action={deleteConnectorAction.bind(null, connectorId)}
            onSubmit={(event) => {
              if (!confirm('Delete this connector and its stored credential?')) {
                event.preventDefault();
              }
            }}
          >
            <Button type="submit" variant="ghost" size="sm" className="text-critical">
              <Trash2 aria-hidden />
              Delete
            </Button>
          </form>
        </div>
      </div>

      {implemented ? null : (
        <p className="flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-4 py-3 text-sm text-caution">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {notImplementedReason}
        </p>
      )}

      {pullMessage ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {pullMessage}
        </p>
      ) : null}

      {test && !test.ran && test.message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {test.message}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-4">
          <StatRow>
            <StatTile
              label="HTTP status"
              value={result.status ?? '—'}
              context={
                result.status === undefined
                  ? 'the source never answered'
                  : result.status < 300
                    ? 'the source answered'
                    : result.status < 400
                      ? 'redirected'
                      : result.status < 500
                        ? 'refused the request'
                        : 'the source is broken'
              }
              tone={result.ok ? 'positive' : 'critical'}
            />
            <StatTile
              label="Round trip"
              value={result.durationMs.toLocaleString('en-GB')}
              unit="ms"
              context={
                result.durationMs < 500
                  ? 'fast enough to page through'
                  : result.durationMs < 3000
                    ? 'a large pull will take a while'
                    : 'slow — lower the page size'
              }
              tone={result.durationMs < 3000 ? 'neutral' : 'caution'}
            />
            <StatTile
              label="Records found"
              value={found === undefined ? '—' : found.toLocaleString('en-GB')}
              context={
                found === undefined
                  ? 'nothing to look in'
                  : found === 0
                    ? 'the record selector matched nothing'
                    : 'in this one response'
              }
              tone={found === undefined ? 'neutral' : found === 0 ? 'critical' : 'positive'}
            />
            <StatTile
              label="Fields per record"
              value={result.fields?.length ?? 0}
              context={
                result.fields && result.fields.length > 0
                  ? 'each becomes a mappable column'
                  : 'none readable on the first record'
              }
              tone={result.fields && result.fields.length > 0 ? 'accent' : 'neutral'}
            />
          </StatRow>

          <p
            className={cn(
              'flex items-start gap-2 rounded-md border px-4 py-3 text-sm',
              result.ok
                ? 'border-positive-border bg-positive-soft text-positive'
                : 'border-critical-border bg-critical-soft text-critical',
            )}
            role="status"
          >
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>
              <strong className="font-semibold">{result.ok ? 'Connected' : 'Failed'}.</strong>{' '}
              {result.message}
            </span>
          </p>

          {emptySelector ? (
            <p className="flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-4 py-3 text-sm text-caution">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                The endpoint answered, but the record selector found nothing in the body. Read the
                response below and set the selector to wherever the list actually sits — a pull with
                this configuration would produce an import with no rows in it.
              </span>
            </p>
          ) : null}

          {result.fields && result.fields.length > 0 ? (
            <div>
              <p className="eyebrow mb-2">Fields on the first record</p>
              <ul className="flex flex-wrap gap-1.5">
                {result.fields.map((field) => (
                  <li
                    key={field}
                    className="mono rounded-sm border border-line bg-surface-sunken px-2 py-0.5 text-2xs text-ink-muted"
                  >
                    {field}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-ink-subtle">
                Use these on the left of a field-mapping line, e.g.{' '}
                <span className="mono">Style = {result.fields[0]}</span>.
              </p>
            </div>
          ) : null}

          {result.sample ? (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="eyebrow mb-2">What the source sent back, verbatim</p>
                <p className="text-2xs text-ink-subtle">
                  Truncated for length. Nothing else is changed.
                </p>
              </div>
              <pre className="mono max-h-96 overflow-auto rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-ink">
                {result.sample}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-5 py-8 text-center">
          <p className="text-sm font-medium text-ink">No test has been run in this session</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
            A test sends one real request with the credential you have stored and prints the
            response here — status, timing, how many records the selector found, and the body
            itself. Run it before anyone relies on this connector.
          </p>
        </div>
      )}
    </section>
  );
}
