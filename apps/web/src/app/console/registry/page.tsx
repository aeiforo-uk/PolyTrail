import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, FlaskConical, Info, Radio, ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart, Legend, StackedBar } from '@/components/viz/bar-chart';
import { seriesColour } from '@/components/viz/tokens';
import { getFilingOverview, type FilingRow } from '@/lib/registry/queries';
import { LEVEL_DEFINITIONS } from '@/lib/verification/types';
import { PROOF_VALIDITY_DAYS, PROOF_WARNING_DAYS } from '@/lib/registry/types';
import { FilingsTable } from './filings-table';

export const metadata = { title: 'EU Registry' };

/**
 * Registry filing.
 *
 * The honest framing is the feature. The EU DPP Registry is live, and a textile
 * obligation does not exist yet — so this screen is a rehearsal room with a real
 * client behind it, and it says which endpoint is answering on every load. A
 * compliance tool that lets a brand believe it has filed with the Commission
 * when it has filed with a Map in memory has done something worse than nothing.
 */
export default async function RegistryPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const overview = await getFilingOverview(session.tenantId);
  const canFile = session.role === 'BRAND_ADMIN' || session.role === 'COMPLIANCE_OFFICER';
  const { rows, counts } = overview;

  const windows = proofWindows(rows);
  const health = proofHealthSegments(rows);
  const blockers = blockingIssues(rows);
  const soonest = windows[0];

  return (
    <>
      <PageHeader
        title="EU Registry"
        description="File a published passport with the EU DPP Registry, and keep its proof of registration current."
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <ObligationBanner />
        <EndpointBanner
          mode={overview.endpoint.mode}
          target={overview.endpoint.target}
          authoritative={overview.endpoint.authoritative}
          verificationLabel={LEVEL_DEFINITIONS[overview.verificationLevel].label}
        />

        <StatRow>
          <StatTile
            label="Filed"
            value={counts.filed}
            context={`of ${rows.length} published ${rows.length === 1 ? 'passport' : 'passports'}`}
            tone="accent"
          />
          <StatTile
            label="Ready to file"
            value={counts.ready}
            context={
              counts.blocked === 0
                ? 'nothing is blocked'
                : `${counts.blocked} blocked by a data gap`
            }
            tone={counts.ready > 0 ? 'positive' : 'neutral'}
          />
          <StatTile
            label="Proof expiring"
            value={counts.expiring}
            context={
              soonest
                ? `soonest in ${soonest.daysLeft} ${soonest.daysLeft === 1 ? 'day' : 'days'}`
                : `warned ${PROOF_WARNING_DAYS} days out`
            }
            tone={counts.expiring > 0 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Proof expired"
            value={counts.expired}
            context={counts.expired === 0 ? 'none lapsed' : 'unregistered until re-filed'}
            tone={counts.expired > 0 ? 'critical' : 'neutral'}
          />
        </StatRow>

        <div className="grid gap-6 xl:grid-cols-2">
          <section
            aria-labelledby="windows-heading"
            className="rounded-lg border border-line bg-surface p-5"
          >
            <h2 id="windows-heading" className="text-sm font-semibold text-ink">
              Proof of registration windows
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              A registration is good for {PROOF_VALIDITY_DAYS} days and then lapses without anyone
              being told. Each bar is what is left of that window.
            </p>

            <div className="mt-4">
              <StackedBar
                ariaLabel={health.map((segment) => `${segment.value} ${segment.label}`).join(', ')}
                segments={health.filter((segment) => segment.value > 0)}
              />
              <Legend
                className="mt-3"
                items={health.map((segment) => ({
                  key: segment.key,
                  label: segment.label,
                  value: String(segment.value),
                  colour: segment.colour,
                }))}
              />
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="eyebrow mb-3">Days left, soonest first</p>
              <BarChart
                data={windows.slice(0, 8).map((window) => ({
                  key: window.dppId,
                  label: `${window.productName} · expires ${window.expiryLabel}`,
                  value: Math.max(0, window.daysLeft),
                  colour: window.colour,
                }))}
                max={PROOF_VALIDITY_DAYS}
                formatValue={(value) => (value === 0 ? 'lapsed' : `${value} d`)}
                emptyMessage="Nothing has been filed yet, so no proof is running down."
              />
              {windows.length > 8 ? (
                <p className="mt-3 text-2xs text-ink-subtle tabular-nums">
                  {windows.length - 8} further {windows.length - 8 === 1 ? 'filing' : 'filings'} with
                  more time left.
                </p>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="blockers-heading"
            className="rounded-lg border border-line bg-surface p-5"
          >
            <h2 id="blockers-heading" className="text-sm font-semibold text-ink">
              What is blocking filings
            </h2>
            <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
              The first thing the pre-submission check refuses on, counted across{' '}
              {counts.blocked} of {rows.length}{' '}
              {rows.length === 1 ? 'passport' : 'passports'}. Fixing the top bar unblocks the most
              filings for the least work.
            </p>
            <BarChart
              data={blockers}
              emptyMessage="Nothing is blocked. Every published passport passes the pre-submission check."
            />
          </section>
        </div>

        <FilingsTable rows={overview.rows} canFile={canFile} />
      </div>
    </>
  );
}

interface ProofWindow {
  dppId: string;
  productName: string;
  daysLeft: number;
  expiryLabel: string;
  colour: string;
}

/**
 * The ninety-day windows, as windows rather than as a date per row.
 *
 * Colour here is a judgement — lapsed, running out, healthy — so it takes the
 * reserved status colours rather than a categorical slot, and every bar carries
 * its own number in text beside it.
 */
function proofWindows(rows: FilingRow[]): ProofWindow[] {
  return rows
    .filter((row): row is FilingRow & { proofExpiresAt: string } => Boolean(row.proofExpiresAt))
    .map((row) => {
      const daysLeft = Math.floor(
        (new Date(row.proofExpiresAt).getTime() - Date.now()) / 86_400_000,
      );
      return {
        dppId: row.dppId,
        productName: row.productName,
        daysLeft,
        expiryLabel: new Date(row.proofExpiresAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        }),
        colour:
          row.proofHealth === 'expired'
            ? 'var(--color-critical)'
            : row.proofHealth === 'expiring'
              ? 'var(--color-caution)'
              : 'var(--color-positive)',
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function proofHealthSegments(rows: FilingRow[]) {
  return [
    {
      key: 'expired',
      label: 'Lapsed',
      value: rows.filter((row) => row.proofHealth === 'expired').length,
      colour: 'var(--color-critical)',
    },
    {
      key: 'expiring',
      label: `Under ${PROOF_WARNING_DAYS} days left`,
      value: rows.filter((row) => row.proofHealth === 'expiring').length,
      colour: 'var(--color-caution)',
    },
    {
      key: 'valid',
      label: 'In date',
      value: rows.filter((row) => row.proofHealth === 'valid').length,
      colour: 'var(--color-positive)',
    },
    {
      key: 'unfiled',
      label: 'Not filed',
      value: rows.filter((row) => !row.proofHealth).length,
      colour: 'var(--color-line-strong)',
    },
  ];
}

/**
 * Readiness across the catalogue, grouped by the issue that stops each filing.
 *
 * Eight categorical slots in fixed order; a ninth distinct issue folds into one
 * "other" bar rather than reusing a hue that already means something here.
 */
function blockingIssues(rows: FilingRow[]) {
  const tally = new Map<string, number>();
  for (const row of rows) {
    if (row.readyToFile) continue;
    const key = row.firstIssue ?? 'Not described';
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = ranked.slice(0, 7).map(([label, value], index) => ({
    key: label,
    label,
    value,
    colour: seriesColour(index),
  }));
  const tail = ranked.slice(7);
  if (tail.length > 0) {
    head.push({
      key: '__other',
      label: `${tail.length} other issues`,
      value: tail.reduce((sum, [, value]) => sum + value, 0),
      colour: 'var(--color-line-strong)',
    });
  }
  return head;
}

/**
 * The paragraph every other vendor leaves out.
 *
 * Claimed textile DPP dates in this market span 2027 to 2030 for a date that
 * does not exist. Saying so plainly is cheap, verifiable, and the difference
 * between a brand planning around a real timeline and one buying a deadline.
 */
function ObligationBanner() {
  return (
    <section
      aria-labelledby="obligation-heading"
      className="rounded-lg border border-line bg-surface-sunken/60 px-5 py-4"
    >
      <h2
        id="obligation-heading"
        className="flex items-center gap-2 text-sm font-semibold text-ink"
      >
        <Info className="size-4 text-ink-muted" aria-hidden />
        Textile registration is not yet mandatory
      </h2>
      <div className="mt-2 max-w-prose space-y-2 text-sm text-ink-muted">
        <p>
          The EU DPP Registry went live on 20 July 2026, but it created no obligation for textiles.
          18 February 2027 is batteries. A textile delegated act under ESPR does not exist yet —
          it is expected around 2027, applying somewhere in late 2028 to 2029.
        </p>
        <p>
          So this is a rehearsal against a stated contract, not a filing you are late for. What it
          buys you is that the day the obligation lands, the envelope is already built, the gaps in
          your data are already named, and the operator verification you will need has already
          started.
        </p>
      </div>
      <Link
        href="/console/security"
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
      >
        <ShieldCheck className="size-4" aria-hidden />
        Operator verification
      </Link>
    </section>
  );
}

function EndpointBanner({
  mode,
  target,
  authoritative,
  verificationLabel,
}: {
  mode: 'mock' | 'http';
  target: string;
  authoritative: boolean;
  verificationLabel: string;
}) {
  return (
    <section
      aria-labelledby="endpoint-heading"
      className={
        authoritative
          ? 'rounded-lg border border-critical-border bg-critical-soft px-5 py-4'
          : 'rounded-lg border border-accent-border bg-accent-soft px-5 py-4'
      }
    >
      <h2
        id="endpoint-heading"
        className={
          authoritative
            ? 'flex items-center gap-2 text-sm font-semibold text-critical'
            : 'flex items-center gap-2 text-sm font-semibold text-accent'
        }
      >
        {authoritative ? (
          <AlertTriangle className="size-4" aria-hidden />
        ) : (
          <FlaskConical className="size-4" aria-hidden />
        )}
        {authoritative ? 'Filings here are filings of record' : 'Rehearsal mode'}
      </h2>

      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">Endpoint</dt>
        <dd className="mono text-2xs text-ink">
          <Radio className="mr-1.5 inline size-3 align-[-1px]" aria-hidden />
          {mode === 'mock' ? 'mock' : 'http'} · {target}
        </dd>

        <dt className="text-ink-muted">Operator verification</dt>
        <dd className="text-ink">
          {verificationLabel}
          {verificationLabel === 'Qualified electronic seal' ? null : (
            <span className="ml-2 text-ink-subtle">
              — a filing of record needs a qualified electronic seal
            </span>
          )}
        </dd>

        <dt className="text-ink-muted">Proof validity</dt>
        <dd className="text-ink">{PROOF_VALIDITY_DAYS} days from acceptance</dd>
      </dl>

      {!authoritative ? (
        <p className="mt-3 max-w-prose text-sm text-ink-muted">
          Nothing filed here reaches the European Commission. Switch by setting{' '}
          <code className="mono text-2xs">EU_REGISTRY_MODE=http</code>,{' '}
          <code className="mono text-2xs">EU_REGISTRY_URL</code> and{' '}
          <code className="mono text-2xs">EU_REGISTRY_AUTHORITATIVE=true</code>.
        </p>
      ) : null}
    </section>
  );
}
