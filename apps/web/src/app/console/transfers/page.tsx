import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Plus,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { listTransfers } from '@/lib/transfers/queries';
import { transferReasonMeta, transferStatusMeta, type TransferSummary } from '@/lib/transfers/types';
import { formatDppId } from '@/lib/passport/identifier';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { cn } from '@/lib/utils';
import { TransferStatusBadge } from './transfer-status';

export const metadata = { title: 'Transfers' };

/**
 * Two lists, not one.
 *
 * Outgoing and incoming look alike in the database and mean opposite things to
 * the person reading them: one is work they started, the other is a decision
 * waiting on them. So incoming is rendered as a stack of decisions with the
 * clock on each, and outgoing as a table of things in flight — merging them
 * into one grid with a direction column would bury the half that needs action.
 */
export default async function TransfersPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { outgoing, incoming, openOutgoing, openIncoming } = await listTransfers(session.tenantId);

  const pending = incoming
    .filter((transfer) => transfer.status === 'initiated')
    .sort((a, b) => expiryRank(a) - expiryRank(b));
  const settled = incoming.filter((transfer) => transfer.status !== 'initiated');

  const accepted = [...incoming, ...outgoing].filter((t) => t.status === 'accepted').length;
  const lapsed = [...incoming, ...outgoing].filter(
    (t) => t.status === 'rejected' || t.status === 'expired' || t.status === 'cancelled',
  ).length;
  const outcomes = outcomeSegments(outgoing);

  return (
    <>
      <PageHeader
        title="Transfers"
        description="Passports leaving this workspace, and passports being handed to it."
        actions={
          <Button asChild size="sm">
            <Link href="/console/transfers/new">
              <Plus aria-hidden />
              Transfer a passport
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <StatRow>
          <StatTile
            label="Waiting on your decision"
            value={openIncoming}
            context={
              pending[0]
                ? `oldest offered ${daysAgo(pending[0].initiatedAt)}`
                : 'nothing has been offered to you'
            }
            tone={openIncoming > 0 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Out for acceptance"
            value={openOutgoing}
            context={`of ${outgoing.length} you have sent`}
            tone={openOutgoing > 0 ? 'accent' : 'neutral'}
          />
          <StatTile
            label="Ownership moved"
            value={accepted}
            context="both sides signed"
            tone={accepted > 0 ? 'positive' : 'neutral'}
          />
          <StatTile
            label="Never completed"
            value={lapsed}
            context="declined, withdrawn or expired"
          />
        </StatRow>

        <section aria-labelledby="incoming-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="incoming-heading" className="display flex items-center gap-2 text-xl">
              <ArrowDownLeft className="size-4 text-accent" aria-hidden />
              Coming to you
            </h2>
            <p className="text-sm text-ink-muted">
              {openIncoming > 0
                ? `${openIncoming} waiting on a decision. Ownership does not move until you accept.`
                : 'Nothing is waiting on a decision.'}
            </p>
          </div>

          {incoming.length === 0 ? (
            <EmptyState
              icon={ArrowDownLeft}
              title="Nothing has been offered to you"
              description="When another workspace hands you a passport — a garment resold, returned or sent for recycling — it lands here with what it grants you, and you decide whether to take it on."
            />
          ) : (
            <>
              {pending.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {pending.map((transfer) => (
                    <IncomingCard key={transfer.id} transfer={transfer} />
                  ))}
                </ul>
              ) : null}

              {settled.length > 0 ? (
                <div className={cn(pending.length > 0 && 'mt-5')}>
                  <p className="eyebrow mb-2">Already decided</p>
                  <TransferTable rows={settled} counterpartyLabel="From" />
                </div>
              ) : null}
            </>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section aria-labelledby="outgoing-heading" className="min-w-0">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="outgoing-heading" className="display flex items-center gap-2 text-xl">
                <ArrowUpRight className="size-4 text-ink-subtle" aria-hidden />
                Leaving you
              </h2>
              {openOutgoing > 0 ? (
                <p className="text-sm text-ink-muted">
                  {openOutgoing} awaiting a recipient
                </p>
              ) : null}
            </div>

            {outgoing.length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="You have not transferred anything yet"
                description="A passport follows the garment. When an item is resold, taken back or sent for recycling, hand the passport over so its history keeps up."
                action={
                  <Button asChild size="sm">
                    <Link href="/console/transfers/new">Transfer a passport</Link>
                  </Button>
                }
              />
            ) : (
              <TransferTable rows={outgoing} counterpartyLabel="To" showExpiry />
            )}
          </section>

          <aside className="min-w-0">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">How your offers end</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Across the {outgoing.length} {outgoing.length === 1 ? 'offer' : 'offers'} you have
                sent. An offer that expires is one the recipient never opened.
              </p>
              {outgoing.length === 0 ? (
                <p className="py-4 text-sm text-ink-subtle">
                  Nothing sent yet, so there is nothing to compare.
                </p>
              ) : (
                <>
                  <StackedBar
                    ariaLabel={outcomes.map((o) => `${o.value} ${o.label}`).join(', ')}
                    segments={outcomes.filter((outcome) => outcome.value > 0)}
                  />
                  <Legend
                    className="mt-3"
                    items={outcomes
                      .filter((outcome) => outcome.value > 0)
                      .map((outcome) => ({
                        key: outcome.key,
                        label: outcome.label,
                        value: String(outcome.value),
                        colour: outcome.colour,
                      }))}
                  />
                </>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

/**
 * An offer made to this workspace, as a decision rather than a row.
 *
 * The clock is the thing that makes it urgent — a link that runs out leaves the
 * sender to start again — so the days left sit at the same weight as the item
 * name, and the rail turns amber once the window is short.
 */
function IncomingCard({ transfer }: { transfer: TransferSummary }) {
  const meta = transferReasonMeta(transfer.reason);
  const left = daysLeft(transfer.expiresAt);
  const urgent = left !== null && left <= 3;

  return (
    <li>
      <Link
        href={`/console/transfers/${transfer.id}`}
        className="grid grid-cols-[2px_minmax(0,1fr)] gap-4 rounded-lg border border-line bg-surface p-5 transition-colors duration-[140ms] hover:bg-surface-sunken"
      >
        <span
          aria-hidden
          className={cn('h-full w-0.5 rounded-full', urgent ? 'bg-caution' : 'bg-accent')}
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {transfer.fromTenantName} is handing you {transfer.productName ?? 'an item'}
              </span>
              <span className="mono mt-0.5 block text-2xs text-ink-subtle">
                {formatDppId(transfer.dppId)} · offered {daysAgo(transfer.initiatedAt)}
                {transfer.initiatedByName ? ` by ${transfer.initiatedByName}` : ''}
              </span>
            </span>
            <TransferStatusBadge status={transfer.status} />
          </span>

          <span className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <span className="min-w-0">
              <span className="eyebrow block">{meta.label}</span>
              <span className="mt-1 block text-sm text-ink-muted">{meta.grants}</span>
            </span>
            <span className="flex items-center gap-4 sm:justify-end">
              {left !== null ? (
                <span className="flex items-center gap-1.5 text-xs tabular-nums">
                  <Clock
                    className={cn('size-3.5 shrink-0', urgent ? 'text-caution' : 'text-ink-subtle')}
                    aria-hidden
                  />
                  <span className={urgent ? 'font-medium text-caution' : 'text-ink-muted'}>
                    {left <= 0
                      ? 'expires today'
                      : `${left} ${left === 1 ? 'day' : 'days'} to decide`}
                  </span>
                </span>
              ) : null}
              <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent">
                Review it
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function TransferTable({
  rows,
  counterpartyLabel,
  showExpiry = false,
}: {
  rows: TransferSummary[];
  counterpartyLabel: 'From' | 'To';
  showExpiry?: boolean;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Item</TH>
          <TH>{counterpartyLabel}</TH>
          <TH>Reason</TH>
          <TH>Status</TH>
          <TH className="text-right">{showExpiry ? 'Link expires' : 'Decided'}</TH>
          <TH className="text-right">Started</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((transfer) => {
          const meta = transferReasonMeta(transfer.reason);
          const counterparty =
            counterpartyLabel === 'From'
              ? transfer.fromTenantName
              : (transfer.toTenantName ?? transfer.toEmail ?? 'Not yet claimed');
          const left = daysLeft(transfer.expiresAt);
          return (
            <TR key={transfer.id}>
              <TD>
                <Link
                  href={`/console/transfers/${transfer.id}`}
                  className="font-medium text-ink transition-colors duration-[140ms] hover:text-accent"
                >
                  {transfer.productName ?? 'Untitled item'}
                </Link>
                <span className="mono mt-0.5 block text-2xs text-ink-subtle">
                  {formatDppId(transfer.dppId)}
                </span>
              </TD>
              <TD className="text-ink-muted">{counterparty}</TD>
              <TD className="text-ink-muted">{meta.label}</TD>
              <TD>
                <TransferStatusBadge status={transfer.status} />
              </TD>
              <TD className="text-right text-ink-muted tabular-nums">
                {showExpiry
                  ? transfer.status === 'initiated' && left !== null
                    ? `${left <= 0 ? 'today' : `${left} ${left === 1 ? 'day' : 'days'}`}`
                    : '—'
                  : transfer.completedAt
                    ? formatDate(transfer.completedAt)
                    : '—'}
              </TD>
              <TD className="text-right text-ink-muted tabular-nums">
                {formatDate(transfer.initiatedAt)}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

/**
 * Outcomes take the reserved status colours, never a categorical slot: a
 * withdrawn offer painted in "series 6" green would read as a success.
 */
function outcomeSegments(rows: TransferSummary[]) {
  const tone: Record<string, string> = {
    initiated: 'var(--color-caution)',
    accepted: 'var(--color-positive)',
    rejected: 'var(--color-critical)',
    cancelled: 'var(--color-ink-subtle)',
    expired: 'var(--color-line-strong)',
  };
  return (['initiated', 'accepted', 'rejected', 'cancelled', 'expired'] as const).map((status) => ({
    key: status,
    label: transferStatusMeta(status).label,
    value: rows.filter((row) => row.status === status).length,
    colour: tone[status]!,
  }));
}

/** Sort key for an open offer: the one whose link dies first comes first. */
function expiryRank(transfer: TransferSummary): number {
  return transfer.expiresAt ? new Date(transfer.expiresAt).getTime() : Number.MAX_SAFE_INTEGER;
}

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

function daysAgo(value: string): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? 'month' : 'months'} ago`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
