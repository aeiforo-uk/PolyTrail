import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BadgeCheck, Factory, Fingerprint, Plus, ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { listPartners, type PartnerRow } from '@/lib/partners/queries';
import {
  SUPPLY_TIERS,
  TIER_LABEL,
  countryName,
  type SupplyTier,
} from '@/lib/partners/vocab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ChipCount, ChipDot, FilterLabel, filterChip } from '@/components/ui/filter-chip';
import { PageHeader } from '@/components/ui/page-header';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { BarChart } from '@/components/viz/bar-chart';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { seriesColour } from '@/components/viz/tokens';
import { cn } from '@/lib/utils';
import {
  EXPIRY_WINDOW_DAYS,
  NO_CERTIFICATES,
  certificateHealthByPartner,
  type CertificateHealth,
} from './queries';
import { TierRank, daysUntil, formatDate, relativeTime, tierColour } from './presentation';

export const metadata = { title: 'Suppliers' };

/**
 * The supplier register.
 *
 * This is a relationship map rather than a contact list: the questions it
 * answers are "how deep does my chain go", "who has ever answered me" and
 * "whose paperwork is about to lapse". A directory that only lists names
 * cannot answer any of them.
 *
 * Filtering is a set of links rather than client state, so a filtered view is
 * a URL somebody can send to a colleague — which is what a sourcing team
 * actually does with "show me every tier-3 site in Bangladesh".
 */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; country?: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const params = await searchParams;
  const tier = (SUPPLY_TIERS.find((t) => t.value === params.tier)?.value ?? null) as SupplyTier | null;
  const country = params.country?.trim().toUpperCase() || null;

  // Read the whole register once and filter in memory. The chips have to carry
  // counts that do not move when a filter is applied, and a facility list is
  // measured in hundreds, not millions.
  const all = await listPartners(session.tenantId);
  const health = await certificateHealthByPartner(
    session.tenantId,
    all.map((row) => row.id),
  );

  const rows = all.filter(
    (row) => (tier === null || row.tier === tier) && (country === null || row.country === country),
  );
  const filtered = tier !== null || country !== null;

  const responded = all.filter((row) => row.lastResponseAt !== null).length;
  const missingGln = all.filter((row) => !row.gln).length;
  const expiringSoon = all.reduce(
    (sum, row) => sum + (health.get(row.id)?.expiringSoon ?? 0),
    0,
  );
  const expired = all.reduce((sum, row) => sum + (health.get(row.id)?.expired ?? 0), 0);

  const byTier = SUPPLY_TIERS.map((step) => ({
    ...step,
    count: all.filter((row) => row.tier === step.value).length,
  }));
  const tiersUsed = byTier.filter((step) => step.count > 0).length;

  const byCountry = countryBreakdown(all);
  const respondedPct = all.length === 0 ? 0 : Math.round((responded / all.length) * 100);

  if (all.length === 0) {
    return (
      <>
        <PageHeader
          title="Suppliers"
          description="Every facility in your chain, and what each of them has told you."
          actions={<AddButton />}
        />
        <div className="px-8 py-8">
          <EmptyState
            icon={Factory}
            title="No suppliers yet"
            description="A passport is only as good as the facilities behind it. Add the mills, factories and farms you buy from, then ask them for what you are missing."
            action={
              <Button asChild size="sm">
                <Link href="/console/partners/new">Add the first supplier</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`${all.length} ${all.length === 1 ? 'facility' : 'facilities'} across ${tiersUsed} ${tiersUsed === 1 ? 'tier' : 'tiers'} and ${byCountry.total} ${byCountry.total === 1 ? 'country' : 'countries'}.`}
        actions={<AddButton />}
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <StatRow>
          <StatTile
            label="Facilities mapped"
            value={all.length}
            context={`${byTier[0]!.count + byTier[1]!.count} at tier 0–1, ${all.length - byTier[0]!.count - byTier[1]!.count} deeper`}
            tone="accent"
          />
          <StatTile
            label="Have ever answered"
            value={responded}
            context={`of ${all.length} · ${respondedPct}%`}
            tone={respondedPct >= 60 ? 'positive' : 'caution'}
          />
          <StatTile
            label="Certificates lapsing"
            value={expiringSoon}
            context={
              expired > 0
                ? `within ${EXPIRY_WINDOW_DAYS} days · ${expired} already expired`
                : `within ${EXPIRY_WINDOW_DAYS} days`
            }
            tone={expired > 0 ? 'critical' : expiringSoon > 0 ? 'caution' : 'positive'}
          />
          <StatTile
            label="No GLN on file"
            value={missingGln}
            context={
              missingGln === 0
                ? 'every facility is formally identified'
                : `of ${all.length} — a passport needs one`
            }
            tone={missingGln > 0 ? 'caution' : 'positive'}
          />
        </StatRow>

        <nav aria-label="Filter the register" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterLabel>Tier</FilterLabel>
            <Chip href={hrefFor(null, country)} active={tier === null} label="All" count={all.length} />
            {byTier.map((step) => (
              <Chip
                key={step.value}
                href={hrefFor(step.value, country)}
                active={tier === step.value}
                label={step.short}
                count={step.count}
                colour={tierColour(step.value)}
                disabled={step.count === 0}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterLabel>Country</FilterLabel>
            <Chip href={hrefFor(tier, null)} active={country === null} label="All" count={all.length} />
            {byCountry.chips.map((entry) => (
              <Chip
                key={entry.code}
                href={hrefFor(tier, entry.code)}
                active={country === entry.code}
                label={entry.name}
                count={entry.count}
              />
            ))}
          </div>
        </nav>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-semibold text-ink">
                {filtered ? 'Matching facilities' : 'The register'}
              </h2>
              <p className="text-xs text-ink-muted tabular-nums">
                {rows.length} of {all.length} shown
              </p>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={Factory}
                title="Nothing matches those filters"
                description="Widen the tier or country filter, or add the facility if it is not on the register yet."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/console/partners">Clear the filters</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Facility</TH>
                    <TH>Tier</TH>
                    <TH>Country</TH>
                    <TH className="text-right">Certificates</TH>
                    <TH className="text-right">Open requests</TH>
                    <TH className="text-right">Last response</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((row) => {
                    const certs = health.get(row.id) ?? NO_CERTIFICATES;
                    const severity = severityOf(row, certs);
                    return (
                      <TR key={row.id}>
                        <TD>
                          <span className="flex items-start gap-3">
                            <span
                              aria-hidden
                              className={cn(
                                'mt-0.5 h-8 w-0.5 shrink-0 rounded-full',
                                severity === 'critical'
                                  ? 'bg-critical'
                                  : severity === 'caution'
                                    ? 'bg-caution'
                                    : 'bg-line',
                              )}
                            />
                            <span className="min-w-0">
                              <Link
                                href={`/console/partners/${row.id}`}
                                className="font-medium text-ink transition-colors duration-[140ms] hover:text-accent"
                              >
                                {row.name}
                              </Link>
                              <span className="block truncate text-2xs text-ink-subtle">
                                {row.legalName && row.legalName !== row.name ? (
                                  <span>{row.legalName} · </span>
                                ) : null}
                                {row.gln ? (
                                  <span className="mono">GLN {row.gln}</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-caution">
                                    <Fingerprint className="size-3" aria-hidden />
                                    No GLN
                                  </span>
                                )}
                              </span>
                            </span>
                          </span>
                        </TD>
                        <TD>
                          <TierRank tier={row.tier} />
                        </TD>
                        <TD className="text-ink-muted">{countryName(row.country)}</TD>
                        <TD className="text-right">
                          <CertificateCell certs={certs} />
                        </TD>
                        <TD className="text-right">
                          {row.openRequestCount > 0 ? (
                            <Badge tone="caution">{row.openRequestCount} open</Badge>
                          ) : (
                            <span className="text-ink-subtle">None</span>
                          )}
                        </TD>
                        <TD className="text-right text-xs tabular-nums">
                          {row.lastResponseAt ? (
                            <span className="text-ink-muted" title={formatDate(row.lastResponseAt)}>
                              {relativeTime(row.lastResponseAt)}
                            </span>
                          ) : (
                            <span className="text-ink-subtle">Never answered</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">How deep the chain goes</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Tier 4 is the fibre itself. Most brands can name their assembly factories and stop
                there.
              </p>
              <BarChart
                data={byTier
                  .filter((step) => step.count > 0)
                  .map((step) => ({
                    key: step.value,
                    label: TIER_LABEL[step.value],
                    value: step.count,
                    colour: tierColour(step.value),
                  }))}
                emptyMessage="No facilities on the register yet."
              />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Where they are</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                Concentration is a risk in itself: one country, one flood, one passport you cannot
                substantiate.
              </p>
              <BarChart data={byCountry.chart} emptyMessage="No countries recorded yet." />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">What is missing</h2>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                <Gap
                  tone={missingGln > 0 ? 'caution' : 'positive'}
                  count={missingGln}
                  singular="facility has no GLN"
                  plural="facilities have no GLN"
                  clear="Every facility carries a GLN."
                  note="The GLN is the only facility identifier the passport treats as authoritative."
                />
                <Gap
                  tone={expired > 0 ? 'critical' : 'positive'}
                  count={expired}
                  singular="certificate has expired"
                  plural="certificates have expired"
                  clear="No certificate on file has lapsed."
                  note="An expired certificate behind a live claim is the finding an auditor opens with."
                />
                <Gap
                  tone={all.length - responded > 0 ? 'caution' : 'positive'}
                  count={all.length - responded}
                  singular="facility has never answered"
                  plural="facilities have never answered"
                  clear="Every facility has answered at least once."
                  note="Silence usually means the request went to a shared inbox nobody reads."
                />
                <Gap
                  tone={
                    all.filter((row) => !row.contactEmail).length > 0 ? 'caution' : 'positive'
                  }
                  count={all.filter((row) => !row.contactEmail).length}
                  singular="facility has no contact email"
                  plural="facilities have no contact email"
                  clear="Every facility has somebody to write to."
                  note="Without an address you can still create a request, but nothing is sent."
                />
              </ul>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function AddButton() {
  return (
    <Button asChild size="sm">
      <Link href="/console/partners/new">
        <Plus aria-hidden />
        Add supplier
      </Link>
    </Button>
  );
}

function hrefFor(tier: SupplyTier | null, country: string | null): string {
  const query = new URLSearchParams();
  if (tier) query.set('tier', tier);
  if (country) query.set('country', country);
  const search = query.toString();
  return search ? `/console/partners?${search}` : '/console/partners';
}

function Chip({
  href,
  active,
  label,
  count,
  colour,
  disabled,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  colour?: string;
  disabled?: boolean;
}) {
  const shell = filterChip({ state: disabled ? 'empty' : active ? 'active' : 'idle' });

  const body = (
    <>
      {colour ? <ChipDot colour={colour} /> : null}
      <span className="font-medium">{label}</span>
      <ChipCount value={count} active={active} />
    </>
  );

  // Nothing to filter to, so it is stated rather than offered. A link that
  // leads to an empty register is a dead end dressed as a control.
  if (disabled) {
    return (
      <span className={shell} aria-disabled="true">
        {body}
      </span>
    );
  }

  return (
    <Link href={href} aria-current={active ? 'true' : undefined} className={shell}>
      {body}
    </Link>
  );
}

function CertificateCell({ certs }: { certs: CertificateHealth }) {
  if (certs.total === 0) {
    return <span className="text-ink-subtle">None</span>;
  }

  if (certs.expired > 0) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-critical">
          <ShieldAlert className="size-3.5" aria-hidden />
          <span className="tabular-nums">{certs.expired} expired</span>
        </span>
        <span className="text-2xs text-ink-subtle tabular-nums">{certs.total} on file</span>
      </span>
    );
  }

  if (certs.expiringSoon > 0 && certs.nextExpiry) {
    const days = daysUntil(certs.nextExpiry);
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-caution">
          <ShieldAlert className="size-3.5" aria-hidden />
          <span className="tabular-nums">{days} days left</span>
        </span>
        <span className="text-2xs text-ink-subtle tabular-nums">{certs.total} on file</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-positive">
      <BadgeCheck className="size-3.5" aria-hidden />
      <span className="tabular-nums">{certs.active}</span>
    </span>
  );
}

function Gap({
  tone,
  count,
  singular,
  plural,
  clear,
  note,
}: {
  tone: 'caution' | 'critical' | 'positive';
  count: number;
  singular: string;
  plural: string;
  clear: string;
  note: string;
}) {
  const settled = count === 0;
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          settled ? 'bg-positive' : tone === 'critical' ? 'bg-critical' : 'bg-caution',
        )}
      />
      <span className="min-w-0">
        <span className={cn('block text-ink', settled && 'text-ink-muted')}>
          {settled ? (
            clear
          ) : (
            <>
              <span className="font-medium tabular-nums">{count}</span>{' '}
              {count === 1 ? singular : plural}
            </>
          )}
        </span>
        <span className="block text-2xs leading-relaxed text-ink-subtle">{note}</span>
      </span>
    </li>
  );
}

/**
 * The eight categorical slots are assigned in fixed order and never cycled, so
 * a ninth country folds into "Other" rather than borrowing slot 1 and reading
 * as the same place twice.
 */
function countryBreakdown(rows: PartnerRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.country, (counts.get(row.country) ?? 0) + 1);

  const sorted = [...counts.entries()]
    .map(([code, count]) => ({ code, name: countryName(code), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en-GB'));

  const named = sorted.slice(0, 8);
  const rest = sorted.slice(8);

  const chart = named.map((entry, index) => ({
    key: entry.code,
    label: entry.name,
    value: entry.count,
    colour: seriesColour(index),
  }));

  if (rest.length > 0) {
    chart.push({
      key: 'other',
      label: `Other (${rest.length} countries)`,
      value: rest.reduce((sum, entry) => sum + entry.count, 0),
      colour: 'var(--color-line-strong)',
    });
  }

  return { chart, chips: named, total: sorted.length };
}

function severityOf(row: PartnerRow, certs: CertificateHealth): 'critical' | 'caution' | 'none' {
  if (certs.expired > 0) return 'critical';
  if (!row.gln || certs.expiringSoon > 0) return 'caution';
  return 'none';
}
