import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Ban, BellRing, FileText, Link2, Mail, Send, UserRound } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import {
  cancelRequest,
  remindRequest,
  reviewRequest,
  sendRequest,
} from '@/lib/data-requests/actions';
import { anchorsFor } from '@/lib/data-requests/anchors';
import { renderRequestEmail } from '@/lib/data-requests/email';
import { fieldFor, formatAnswer, type RequestableField } from '@/lib/data-requests/fields';
import { currentPayload, getDataRequest } from '@/lib/data-requests/queries';
import { mergeSubmission } from '@/lib/data-requests/merge';
import { supplierLink, tokenExpiresAt } from '@/lib/data-requests/tokens';
import { getPartner } from '@/lib/partners/queries';
import { TIER_LABEL, countryName, type SupplyTier } from '@/lib/partners/vocab';
import { getWorkspace } from '../../queries';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { daysUntil, formatDate, relativeTime } from '../../partners/presentation';
import { CopyLink } from '../copy-link';
import { RequestStatusBadge } from '../request-status';
import { DiffHeader, DiffRow, verdictOf, type ReviewExisting, type ReviewItem } from '../answer-diff';
import { ReviewPanel } from '../review-panel';

export const metadata = { title: 'Data request' };

const AWAITING_REVIEW = ['submitted', 'under_review'];

/**
 * One request, as a comparison.
 *
 * The reviewer's question is never "what did they write" — it is "does what
 * they wrote change anything, and is any of it wrong". So the answers are
 * shown against what the attached passports already hold, and the three
 * things that can be true of a field (new, the same, contradictory) are named
 * in words on every row.
 */
