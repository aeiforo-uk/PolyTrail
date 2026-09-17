import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { Meter } from '@/components/viz/meter';
import { STATUS_LABELS, isEditable, type PassportStatus } from '@/lib/passport/state';
import { saveSectionAction } from '../actions';
import { sectionBySlug } from '../config';
import { loadPassport, publicationIssues } from '../data';
import { CareSection } from '../sections/care';
import { CircularitySection } from '../sections/circularity';
import { ClaimsSection } from '../sections/claims';
import { CompositionSection } from '../sections/composition';
import { DurabilitySection } from '../sections/durability';
import { EnvironmentSection } from '../sections/environment';
import { IdentitySection } from '../sections/identity';
import { SocialSection } from '../sections/social';
import { SubstancesSection } from '../sections/substances';
import { SupplyChainSection } from '../sections/supply-chain';
import type { SectionProps } from '../sections/types';

const COMPONENTS: Record<string, (props: SectionProps) => React.ReactNode> = {
  identity: IdentitySection,
  composition: CompositionSection,
  substances: SubstancesSection,
  'supply-chain': SupplyChainSection,
  environment: EnvironmentSection,
  durability: DurabilitySection,
  care: CareSection,
  circularity: CircularitySection,
  social: SocialSection,
  claims: ClaimsSection,
};

export default async function SectionPage({
  params,
}: {
  params: Promise<{ dppId: string; section: string }>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { dppId, section: slug } = await params;
  const section = sectionBySlug(slug);
  const Section = COMPONENTS[slug];
  if (!section || !Section) notFound();

  const detail = await loadPassport(session.tenantId, dppId);
  if (!detail) notFound();

  const status = detail.passport.status as PassportStatus;
  const readOnly = !isEditable(status);

  // Scored on the server so it reflects what was actually saved. The form's own
  // counter covers what is on screen but not yet committed.
  const scored = detail.completeness.sections.filter((entry) => section.owns.includes(entry.key));
  const filled = scored.reduce((sum, entry) => sum + entry.filled, 0);
  const total = scored.reduce((sum, entry) => sum + entry.total, 0);
  const missing = scored.flatMap((entry) => entry.missingRequired);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-line bg-surface px-5 py-4">
        <div className="flex items-center gap-3">
          <Meter
            value={total === 0 ? 0 : Math.round((filled / total) * 100)}
            size={38}
            thickness={4}
            tone={missing.length > 0 ? 'critical' : undefined}
          />
          <div className="min-w-0">
            <p className="eyebrow">Saved in this section</p>
            <p className="text-sm text-ink tabular-nums">
              {filled} of {total} fields
            </p>
          </div>
        </div>

        {missing.length > 0 ? (
          <div className="min-w-0 flex-1 sm:max-w-lg">
            <p className="flex items-center gap-1.5 text-xs font-medium text-caution">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              Needed before publishing
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {missing.map((label) => (
                <li
                  key={label}
                  className="rounded-full border border-caution-border bg-caution-soft px-2 py-0.5 text-2xs text-caution"
                >
                  {label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-positive">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Nothing here is blocking publication.
          </p>
        )}
      </div>

      <Section
        section={section}
        payload={detail.payload}
        action={saveSectionAction.bind(null, dppId)}
        readOnly={readOnly}
        statusLabel={STATUS_LABELS[status]}
        gateErrors={publicationIssues(detail.payload)}
      />
    </div>
  );
}
