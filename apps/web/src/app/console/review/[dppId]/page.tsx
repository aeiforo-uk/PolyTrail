import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  ExternalLink,
  History,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/viz/meter';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { scoreCompleteness } from '@/lib/passport/completeness';
import type { PassportPayload } from '@/lib/passport/schema';
import { STATUS_LABELS, availableTransitions, type PassportStatus } from '@/lib/passport/state';
import { formatDppId } from '@/lib/passport/identifier';
import { cn } from '@/lib/utils';
import { getReviewDetail } from '../queries';
import { diffPayloads, readableFields, type ChangeKind, type FieldChange } from '../diff';
import { parseChangeRequest } from '../change-request';
import { formatDateTime, waitedFor } from '../format';
import { DecisionPanel, type FieldOption } from '../decision-panel';

const REVIEWERS = ['COMPLIANCE_OFFICER', 'BRAND_ADMIN'];

/**
 * One review, with the change as the centrepiece.
 *
 * A reviewer is not reading a document; they are approving a delta. So the
 * page opens on what moved between the version they last approved and the one
 * in front of them — grouped by section, counted by meaning, previous value
 * beside new value — and the whole passport sits underneath, folded away, for
 * the times they want it.
 */
export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ dppId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!REVIEWERS.includes(session.role)) redirect('/console');

  const { dppId } = await params;
  const detail = await getReviewDetail(session.tenantId, dppId);
  if (!detail) notFound();

  const { passport, productName, current, baseline, history } = detail;
  const status = passport.status as PassportStatus;
  const completeness = scoreCompleteness(current.payload as Partial<PassportPayload>);
  const diff = baseline ? diffPayloads(baseline.payload, current.payload) : null;
  const content = readableFields(current.payload);

  const transitions = availableTransitions(status, session.role).map((transition) => ({
    to: transition.to,
    label: transition.label,
    description: transition.description,
    requiresReason: transition.requiresReason ?? false,
    confirm: transition.confirm ?? false,
    validates: transition.validates ?? false,
  }));

  // Offer the reviewer the fields they are most likely to point at: what the
  // publication gate will reject, then what this version actually changed.
  const fieldOptions: FieldOption[] = [
    ...completeness.missingRequired.map((field) => ({
      path: field.path,
      label: field.label,
      section: sectionOf(field.path),
      note: 'required, still empty',
    })),
    ...(diff?.changes ?? []).map((change) => ({
      path: change.path,
      label: change.qualifier ? `${change.label} (${change.qualifier})` : change.label,
      section: change.sectionLabel,
      note: `${change.kind} in v${current.version}`,
    })),
  ].filter((option, index, all) => all.findIndex((other) => other.path === option.path) === index);

  const lastRequest =
    status === 'changes_requested'
      ? parseChangeRequest(history.find((entry) => entry.toStatus === 'changes_requested')?.reason)
      : null;

  const totals = diff
    ? [
        { key: 'added', label: 'added', value: diff.added, colour: 'var(--color-positive)' },
        { key: 'changed', label: 'changed', value: diff.changed, colour: 'var(--color-caution)' },
        { key: 'removed', label: 'removed', value: diff.removed, colour: 'var(--color-critical)' },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={productName}
        description={[
          passport.colourName,
          passport.size ? `Size ${passport.size}` : null,
          `Version ${current.version}`,
          `submitted by ${current.authorName ?? 'an unknown author'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <StatusBadge status={status} />
            <Button asChild variant="ghost" size="sm">
              <Link href="/console/review">
                <ArrowLeft aria-hidden />
                Queue
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/console/passports/${passport.dppId}`}>
                Full passport
                <ExternalLink aria-hidden />
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-8 px-8 py-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="change-heading" className="min-w-0">
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2 id="change-heading" className="text-sm font-semibold text-ink">
                    What you are being asked to approve
                  </h2>
                  <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">
                    {baseline ? (
                      <>
                        Version {current.version} against version {baseline.version}, the{' '}
                        {baseline.kind === 'published'
                          ? 'version currently published'
                          : 'version before this one'}
                        , saved {formatDateTime(baseline.createdAt)}.
                      </>
                    ) : (
                      'This is the first version of the passport, so there is nothing to compare it against.'
                    )}
                  </p>
                </div>

                {diff && diff.changes.length > 0 ? (
                  <p className="shrink-0 text-right">
                    <span className="text-2xl font-semibold leading-none tracking-[-0.016em] text-ink tabular-nums">
                      {diff.changes.length}
                    </span>
                    <span className="mt-1 block text-2xs text-ink-subtle">
                      {diff.changes.length === 1 ? 'field changed' : 'fields changed'} across{' '}
                      {diff.sections.length}{' '}
                      {diff.sections.length === 1 ? 'section' : 'sections'}
                    </span>
                  </p>
                ) : null}
              </div>

              {!diff ? (
                <p className="px-5 py-8 text-sm text-ink-muted">
                  Read it in full below, then decide. Nothing was approved before this, so every
                  field is new.
                </p>
              ) : diff.changes.length === 0 ? (
                <p className="flex items-center gap-2 px-5 py-8 text-sm text-ink-muted">
                  <CircleCheck className="size-4 shrink-0 text-positive" aria-hidden />
                  Nothing changed between these two versions. Approving re-affirms what was already
                  approved.
                </p>
              ) : (
                <>
                  <div className="border-b border-line px-5 py-4">
                    <StackedBar
                      ariaLabel={totals.map((t) => `${t.value} ${t.label}`).join(', ')}
                      segments={totals.filter((t) => t.value > 0)}
                    />
                    <Legend
                      className="mt-3"
                      items={totals.map((total) => ({
                        key: total.key,
                        label: total.label,
                        value: String(total.value),
                        colour: total.colour,
                      }))}
                    />
                  </div>

                  <div className="divide-y divide-line">
                    {diff.sections.map((section) => (
                      <div key={section.key}>
                        <div className="flex flex-wrap items-baseline justify-between gap-3 bg-surface-sunken/60 px-5 py-2.5">
                          <p className="eyebrow">{section.label}</p>
                          <p className="flex items-center gap-3 text-2xs text-ink-subtle tabular-nums">
                            {(['added', 'changed', 'removed'] as const).map((kind) => {
                              const count = section.changes.filter((c) => c.kind === kind).length;
                              if (count === 0) return null;
                              return (
                                <span key={kind} className="flex items-center gap-1">
                                  <span
                                    aria-hidden
                                    className={cn('size-1.5 rounded-full', dotFor(kind))}
                                  />
                                  {count} {kind}
                                </span>
                              );
                            })}
                          </p>
                        </div>

                        <p className="hidden grid-cols-[2px_minmax(0,15rem)_minmax(0,1fr)_1rem_minmax(0,1fr)] gap-x-4 px-5 pt-3 pb-1 text-2xs text-ink-subtle sm:grid">
                          <span aria-hidden />
                          <span>Field</span>
                          <span>Version {baseline?.version}</span>
                          <span aria-hidden />
                          <span>Version {current.version}</span>
                        </p>

                        <ul className="divide-y divide-line">
                          {section.changes.map((change) => (
                            <ChangeRow key={change.path} change={change} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          <section aria-labelledby="content-heading" className="min-w-0">
            <details className="group overflow-hidden rounded-lg border border-line bg-surface">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 transition-colors duration-[140ms] hover:bg-surface-sunken">
                <span className="min-w-0">
                  <span id="content-heading" className="block text-sm font-semibold text-ink">
                    The whole passport, as submitted
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {content.reduce((sum, section) => sum + section.rows.length, 0)} fields across{' '}
                    {content.length} sections. Open it when the change alone is not enough.
                  </span>
                </span>
                <ChevronDown
                  className="size-4 shrink-0 text-ink-subtle transition-transform duration-[220ms] ease-[cubic-bezier(.32,.72,0,1)] group-open:rotate-180"
                  aria-hidden
                />
              </summary>

              <div className="divide-y divide-line border-t border-line">
                {content.map((section) => (
                  <div key={section.key}>
                    <p className="eyebrow bg-surface-sunken/60 px-5 py-2.5">{section.label}</p>
                    <dl className="divide-y divide-line">
                      {section.rows.map((row) => (
                        <div
                          key={row.path}
                          className="grid gap-1 px-5 py-2.5 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-4"
                        >
                          <dt className="text-xs text-ink-muted">
                            {row.label}
                            {row.qualifier ? (
                              <span className="block text-2xs text-ink-subtle">{row.qualifier}</span>
                            ) : null}
                          </dt>
                          <dd className="min-w-0 text-sm break-words text-ink">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </details>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-line-strong bg-surface p-5 xl:sticky xl:top-6">
            <h2 className="title-2 text-ink">Your decision</h2>
            <p className="mt-1.5 mb-4 text-xs leading-relaxed text-ink-muted">
              Submitted by {current.authorName ?? 'an unknown author'}, waiting{' '}
              <span className="font-medium text-ink tabular-nums">
                {waitedFor(current.createdAt)}
              </span>
              . Whatever you choose goes into the audit chain with your name on it and cannot be
              edited afterwards.
            </p>

            <div className="mb-4 flex items-center gap-3 rounded-md border border-line bg-surface-sunken/50 px-3 py-2.5">
              <Meter value={completeness.score} size={40} thickness={4} />
              <p className="min-w-0 text-xs text-ink-muted">
                {completeness.missingRequired.length === 0
                  ? 'Every required field is filled in.'
                  : `${completeness.missingRequired.length} required ${completeness.missingRequired.length === 1 ? 'field is' : 'fields are'} still empty.`}
              </p>
            </div>

            <DecisionPanel
              dppId={passport.dppId}
              options={transitions}
              fieldOptions={fieldOptions}
            />
          </section>

          {lastRequest && lastRequest.fields.length > 0 ? (
            <section className="rounded-lg border border-caution-border bg-caution-soft p-5">
              <h2 className="text-sm font-semibold text-caution">Changes you asked for</h2>
              <p className="mt-1 text-xs whitespace-pre-line text-ink-muted">
                {lastRequest.comment}
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {lastRequest.fields.map((field) => (
                  <li key={field.path} className="text-xs text-ink">
                    {field.label}
                    <span className="mono block text-2xs break-all text-ink-subtle">
                      {field.path}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {completeness.missingRequired.length > 0 ? (
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Required before publishing</h2>
              <p className="mt-1 text-xs text-ink-muted">
                The publication check refuses these, so approving now only defers the problem.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {completeness.missingRequired.map((field) => (
                  <li key={field.path} className="flex items-start gap-2 text-xs text-ink-muted">
                    <CircleAlert className="mt-0.5 size-3 shrink-0 text-critical" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-ink">{field.label}</span>
                      <span className="mono block text-2xs break-all text-ink-subtle">
                        {field.path}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <History className="size-4 text-ink-subtle" aria-hidden />
              Decision history
            </h2>
            {history.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">
                Nothing has happened to this passport yet. Your decision will be the first entry.
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3">
                {history.map((entry, index) => (
                  <li
                    key={`${entry.createdAt.toISOString()}-${index}`}
                    className="border-l-2 border-line pl-3"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink">
                      {entry.fromStatus ? (
                        <>
                          <span className="text-ink-muted">{label(entry.fromStatus)}</span>
                          <ArrowRight className="size-3 text-ink-subtle" aria-hidden />
                        </>
                      ) : null}
                      <span className="font-medium">{label(entry.toStatus)}</span>
                    </p>
                    <p className="mt-0.5 text-2xs text-ink-subtle tabular-nums">
                      {entry.actorName ?? 'Unknown'} · {formatDateTime(entry.createdAt)}
                    </p>
                    {entry.reason ? (
                      <p className="mt-1 text-xs whitespace-pre-line text-ink-muted">
                        {entry.reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">This version</h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Passport</dt>
                <dd className="mono text-ink">{formatDppId(passport.dppId)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Version</dt>
                <dd className="text-ink tabular-nums">v{current.version}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Saved</dt>
                <dd className="text-ink tabular-nums">{formatDateTime(current.createdAt)}</dd>
              </div>
              {current.changeReason ? (
                <div>
                  <dt className="text-ink-muted">Author&rsquo;s note</dt>
                  <dd className="mt-0.5 text-ink">{current.changeReason}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-ink-muted">Content hash</dt>
                <dd className="mono mt-0.5 text-2xs break-all text-ink-subtle">
                  {current.dataHash}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

/**
 * One changed field, previous value beside new value.
 *
 * Colour here encodes meaning rather than category: something added is not
 * "series 1", it is a claim the brand did not make before, and the three
 * meanings share the reserved judgement colours so they read the same way in
 * this table as they do in the summary bar above it.
 */
function ChangeRow({ change }: { change: FieldChange }) {
  const meta = KINDS[change.kind];
  const Icon = meta.icon;

  return (
    <li className="grid items-start gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[2px_minmax(0,15rem)_minmax(0,1fr)_1rem_minmax(0,1fr)]">
      <span aria-hidden className={cn('hidden h-full w-0.5 rounded-full sm:block', meta.rail)} />

      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm text-ink">
          <Icon className={cn('size-3.5 shrink-0', meta.text)} aria-hidden />
          <span className="min-w-0 truncate" title={change.label}>
            {change.label}
          </span>
        </p>
        <p className="mt-0.5 text-2xs text-ink-subtle">
          <span className="sr-only">{meta.word}. </span>
          {change.qualifier ? `${change.qualifier} · ` : ''}
          <span className="mono break-all">{change.path}</span>
        </p>
      </div>

      <div className="min-w-0">
        {change.before === null ? (
          <p className="text-xs text-ink-subtle italic">Not set before</p>
        ) : (
          <p
            className={cn(
              'min-w-0 rounded-sm bg-surface-sunken px-2 py-1 text-sm break-words',
              change.kind === 'removed' ? 'text-ink-subtle line-through' : 'text-ink-muted',
            )}
          >
            {change.before}
          </p>
        )}
      </div>

      <span className="hidden items-center justify-center pt-1.5 sm:flex" aria-hidden>
        <ArrowRight className="size-3 text-ink-subtle" />
      </span>

      <div className="min-w-0">
        {change.after === null ? (
          <p className="text-xs text-critical italic">Removed</p>
        ) : (
          <p className="min-w-0 rounded-sm bg-surface-sunken px-2 py-1 text-sm break-words text-ink">
            {change.after}
          </p>
        )}
      </div>
    </li>
  );
}

const KINDS: Record<
  ChangeKind,
  { icon: typeof CirclePlus; text: string; rail: string; word: string }
> = {
  added: { icon: CirclePlus, text: 'text-positive', rail: 'bg-positive', word: 'Added' },
  changed: { icon: CircleAlert, text: 'text-caution', rail: 'bg-caution', word: 'Changed' },
  removed: { icon: CircleMinus, text: 'text-critical', rail: 'bg-critical', word: 'Removed' },
};

function dotFor(kind: ChangeKind): string {
  return KINDS[kind].rail;
}

function sectionOf(path: string): string {
  const head = path.split('.')[0] ?? '';
  return head.charAt(0).toUpperCase() + head.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
}

function label(status: string): string {
  return STATUS_LABELS[status as PassportStatus] ?? status.replace(/_/g, ' ');
}
