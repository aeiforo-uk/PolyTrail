import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eye,
  EyeOff,
  FileWarning,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Legend, StackedBar } from '@/components/viz/bar-chart';
import { rampStep } from '@/components/viz/tokens';
import { formatDppId, passportUrl } from '@/lib/passport/identifier';
import { REGULATED_TIERS, REGULATED_TIER_LABELS, type RegulatedTier } from '@/lib/tier/types';
import { loadEvidenceRecord, type FieldDisclosure } from '../queries';
import { recordAuthorityRead } from '../audit';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ dppId: string }> }) {
  const { dppId } = await params;
  return { title: `Record ${formatDppId(dppId)}` };
}

/**
 * Disclosure is an ordered scale, not a set of categories.
 *
 * Public → legitimate interest → authority-only is a single axis of how closed
 * a field is, so it takes the sequential ramp rather than three categorical
 * hues, which would imply the tiers are unrelated kinds. It is emphatically not
 * the status palette either: authority-only is not a *problem*, and painting it
 * red would tell an inspector to be alarmed by a conformity certificate sitting
 * exactly where the delegated act puts it.
 */
const TIER_META: Record<
  RegulatedTier,
  { icon: typeof Eye; colour: string; note: string; shortNote: string }
> = {
  public: {
    icon: Eye,
    colour: rampStep(0.15),
    note: 'Anyone who scans the label sees these, with no account and no claim of interest.',
    shortNote: 'anyone who scans',
  },
  legitimate_interest: {
    icon: EyeOff,
    colour: rampStep(0.55),
    note: 'Released only to a reader with a demonstrated interest — a repairer, a recycler, a trade partner. A consumer scanning the label does not see them.',
    shortNote: 'repairers, recyclers, trade',
  },
  authority: {
    icon: Lock,
    colour: rampStep(1),
    note: 'Withheld from every reader except you. Conformity certificates and supplier commercial terms sit here by design, not by evasion.',
    shortNote: 'you alone',
  },
};

/**
 * The evidence view.
 *
 * Three things an inspector needs that a consumer-facing passport cannot give
 * them: every field including the restricted ones, the *tier* each field sits
 * in so they can see what the public was shown, and the integrity trail — every
 * version with its hash, every status change with its reason, every credential
 * with its issuer.
 */
