import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowUpRight, BookOpen, FileJson, Lock } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { getDeveloperOverview } from './queries';
import { ApiKeysPanel } from './api-keys-panel';
import { WebhooksPanel } from './webhooks-panel';
import { SigningPanel } from './signing-panel';

export const metadata = { title: 'Developers' };

/**
 * Developer settings.
 *
 * Research into the live market found no textile passport vendor publishing a
 * real API — "GS1 Digital Link support" that resolves to HTML, JSON-LD that is
 * a schema.org SEO tag, and no OpenAPI document anywhere. This page is the
 * answer to that: keys, webhooks, signing identity and the machine-readable
 * contract, in one place, with the contract linked at the top rather than
 * described at the bottom.
 */
export default async function DevelopersPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  if (session.role !== 'BRAND_ADMIN') {
    return (
      <>
        <PageHeader title="Developers" description="API keys, webhooks and signing identity." />
        <div className="px-8 py-8">
          <EmptyState
            icon={Lock}
            title="Only a brand admin can manage integrations"
            description="An API key can create and publish passports, so minting one is kept to the workspace owner. Ask a brand admin for a key scoped to what your integration actually needs — the contract itself is public and linked below."
            action={
              <a
                href="/api/v1/openapi.json"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <BookOpen className="size-4" aria-hidden />
                Read the OpenAPI document
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            }
          />
        </div>
      </>
    );
  }

  const [overview, headerList] = await Promise.all([
    getDeveloperOverview(session.tenantId),
    headers(),
  ]);

  const host = headerList.get('host') ?? 'your-workspace.polytrail.app';
  const origin = `${host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'}://${host}`;

  const now = Date.now();
  const liveKeys = overview.keys.filter(
    (key) => key.revokedAt === null && (key.expiresAt === null || key.expiresAt.getTime() > now),
  );
  const retiredKeys = overview.keys.length - liveKeys.length;
  const pausedEndpoints = overview.endpoints.filter((endpoint) => !endpoint.active).length;
  const strugglingEndpoints = overview.endpoints.filter(
    (endpoint) => !endpoint.active || endpoint.consecutiveFailures > 0,
  ).length;
  const accepted = overview.deliveries.filter((delivery) => delivery.deliveredAt !== null).length;
  const acceptRate =
    overview.deliveries.length === 0
      ? null
      : Math.round((accepted / overview.deliveries.length) * 100);

  return (
    <>
      <PageHeader
        title="Developers"
        description="Read and write passports from your own systems, and be told when something changes. Everything here is enforced by the same definitions the routes are guarded by."
      />

      <div className="flex flex-col gap-10 px-8 py-8">
        <ApiReference origin={origin} didDocumentUrl={overview.signing.didDocumentPath} />

        <StatRow>
          <StatTile
            label="Keys in use"
            value={liveKeys.length}
            context={
              retiredKeys === 0
                ? overview.keys.length === 0
                  ? 'none created yet'
                  : 'none revoked or expired'
                : `${retiredKeys} revoked or expired`
            }
            tone={liveKeys.length > 0 ? 'accent' : 'neutral'}
          />
          <StatTile
            label="Webhook endpoints"
            value={overview.endpoints.length}
            context={
              pausedEndpoints === 0
                ? overview.endpoints.length === 0
                  ? 'nothing subscribed'
                  : 'all receiving'
                : `${pausedEndpoints} paused after failing`
            }
            tone={pausedEndpoints > 0 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Deliveries accepted"
            value={acceptRate === null ? '—' : `${acceptRate}%`}
            context={
              overview.deliveries.length === 0
                ? 'nothing delivered yet'
                : `${accepted} of the last ${overview.deliveries.length} attempts`
            }
            tone={acceptRate === null ? 'neutral' : acceptRate >= 95 ? 'positive' : 'critical'}
          />
          <StatTile
            label="Endpoints needing attention"
            value={strugglingEndpoints}
            context={
              strugglingEndpoints === 0
                ? 'nothing is failing'
                : 'paused, or failing repeatedly'
            }
            tone={strugglingEndpoints > 0 ? 'critical' : 'neutral'}
          />
        </StatRow>

        <ApiKeysPanel keys={overview.keys} origin={origin} />
        <WebhooksPanel endpoints={overview.endpoints} deliveries={overview.deliveries} />
        <SigningPanel
          did={overview.signing.did}
          keyId={overview.signing.keyId}
          algorithm={overview.signing.algorithm}
          createdAt={overview.signing.createdAt?.toISOString() ?? null}
          didDocumentUrl={overview.signing.didDocumentPath}
        />
      </div>
    </>
  );
}

