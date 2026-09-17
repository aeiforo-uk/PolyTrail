import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  BadgeCheck,
  ClipboardList,
  Fingerprint,
  Mail,
  MapPin,
  Pencil,
  Plus,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { getPartnerDetail } from '@/lib/partners/queries';
import {
  ROLE_LABEL,
  countryName,
  type PartnerRole,
  type SupplyTier,
} from '@/lib/partners/vocab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import { StackedBar } from '@/components/viz/bar-chart';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { cn } from '@/lib/utils';
import { RequestStatusBadge } from '../../requests/request-status';
import { partnerCertificates, type PartnerCertificate } from '../queries';
import { TierRank, daysUntil, formatDate, relativeTime } from '../presentation';

export async function generateMetadata({ params }: { params: Promise<{ partnerId: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) return { title: 'Supplier' };
  const detail = await getPartnerDetail(session.tenantId, (await params).partnerId);
  return { title: detail?.partner.name ?? 'Supplier' };
}

/**
 * One facility, and the whole of the relationship with it.
 *
 * The rail carries what the facility *is* — where, who, which identifiers,
 * which certificates and how long they have left. The main column carries what
 * has happened: the passports the facility sits inside, and every request ever
 * sent to it as a timeline. A sourcing manager opening this page is almost
 * always answering "can I still make this claim", and that is a question about
 * history, not about a contact card.
 */
export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { partnerId } = await params;
  const detail = await getPartnerDetail(session.tenantId, partnerId);
  if (!detail) notFound();

  const certificates = await partnerCertificates(session.tenantId, partnerId);

  const { partner, address, passports, requests } = detail;
  const location = [address?.line1, address?.city, address?.postalCode, countryName(partner.country)]
    .filter(Boolean)
    .join(', ');

  const answered = requests.filter((request) => request.submittedAt !== null);
  const open = requests.filter((request) =>
    ['sent', 'in_progress', 'submitted', 'under_review'].includes(request.status),
  );
  const turnarounds = answered
    .filter((request) => request.sentAt !== null)
    .map((request) => daysUntil(request.submittedAt!, request.sentAt!));
  const medianTurnaround = median(turnarounds);

  const now = new Date();
  const lapsed = certificates.filter((cert) => isLapsed(cert, now));
  const lapsingSoon = certificates.filter(
    (cert) => !isLapsed(cert, now) && cert.validUntil !== null && daysUntil(cert.validUntil, now) <= 90,
  );

  return (
    <>
      <PageHeader
        title={partner.name}
        description={
          partner.legalName && partner.legalName !== partner.name ? partner.legalName : undefined
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/console/partners/${partner.id}/edit`}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/console/requests/new?partnerId=${partner.id}`}>
                <Plus aria-hidden />
                Ask for data
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <TierRank tier={partner.tier as SupplyTier} />
          <span aria-hidden className="h-4 w-px bg-line" />
          <span className="flex flex-wrap gap-1.5">
            {(partner.roles as PartnerRole[]).map((role) => (
              <Badge key={role} tone="outline">
                {ROLE_LABEL[role] ?? role}
              </Badge>
            ))}
          </span>
        </div>

        <StatRow>
          <StatTile
            label="Passports they touch"
            value={passports.length}
            context={
              passports.length === 0
                ? 'not linked to a product yet'
                : `${passports.filter((row) => row.verifiedAt).length} of them verified`
            }
            tone={passports.length === 0 ? 'neutral' : 'accent'}
          />
          <StatTile
            label="Requests answered"
            value={answered.length}
            context={`of ${requests.length} sent${open.length > 0 ? ` · ${open.length} still open` : ''}`}
            tone={open.length > 0 ? 'caution' : 'positive'}
          />
          <StatTile
            label="Usual turnaround"
            value={medianTurnaround === null ? '—' : medianTurnaround}
            unit={medianTurnaround === null ? undefined : medianTurnaround === 1 ? 'day' : 'days'}
            context={
              medianTurnaround === null
                ? 'nothing answered yet'
                : `median across ${turnarounds.length} ${turnarounds.length === 1 ? 'reply' : 'replies'}`
            }
            tone={medianTurnaround !== null && medianTurnaround <= 14 ? 'positive' : 'neutral'}
          />
          <StatTile
            label="Certificates"
            value={certificates.length}
            context={
              lapsed.length > 0
                ? `${lapsed.length} expired`
                : lapsingSoon.length > 0
                  ? `${lapsingSoon.length} lapsing within 90 days`
                  : certificates.length === 0
                    ? 'nothing on file'
                    : 'all in date'
            }
            tone={
              lapsed.length > 0
                ? 'critical'
                : lapsingSoon.length > 0
                  ? 'caution'
                  : certificates.length > 0
                    ? 'positive'
                    : 'neutral'
            }
          />
        </StatRow>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink">Passports they touch</h2>
              {passports.length === 0 ? (
                <EmptyState
                  title="Not linked to a passport yet"
                  description="Link this facility to a passport from the passport supply-chain section, and the step it performs appears here."
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Product</TH>
                      <TH>Step</TH>
                      <TH>Component</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Verified</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {passports.map((row) => (
                      <TR key={`${row.passportId}-${row.role}`}>
                        <TD>
                          <Link
                            href={`/console/passports/${row.dppId}`}
                            className="font-medium text-ink transition-colors duration-[140ms] hover:text-accent"
                          >
                            {row.productName}
                          </Link>
                        </TD>
                        <TD className="text-ink-muted">
                          {ROLE_LABEL[row.role as PartnerRole] ?? row.role}
                        </TD>
                        <TD className="text-ink-muted">{row.componentRef ?? '—'}</TD>
                        <TD>
                          <StatusBadge status={row.status} />
                        </TD>
                        <TD className="text-right text-xs tabular-nums">
                          {row.verifiedAt ? (
                            <span className="text-ink-muted" title={formatDate(row.verifiedAt)}>
                              {relativeTime(row.verifiedAt)}
                            </span>
                          ) : (
                            <span className="text-caution">Not verified</span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-semibold text-ink">Everything you have asked them</h2>
                {requests.length > 0 ? (
                  <p className="text-xs text-ink-muted tabular-nums">
                    {requests.length} {requests.length === 1 ? 'request' : 'requests'}
                  </p>
                ) : null}
              </div>

              {requests.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="You have never asked them for anything"
                  description="A request takes about a minute to build and needs no account at their end — they answer through a link."
                  action={
                    <Button asChild size="sm">
                      <Link href={`/console/requests/new?partnerId=${partner.id}`}>
                        Ask for data
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ol className="relative flex flex-col gap-0 rounded-lg border border-line bg-surface">
                  {requests.map((request, index) => {
                    const overdue =
                      request.dueAt !== null &&
                      request.submittedAt === null &&
                      ['sent', 'in_progress'].includes(request.status) &&
                      request.dueAt.getTime() < now.getTime();

                    return (
                      <li
                        key={request.id}
                        className={cn(
                          'relative flex gap-4 px-5 py-4',
                          index > 0 && 'border-t border-line',
                        )}
                      >
                        <span className="relative flex w-3 shrink-0 justify-center">
                          {/* The thread of the timeline, drawn as two stubs so it
                              stops at the dot on the first and last entries
                              rather than running off the card. */}
                          {index > 0 ? (
                            <span aria-hidden className="absolute top-0 h-2 w-px bg-line" />
                          ) : null}
                          {index < requests.length - 1 ? (
                            <span aria-hidden className="absolute top-3.5 bottom-0 w-px bg-line" />
                          ) : null}
                          <span
                            aria-hidden
                            className={cn(
                              'relative mt-1.5 size-2 rounded-full ring-3 ring-surface',
                              overdue
                                ? 'bg-critical'
                                : request.submittedAt
                                  ? 'bg-positive'
                                  : 'bg-line-strong',
                            )}
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <Link
                              href={`/console/requests/${request.id}`}
                              className="text-sm font-medium text-ink transition-colors duration-[140ms] hover:text-accent"
                            >
                              {request.title}
                            </Link>
                            <RequestStatusBadge status={request.status} />
                            {overdue && request.dueAt ? (
                              <Badge tone="critical">
                                {Math.abs(daysUntil(request.dueAt, now))} days late
                              </Badge>
                            ) : null}
                          </div>

                          <p className="mt-1 text-xs text-ink-muted tabular-nums">
                            {request.fieldCount} {request.fieldCount === 1 ? 'field' : 'fields'}
                            {request.dueAt ? ` · due ${formatDate(request.dueAt)}` : ' · no deadline'}
                          </p>

                          <ol className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-subtle">
                            <Milestone label="Sent" date={request.sentAt} />
                            <Milestone label="Answered" date={request.submittedAt} />
                          </ol>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">The facility</h2>
              <dl className="mt-4 flex flex-col gap-3.5 text-sm">
                <Detail label="Where" icon={MapPin}>
                  {location || countryName(partner.country)}
                  {partner.latitude && partner.longitude ? (
                    <span className="mono mt-1 block text-2xs text-ink-subtle">
                      {partner.latitude}, {partner.longitude}
                    </span>
                  ) : null}
                </Detail>
                <Detail label="Who to write to" icon={Mail}>
                  {partner.contactName || partner.contactEmail ? (
                    <>
                      {partner.contactName ? <span>{partner.contactName}</span> : null}
                      {partner.contactEmail ? (
                        <span className="block break-all text-ink-muted">
                          {partner.contactEmail}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-caution">
                      Nobody on file. Without an address a data request cannot be sent, only copied
                      as a link.
                    </span>
                  )}
                </Detail>
                {partner.workerCount != null ? (
                  <Detail label="Workers on site" icon={Users}>
                    <span className="tabular-nums">
                      {partner.workerCount.toLocaleString('en-GB')}
                    </span>
                  </Detail>
                ) : null}
                {partner.capabilities.length > 0 ? (
                  <Detail label="Capabilities">{partner.capabilities.join(', ')}</Detail>
                ) : null}
                {partner.notes ? <Detail label="Notes">{partner.notes}</Detail> : null}
              </dl>
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Identifiers</h2>
              <dl className="mt-4 flex flex-col gap-4 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5">
                    <span className="eyebrow">GLN</span>
                    <Badge tone="accent">Authoritative</Badge>
                  </dt>
                  <dd className="mt-1">
                    {partner.gln ? (
                      <span className="mono text-ink">{partner.gln}</span>
                    ) : (
                      <span className="flex items-start gap-1.5 text-caution">
                        <Fingerprint className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        Missing — the passport needs a formal facility identifier before it can be
                        published.
                      </span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="flex items-center gap-1.5">
                    <span className="eyebrow">Open Supply Hub</span>
                    <Badge tone="neutral">Supplementary</Badge>
                  </dt>
                  <dd className="mt-1">
                    {partner.osId ? (
                      <span className="mono text-ink">{partner.osId}</span>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                    <span className="mt-1 block text-2xs leading-relaxed text-ink-subtle">
                      Cross-reference only. The JRC rejected Open Supply Hub as not a formal
                      identifier scheme, so it never stands in for the GLN.
                    </span>
                  </dd>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="eyebrow">LEI</dt>
                    <dd className="mt-1">
                      {partner.lei ? (
                        <span className="mono text-ink">{partner.lei}</span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="eyebrow">DID</dt>
                    <dd className="mt-1">
                      {partner.did ? (
                        <span className="mono block break-all text-ink">{partner.did}</span>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </dd>
                  </div>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Certificates</h2>
                {certificates.length > 0 ? (
                  <p className="text-xs text-ink-muted tabular-nums">{certificates.length} on file</p>
                ) : null}
              </div>

              {certificates.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  Nothing on file. Ask for the certificates in a data request and they land here,
                  against this facility rather than loose in a shared drive.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-4">
                  {certificates.map((cert) => (
                    <ValidityRow key={cert.id} cert={cert} now={now} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function Detail({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="eyebrow mb-0.5 flex items-center gap-1.5">
        {Icon ? <Icon className="size-3 text-ink-subtle" aria-hidden /> : null}
        {label}
      </dt>
      <dd className="leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

function Milestone({ label, date }: { label: string; date: Date | null }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn('size-1 rounded-full', date ? 'bg-ink-subtle' : 'bg-line-strong')}
      />
      {label}{' '}
      {date ? (
        <span className="tabular-nums text-ink-muted" title={formatDate(date)}>
          {relativeTime(date)}
        </span>
      ) : (
        <span>not yet</span>
      )}
    </li>
  );
}

function isLapsed(cert: PartnerCertificate, now: Date): boolean {
  if (cert.status === 'expired' || cert.status === 'revoked') return true;
  return cert.validUntil !== null && cert.validUntil.getTime() < now.getTime();
}

/**
 * A certificate as a span rather than a date.
 *
 * "Valid to 4 March 2027" makes the reader do the subtraction; a bar showing
 * how much of the term is already spent does not. The elapsed portion is drawn
 * in a recessive grey and the remaining portion in a status colour, so the bar
 * says both how long is left and whether that is a problem — and the figure is
 * written out beside it, because colour alone is never the message.
 */
function ValidityRow({ cert, now }: { cert: PartnerCertificate; now: Date }) {
  const lapsed = isLapsed(cert, now);
  const daysLeft = cert.validUntil ? daysUntil(cert.validUntil, now) : null;
  const tone =
    lapsed || cert.status === 'revoked'
      ? 'critical'
      : daysLeft !== null && daysLeft <= 90
        ? 'caution'
        : 'positive';

  const colour =
    tone === 'critical'
      ? 'var(--color-critical)'
      : tone === 'caution'
        ? 'var(--color-caution)'
        : 'var(--color-positive)';

  const hasSpan = cert.validFrom !== null && cert.validUntil !== null && !lapsed;
  const total = hasSpan ? cert.validUntil!.getTime() - cert.validFrom!.getTime() : 0;
  const spent = hasSpan ? Math.max(0, Math.min(total, now.getTime() - cert.validFrom!.getTime())) : 0;

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            {tone === 'critical' ? (
              <ShieldAlert className="size-3.5 shrink-0 text-critical" aria-hidden />
            ) : (
              <BadgeCheck
                className={cn(
                  'size-3.5 shrink-0',
                  tone === 'caution' ? 'text-caution' : 'text-positive',
                )}
                aria-hidden
              />
            )}
            {cert.scheme}
          </span>
          <span className="mt-0.5 block text-2xs text-ink-subtle">
            {cert.licenceNumber ? (
              <span className="mono">{cert.licenceNumber}</span>
            ) : (
              cert.credentialType
            )}
            {cert.issuerName ? ` · ${cert.issuerName}` : ''}
          </span>
        </span>

        <span
          className={cn(
            'shrink-0 text-2xs tabular-nums',
            tone === 'critical'
              ? 'text-critical'
              : tone === 'caution'
                ? 'text-caution'
                : 'text-positive',
          )}
        >
          {cert.status === 'revoked'
            ? 'Revoked'
            : lapsed
              ? cert.validUntil
                ? `Expired ${relativeTime(cert.validUntil, now)}`
                : 'Expired'
              : daysLeft === null
                ? 'No end date'
                : `${daysLeft} days left`}
        </span>
      </div>

      {hasSpan ? (
        <>
          <StackedBar
            height={6}
            ariaLabel={`${cert.scheme} valid from ${formatDate(cert.validFrom!)} to ${formatDate(cert.validUntil!)}, ${daysLeft} days remaining`}
            segments={[
              { key: 'spent', label: 'Elapsed', value: spent, colour: 'var(--color-line-strong)' },
              { key: 'left', label: 'Remaining', value: total - spent, colour },
            ]}
          />
          <p className="flex items-baseline justify-between gap-3 text-2xs text-ink-subtle tabular-nums">
            <span>{formatDate(cert.validFrom!)}</span>
            <span>{formatDate(cert.validUntil!)}</span>
          </p>
        </>
      ) : (
        <p className="text-2xs text-ink-subtle tabular-nums">
          {cert.validFrom ? `From ${formatDate(cert.validFrom)}` : 'Start date not recorded'}
          {cert.validUntil ? ` · to ${formatDate(cert.validUntil)}` : ''}
        </p>
      )}
    </li>
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}
