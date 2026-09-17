import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  ExternalLink,
  GitCommitVertical,
  History,
  Pencil,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getPassportDetail } from '../../queries';
import { getPassportHistory, type StatusEntry, type VersionEntry } from '../queries';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/viz/meter';
import { statusTone } from '@/components/viz/status-colour';
import { formatDppId } from '@/lib/passport/identifier';
import { STATUS_LABELS, type PassportStatus } from '@/lib/passport/state';
import { PassportCard } from '@/components/passport/passport-card';
import { carrierSvg, carrierTarget } from '@/lib/passport/qr';
import { CATEGORIES, type CategoryKey } from '@/lib/passport/vocab';
import { countryName } from '@/lib/partners/vocab';
import { DisclosurePreview } from './disclosure-preview';
import { OverviewTab } from './overview';
import { RecordTabs } from './record-tabs';

/**
 * One passport, as a record rather than as a form.
 *
 * The header band answers "which product is this and can it go out" without
 * scrolling: the identifiers a warehouse or a customs officer would quote, the
 * lifecycle state, and how finished the content is. Everything below it is one
 * of four readings of the same thing — what it says, who may read it, what it
 * used to say, and who changed it.
 */
export default async function PassportDetailPage({
  params,
}: {
  params: Promise<{ dppId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { dppId } = await params;
  const [detail, history] = await Promise.all([
    getPassportDetail(session.tenantId, dppId),
    getPassportHistory(session.tenantId, dppId),
  ]);
  if (!detail) notFound();

  const { passport, product, payload, completeness } = detail;
  const status = passport.status as PassportStatus;
  const versions = history?.versions ?? [];
  const statusHistory = history?.statusHistory ?? [];
  const blocking = completeness.missingRequired.length;

  // The carrier is built here rather than in the tab: `qrcode` is a Node
  // dependency, and the tab it lands in is rendered inside a client boundary.
  const target = carrierTarget({
    dppId: passport.dppId,
    gtin: passport.gtin,
    batchNumber: passport.batchNumber,
    serialNumber: passport.serialNumber,
  });
  const qrSvg = await carrierSvg(target.uri);
  const identity = payload.identity;

  return (
    <>
      <header className="border-b border-line px-8 pt-6 pb-6">
        <Link
          href="/console/passports"
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors duration-[140ms] hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All passports
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="flex min-w-0 items-start gap-4">
            {/* The garment beside its name. Same plate-and-swatch treatment as
                the catalogue rows, one size up, so the record is recognisable
                before a single identifier is read. */}
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-sunken">
              {identity?.images?.[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={identity.images[0].url}
                  alt={identity.images[0].alt ?? ''}
                  width={64}
                  height={64}
                  className="size-full object-cover"
                />
              ) : (
                <span className="passport-swatch size-full" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
            <h1 className="title-1 text-ink">{product?.name ?? 'Passport'}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {[passport.colourName, passport.size ? `Size ${passport.size}` : null]
                .filter(Boolean)
                .join(' · ') || 'No variant details recorded'}
            </p>

            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
              <IdChip label="Passport" value={formatDppId(passport.dppId)} />
              {passport.gtin ? <IdChip label="GTIN" value={passport.gtin} /> : null}
              {passport.sku ? <IdChip label="SKU" value={passport.sku} /> : null}
              {product?.styleNumber ? <IdChip label="Style" value={product.styleNumber} /> : null}
              {passport.serialNumber ? (
                <IdChip label="Serial" value={passport.serialNumber} />
              ) : null}
              {passport.batchNumber ? <IdChip label="Batch" value={passport.batchNumber} /> : null}
              <IdChip label="Covers" value={SCOPE_LABELS[passport.scope] ?? passport.scope} />
            </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-4">
            <div className="flex items-center gap-5">
              <div className="text-right">
                <StatusBadge status={status} />
                <p className="mt-1.5 text-2xs text-ink-subtle tabular-nums">
                  v{passport.currentVersion}
                  {passport.publishedVersion != null
                    ? ` · v${passport.publishedVersion} public`
                    : ' · never published'}
                </p>
              </div>
              <Meter
                value={completeness.score}
                size={52}
                thickness={5}
                label="Complete"
                sublabel={
                  blocking === 0
                    ? 'nothing required is missing'
                    : `${blocking} required ${blocking === 1 ? 'field' : 'fields'} left`
                }
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/console/passports/${passport.dppId}/edit/identity`}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/console/transfers/new?dppId=${passport.dppId}`}>
                  <ArrowLeftRight aria-hidden />
                  Transfer
                </Link>
              </Button>
              {passport.publishedVersion != null ? (
                <Button asChild variant="secondary" size="sm">
                  <a href={`/p/${passport.dppId}`} target="_blank" rel="noreferrer">
                    Preview as a shopper
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <RecordTabs
        versionCount={versions.length}
        activityCount={statusHistory.length}
        overview={
          <OverviewTab
            payload={payload}
            category={product?.category ?? null}
            completeness={completeness}
            dppId={passport.dppId}
            carrier={
              <PassportCard
                dppId={passport.dppId}
                productName={product?.name ?? 'Untitled passport'}
                brandName={identity?.brandName ?? null}
                category={categoryLabel(product?.category)}
                countryOfOrigin={
                  identity?.countryOfOrigin ? countryName(identity.countryOfOrigin) : null
                }
                gtin={passport.gtin}
                status={STATUS_LABELS[status] ?? status}
                imageUrl={identity?.images?.[0]?.url ?? null}
                imageAlt={identity?.images?.[0]?.alt ?? null}
                qrSvg={qrSvg}
                carrierUri={target.uri}
                carrierScheme={target.scheme}
              />
            }
          />
        }
        disclosure={<DisclosurePreview payload={payload} />}
        versions={
          <VersionsTab versions={versions} current={passport.currentVersion} published={passport.publishedVersion} />
        }
        activity={<ActivityTab entries={statusHistory} createdAt={passport.createdAt} />}
      />
    </>
  );
}

/** The vocabulary key is an internal path; the card shows what it means. */
function categoryLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORIES[key as CategoryKey]?.label ?? key;
}

// ── Versions ───────────────────────────────────────────────────────────────

/**
 * Every version, with the hash that fixes it.
 *
 * The hash is shown in full rather than truncated: it is the thing an auditor
 * compares against an exported credential, and a hash you have to hover to read
 * is a hash nobody checks.
 */
function VersionsTab({
  versions,
  current,
  published,
}: {
  versions: VersionEntry[];
  current: number;
  published: number | null;
}) {
  if (versions.length === 0) {
    return (
      <EmptyState
        icon={GitCommitVertical}
        title="No versions saved yet"
        description="A version is written every time a section is saved with something changed. Each one keeps its own hash, so the content a reviewer approved is provably the content that gets published."
      />
    );
  }

  return (
    <ol className="max-w-3xl">
      {versions.map((version, index) => (
        <li key={version.version} className="flex gap-4">
          <div className="flex shrink-0 flex-col items-center">
            <span
              aria-hidden
              className={
                version.version === published
                  ? 'mt-1.5 size-2.5 rounded-full bg-positive ring-3 ring-positive-soft'
                  : version.version === current
                    ? 'mt-1.5 size-2.5 rounded-full bg-accent ring-3 ring-accent-soft'
                    : 'mt-1.5 size-2.5 rounded-full bg-line-strong'
              }
            />
            {index < versions.length - 1 ? (
              <span aria-hidden className="w-px flex-1 bg-line" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1 pb-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-ink tabular-nums">
                Version {version.version}
              </span>
              {version.version === published ? (
                <span className="text-2xs font-medium text-positive">Live on the public URL</span>
              ) : version.version === current ? (
                <span className="text-2xs font-medium text-accent">Current working copy</span>
              ) : null}
              <span className="text-xs text-ink-subtle tabular-nums">
                {formatDateTime(version.createdAt)}
              </span>
              <span className="text-xs text-ink-muted">
                {version.actorName ?? version.actorEmail ?? 'System'}
              </span>
            </div>

            <p className="mt-1 text-sm text-ink-muted">
              {version.changeReason ?? (
                <span className="text-ink-subtle">No reason was given for this change.</span>
              )}
            </p>

            <dl className="mt-2.5 flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="eyebrow">Content hash</dt>
                <dd className="mono min-w-0 text-2xs break-all text-ink-muted">
                  {version.dataHash}
                </dd>
              </div>
              {version.credentialHash ? (
                <div className="flex flex-wrap items-baseline gap-2">
                  <dt className="eyebrow">Credential</dt>
                  <dd className="mono min-w-0 text-2xs break-all text-ink-muted">
                    {version.credentialHash}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Activity ───────────────────────────────────────────────────────────────

function ActivityTab({ entries, createdAt }: { entries: StatusEntry[]; createdAt: Date }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nothing has moved yet"
        description={`This passport was created on ${formatDateTime(createdAt)} and has stayed in draft since. Every status change from here — submitted, approved, published, suspended — is recorded with who made it and why.`}
      />
    );
  }

  return (
    <ol className="max-w-3xl">
      {entries.map((entry, index) => (
        <li key={entry.id} className="flex gap-4">
          <div className="flex shrink-0 flex-col items-center">
            <span
              aria-hidden
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ background: statusTone(entry.toStatus) }}
            />
            {index < entries.length - 1 ? (
              <span aria-hidden className="w-px flex-1 bg-line" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1 pb-6">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {entry.fromStatus ? (
                <>
                  <span className="text-xs text-ink-subtle">
                    {STATUS_LABELS[entry.fromStatus as PassportStatus] ?? entry.fromStatus}
                  </span>
                  <span aria-hidden className="text-ink-subtle">
                    →
                  </span>
                </>
              ) : null}
              <StatusBadge status={entry.toStatus} />
              <span className="text-xs text-ink-subtle tabular-nums">
                {formatDateTime(entry.createdAt)}
              </span>
              <span className="text-xs text-ink-muted">{entry.actorName ?? 'System'}</span>
            </div>
            {entry.reason ? (
              <p className="mt-1.5 border-l-2 border-line pl-3 text-sm leading-relaxed text-ink-muted">
                {entry.reason}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  model: 'Every unit of this style',
  batch: 'One production batch',
  item: 'One physical item',
};

function IdChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-2.5 py-1 text-2xs">
      <span className="text-ink-subtle">{label}</span>
      <span className="mono text-ink">{value}</span>
    </span>
  );
}

function formatDateTime(value: Date): string {
  return value.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
