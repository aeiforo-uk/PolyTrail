import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Meter } from '@/components/viz/meter';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDppId } from '@/lib/passport/identifier';
import { STATUS_LABELS, availableTransitions, type PassportStatus } from '@/lib/passport/state';
import { transitionAction } from './actions';
import { SECTIONS } from './config';
import { loadPassport } from './data';
import { SectionRail, type RailItem } from './section-rail';
import { StatusBar } from './status-bar';

/**
 * The frame around every section: what the passport is, where it is in its
 * lifecycle, and how far each section has got. Loading it here rather than in
 * each section page means the rail's progress is recomputed on every save
 * without a section having to know the rail exists.
 */
export default async function EditLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ dppId: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { dppId } = await params;
  const detail = await loadPassport(session.tenantId, dppId);
  if (!detail) notFound();

  const { passport, product, completeness } = detail;
  const status = passport.status as PassportStatus;
  const byKey = new Map(completeness.sections.map((section) => [section.key, section]));

  const items: RailItem[] = SECTIONS.map((section) => {
    const scored = section.owns.map((key) => byKey.get(key)).filter(Boolean);
    return {
      slug: section.slug,
      label: section.label,
      filled: scored.reduce((sum, entry) => sum + entry!.filled, 0),
      total: scored.reduce((sum, entry) => sum + entry!.total, 0),
      missing: scored.reduce((sum, entry) => sum + entry!.missingRequired.length, 0),
    };
  });

  const blocking = completeness.missingRequired.length;

  const transitions = availableTransitions(status, session.role).map((transition) => ({
    to: transition.to,
    label: transition.label,
    description: transition.description,
    requiresReason: transition.requiresReason,
    confirm: transition.confirm,
  }));

  return (
    <>
      <PageHeader
        title={product?.name ?? 'Passport'}
        description={[
          formatDppId(passport.dppId),
          passport.colourName,
          passport.size ? `Size ${passport.size}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <StatusBadge status={passport.status} />
            <Button asChild variant="ghost" size="sm">
              <Link href={`/console/passports/${passport.dppId}`}>Overview</Link>
            </Button>
            {passport.publishedVersion != null ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/p/${passport.dppId}`} target="_blank" rel="noreferrer">
                  Public passport
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="border-b border-line bg-surface-sunken/50 px-8 py-4">
        <StatusBar
          dppId={passport.dppId}
          statusLabel={STATUS_LABELS[status]}
          transitions={transitions}
          action={transitionAction.bind(null, passport.dppId)}
        />
      </div>

      <div className="grid gap-10 px-8 py-8 lg:grid-cols-[238px_minmax(0,1fr)]">
        <div className="min-w-0">
          <SectionRail dppId={passport.dppId} items={items} />
          <div className="mt-6 rounded-lg border border-line bg-surface p-4">
            <Meter
              value={completeness.score}
              size={44}
              thickness={4}
              label="Overall"
              sublabel={
                blocking === 0
                  ? 'ready to publish'
                  : `${blocking} required ${blocking === 1 ? 'field' : 'fields'} left`
              }
              tone={blocking > 0 ? 'critical' : undefined}
            />
            <p className="mt-3 border-t border-line pt-3 text-2xs leading-4 text-ink-subtle">
              Scored against every field the registry expects, with required fields weighted
              heaviest.
            </p>
          </div>
        </div>

        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
