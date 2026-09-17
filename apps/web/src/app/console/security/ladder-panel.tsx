'use client';

import { useActionState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CircleDashed,
  Clock,
  Globe,
  Mail,
  MinusCircle,
  Stamp,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  LEVEL_ORDER,
  rankOf,
  type LadderRung,
  type LadderStatus,
  type VerificationLevel,
} from '@/lib/verification/types';
import type { OpenDomainChallenge, PendingReview } from './queries';
import {
  confirmEmailAction,
  reviewDocumentsAction,
  sendEmailChallengeAction,
  startDomainAction,
  submitDocumentsAction,
  verifyDomainAction,
  type DomainChallengeState,
  type SecurityState,
} from './actions';

/**
 * The operator verification ladder, drawn as a ladder.
 *
 * The levels are cumulative and each one unlocks something specific, so the
 * shape on screen is a rail with rungs on it rather than four cards that happen
 * to be stacked: a brand should be able to see where it is standing, what it
 * climbed to get there, and what the next rung buys, without reading a word.
 *
 * Rungs already climbed are quiet — they are settled. The next rung is the only
 * one carrying a form. The top rung is drawn as unreachable because it is.
 */
export function LadderPanel({
  ladder,
  pendingReviews,
  openDomainChallenge,
  canReview,
}: {
  ladder: LadderStatus;
  pendingReviews: PendingReview[];
  openDomainChallenge: OpenDomainChallenge | null;
  canReview: boolean;
}) {
  // The rung the brand should be working on: the lowest one not yet standing.
  const nextIndex = ladder.rungs.findIndex(
    (rung) => rung.definition.level !== 'unverified' && rung.state !== 'verified',
  );

  return (
    <section aria-labelledby="ladder-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="ladder-heading" className="text-sm font-semibold text-ink">
          Operator verification
        </h2>
        <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-muted">
          The EU DPP Registry will not accept a filing from an operator whose identity has not been
          established. Art. 4 sets the bar at a qualified electronic seal — a requirement no vendor
          in this market currently mentions.
        </p>
      </div>

      <ol className="relative flex flex-col">
        {ladder.rungs
          .filter((rung) => rung.definition.level !== 'unverified')
          .map((rung, index, all) => (
            <li key={rung.definition.level} className="relative flex gap-4 pb-4 last:pb-0">
              {/* The rail. It stops at the last rung rather than running off
                  the bottom, because there is nothing above the top one. */}
              {index < all.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-9 bottom-0 left-[0.9375rem] w-px',
                    rung.state === 'verified' ? 'bg-positive' : 'bg-line',
                  )}
                />
              ) : null}

              <Marker rung={rung} step={index + 1} />

              <Rung
                rung={rung}
                current={ladder.level}
                isNext={ladder.rungs.indexOf(rung) === nextIndex}
                openDomainChallenge={openDomainChallenge}
              />
            </li>
          ))}
      </ol>

      {canReview && pendingReviews.length > 0 ? <ReviewQueue reviews={pendingReviews} /> : null}
    </section>
  );
}

const ICONS: Record<VerificationLevel, typeof Mail> = {
  unverified: CircleDashed,
  email_confirmed: Mail,
  domain_verified: Globe,
  document_verified: Check,
  qualified_seal: Stamp,
};

/** The rung itself: a numbered step on the rail, filled once it is standing. */
function Marker({ rung, step }: { rung: LadderRung; step: number }) {
  const Icon = ICONS[rung.definition.level];
  const verified = rung.state === 'verified';
  const unavailable = rung.state === 'unavailable';

  return (
    <span
      aria-hidden
      className={cn(
        'relative z-10 mt-2 flex size-8 shrink-0 items-center justify-center rounded-full border',
        verified && 'border-positive bg-positive text-white',
        !verified && unavailable && 'border-dashed border-line-strong bg-canvas text-ink-subtle',
        !verified && !unavailable && 'border-line-strong bg-surface text-ink-muted',
      )}
    >
      {verified ? <Check className="size-4" /> : <Icon className="size-4" />}
      <span className="absolute -bottom-4 text-2xs tabular-nums text-ink-subtle">{step}</span>
    </span>
  );
}

function StateBadge({ state }: { state: LadderRung['state'] }) {
  switch (state) {
    case 'verified':
      return (
        <Badge tone="positive">
          <Check aria-hidden />
          Achieved
        </Badge>
      );
    case 'pending':
      return (
        <Badge tone="caution">
          <Clock aria-hidden />
          Waiting on a decision
        </Badge>
      );
    case 'expired':
      return (
        <Badge tone="critical">
          <CalendarClock aria-hidden />
          Expired
        </Badge>
      );
    case 'revoked':
      return (
        <Badge tone="critical">
          <XCircle aria-hidden />
          Withdrawn
        </Badge>
      );
    case 'unavailable':
      return (
        <Badge tone="neutral">
          <MinusCircle aria-hidden />
          Not implemented
        </Badge>
      );
    default:
      return (
        <Badge tone="outline">
          <CircleDashed aria-hidden />
          Not started
        </Badge>
      );
  }
}