export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ link?: string; reminder?: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  const tenantId = session.tenantId;

  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  const detail = await getDataRequest(tenantId, requestId);
  if (!detail) notFound();

  const { request, submission, partner, passports, reviewer, createdBy } = detail;
  const workspace = await getWorkspace(tenantId);

  const now = new Date();
  const expiresAt = tokenExpiresAt(request);
  const fields = request.requestedFields.map((path) => fieldFor(path)).filter((f) => f !== null);
  const awaitingReview = AWAITING_REVIEW.includes(request.status);
  const hasAnswers = Object.keys(submission.values).length > 0;

  // The current state of every attached passport, read once. It feeds both the
  // side-by-side comparison and the dry-run merge below; nothing here writes.
  const payloads =
    passports.length > 0 && (hasAnswers || awaitingReview)
      ? await Promise.all(
          passports.map(async (target) => ({
            dppId: target.dppId,
            payload: (await currentPayload(tenantId, target.id))?.payload ?? {},
          })),
        )
      : [];

  // A dry run of the merge, so the reviewer sees the disagreements before
  // committing rather than after.
  const conflictsByPath = new Map<string, Array<{ dppId: string; existing: string }>>();
  if (awaitingReview && payloads.length > 0) {
    const fullPartner = partner ? await getPartner(tenantId, partner.id) : null;
    const anchors = anchorsFor(
      fullPartner
        ? {
            id: fullPartner.id,
            name: fullPartner.name,
            tier: fullPartner.tier,
            country: fullPartner.country,
            roles: fullPartner.roles,
            gln: fullPartner.gln,
            osId: fullPartner.osId,
          }
        : null,
    );

    for (const target of payloads) {
      const dry = mergeSubmission(target.payload, submission.values, { anchors });
      for (const conflict of dry.conflicts) {
        const list = conflictsByPath.get(conflict.field) ?? [];
        list.push({ dppId: target.dppId, existing: String(conflict.existing) });
        conflictsByPath.set(conflict.field, list);
      }
    }
  }

  const reviewItems: ReviewItem[] = fields.map((field) => {
    const value = submission.values[field.path];
    const answered = value !== null && value !== undefined && value !== '';
    return {
      path: field.path,
      label: field.label,
      basis: field.basis,
      sectionLabel: field.sectionLabel,
      answer: formatAnswer(field, value),
      answered,
      existing: existingFor(field, payloads, passports.length),
      conflicts: conflictsByPath.get(field.path) ?? [],
    };
  });

  const answeredCount = reviewItems.filter((item) => item.answered).length;
  const disagreeing = reviewItems.filter((item) => verdictOf(item) === 'conflict').length;
  const fresh = reviewItems.filter((item) => verdictOf(item) === 'new').length;
  const sections = new Set(fields.map((f) => f.sectionLabel));

  const email = renderRequestEmail({
    brandName: workspace?.legalName ?? 'Your brand',
    partnerName: partner?.name ?? 'your supplier',
    contactName: partner?.contactName ?? null,
    title: request.title,
    message: request.message,
    fieldCount: fields.length,
    sectionLabels: [...sections],
    dueAt: request.dueAt,
    link: query.link ? supplierLink(query.link) : 'https://polytrail.eu/s/…',
    reminder: query.reminder === '1',
  });

  const late =
    request.dueAt !== null &&
    request.submittedAt === null &&
    ['sent', 'in_progress', 'rejected'].includes(request.status)
      ? Math.max(0, -daysUntil(request.dueAt, now))
      : 0;

  return (
    <>
      <PageHeader
        title={request.title}
        description={
          partner
            ? `${partner.name} · ${TIER_LABEL[partner.tier as SupplyTier] ?? partner.tier} · ${countryName(partner.country)}`
            : 'The supplier this was addressed to has been removed.'
        }
        actions={
          <>
            {request.status === 'draft' ? (
              <form action={sendRequest.bind(null, request.id)}>
                <Button type="submit" size="sm">
                  <Send aria-hidden />
                  Send
                </Button>
              </form>
            ) : null}
            {['sent', 'in_progress', 'rejected'].includes(request.status) ? (
              <form action={remindRequest.bind(null, request.id)}>
                <Button type="submit" size="sm" variant="secondary">
                  <BellRing aria-hidden />
                  Send a reminder
                </Button>
              </form>
            ) : null}
            {!['approved', 'cancelled'].includes(request.status) ? (
              <form action={cancelRequest.bind(null, request.id)}>
                <Button type="submit" size="sm" variant="ghost">
                  <Ban aria-hidden />
                  Cancel
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <RequestStatusBadge status={request.status} />
          <span className="text-xs text-ink-muted tabular-nums">
            {request.dueAt
              ? late > 0
                ? `Due ${formatDate(request.dueAt)} — ${late} ${late === 1 ? 'day' : 'days'} late`
                : `Due ${formatDate(request.dueAt)}`
              : 'No deadline set'}
            {expiresAt ? ` · link expires ${formatDate(expiresAt)}` : ''}
          </span>
          {createdBy ? (
            <span className="text-xs text-ink-subtle">Written by {createdBy.name}</span>
          ) : null}
          {request.sentAt ? (
            <span className="text-xs text-ink-subtle" title={formatDate(request.sentAt)}>
              Sent {relativeTime(request.sentAt, now)}
            </span>
          ) : null}
        </div>

        {query.link ? (
          <section className="rounded-lg border border-accent-border bg-accent-soft/40 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Link2 className="size-4 text-accent" aria-hidden />
              {query.reminder === '1' ? 'New link issued' : 'The supplier link'}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              This is the only time it is shown. Only a hash is stored, so it cannot be recovered —
              issue a new one from &ldquo;Send a reminder&rdquo; if it goes astray.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="mono min-w-0 flex-1 overflow-x-auto rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink">
                {supplierLink(query.link)}
              </code>
              <CopyLink value={supplierLink(query.link)} />
            </div>
          </section>
        ) : null}

        {request.status === 'rejected' && request.reviewNotes ? (
          <section className="rounded-lg border border-critical-border bg-critical-soft/40 p-5">
            <h2 className="text-sm font-semibold text-ink">Sent back to the supplier</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink">{request.reviewNotes}</p>
            {reviewer ? (
              <p className="mt-2 text-xs text-ink-subtle">
                {reviewer.name}
                {request.reviewedAt ? ` · ${formatDate(request.reviewedAt)}` : ''}
              </p>
            ) : null}
          </section>
        ) : null}

        <StatRow>
          <StatTile
            label="Fields asked for"
            value={fields.length}
            context={`across ${sections.size} ${sections.size === 1 ? 'section' : 'sections'}`}
            tone="accent"
          />
          <StatTile
            label="Answered"
            value={answeredCount}
            context={
              fields.length === 0
                ? 'nothing requested'
                : `of ${fields.length} · ${Math.round((answeredCount / fields.length) * 100)}%`
            }
            tone={answeredCount === fields.length ? 'positive' : 'caution'}
          />
          <StatTile
            label="New information"
            value={fresh}
            context={
              passports.length === 0
                ? 'no passport attached to compare'
                : `${reviewItems.length - fresh - disagreeing} already recorded or blank`
            }
            tone={fresh > 0 ? 'positive' : 'neutral'}
          />
          <StatTile
            label="Disagreements"
            value={disagreeing}
            context={
              disagreeing === 0
                ? 'nothing contradicts the passport'
                : 'a person decides each of these'
            }
            tone={disagreeing > 0 ? 'caution' : 'positive'}
          />
        </StatRow>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {awaitingReview ? (
              <ReviewPanel action={reviewRequest.bind(null, request.id)} items={reviewItems} />
            ) : (
              <section className="overflow-hidden rounded-lg border border-line bg-surface">
                <header className="border-b border-line px-5 py-4">
                  <h2 className="text-sm font-semibold text-ink">
                    {hasAnswers ? 'What was asked, and what came back' : 'What was asked'}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted tabular-nums">
                    {fields.length} {fields.length === 1 ? 'field' : 'fields'} across{' '}
                    {sections.size} {sections.size === 1 ? 'section' : 'sections'}
                    {hasAnswers ? ` · ${answeredCount} answered` : ''}
                  </p>
                </header>
                {hasAnswers ? <DiffHeader /> : null}
                <ul className="divide-y divide-line">
                  {reviewItems.map((item) => (
                    <DiffRow key={item.path} item={item} />
                  ))}
                </ul>
              </section>
            )}

            {submission.merges && submission.merges.length > 0 ? (
              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="text-sm font-semibold text-ink">What was merged</h2>
                <ul className="mt-3 flex flex-col gap-3 text-sm">
                  {submission.merges.map((merge) => (
                    <li key={`${merge.dppId}-${merge.version}`}>
                      <p className="text-ink">
                        <span className="mono">{merge.dppId}</span> version{' '}
                        <span className="tabular-nums">{merge.version}</span> ·{' '}
                        <span className="tabular-nums">{merge.changes.length}</span>{' '}
                        {merge.changes.length === 1 ? 'field' : 'fields'}
                      </p>
                      <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-muted">
                        {merge.changes.map((change) => (
                          <li key={change.path}>
                            <span className="mono">{change.path}</span>{' '}
                            {change.from === null
                              ? 'set to'
                              : `changed from ${String(change.from)} to`}{' '}
                            <span className="text-ink">{String(change.to)}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Passports covered</h2>
              {passports.length === 0 ? (
                <p className="mt-2 text-sm leading-relaxed text-caution">
                  None attached. Answers cannot be merged until at least one passport is, so this
                  request currently collects data that has nowhere to land.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                  {passports.map((passport) => (
                    <li key={passport.id} className="flex items-center justify-between gap-2">
                      <Link
                        href={`/console/passports/${passport.dppId}`}
                        className="min-w-0 truncate text-ink transition-colors duration-[140ms] hover:text-accent"
                      >
                        {passport.productName}
                      </Link>
                      <StatusBadge status={passport.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {submission.respondent?.name || submission.respondent?.email ? (
              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <UserRound className="size-4 text-ink-subtle" aria-hidden />
                  Who answered
                </h2>
                <p className="mt-2 text-sm text-ink">
                  {submission.respondent.name ?? 'Name not given'}
                </p>
                {submission.respondent.role ? (
                  <p className="text-sm text-ink-muted">{submission.respondent.role}</p>
                ) : null}
                {submission.respondent.email ? (
                  <p className="text-sm break-all text-ink-muted">{submission.respondent.email}</p>
                ) : null}
                {request.submittedAt ? (
                  <p className="mt-2 text-xs text-ink-subtle" title={formatDate(request.submittedAt)}>
                    Submitted {relativeTime(request.submittedAt, now)}
                  </p>
                ) : null}
              </section>
            ) : null}

            {submission.documents && submission.documents.length > 0 ? (
              <section className="rounded-lg border border-line bg-surface p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <FileText className="size-4 text-ink-subtle" aria-hidden />
                  Documents named
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Metadata only — the portal cannot accept files yet, so ask for these by email.
                </p>
                <ul className="mt-3 flex flex-col gap-1">
                  {submission.documents.map((doc) => (
                    <li key={`${doc.field}-${doc.filename}`} className="mono text-xs text-ink">
                      {doc.filename}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Mail className="size-4 text-ink-subtle" aria-hidden />
                The message they received
              </h2>
              <p className="mt-2 text-sm font-medium text-ink">{email.subject}</p>
              <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-ink-muted">
                {email.body}
              </pre>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/** Walk a dotted registry path. Returns undefined rather than throwing. */
function readPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * What the attached passports currently hold for one field.
 *
 * A path with a `*` addresses a repeating section, where there is no single
 * current value to compare against — saying "nothing recorded" there would be
 * a lie, so the row says so plainly instead.
 */
function existingFor(
  field: RequestableField,
  payloads: Array<{ dppId: string; payload: unknown }>,
  passportCount: number,
): ReviewExisting | null {
  if (passportCount === 0) return null;
  if (field.path.includes('*')) return { known: false, display: '—', varies: false };
  if (payloads.length === 0) return null;

  const displays = payloads.map((target) => formatAnswer(field, readPath(target.payload, field.path)));
  const distinct = [...new Set(displays)];
  if (distinct.length === 1) return { known: true, display: distinct[0]!, varies: false };

  const meaningful = distinct.filter((value) => value !== '—');
  return {
    known: true,
    display: meaningful.length > 0 ? meaningful.join(' / ') : '—',
    varies: true,
  };
}
