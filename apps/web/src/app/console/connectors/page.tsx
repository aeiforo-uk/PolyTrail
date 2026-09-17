import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  KeyRound,
  Plug,
  Plus,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { canConfigureConnectors } from '@/lib/import/access';
import { CONNECTOR_KIND_INFO, CONNECTOR_KIND_LIST } from '@/lib/connectors/kinds';
import { listConnectors } from '@/lib/connectors/store';
import { credentialStorageAvailable } from '@/lib/connectors/crypto';
import type { ConnectorSummary } from '@/lib/connectors/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Connectors' };

/**
 * Connected systems.
 *
 * The list shows what is built and what is not, side by side. A brand
 * evaluating this product deserves to know on the first screen that "SAP" is a
 * placeholder, rather than after configuring one — so the two columns below are
 * headed "Built and working" and "Declared, not built", and the second column
 * says what is actually missing.
 *
 * The connectors the workspace has configured are ranked by whether they can be
 * relied on: a failing one first, then one nobody has ever tested, then the
 * ones that answered.
 */
export default async function ConnectorsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!canConfigureConnectors(session)) redirect('/console');

  const connectors = await listConnectors(session.tenantId);
  const canStoreCredentials = credentialStorageAvailable();

  const failing = connectors.filter((c) => c.lastTestedAt !== null && c.lastTestOk === false);
  const untested = connectors.filter((c) => c.lastTestedAt === null);
  const working = connectors.filter((c) => c.lastTestOk === true);
  const ranked = [...connectors].sort((a, b) => rank(a) - rank(b));

  const available = CONNECTOR_KIND_LIST.filter((kind) => kind.implemented);
  const declared = CONNECTOR_KIND_LIST.filter((kind) => !kind.implemented);

  return (
    <>
      <PageHeader
        title="Connectors"
        description="Pull product data straight from the system that already holds it. Records arrive as an import you still map and review — a connector removes the export step, not the check."
        actions={
          <Button asChild size="sm">
            <Link href="/console/connectors/new">
              <Plus aria-hidden />
              Add a connector
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        {canStoreCredentials ? null : (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-semibold">Credentials cannot be stored.</strong>{' '}
              <span className="mono">CONNECTOR_SECRET</span> is not set in the environment, so there
              is no key to encrypt them with. Connectors without a credential still work against
              open endpoints.
            </span>
          </p>
        )}

        {connectors.length > 0 ? (
          <StatRow>
            <StatTile
              label="Connected systems"
              value={connectors.length}
              context={`${connectors.filter((c) => c.hasSecret).length} hold a stored credential`}
              tone="accent"
            />
            <StatTile
              label="Answered last test"
              value={working.length}
              context={
                connectors.length - untested.length === 0
                  ? 'none tested yet'
                  : `of ${connectors.length - untested.length} tested`
              }
              tone={working.length > 0 ? 'positive' : 'neutral'}
            />
            <StatTile
              label="Failing"
              value={failing.length}
              context={failing.length === 0 ? 'nothing is broken' : 'a pull would fail now'}
              tone={failing.length > 0 ? 'critical' : 'neutral'}
            />
            <StatTile
              label="Never tested"
              value={untested.length}
              context={
                untested.length === 0
                  ? 'all proven at least once'
                  : 'test before anyone relies on it'
              }
              tone={untested.length > 0 ? 'caution' : 'neutral'}
            />
          </StatRow>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-semibold text-ink">Your connectors</h2>
              {connectors.length > 0 ? (
                <p className="text-xs text-ink-subtle">Least trustworthy first</p>
              ) : null}
            </div>

            {connectors.length === 0 ? (
              <EmptyState
                icon={Plug}
                title="Nothing is connected yet"
                description="A connector reads products from a PIM, a PLM or any HTTP endpoint that returns JSON, and turns them into an import. You still map the fields and review what it would do — nothing is written to a passport straight from an API."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button asChild size="sm">
                      <Link href="/console/connectors/new">
                        <Plus aria-hidden />
                        Add the first connector
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" size="sm">
                      <Link href="/console/imports/new">Upload a CSV instead</Link>
                    </Button>
                  </div>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {ranked.map((connector) => {
                  const info = CONNECTOR_KIND_INFO[connector.kind];
                  const health = healthOf(connector);
                  const url = readUrl(connector);

                  return (
                    <li key={connector.id}>
                      <Link
                        href={`/console/connectors/${connector.id}`}
                        className={cn(
                          'flex items-stretch gap-4 overflow-hidden rounded-lg border border-line bg-surface',
                          'transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)] hover:bg-surface-sunken',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'w-0.5 shrink-0',
                            health === 'critical'
                              ? 'bg-critical'
                              : health === 'caution'
                                ? 'bg-caution'
                                : 'bg-positive',
                          )}
                        />
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 py-3.5 pr-4">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-ink">
                                {connector.name}
                              </span>
                              {info.implemented ? null : (
                                <Badge tone="caution">Type not built</Badge>
                              )}
                            </span>
                            <span className="mono mt-0.5 block truncate text-2xs text-ink-subtle">
                              {url ?? info.label}
                            </span>
                          </span>

                          <span className="flex shrink-0 items-center gap-1.5 text-xs">
                            {connector.hasSecret ? (
                              <>
                                <KeyRound className="size-3.5 text-ink-subtle" aria-hidden />
                                <span className="text-ink-muted">Credential stored</span>
                              </>
                            ) : (
                              <>
                                <KeyRound className="size-3.5 text-ink-subtle" aria-hidden />
                                <span className="text-ink-subtle">No credential</span>
                              </>
                            )}
                          </span>

                          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
                            {connector.lastTestedAt === null ? (
                              <>
                                <CircleDashed className="size-3.5 text-caution" aria-hidden />
                                <span className="text-caution">Never tested</span>
                              </>
                            ) : connector.lastTestOk ? (
                              <>
                                <CheckCircle2 className="size-3.5 text-positive" aria-hidden />
                                <span className="text-positive">
                                  Worked {formatDate(connector.lastTestedAt)}
                                </span>
                              </>
                            ) : (
                              <>
                                <XCircle className="size-3.5 text-critical" aria-hidden />
                                <span className="text-critical">
                                  Failed {formatDate(connector.lastTestedAt)}
                                </span>
                              </>
                            )}
                          </span>

                          <ArrowRight className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="min-w-0">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-ink">What can be connected</h2>
              <p className="mt-1 text-sm text-ink-muted">
                One generic connector, built and working. The named systems are declared but not
                implemented — listed so you know where they stand, not to imply they work.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <p className="eyebrow mb-2 flex items-center gap-1.5 text-positive">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Built and working
                </p>
                <ul className="flex flex-col gap-2">
                  {available.map((kind) => (
                    <li
                      key={kind.kind}
                      className="rounded-lg border border-positive-border bg-surface p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-ink">{kind.label}</h3>
                        <Badge tone="positive">
                          <CheckCircle2 aria-hidden />
                          Available
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                        {kind.description}
                      </p>
                      <Link
                        href="/console/connectors/new"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        Configure one
                        <ArrowRight className="size-3" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="eyebrow mb-2 flex items-center gap-1.5 text-ink-subtle">
                  <CircleDashed className="size-3" aria-hidden />
                  Declared, not built
                </p>
                <ul className="flex flex-col gap-px overflow-hidden rounded-lg border border-dashed border-line-strong bg-line">
                  {declared.map((kind) => (
                    <li key={kind.kind} className="bg-surface-sunken/60 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-ink-muted">{kind.label}</h3>
                        <Badge tone="outline">
                          <CircleDashed aria-hidden />
                          Not implemented
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">
                        {kind.status}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-2xs leading-relaxed text-ink-subtle">
                  Every one of these speaks HTTP and JSON. The REST connector above will read them
                  today if you can point it at an endpoint.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function rank(connector: ConnectorSummary): number {
  if (connector.lastTestedAt !== null && connector.lastTestOk === false) return 0;
  if (connector.lastTestedAt === null) return 1;
  return 2;
}

function healthOf(connector: ConnectorSummary): 'critical' | 'caution' | 'positive' {
  if (connector.lastTestedAt !== null && connector.lastTestOk === false) return 'critical';
  if (connector.lastTestedAt === null) return 'caution';
  return 'positive';
}

function readUrl(connector: ConnectorSummary): string | null {
  const value = connector.settings?.baseUrl;
  return typeof value === 'string' && value !== '' ? value : null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