export default async function AuthorityRecordPage({
  params,
}: {
  params: Promise<{ dppId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login?next=/authority');

  const { dppId } = await params;
  const record = await loadEvidenceRecord(dppId);
  if (!record) notFound();

  await recordAuthorityRead({ session, tenantId: record.tenantId, dppId: record.dppId });

  const byTier = Object.fromEntries(
    REGULATED_TIERS.map((tier) => [
      tier,
      record.disclosure.filter((field) => field.regulated === tier),
    ]),
  ) as Record<RegulatedTier, FieldDisclosure[]>;

  const total = record.disclosure.length;
  const publicCount = byTier.public.length;
  const withheld = total - publicCount;
  const withheldShare = total === 0 ? 0 : Math.round((withheld / total) * 100);
  const espr = record.disclosure.filter((field) => field.espr).length;
  const liveCredentials = record.credentials.filter((credential) => !credential.revokedAt).length;

  const segments = REGULATED_TIERS.map((tier) => ({
    key: tier,
    label: REGULATED_TIER_LABELS[tier],
    value: byTier[tier].length,
    colour: TIER_META[tier].colour,
  })).filter((segment) => segment.value > 0);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/authority"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors duration-[140ms] hover:text-ink motion-reduce:transition-none"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Search
          </Link>
          <h1 className="display text-3xl">{record.brand.tradeName ?? record.brand.legalName}</h1>
          <p className="mono mt-1 text-2xs text-ink-subtle">
            {formatDppId(record.dppId)} · {record.scope} level · version{' '}
            {record.publishedVersion ?? record.currentVersion}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusBadge status={record.status} />
          <Button asChild size="sm" variant="secondary">
            <a href={`/authority/${record.dppId}/export`} download>
              <Download aria-hidden />
              Export record
            </a>
          </Button>
        </div>
      </div>

      {record.recall ? (
        <section className="overflow-hidden rounded-lg border border-critical-border bg-critical-soft">
          <div className="flex gap-4">
            <span aria-hidden className="w-1 shrink-0 bg-critical" />
            <div className="min-w-0 flex-1 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-critical">
                <AlertTriangle className="size-4" aria-hidden />
                Recalled
                {record.recall.severity ? ` · ${record.recall.severity}` : ''}
              </h2>
              <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink">
                {record.recall.reason}
              </p>
              {record.recall.recalledAt ? (
                <p className="mt-1 text-2xs tabular-nums text-ink-subtle">
                  Recorded {new Date(record.recall.recalledAt).toLocaleString('en-GB')}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="shape-heading" className="flex flex-col gap-5">
        <div>
          <h2 id="shape-heading" className="text-sm font-semibold text-ink">
            The shape of the disclosure
          </h2>
          <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-muted">
            What matters here is not that you can see everything — it is that you can see what the
            public could not.
          </p>
        </div>

        <StatRow>
          <StatTile
            label="Fields declared"
            value={total}
            context={`${espr} in the ESPR content set`}
            tone="accent"
          />
          <StatTile
            label="Withheld from the public"
            value={withheld}
            context={`${withheldShare}% of the record`}
            tone={withheldShare >= 50 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Versions"
            value={record.versions.length}
            context={
              record.publishedVersion
                ? `v${record.publishedVersion} is the one on the market`
                : 'nothing published yet'
            }
          />
          <StatTile
            label="Credentials"
            value={record.credentials.length}
            context={
              record.credentials.length === 0
                ? 'none issued'
                : `${liveCredentials} of ${record.credentials.length} unrevoked`
            }
            tone={
              record.credentials.length > 0 && liveCredentials < record.credentials.length
                ? 'caution'
                : 'neutral'
            }
          />
        </StatRow>

        {segments.length > 0 ? (
          <div className="rounded-lg border border-line bg-surface p-5">
            <StackedBar
              height={14}
              ariaLabel={segments
                .map((segment) => `${segment.value} fields ${segment.label}`)
                .join(', ')}
              segments={segments}
            />
            <Legend
              className="mt-3"
              items={segments.map((segment) => ({
                key: segment.key,
                label: segment.label,
                value: String(segment.value),
                colour: segment.colour,
              }))}
            />
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">
              {withheldShare === 0
                ? 'Everything this passport carries is public. A consumer scanning the label reads the same record you are reading.'
                : `A consumer scanning this label reads ${publicCount} of ${total} fields. The remaining ${withheld} are released only to a reader with a demonstrated interest or, for ${byTier.authority.length} of them, to a market-surveillance authority alone.`}
            </p>
          </div>
        ) : null}
      </section>

      <OperatorSection record={record} />
      <DisclosureSection byTier={byTier} unregistered={record.unregistered} />
      <VersionSection record={record} />
      <TransitionSection record={record} />
      <CredentialSection record={record} />
    </div>
  );
}

type Record_ = NonNullable<Awaited<ReturnType<typeof loadEvidenceRecord>>>;

function OperatorSection({ record }: { record: Record_ }) {
  return (
    <section aria-labelledby="operator-heading">
      <h2 id="operator-heading" className="text-sm font-semibold text-ink">
        Responsible operator
      </h2>
      <p className="mt-0.5 mb-3 max-w-prose text-sm leading-relaxed text-ink-muted">
        Who answers for this product under Regulation (EU) 2019/1020 Art. 4, and the identifiers
        you would cite in a request.
      </p>
      <dl className="grid gap-x-8 gap-y-2 rounded-lg border border-line bg-surface px-5 py-4 text-sm sm:grid-cols-[13rem_1fr]">
        <Row label="Legal name">{record.brand.legalName}</Row>
        <Row label="Country of establishment">{record.brand.country}</Row>
        <Row label="LEI">{mono(record.brand.lei)}</Row>
        <Row label="EORI">{mono(record.brand.eoriNumber)}</Row>
        <Row label="GLN">{mono(record.brand.gln)}</Row>
        <Row label="VAT">{mono(record.brand.vatNumber)}</Row>
        <Row label="DID">{mono(record.brand.did)}</Row>
        <Row label="Contact">{record.brand.contactEmail ?? '—'}</Row>
        <Row label="Public passport">
          <a
            href={passportUrl(record.dppId)}
            target="_blank"
            rel="noreferrer"
            className="mono text-2xs break-all text-accent hover:underline"
          >
            {passportUrl(record.dppId)}
          </a>
        </Row>
        <Row label="EU Registry">
          {record.registry.id ? (
            <>
              <span className="mono text-2xs text-ink">{record.registry.id}</span>
              {record.registry.submittedAt ? (
                <span className="ml-2 text-ink-muted">
                  filed {new Date(record.registry.submittedAt).toLocaleDateString('en-GB')}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-ink-muted">
              Not filed — textile registration is not yet mandatory
            </span>
          )}
        </Row>
      </dl>
    </section>
  );
}

/**
 * Field-by-field, grouped by the tier the regulator's own vocabulary uses.
 *
 * Polytrail models audiences more finely than the three regulated tiers — a
 * repairer and a recycler want different things — but an inspector should be
 * reading this in the delegated act's language, so the regulated tier leads and
 * the finer audience set is shown alongside it. Each group carries the ramp
 * step it occupies in the bar above, so the table and the chart are obviously
 * the same thing twice.
 */
function DisclosureSection({
  byTier,
  unregistered,
}: {
  byTier: Record<RegulatedTier, FieldDisclosure[]>;
  unregistered: string[];
}) {
  return (
    <section aria-labelledby="disclosure-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="disclosure-heading" className="text-sm font-semibold text-ink">
          Declared content, by access tier
        </h2>
        <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-muted">
          The pattern the JRC proposes is that claims are public and evidence is restricted. Each
          field carries the instrument that asks for it, so a gap is attributable rather than
          merely noticeable.
        </p>
      </div>

      {REGULATED_TIERS.map((tier) => {
        const fields = byTier[tier];
        const meta = TIER_META[tier];
        if (fields.length === 0) return null;
        const espr = fields.filter((field) => field.espr).length;

        return (
          <div key={tier} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex">
              <span aria-hidden className="w-1 shrink-0" style={{ background: meta.colour }} />
              <div className="min-w-0 flex-1 border-b border-line px-5 py-3.5">
                <h3 className="flex flex-wrap items-center gap-2.5 text-sm font-medium text-ink">
                  <meta.icon className="size-4 text-ink-muted" aria-hidden />
                  {REGULATED_TIER_LABELS[tier]}
                  <span className="text-2xs tabular-nums text-ink-subtle">
                    {fields.length} {fields.length === 1 ? 'field' : 'fields'}
                    {espr > 0 ? ` · ${espr} ESPR` : ''}
                  </span>
                </h3>
                <p className="mt-1 max-w-prose text-2xs leading-relaxed text-ink-subtle">
                  {meta.note}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-ink-subtle">
                  <tr>
                    <TH>Field</TH>
                    <TH>Value</TH>
                    <TH>Visible to</TH>
                    <TH>Basis</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {fields.map((field) => (
                    <TR key={field.path}>
                      <TD>
                        <p className="text-ink">{field.label}</p>
                        <p className="mono mt-0.5 text-2xs text-ink-subtle">{field.path}</p>
                      </TD>
                      <TD className="max-w-md">
                        <span className="mono text-2xs break-words text-ink">
                          {renderValue(field.value)}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-2xs text-ink-muted">{field.audiences.join(', ')}</span>
                      </TD>
                      <TD>
                        <span className="text-2xs text-ink-subtle">{field.basis}</span>
                        {field.espr ? (
                          <Badge tone="accent" className="ml-1.5">
                            ESPR
                          </Badge>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {unregistered.length > 0 ? (
        <div className="rounded-lg border border-caution-border bg-caution-soft px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-caution">
            <FileWarning className="size-4" aria-hidden />
            {unregistered.length} value{unregistered.length === 1 ? '' : 's'} the field registry does
            not describe
          </h3>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
            The projector is deny-by-default, so these are invisible to every reader except you.
            They are listed because an undocumented value in a regulated record is worth seeing.
          </p>
          <ul className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted">
            {unregistered.slice(0, 40).map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
          {unregistered.length > 40 ? (
            <p className="mt-2 text-2xs text-ink-subtle">
              {unregistered.length - 40} more in the exported record.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Versions as a timeline rather than a table.
 *
 * The question is not "what are the hashes" but "what changed, when, and did
 * anyone say why" — and that is a sequence. The published version is marked on
 * the rail, so the one that is actually on the market is findable at a glance
 * in a list that may be twenty long.
 */
function VersionSection({ record }: { record: Record_ }) {
  return (
    <section aria-labelledby="versions-heading">
      <h2 id="versions-heading" className="text-sm font-semibold text-ink">
        Version history
      </h2>
      <p className="mt-0.5 mb-4 max-w-prose text-sm leading-relaxed text-ink-muted">
        Content is never rewritten in place. Correcting a passport writes a new version with a
        reason, so what changed and why is answerable rather than inferred. The content hash is over
        the canonical form of the payload at that version.
      </p>

      <ol className="border-l border-line pl-6">
        {record.versions.map((version) => {
          const isPublished = version.version === record.publishedVersion;
          return (
            <li key={version.version} className="relative pb-6 last:pb-0">
              <span
                aria-hidden
                className={
                  isPublished
                    ? 'absolute top-1.5 -left-[1.7rem] size-2.5 rounded-full bg-positive ring-4 ring-canvas'
                    : 'absolute top-1.5 -left-[1.7rem] size-2.5 rounded-full bg-line-strong ring-4 ring-canvas'
                }
              />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium tabular-nums text-ink">v{version.version}</span>
                {isPublished ? <Badge tone="positive">On the market</Badge> : null}
                <span className="text-2xs tabular-nums text-ink-subtle">
                  {new Date(version.createdAt).toLocaleString('en-GB')}
                </span>
              </div>

              <p className="mt-1 max-w-prose text-sm text-ink-muted">
                {version.changeReason ?? (
                  <span className="text-ink-subtle">No reason was recorded for this version.</span>
                )}
              </p>

              <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-2xs sm:grid-cols-[8.5rem_1fr]">
                <dt className="text-ink-subtle">Content hash</dt>
                <dd className="mono break-all text-ink-muted">{version.dataHash}</dd>
                <dt className="text-ink-subtle">Credential hash</dt>
                <dd className="mono break-all text-ink-subtle">{version.credentialHash ?? '—'}</dd>
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TransitionSection({ record }: { record: Record_ }) {
  if (record.transitions.length === 0) return null;
  return (
    <section aria-labelledby="transitions-heading">
      <h2 id="transitions-heading" className="text-sm font-semibold text-ink">
        Status transitions
      </h2>
      <p className="mt-0.5 mb-3 max-w-prose text-sm leading-relaxed text-ink-muted">
        Newest first. Suspension and recall require a written reason, so an empty one on those rows
        is itself a finding.
      </p>
      <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {record.transitions.map((transition) => (
          <li
            key={`${transition.at}-${transition.to}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3"
          >
            <span className="text-2xs tabular-nums text-ink-subtle">
              {new Date(transition.at).toLocaleString('en-GB')}
            </span>
            <span className="text-sm text-ink">
              {transition.from ? `${transition.from.replace(/_/g, ' ')} → ` : ''}
              {transition.to.replace(/_/g, ' ')}
            </span>
            {transition.reason ? (
              <span className="text-sm text-ink-muted">— {transition.reason}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function CredentialSection({ record }: { record: Record_ }) {
  return (
    <section aria-labelledby="credentials-heading">
      <h2 id="credentials-heading" className="text-sm font-semibold text-ink">
        Credentials
      </h2>
      <p className="mt-0.5 mb-3 max-w-prose text-sm leading-relaxed text-ink-muted">
        Third-party claims issued against this passport, with the body that issued them.
      </p>
      {record.credentials.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-5 py-6">
          <p className="text-sm font-medium text-ink">No credentials have been issued</p>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
            Every claim on this passport is the brand’s own, unverified by a third party. That is
            permitted — but a certification claimed in the public content with no credential behind
            it is the thing to look for.
          </p>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Scheme</TH>
              <TH>Issuer</TH>
              <TH>Licence</TH>
              <TH>Valid</TH>
              <TH>Status</TH>
              <TH>Document hash</TH>
            </TR>
          </THead>
          <TBody>
            {record.credentials.map((credential) => (
              <TR key={credential.documentHash}>
                <TD>
                  <p className="text-ink">{credential.scheme}</p>
                  <p className="text-2xs text-ink-subtle">{credential.credentialType}</p>
                </TD>
                <TD>
                  <p className="text-ink">{credential.issuerName}</p>
                  {credential.issuerDid ? (
                    <p className="mono text-2xs break-all text-ink-subtle">{credential.issuerDid}</p>
                  ) : null}
                </TD>
                <TD>
                  <span className="mono text-2xs text-ink-muted">
                    {credential.licenceNumber ?? '—'}
                  </span>
                </TD>
                <TD>
                  <span className="text-2xs tabular-nums text-ink-muted">
                    {credential.validFrom
                      ? new Date(credential.validFrom).toLocaleDateString('en-GB')
                      : '—'}
                    {' → '}
                    {credential.validUntil
                      ? new Date(credential.validUntil).toLocaleDateString('en-GB')
                      : '—'}
                  </span>
                </TD>
                <TD>
                  {credential.revokedAt ? (
                    <Badge tone="critical">
                      <XCircle aria-hidden />
                      Revoked
                    </Badge>
                  ) : (
                    <Badge tone="positive">
                      <ShieldCheck aria-hidden />
                      {credential.status}
                    </Badge>
                  )}
                  {credential.revocationReason ? (
                    <p className="mt-1 text-2xs text-ink-muted">{credential.revocationReason}</p>
                  ) : null}
                </TD>
                <TD>
                  <span className="mono text-2xs break-all text-ink-subtle">
                    {credential.documentHash}
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </>
  );
}

function mono(value: string | null): React.ReactNode {
  return value ? <span className="mono text-2xs break-all">{value}</span> : '—';
}

/** Long structures are truncated rather than allowed to bury the row they sit in. */
function renderValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return truncate(JSON.stringify(value));
}

function truncate(value: string): string {
  return value.length > 280 ? `${value.slice(0, 280)}…` : value;
}
