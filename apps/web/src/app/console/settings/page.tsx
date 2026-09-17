import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, Gauge, Globe, Palette, ScrollText } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Meter } from '@/components/viz/meter';
import { getDomainVerification, getSettings } from './queries';
import { IdentityForm } from './identity-form';
import { BrandingForm, type BrandingValues } from './branding-form';
import { IDENTITY_FIELDS, identityFilled, type IdentityValues } from './identity-groups';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (session.role !== 'BRAND_ADMIN') redirect('/console');

  const [settings, domainVerifiedAt] = await Promise.all([
    getSettings(session.tenantId),
    getDomainVerification(session.tenantId),
  ]);
  if (!settings) notFound();

  const { tenant, branding, usage } = settings;
  const address = tenant.registeredAddress;

  const identity: IdentityValues = {
    legalName: tenant.legalName,
    tradeName: tenant.tradeName ?? '',
    country: tenant.country,
    vatNumber: tenant.vatNumber ?? '',
    eoriNumber: tenant.eoriNumber ?? '',
    lei: tenant.lei ?? '',
    gln: tenant.gln ?? '',
    gs1CompanyPrefix: tenant.gs1CompanyPrefix ?? '',
    contactEmail: tenant.contactEmail ?? '',
    website: tenant.website ?? '',
    addressLine1: address?.line1 ?? '',
    addressLine2: address?.line2 ?? '',
    addressCity: address?.city ?? '',
    addressRegion: address?.region ?? '',
    addressPostalCode: address?.postalCode ?? '',
    addressCountry: address?.country ?? '',
  };

  const brandingValues: BrandingValues = {
    accentColor: branding.accentColor ?? '',
    displayFont: branding.displayFont ?? '',
    logoUrl: branding.logoUrl ?? '',
    logoDarkUrl: branding.logoDarkUrl ?? '',
    faviconUrl: branding.faviconUrl ?? '',
    footerText: branding.footerText ?? '',
    supportUrl: branding.supportUrl ?? '',
    customDomain: branding.customDomain ?? '',
  };

  const filled = identityFilled(identity, IDENTITY_FIELDS);
  const remaining = Math.max(0, usage.quota - usage.used);
  const usedShare =
    usage.quota === 0 ? 0 : Math.min(100, Math.round((usage.used / usage.quota) * 100));
  const publishedShare =
    usage.used === 0 ? 0 : Math.round((usage.published / usage.used) * 100);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Who this workspace is in law, how its passports look, and what the plan allows."
        actions={
          <Link
            href="/console/security"
            className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors duration-[140ms] hover:text-ink motion-reduce:transition-none"
          >
            Verification
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="flex flex-col gap-12 px-8 py-8">
        <section>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ScrollText className="size-4 text-ink-subtle" aria-hidden />
                Workspace identity
              </h2>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
                Grouped by the instrument that asks for each field. All of it is published on every
                passport as the responsible economic operator, except tax and customs — get it right
                once and every passport inherits it.
              </p>
            </div>
            <Meter
              value={(filled / IDENTITY_FIELDS.length) * 100}
              size={44}
              label={`${filled} of ${IDENTITY_FIELDS.length} fields`}
              sublabel={
                filled === IDENTITY_FIELDS.length ? 'nothing outstanding' : 'across four instruments'
              }
            />
          </div>
          <IdentityForm values={identity} />
        </section>

        <section className="border-t border-line pt-10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Palette className="size-4 text-ink-subtle" aria-hidden />
            Branding
          </h2>
          <p className="mt-1 mb-5 max-w-prose text-sm leading-relaxed text-ink-muted">
            The public passport stays the same document whatever you change here — a shopper and a
            market-surveillance officer should recognise its shape instantly. The preview is
            rendered from the values as you type them.
          </p>
          <BrandingForm
            values={brandingValues}
            brandName={tenant.tradeName ?? tenant.legalName}
            domainVerifiedAt={
              domainVerifiedAt
                ? domainVerifiedAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : null
            }
          />
        </section>

        <section className="border-t border-line pt-10">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Gauge className="size-4 text-ink-subtle" aria-hidden />
                Plan and usage
              </h2>
              <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
                Read-only. The quota counts every passport that exists, not only the published ones
                — a draft occupies a slot from the moment it is created.
              </p>
            </div>
            <Badge tone={tenant.status === 'active' ? 'positive' : 'caution'}>
              {capitalise(tenant.plan)} · {capitalise(tenant.status)}
            </Badge>
          </div>

          <StatRow>
            <StatTile
              label="Passports used"
              value={usage.used.toLocaleString('en-GB')}
              context={`of ${usage.quota.toLocaleString('en-GB')} · ${remaining.toLocaleString('en-GB')} left`}
              tone={usedShare >= 90 ? 'critical' : usedShare >= 75 ? 'caution' : 'neutral'}
            />
            <StatTile
              label="Published"
              value={usage.published.toLocaleString('en-GB')}
              context={
                usage.used === 0
                  ? 'nothing created yet'
                  : `${publishedShare}% of what you have created`
              }
              tone={usage.published > 0 ? 'positive' : 'neutral'}
            />
            <StatTile
              label="Plan"
              value={capitalise(tenant.plan)}
              context="contact us to change it"
            />
            <StatTile
              label="Custom domain"
              value={branding.customDomain ? (domainVerifiedAt ? 'Verified' : 'Pending') : 'None'}
              context={
                branding.customDomain
                  ? branding.customDomain
                  : 'passports resolve at your Polytrail address'
              }
              tone={
                branding.customDomain
                  ? domainVerifiedAt
                    ? 'positive'
                    : 'caution'
                  : 'neutral'
              }
            />
          </StatRow>

          <div className="mt-4 flex flex-wrap items-center gap-6 rounded-lg border border-line bg-surface px-5 py-4">
            <Meter
              value={usedShare}
              size={48}
              tone={usedShare >= 90 ? 'critical' : usedShare >= 75 ? 'caution' : 'accent'}
              label={`${usedShare}% of the quota`}
              sublabel={`${usage.used.toLocaleString('en-GB')} of ${usage.quota.toLocaleString('en-GB')} passports`}
            />
            <p className="min-w-56 flex-1 text-sm leading-relaxed text-ink-muted">
              {usedShare >= 90
                ? 'You are close to the limit. Creating a passport will start to fail — talk to us before the next drop lands.'
                : usedShare >= 75
                  ? 'Comfortable for now, but a season’s worth of new styles would take you past the limit.'
                  : 'Plenty of headroom. Archiving a passport does not release its slot, because the record has to stay.'}
            </p>
            {branding.customDomain ? (
              <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                <Globe className="size-3.5" aria-hidden />
                {domainVerifiedAt
                  ? `Verified ${domainVerifiedAt.toLocaleDateString('en-GB')}`
                  : 'Awaiting DNS verification'}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
