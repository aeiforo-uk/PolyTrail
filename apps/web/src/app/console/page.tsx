import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  FileCheck2,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { STATUS_LABELS, type PassportStatus } from '@/lib/passport/state';
import {
  getCompletenessBands,
  getRecentActivity,
  getStatusBreakdown,
  getStats,
  getTraceabilityCoverage,
  getWeeklyActivity,
  getWorkspace,
  listPassports,
  type PassportRow,
} from './queries';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart, Legend, StackedBar } from '@/components/viz/bar-chart';
import { Meter } from '@/components/viz/meter';
import { rampStep } from '@/components/viz/tokens';
import { STATUS_ORDER, statusTone } from '@/components/viz/status-colour';

/**
 * The work queue, not a dashboard.
 *
 * The question this page answers is "what should I do next", so the ordering is
 * by urgency rather than by recency, and nothing appears here that does not
 * need a decision. Counts sit at the top because they are the shape of the
 * backlog; below them is the actual list of things to pick up.
 */
export default async function ConsoleHome() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  const tenantId = session.tenantId;

  const [workspace, stats, passports, weekly, statuses, bands, coverage, activity] =
    await Promise.all([
      getWorkspace(tenantId),
      getStats(tenantId),
      listPassports(tenantId),
      getWeeklyActivity(tenantId),
      getStatusBreakdown(tenantId),
      getCompletenessBands(tenantId),
      getTraceabilityCoverage(tenantId),
      getRecentActivity(tenantId),
    ]);

  const queue = buildQueue(passports);
  // Pipeline order, so the bar reads as work moving toward publication.
  const ordered = STATUS_ORDER.map((status) => statuses.find((s) => s.status === status)).filter(
    (s): s is NonNullable<typeof s> => Boolean(s && s.count > 0),
  );
  const published = statuses.find((s) => s.status === 'published')?.count ?? 0;
  const lastWeek = weekly.at(-2) ?? 0;
  const thisWeek = weekly.at(-1) ?? 0;
  const weeklyDelta = lastWeek === 0 ? undefined : ((thisWeek - lastWeek) / lastWeek) * 100;

  return (
    <>
      <PageHeader
        title={workspace?.tradeName ?? workspace?.legalName ?? 'Workspace'}
        description={`${queue.length === 0 ? 'Nothing is waiting on you.' : `${queue.length} ${queue.length === 1 ? 'passport needs' : 'passports need'} a decision.`}`}
        actions={
          <Button asChild>
            <Link href="/console/passports/new">
              <Plus className="size-4" aria-hidden />
              New passport
            </Link>
          </Button>
        }
      />

      {/* Entrances are the CSS utilities, not a client boundary: the page is a
          server component and stays one. Three steps — tiles, queue, charts —
          in reading order. */}
      <div className="flex flex-col gap-8 px-8 py-8">
        <div className="animate-in-up stagger-1">
        <StatRow>
          <StatTile
            label="Passports"
            value={stats.total}
            context={`${published} published`}
            trend={weekly}
            deltaPercent={weeklyDelta}
            href="/console/passports"
            tone="accent"
          />
          <StatTile
            label="Awaiting review"
            value={stats.inReview}
            context={stats.inReview === 0 ? 'queue is clear' : 'oldest first'}
            href="/console/review"
            tone={stats.inReview > 0 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Average completeness"
            value={`${stats.averageCompleteness}%`}
            context={`${bands.strong} of ${stats.total} above 90%`}
            tone={stats.averageCompleteness >= 80 ? 'positive' : 'caution'}
          />
          <StatTile
            label="Suppliers mapped"
            value={stats.partners}
            context={`${stats.teamMembers} people in the workspace`}
            href="/console/partners"
          />
        </StatRow>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="animate-in-up stagger-2 min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-semibold text-ink">Needs a decision</h2>
              <Link
                href="/console/passports"
                className="flex items-center gap-1 text-sm text-accent hover:underline"
              >
                All passports
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-6 py-12 text-center">
                <ShieldCheck className="mb-3 size-5 text-positive" aria-hidden />
                <p className="text-sm font-medium text-ink">Everything is published and complete.</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Nothing is waiting on a review or a missing field.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {queue.map((item) => (
                  <li key={item.row.id}>
                    <Link
                      href={`/console/passports/${item.row.dppId}`}
                      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-sunken"
                    >
                      <span
                        aria-hidden
                        className={
                          item.severity === 'critical'
                            ? 'h-8 w-0.5 shrink-0 rounded-full bg-critical'
                            : item.severity === 'caution'
                              ? 'h-8 w-0.5 shrink-0 rounded-full bg-caution'
                              : 'h-8 w-0.5 shrink-0 rounded-full bg-line-strong'
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {item.row.productName}
                        </span>
                        <span className="block truncate text-xs text-ink-subtle">{item.reason}</span>
                      </span>
                      <Meter value={item.row.completeness} size={34} thickness={3.5} />
                      <StatusBadge status={item.row.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="animate-in-up stagger-3 flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Where passports stand</h2>
              <div className="mt-4">
                <StackedBar
                  ariaLabel={ordered
                    .map((s) => `${s.count} ${STATUS_LABELS[s.status as PassportStatus] ?? s.status}`)
                    .join(', ')}
                  segments={ordered.map((s) => ({
                    key: s.status,
                    label: STATUS_LABELS[s.status as PassportStatus] ?? s.status,
                    value: s.count,
                    colour: statusTone(s.status),
                  }))}
                />
                <Legend
                  className="mt-3"
                  items={ordered.map((s) => ({
                    key: s.status,
                    label: STATUS_LABELS[s.status as PassportStatus] ?? s.status,
                    value: String(s.count),
                    colour: statusTone(s.status),
                  }))}
                />
              </div>
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">How far the chain is mapped</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Tier 4 is the fibre itself. Most brands stop at tier 2.
              </p>
              <BarChart
                data={DEPTHS.map((depth, i) => ({
                  key: depth.key,
                  label: depth.label,
                  value: coverage.find((c) => c.depth === depth.key)?.count ?? 0,
                  /*
                   * Tier depth is ordinal — tier 4 is further down the chain
                   * than tier 2 — so it takes the sequential ramp, darkening
                   * with depth. Categorical hues encode identity and carry no
                   * order, so painting the tiers in them said "these are four
                   * unrelated things" in four competing colours.
                   */
                  colour:
                    depth.key === 'unmapped'
                      ? 'var(--color-line-strong)'
                      : rampStep(DEPTHS.length > 1 ? i / (DEPTHS.length - 1) : 1),
                })).filter((d) => d.value > 0)}
                emptyMessage="No supply chains mapped yet."
              />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
              <ol className="mt-3 flex flex-col gap-2.5">
                {activity.length === 0 ? (
                  <li className="text-sm text-ink-subtle">Nothing recorded yet.</li>
                ) : (
                  activity.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5 text-xs">
                      <FileCheck2 className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-ink">{describe(entry.action)}</span>
                        <span className="block text-ink-subtle">
                          {entry.actorLabel} ·{' '}
                          {new Date(entry.recordedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </span>
                    </li>
                  ))
                )}
              </ol>
              <Link
                href="/console/audit"
                className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Full audit log
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

const DEPTHS = [
  { key: 'tier_1', label: 'Tier 1 — assembly' },
  { key: 'tier_2', label: 'Tier 2 — fabric' },
  { key: 'tier_3', label: 'Tier 3 — yarn' },
  { key: 'tier_4', label: 'Tier 4 — fibre' },
  { key: 'full', label: 'Full chain' },
  { key: 'unmapped', label: 'Not mapped' },
] as const;

interface QueueItem {
  row: PassportRow;
  reason: string;
  severity: 'critical' | 'caution' | 'neutral';
  rank: number;
}

/**
 * What actually needs a decision, in the order it needs one.
 *
 * The previous version of this list flagged every passport with the same amber
 * icon, which meant it flagged nothing. A passport that is published and 84%
 * complete is not competing for attention with one that has been sitting in
 * review for a week.
 */
function buildQueue(rows: PassportRow[]): QueueItem[] {
  const items: QueueItem[] = [];

  for (const row of rows) {
    if (row.status === 'in_review') {
      items.push({ row, reason: 'Waiting for review', severity: 'caution', rank: 0 });
    } else if (row.status === 'changes_requested') {
      items.push({ row, reason: 'Changes were requested', severity: 'caution', rank: 1 });
    } else if (row.status === 'suspended' || row.status === 'recalled') {
      items.push({
        row,
        reason: row.status === 'recalled' ? 'Recalled — public notice is live' : 'Suspended',
        severity: 'critical',
        rank: -1,
      });
    } else if (row.status === 'approved') {
      items.push({ row, reason: 'Approved and ready to publish', severity: 'neutral', rank: 2 });
    } else if (row.status === 'draft' && row.completeness < 60) {
      items.push({
        row,
        reason: `Draft, ${row.completeness}% complete`,
        severity: 'neutral',
        rank: 3,
      });
    }
  }

  return items.sort((a, b) => a.rank - b.rank || a.row.completeness - b.row.completeness).slice(0, 8);
}

function describe(action: string): string {
  const map: Record<string, string> = {
    'passport.created': 'Passport created',
    'passport.published': 'Passport published',
    'passport.version.created': 'Passport updated',
    'passport.recalled': 'Product recalled',
    'passport.updated': 'Passport changed',
    'data_request.sent': 'Data request sent',
    'data_request.submitted': 'Supplier responded',
    'partner.created': 'Supplier added',
  };
  return map[action] ?? action.replace(/[._]/g, ' ');
}
