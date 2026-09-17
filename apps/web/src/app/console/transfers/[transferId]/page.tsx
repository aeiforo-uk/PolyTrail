import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  FileSignature,
  Hourglass,
  KeyRound,
  Mail,
  Send,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getPassportForTransfer, getTransfer } from '@/lib/transfers/queries';
import { canCancel } from '@/lib/transfers/state';
import { transferReasonMeta, transferStatusMeta } from '@/lib/transfers/types';
import { listEvents } from '@/lib/lifecycle/events';
import { formatDppId } from '@/lib/passport/identifier';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { TransferStatusBadge } from '../transfer-status';
import { CancelButton } from './cancel-button';
import { DecidePanel } from './decide-panel';
import { CredentialPanel } from './credential-panel';

export const metadata = { title: 'Transfer' };

/**
 * One transfer, read as a chain of custody.
 *
 * The page is arranged as the record reads, top to bottom: who offered what,
 * what they signed, who it went to, what came back, and what the new owner can
 * now see. A dispute is answered by scrolling, not by asking an operator to run
 * a query.
 */
export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { transferId } = await params;
  const transfer = await getTransfer(session.tenantId, transferId);
  if (!transfer) notFound();

  const reason = transferReasonMeta(transfer.reason);
  const status = transferStatusMeta(transfer.status);
  const passport = await getPassportForTransfer(transfer.dppId);
  const timeline = passport ? await listEvents(passport.id) : [];

  const withdrawable = canCancel(
    {
      status: transfer.status,
      fromTenantId: transfer.fromTenantId,
      toTenantId: transfer.toTenantId,
      toEmail: transfer.toEmail,
      expiresAt: transfer.expiresAt,
    },
    session,
  );

  const credentialHash =
    typeof transfer.metadata.credentialHash === 'string' ? transfer.metadata.credentialHash : null;
  const acceptanceHash =
    typeof transfer.metadata.acceptanceCredentialHash === 'string'
      ? transfer.metadata.acceptanceCredentialHash
      : null;

  const recipient = transfer.toTenantName ?? transfer.toEmail ?? 'Not yet claimed';
  const accepted = transfer.status === 'accepted';

  return (
    <>
      <PageHeader
        title={transfer.productName ?? 'Untitled item'}
        description={`${transfer.outgoing ? 'Leaving this workspace' : 'Offered to this workspace'} · ${reason.label} · ${status.description}`}
        actions={
          <>
            <TransferStatusBadge status={transfer.status} />
            {withdrawable.ok ? <CancelButton transferId={transfer.id} /> : null}
            <Button asChild variant="ghost" size="sm">
              <Link href="/console/transfers">
                <ArrowLeft aria-hidden />
                All transfers
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-8 px-8 py-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          {!transfer.outgoing && transfer.status === 'initiated' ? (
            <DecidePanel
              transferId={transfer.id}
              grants={reason.grants}
              fromName={transfer.fromTenantName}
            />
          ) : null}

          <section aria-labelledby="parties-heading">
            <h2 id="parties-heading" className="eyebrow mb-3">
              Chain of custody
            </h2>

            <div className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <Party
                label="Held by"
                name={transfer.fromTenantName}
                detail={
                  transfer.initiatedByName ? `Offered by ${transfer.initiatedByName}` : null
                }
                settled
              />
              <span className="flex items-center justify-center text-ink-subtle" aria-hidden>
                <ArrowRight className="size-4" />
              </span>
              <Party
                label={accepted ? 'Now held by' : 'Offered to'}
                name={recipient}
                detail={
                  transfer.toTenantName
                    ? transfer.toEmail
                    : transfer.status === 'initiated'
                      ? 'No workspace yet — one is created on acceptance'
                      : 'Never claimed'
                }
                settled={accepted}
              />
            </div>

            <ol className="mt-6 flex flex-col">
              <Step
                icon={Send}
                tone="settled"
                title={`${transfer.fromTenantName} made the offer`}
                meta={`${formatDateTime(transfer.initiatedAt)}${transfer.initiatedByName ? ` · ${transfer.initiatedByName}` : ''}`}
              >
                <p className="text-sm text-ink-muted">
                  <span className="text-ink">{reason.label}.</span> {reason.summary}
                </p>
                {transfer.note ? (
                  <blockquote className="mt-3 border-l-2 border-line-strong pl-3 text-sm text-ink-muted italic">
                    {transfer.note}
                  </blockquote>
                ) : null}
              </Step>

              <Step
                icon={FileSignature}
                tone={transfer.transferCredential ? 'settled' : 'pending'}
                title="The sender signed what they were handing over"
                meta={
                  transfer.transferCredential
                    ? 'Stored exactly as issued'
                    : 'No credential was issued'
                }
              >
                <CredentialPanel
                  title="Transfer credential"
                  description={`Issued by ${transfer.fromTenantName} when the offer was sent. It names the item, the reason and what the recipient would be able to read.`}
                  document={transfer.transferCredential}
                  hash={credentialHash}
                />
              </Step>

              <Step
                icon={Mail}
                tone="settled"
                title={`The link went to ${transfer.toEmail ?? 'the recipient'}`}
                meta={
                  transfer.expiresAt
                    ? `Works until ${formatDateTime(transfer.expiresAt)}`
                    : 'No expiry'
                }
              >
                <p className="text-sm text-ink-muted">
                  Anyone holding the link can read the offer without an account. Only accepting
                  needs an identity, because ownership has to belong to somebody.
                </p>
              </Step>

              {transfer.status === 'initiated' ? (
                <Step
                  icon={Hourglass}
                  tone="open"
                  title={`Waiting on ${recipient}`}
                  meta={
                    transfer.expiresAt
                      ? `The link stops working ${formatDateTime(transfer.expiresAt)}`
                      : 'No expiry set'
                  }
                  last
                >
                  <p className="text-sm text-ink-muted">
                    Nothing has moved. {transfer.fromTenantName} still holds the passport and is
                    still answerable for it.
                  </p>
                </Step>
              ) : transfer.status === 'accepted' ? (
                <>
                  <Step
                    icon={CircleCheck}
                    tone="good"
                    title={`${transfer.toTenantName ?? 'The recipient'} accepted`}
                    meta={`${transfer.completedAt ? formatDateTime(transfer.completedAt) : 'Date not recorded'}${transfer.completedByName ? ` · ${transfer.completedByName}` : ''}`}
                  >
                    <CredentialPanel
                      title="Acceptance credential"
                      description="Signed by the recipient. Two signatures, kept verbatim, so a disagreement about what was handed over is settled from the record rather than from memory."
                      document={transfer.acceptanceCredential}
                      hash={acceptanceHash}
                    />
                  </Step>

                  <Step
                    icon={KeyRound}
                    tone="good"
                    title="What the new owner can now read"
                    meta={`${reason.tier} tier`}
                    last
                  >
                    <p className="text-sm text-ink">{reason.grants}</p>
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {reason.becomesBrandOfRecord
                        ? 'They are the brand of record for this passport and manage it in their own console.'
                        : 'They read a projection of the passport at that tier. Editing it stays with the brand of record.'}
                    </p>
                    {reason.event ? (
                      <p className="mt-1.5 text-sm text-ink-muted">
                        A &ldquo;{reason.event.replace(/_/g, ' ')}&rdquo; event was added to the
                        item&rsquo;s own record.
                      </p>
                    ) : null}
                  </Step>
                </>
              ) : (
                <Step
                  icon={
                    transfer.status === 'rejected'
                      ? CircleX
                      : transfer.status === 'cancelled'
                        ? CircleSlash
                        : Clock
                  }
                  tone={transfer.status === 'rejected' ? 'bad' : 'closed'}
                  title={
                    transfer.status === 'rejected'
                      ? `${recipient} declined`
                      : transfer.status === 'cancelled'
                        ? `${transfer.fromTenantName} withdrew the offer`
                        : 'The link expired'
                  }
                  meta={
                    transfer.completedAt
                      ? formatDateTime(transfer.completedAt)
                      : transfer.expiresAt
                        ? formatDateTime(transfer.expiresAt)
                        : ''
                  }
                  last
                >
                  <p className="text-sm text-ink-muted">{status.description}</p>
                  {transfer.rejectionReason ? (
                    <blockquote className="mt-3 border-l-2 border-critical-border pl-3 text-sm text-ink italic">
                      {transfer.rejectionReason}
                    </blockquote>
                  ) : null}
                </Step>
              )}
            </ol>
          </section>

          <section aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="eyebrow mb-1">
              What this item has been through
            </h2>
            <p className="mb-4 max-w-prose text-sm text-ink-muted">
              Every post-market event on the passport itself, oldest first. This survives the
              transfer — it is the item&rsquo;s history, not this workspace&rsquo;s.
            </p>

            {timeline.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-5 py-6 text-sm text-ink-muted">
                Nothing has been recorded against this item yet. Repairs, resales and collections
                land here as they happen.
              </p>
            ) : (
              <ol className="border-l border-line pl-5">
                {timeline.map((event) => (
                  <li key={event.id} className="relative pb-5 last:pb-0">
                    <span
                      aria-hidden
                      className="absolute top-1.5 -left-[1.4rem] size-2 rounded-full bg-line-strong ring-3 ring-canvas"
                    />
                    <p className="text-sm font-medium text-ink">
                      {event.label}
                      {event.terminal ? (
                        <span className="ml-2 text-2xs text-critical">closes the passport</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-subtle tabular-nums">
                      {formatDateTime(event.occurredAt)}
                      {event.actorName ? ` · ${event.actorName}` : ''}
                      {event.partnerName ? ` · ${event.partnerName}` : ''}
                    </p>
                    {event.summary ? (
                      <p className="mt-1 text-sm text-ink-muted">{event.summary}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">The item</h2>
            <p className="mt-2 text-sm text-ink">{transfer.productName ?? 'Untitled item'}</p>
            <Link
              href={`/p/${transfer.dppId}`}
              className="mono mt-1 block text-2xs text-ink-subtle transition-colors duration-[140ms] hover:text-accent"
            >
              {formatDppId(transfer.dppId)}
            </Link>
            <dl className="mt-4 flex flex-col gap-2.5 border-t border-line pt-4 text-xs">
              <Row label="Reason">{reason.label}</Row>
              <Row label="Access tier">{reason.tier}</Row>
              <Row label="Started">{formatDateTime(transfer.initiatedAt)}</Row>
              <Row label="Link expires">
                {transfer.expiresAt ? formatDateTime(transfer.expiresAt) : 'No expiry'}
              </Row>
              {transfer.completedAt ? (
                <Row label="Decided">{formatDateTime(transfer.completedAt)}</Row>
              ) : null}
            </dl>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Signatures</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Both sides sign. Neither document can be edited after it is issued.
            </p>
            <ul className="mt-3 flex flex-col gap-2.5 text-xs">
              <SignatureRow
                label="Sender's offer"
                present={Boolean(transfer.transferCredential)}
                hash={credentialHash}
              />
              <SignatureRow
                label="Recipient's acceptance"
                present={Boolean(transfer.acceptanceCredential)}
                hash={acceptanceHash}
                pendingNote={
                  transfer.status === 'initiated'
                    ? 'Issued only when they accept'
                    : 'Never issued — the transfer did not complete'
                }
              />
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

type StepTone = 'settled' | 'good' | 'bad' | 'open' | 'pending' | 'closed';

const STEP_TONE: Record<StepTone, { dot: string; ring: string; icon: string }> = {
  settled: { dot: 'bg-surface', ring: 'border-line-strong', icon: 'text-ink-subtle' },
  good: { dot: 'bg-positive-soft', ring: 'border-positive-border', icon: 'text-positive' },
  bad: { dot: 'bg-critical-soft', ring: 'border-critical-border', icon: 'text-critical' },
  open: { dot: 'bg-caution-soft', ring: 'border-caution-border', icon: 'text-caution' },
  pending: { dot: 'bg-surface-sunken', ring: 'border-dashed border-line-strong', icon: 'text-ink-subtle' },
  closed: { dot: 'bg-surface-sunken', ring: 'border-line-strong', icon: 'text-ink-subtle' },
};

/** One link in the chain: a marker, what happened, and the evidence for it. */
function Step({
  icon: Icon,
  tone,
  title,
  meta,
  children,
  last = false,
}: {
  icon: typeof Send;
  tone: StepTone;
  title: string;
  meta?: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const style = STEP_TONE[tone];
  return (
    <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
      {!last ? (
        <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-line" />
      ) : null}
      <span
        aria-hidden
        className={cn(
          'relative z-1 flex size-8 items-center justify-center rounded-full border',
          style.dot,
          style.ring,
        )}
      >
        <Icon className={cn('size-3.5', style.icon)} />
      </span>
      <div className={cn('min-w-0', last ? 'pb-0' : 'pb-7')}>
        <p className="text-sm font-medium text-ink">{title}</p>
        {meta ? <p className="mt-0.5 text-2xs text-ink-subtle tabular-nums">{meta}</p> : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </li>
  );
}

function Party({
  label,
  name,
  detail,
  settled,
}: {
  label: string;
  name: string;
  detail: string | null;
  settled: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border px-4 py-3',
        settled ? 'border-line-strong bg-surface' : 'border-dashed border-line-strong bg-surface-sunken/40',
      )}
    >
      <p className="eyebrow flex items-center gap-1.5">
        <Building2 className="size-3" aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium break-words text-ink">{name}</p>
      {detail ? <p className="text-xs break-words text-ink-subtle">{detail}</p> : null}
    </div>
  );
}

function SignatureRow({
  label,
  present,
  hash,
  pendingNote,
}: {
  label: string;
  present: boolean;
  hash: string | null;
  pendingNote?: string;
}) {
  return (
    <li>
      <p className="flex items-center justify-between gap-3">
        <span className="text-ink-muted">{label}</span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 text-2xs font-medium',
            present ? 'text-positive' : 'text-ink-subtle',
          )}
        >
          {present ? (
            <CircleCheck className="size-3" aria-hidden />
          ) : (
            <Hourglass className="size-3" aria-hidden />
          )}
          {present ? 'Signed' : 'Not issued'}
        </span>
      </p>
      {hash ? (
        <p className="mono mt-0.5 text-2xs break-all text-ink-subtle">{hash}</p>
      ) : pendingNote ? (
        <p className="mt-0.5 text-2xs text-ink-subtle">{pendingNote}</p>
      ) : null}
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words text-ink">{children}</dd>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