function Rung({
  rung,
  current,
  isNext,
  openDomainChallenge,
}: {
  rung: LadderRung;
  current: VerificationLevel;
  isNext: boolean;
  openDomainChallenge: OpenDomainChallenge | null;
}) {
  const isCurrent = rung.definition.level === current;
  const verified = rung.state === 'verified';
  const unreachable =
    rung.state === 'unavailable' ||
    (!verified && !isNext && rankOf(rung.definition.level) > rankOf(current) + 1);

  const dateOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };

  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-lg border px-5 py-4',
        isCurrent && 'border-accent-border bg-surface',
        !isCurrent && verified && 'border-line bg-surface',
        !isCurrent && !verified && 'border-line bg-surface',
        unreachable && 'bg-surface-sunken/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
            {rung.definition.label}
            <span className="text-2xs font-normal text-ink-subtle">
              Level {LEVEL_ORDER.indexOf(rung.definition.level)} of {LEVEL_ORDER.length - 1}
            </span>
            {isCurrent ? <span className="text-2xs font-normal text-accent">You are here</span> : null}
          </p>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
            {rung.definition.method}
          </p>
        </div>
        <StateBadge state={rung.state} />
      </div>

      {/* Unlocks is the reason anyone climbs, so it is a statement rather than a
          row in a definition list. */}
      <p className="mt-3 rounded-md border border-line bg-surface-sunken/60 px-3.5 py-2.5 text-sm leading-relaxed text-ink">
        <span className="font-medium">Unlocks</span>{' '}
        <span className="text-ink-muted">{rung.definition.unlocks}</span>
      </p>

      <dl className="mt-3 grid gap-x-8 gap-y-2 border-t border-line pt-3 text-2xs sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-subtle">What is achieved</dt>
          <dd className="text-ink-muted">
            {verified ? (
              <>
                {rung.summary ? <span className="mono">{rung.summary}</span> : 'Established'}
                {rung.verifiedAt
                  ? ` · ${new Date(rung.verifiedAt).toLocaleDateString('en-GB', dateOptions)}`
                  : ''}
              </>
            ) : rung.state === 'pending' ? (
              'Submitted, not yet decided'
            ) : (
              'Nothing yet'
            )}
          </dd>
        </div>

        <div className="flex flex-col gap-0.5">
          <dt className="text-ink-subtle">When it lapses</dt>
          <dd className="text-ink-muted">
            {rung.expiresAt ? (
              <>
                {new Date(rung.expiresAt).toLocaleDateString('en-GB', dateOptions)}
                <span className="text-ink-subtle">
                  {' '}
                  · {rung.definition.validForDays} days from proof
                </span>
              </>
            ) : rung.definition.validForDays == null ? (
              'Does not expire'
            ) : (
              `${rung.definition.validForDays} days once established`
            )}
          </dd>
        </div>

        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <dt className="text-ink-subtle">Basis</dt>
          <dd className="text-ink-muted">{rung.definition.instrument}</dd>
        </div>
      </dl>

      {rung.definition.expiryBasis ? (
        <p className="mt-2 max-w-prose text-2xs leading-relaxed text-ink-subtle">
          {rung.definition.expiryBasis}
        </p>
      ) : null}

      <div className="mt-4">
        {rung.definition.level === 'email_confirmed' ? <EmailRung rung={rung} /> : null}
        {rung.definition.level === 'domain_verified' ? (
          <DomainRung rung={rung} openChallenge={openDomainChallenge} />
        ) : null}
        {rung.definition.level === 'document_verified' ? <DocumentRung rung={rung} /> : null}
        {rung.definition.level === 'qualified_seal' ? <SealRung /> : null}
      </div>
    </div>
  );
}

