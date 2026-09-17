import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowUpRight, Check, Info } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api/errors';
import { formatDppId } from '@/lib/passport/identifier';
import { prepareSubmission } from '@/lib/registry/service';
import {
  IDENTIFIER_SCHEME_LABELS,
  OPERATOR_SCHEME_LABELS,
  PROOF_VALIDITY_DAYS,
  UPI_MAX_LENGTH,
} from '@/lib/registry/types';
import type { ReadinessIssue } from '@/lib/registry/preflight';

export const metadata = { title: 'Filing detail' };

/**
 * What would be filed, before it is filed.
 *
 * Shown as the actual envelope rather than as a summary, because the person
 * reading it is checking a declaration they will be answerable for. A friendly
 * abstraction over a regulatory submission is a way of preventing somebody from
 * noticing that the customs code is wrong.
 */
export default async function FilingDetailPage({
  params,
}: {
  params: Promise<{ dppId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { dppId } = await params;

  let prepared;
  try {
    prepared = await prepareSubmission(session.tenantId, dppId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { record, readiness, endpoint, passport } = prepared;

  return (
    <>
      <PageHeader
        title="Filing detail"
        description={`Exactly what would be sent to the Registry for ${formatDppId(passport.dppId)}.`}
        actions={
          <Link
            href="/console/registry"
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All filings
          </Link>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        {readiness.issues.length > 0 ? (
          <IssueList
            tone="critical"
            title={`${readiness.issues.length} thing${readiness.issues.length === 1 ? '' : 's'} must be fixed before this can be filed`}
            issues={readiness.issues}
          />
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-positive-border bg-positive-soft px-4 py-3 text-sm text-positive">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            This record passes the pre-submission check against the{' '}
            {endpoint.authoritative ? 'configured Registry' : 'rehearsal endpoint'}.
          </p>
        )}

        {readiness.advisories.length > 0 ? (
          <IssueList
            tone="caution"
            title="Worth knowing before you file"
            issues={readiness.advisories}
          />
        ) : null}

        <section aria-labelledby="envelope-heading">
          <h2 id="envelope-heading" className="text-sm font-semibold text-ink">
            Submission envelope
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-ink-muted">
            The Registry stores a pointer, not a passport: where the data lives, who is responsible
            for it, what the product is in customs terms, and a hash that pins the version.
          </p>

          <dl className="mt-4 grid gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-5 py-4 text-sm sm:grid-cols-[13rem_1fr]">
            <Row
              label="Unique product identifier"
              basis={`${IDENTIFIER_SCHEME_LABELS[record.upiScheme]} · ${record.upi.length}/${UPI_MAX_LENGTH} characters`}
            >
              <a
                href={record.upi}
                target="_blank"
                rel="noreferrer"
                className="mono inline-flex items-center gap-1 text-2xs break-all text-accent hover:underline"
              >
                {record.upi}
                <ArrowUpRight className="size-3 shrink-0" aria-hidden />
              </a>
            </Row>

            <Row
              label="Responsible operator"
              basis={OPERATOR_SCHEME_LABELS[record.operator.scheme]}
            >
              {record.operator.identifier ? (
                <>
                  <span className="mono text-2xs text-ink">{record.operator.identifier}</span>
                  <span className="ml-2 text-ink-muted">
                    {record.operator.legalName} · {record.operator.country}
                  </span>
                </>
              ) : (
                <Badge tone="critical">
                  <AlertCircle aria-hidden />
                  Missing
                </Badge>
              )}
            </Row>

            <Row label="Commodity code" basis="Combined Nomenclature">
              {record.commodityCode ? (
                <span className="mono text-2xs text-ink">{record.commodityCode}</span>
              ) : (
                <Badge tone="critical">
                  <AlertCircle aria-hidden />
                  Missing
                </Badge>
              )}
            </Row>

            <Row label="Service provider" basis="Who answers the identifier">
              <span className="mono text-2xs text-ink">{record.serviceProviderReference}</span>
            </Row>

            <Row label="Granularity" basis="Model, batch or item">
              <span className="text-ink">{record.granularity}</span>
            </Row>

            <Row label="Version hash" basis="SHA-256 over the canonical descriptor">
              <span className="mono text-2xs break-all text-ink">{record.versionHash}</span>
            </Row>

            <Row label="Content hash" basis={`Passport version ${record.version}`}>
              <span className="mono text-2xs break-all text-ink-muted">{record.payloadHash}</span>
            </Row>

            <Row label="Backup address" basis="Machine-readable copy">
              <span className="mono text-2xs break-all text-ink-muted">{record.backupUrl}</span>
            </Row>
          </dl>
        </section>

        <section aria-labelledby="links-heading">
          <h2 id="links-heading" className="text-sm font-semibold text-ink">
            Identifier links
          </h2>
          <p className="mt-0.5 max-w-prose text-sm text-ink-muted">
            Identifier granularity is not disclosure granularity. Item-level identifiers can be
            minted now and populated by inheritance from batch or model data.
          </p>
          <dl className="mt-4 grid gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-5 py-4 text-sm sm:grid-cols-[13rem_1fr]">
            {(['model', 'batch', 'item'] as const).map((level) => (
              <Row key={level} label={level[0]!.toUpperCase() + level.slice(1)}>
                {record.identifierLinks[level] ? (
                  <span className="mono text-2xs break-all text-ink">
                    {record.identifierLinks[level]}
                  </span>
                ) : (
                  <span className="text-ink-subtle">Not applicable at this granularity</span>
                )}
              </Row>
            ))}
          </dl>
        </section>

        <section aria-labelledby="current-heading">
          <h2 id="current-heading" className="text-sm font-semibold text-ink">
            Current registration
          </h2>
          {passport.registryId ? (
            <dl className="mt-4 grid gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-5 py-4 text-sm sm:grid-cols-[13rem_1fr]">
              <Row label="Registry identifier">
                <span className="mono text-2xs text-ink">{passport.registryId}</span>
              </Row>
              <Row label="Filed">
                <span className="text-ink">
                  {passport.registrySubmittedAt
                    ? new Date(passport.registrySubmittedAt).toLocaleString('en-GB')
                    : '—'}
                </span>
              </Row>
              <Row label="Proof expires" basis={`${PROOF_VALIDITY_DAYS} days from acceptance`}>
                <span className="text-ink">
                  {passport.registrySubmittedAt
                    ? new Date(
                        new Date(passport.registrySubmittedAt).getTime() +
                          PROOF_VALIDITY_DAYS * 86_400_000,
                      ).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'}
                </span>
              </Row>
            </dl>
          ) : (
            <p className="mt-2 flex items-start gap-2 text-sm text-ink-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
              This passport has not been filed.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function IssueList({
  tone,
  title,
  issues,
}: {
  tone: 'critical' | 'caution';
  title: string;
  issues: ReadinessIssue[];
}) {
  return (
    <section
      aria-label={title}
      className={
        tone === 'critical'
          ? 'rounded-lg border border-critical-border bg-critical-soft px-5 py-4'
          : 'rounded-lg border border-caution-border bg-caution-soft px-5 py-4'
      }
    >
      <h2
        className={
          tone === 'critical'
            ? 'flex items-center gap-2 text-sm font-semibold text-critical'
            : 'flex items-center gap-2 text-sm font-semibold text-caution'
        }
      >
        <AlertCircle className="size-4" aria-hidden />
        {title}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {issues.map((issue) => (
          <li key={`${issue.field}-${issue.label}`} className="text-sm">
            <p className="font-medium text-ink">{issue.label}</p>
            <p className="mt-0.5 max-w-prose text-ink-muted">{issue.detail}</p>
            <p className="mt-1 text-2xs text-ink-subtle">{issue.instrument}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  label,
  basis,
  children,
}: {
  label: string;
  basis?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-muted">
        {label}
        {basis ? <span className="mt-0.5 block text-2xs text-ink-subtle">{basis}</span> : null}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