/**
 * The contract, at the top of the page.
 *
 * A generated OpenAPI document is the single most useful thing this product can
 * hand a developer, and burying it under three panels of settings is how it
 * goes unread. It sits first, with a request they can paste into a terminal
 * beside it.
 */
function ApiReference({ origin, didDocumentUrl }: { origin: string; didDocumentUrl: string }) {
  const links = [
    {
      href: '/api/v1/openapi.json',
      label: '/api/v1/openapi.json',
      title: 'OpenAPI 3.1 document',
      note: 'Generated from the definitions the routes are guarded by, so the scopes, rate limits and schemas it documents are the ones actually enforced. Point a client generator at it.',
      icon: BookOpen,
      primary: true,
    },
    {
      href: didDocumentUrl,
      label: didDocumentUrl,
      title: 'Workspace DID document',
      note: 'The public keys every credential this workspace signs is verified against.',
      icon: FileJson,
      primary: false,
    },
    {
      href: '/.well-known/did.json',
      label: '/.well-known/did.json',
      title: 'Platform DID document',
      note: 'The platform identity itself, for verifiers resolving the issuer chain.',
      icon: FileJson,
      primary: false,
    },
  ];

  return (
    <section
      aria-labelledby="api-reference-heading"
      className="grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
    >
      <div className="bg-surface p-6">
        <p className="eyebrow">The contract</p>
        <h2 id="api-reference-heading" className="display mt-1 text-2xl text-ink">
          A real, machine-readable API
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
          Not a resolver that returns HTML and not a schema.org tag. Every endpoint below is
          described, versioned and scope-guarded by the same document your client generator reads.
        </p>

        <ul className="mt-5 flex flex-col gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3 transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)] hover:border-line-hover hover:bg-surface-sunken"
              >
                <link.icon
                  className={
                    link.primary
                      ? 'mt-0.5 size-4 shrink-0 text-accent'
                      : 'mt-0.5 size-4 shrink-0 text-ink-subtle'
                  }
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-ink">{link.title}</span>
                    <ArrowUpRight
                      className="size-3.5 text-ink-subtle transition-transform duration-[140ms] group-hover:-translate-y-px group-hover:translate-x-px"
                      aria-hidden
                    />
                  </span>
                  <span className="mono mt-0.5 block truncate text-2xs text-accent">
                    {link.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-subtle">
                    {link.note}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-surface p-6">
        <p className="eyebrow">First request</p>
        <p className="mt-1 text-sm text-ink-muted">
          Mint a key below, then paste this. It reads; it writes nothing.
        </p>
        <pre className="mono mt-3 overflow-x-auto rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-2xs leading-relaxed text-ink">
          {`curl ${origin}/api/v1/passports \\
  -H "Authorization: Bearer ptk_…" \\
  -H "Accept: application/json"`}
        </pre>

        <p className="eyebrow mt-5">What comes back</p>
        <pre className="mono mt-2 overflow-x-auto rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-2xs leading-relaxed text-ink-muted">
          {`{
  "data": [
    {
      "dppId": "01H…",
      "status": "published",
      "version": 3,
      "productName": "Cropped Organic Tee"
    }
  ],
  "meta": { "total": 412 }
}`}
        </pre>

        <p className="mt-4 text-2xs leading-relaxed text-ink-subtle">
          A key carries only the scopes it was created with. A request outside them is refused with
          a <span className="mono">403</span> that names the scope it wanted, not a generic denial.
        </p>
      </div>
    </section>
  );
}