function Notice({ state }: { state: SecurityState | DomainChallengeState }) {
  if (!state.error && !state.message) return null;
  const error = Boolean(state.error);
  return (
    <p
      role="status"
      className={
        error
          ? 'mt-3 flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2 text-sm text-critical'
          : 'mt-3 flex items-start gap-2 rounded-md border border-positive-border bg-positive-soft px-3 py-2 text-sm text-positive'
      }
    >
      {error ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      {state.error ?? state.message}
    </p>
  );
}

function EmailRung({ rung }: { rung: LadderRung }) {
  const [sendState, send, sending] = useActionState<SecurityState, FormData>(
    sendEmailChallengeAction,
    {},
  );
  const [confirmState, confirm, confirming] = useActionState<SecurityState, FormData>(
    confirmEmailAction,
    {},
  );

  if (rung.state === 'verified') {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        Change the workspace contact address in Settings and it will need confirming again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <form action={send}>
          <Button type="submit" size="sm" variant="secondary" loading={sending}>
            <Mail aria-hidden />
            Send a code
          </Button>
        </form>

        <form action={confirm} className="flex items-end gap-2">
          <Field label="Code from the email" htmlFor="email-token" className="w-72">
            <Input id="email-token" name="token" autoComplete="one-time-code" required />
          </Field>
          <Button type="submit" size="sm" loading={confirming}>
            Confirm
          </Button>
        </form>
      </div>
      <Notice state={sendState} />
      <Notice state={confirmState} />
    </div>
  );
}

function DomainRung({
  rung,
  openChallenge,
}: {
  rung: LadderRung;
  openChallenge: OpenDomainChallenge | null;
}) {
  const [startState, start, starting] = useActionState<DomainChallengeState, FormData>(
    startDomainAction,
    {},
  );
  const [verifyState, verify, verifying] = useActionState<DomainChallengeState, FormData>(
    verifyDomainAction,
    {},
  );

  const challenge = startState.challenge ?? openChallenge;

  if (rung.state === 'verified') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm leading-relaxed text-ink-muted">
          Leave the TXT record in place — it is re-checked when the year is up, and removing it
          drops the workspace back a rung.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-accent hover:underline">
            Verify a different domain
          </summary>
          <form action={start} className="mt-3 flex items-end gap-2">
            <Field label="Domain" htmlFor="domain-input-alt" className="w-72">
              <Input id="domain-input-alt" name="domain" placeholder="example.com" required />
            </Field>
            <Button type="submit" size="sm" variant="secondary" loading={starting}>
              Issue a challenge
            </Button>
          </form>
        </details>
        <Notice state={startState} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={start} className="flex flex-wrap items-end gap-2">
        <Field
          label="Domain"
          htmlFor="domain-input"
          hint="The domain your passport links live on. No https, no path."
          className="w-72"
        >
          <Input id="domain-input" name="domain" placeholder="example.com" required />
        </Field>
        <Button type="submit" size="sm" variant="secondary" loading={starting}>
          <Globe aria-hidden />
          Issue a challenge
        </Button>
      </form>

      {challenge ? (
        <div className="rounded-md border border-line bg-surface-sunken/60 px-4 py-3">
          <p className="text-sm text-ink">
            Add this TXT record to <span className="font-medium">{challenge.domain}</span>:
          </p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-2xs sm:grid-cols-[5rem_1fr]">
            <dt className="text-ink-subtle">Name</dt>
            <dd className="mono break-all text-ink">{challenge.recordName}</dd>
            <dt className="text-ink-subtle">Type</dt>
            <dd className="mono text-ink">TXT</dd>
            <dt className="text-ink-subtle">Value</dt>
            <dd className="mono break-all text-ink">{challenge.recordValue}</dd>
          </dl>

          <form action={verify} className="mt-3">
            <input type="hidden" name="verificationId" value={challenge.verificationId} />
            <Button type="submit" size="sm" loading={verifying}>
              Check the record
            </Button>
          </form>

          {verifyState.found && verifyState.found.length > 0 ? (
            <div className="mt-3 text-2xs">
              <p className="text-ink-subtle">What we found at that name:</p>
              <ul className="mono mt-1 flex flex-col gap-0.5 text-ink-muted">
                {verifyState.found.map((value) => (
                  <li key={value} className="break-all">
                    {value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <Notice state={startState} />
      <Notice state={verifyState} />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentRung({ rung }: { rung: LadderRung }) {
  const [state, action, pending] = useActionState<SecurityState, FormData>(
    submitDocumentsAction,
    {},
  );

  if (rung.state === 'verified') {
    return (
      <p className="text-sm leading-relaxed text-ink-muted">
        A reviewer approved this workspace’s registration documents. Re-submit before the two years
        are up — a company extract older than that is no longer evidence of anything current.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        Attach the document itself. It is stored hashed, so the reviewer decides on the exact bytes
        you submitted — and an auditor can later prove they never changed.
      </p>
      <form action={action} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Document type" htmlFor="document-kind">
            <Input
              id="document-kind"
              name="documentKind"
              placeholder="Company registry extract"
              required
            />
          </Field>
          <Field
            label="File"
            htmlFor="document-file"
            hint="PDF, image, CSV or text. 8 MB at most."
          >
            <input
              id="document-file"
              name="documentFile"
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain"
              className="block w-full cursor-pointer rounded-md border border-line-strong bg-surface text-sm text-ink-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-l-md file:border-0 file:border-r file:border-line file:bg-surface-sunken file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-line/60"
            />
          </Field>
          <Field label="Reference" htmlFor="document-reference" hint="Registration or LEI number.">
            <Input id="document-reference" name="documentReference" placeholder="Optional" />
          </Field>
        </div>
        <Field label="Notes for the reviewer" htmlFor="document-notes">
          <Textarea id="document-notes" name="notes" rows={2} />
        </Field>
        <div>
          <Button type="submit" size="sm" variant="secondary" loading={pending}>
            Submit for review
          </Button>
        </div>
      </form>
      <Notice state={state} />
    </div>
  );
}

/**
 * The rung that is deliberately not clickable.
 *
 * Polytrail does not hold a qualified certificate from a QTSP, so there is no
 * button here. Offering one that produced a green tick would be a lie with a
 * regulation attached to it.
 */
function SealRung() {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-surface-sunken/60 px-4 py-3">
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        Polytrail does not yet hold a qualified certificate from a trust service provider on the EU
        Trusted List, so this step cannot be completed here and no button pretends otherwise. What
        exists is the gate: a filing of record is refused until this rung stands, and the
        pre-submission check says so by name.
      </p>
      <p className="mt-2 max-w-prose text-2xs leading-relaxed text-ink-subtle">
        Obtaining one is a procurement exercise with a QTSP, not a code change. When it lands, the
        seal is applied to the canonical form of the submission envelope this product already
        builds.
      </p>
    </div>
  );
}

function ReviewQueue({ reviews }: { reviews: PendingReview[] }) {
  const [state, action, pending] = useActionState<SecurityState, FormData>(
    reviewDocumentsAction,
    {},
  );

  return (
    <div className="rounded-lg border border-caution-border bg-caution-soft px-5 py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-caution">
        <Clock className="size-4" aria-hidden />
        {reviews.length} submission{reviews.length === 1 ? '' : 's'} waiting on a decision
      </h3>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        You are approving your own workspace’s evidence, which is exactly the conflict a qualified
        seal removes. Record what you actually checked.
      </p>

      {reviews.map((review) => (
        <form key={review.id} action={action} className="mt-4 border-t border-caution-border pt-3">
          <input type="hidden" name="verificationId" value={review.id} />

          <p className="text-2xs tabular-nums text-ink-subtle">
            Submitted {new Date(review.submittedAt).toLocaleString('en-GB')}
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-sm text-ink">
            {review.documents.map((document) => (
              <li key={`${document.kind}-${document.fileName}`}>
                {document.kind} —{' '}
                {document.documentId ? (
                  /* Open the actual bytes in a new tab. Reviewing a filename
                     was the old, dishonest version of this queue. */
                  <a
                    href={`/api/documents/${document.documentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-2xs text-accent underline decoration-accent/35 underline-offset-2 hover:decoration-accent"
                  >
                    {document.fileName}
                  </a>
                ) : (
                  <span className="mono text-2xs">{document.fileName}</span>
                )}
                {typeof document.sizeBytes === 'number' && document.sizeBytes > 0 ? (
                  <span className="text-2xs text-ink-subtle tabular-nums">
                    {' '}
                    · {formatBytes(document.sizeBytes)}
                  </span>
                ) : null}
                {document.contentHash ? (
                  <span className="mono text-2xs text-ink-subtle">
                    {' '}
                    · {document.contentHash.slice(0, 10)}…{document.contentHash.slice(-4)}
                  </span>
                ) : null}
                {document.reference ? (
                  <span className="text-ink-muted"> · {document.reference}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {review.notes ? <p className="mt-1 text-sm text-ink-muted">{review.notes}</p> : null}

          <Field label="Decision note" htmlFor={`review-notes-${review.id}`} className="mt-3">
            <Textarea
              id={`review-notes-${review.id}`}
              name="notes"
              rows={2}
              placeholder="What you checked, and against what."
            />
          </Field>

          {/* The decision rides on the submit button's own name and value, so
              which button was pressed is carried by the form post itself rather
              than by React state that may not have flushed. */}
          <div className="mt-3 flex gap-2">
            <Button type="submit" name="decision" value="approve" size="sm" loading={pending}>
              Approve
            </Button>
            <Button
              type="submit"
              name="decision"
              value="reject"
              size="sm"
              variant="secondary"
              loading={pending}
            >
              Reject
            </Button>
          </div>
        </form>
      ))}

      <Notice state={state} />
    </div>
  );
}
