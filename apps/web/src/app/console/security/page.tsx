import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { Meter } from '@/components/viz/meter';
import { getMfaStatus } from '@/lib/mfa/service';
import { LEVEL_DEFINITIONS, LEVEL_ORDER, rankOf } from '@/lib/verification/types';
import { getSecurityOverview } from './queries';
import { LadderPanel } from './ladder-panel';
import { MfaPanel } from './mfa-panel';

export const metadata = { title: 'Security' };

/**
 * Security: who this workspace has proven itself to be, and how its people
 * prove who they are.
 *
 * The two sit on one page because they are the same question at two scales.
 * The Registry asks whether the operator is who it claims; the operator has to
 * ask the same of the person about to file on its behalf. The workspace leads,
 * because it is the one with a regulator attached to it.
 */
export default async function SecurityPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const [overview, mfa] = await Promise.all([
    getSecurityOverview(session.tenantId),
    getMfaStatus(session.userId),
  ]);

  const canReview = session.role === 'BRAND_ADMIN' || session.role === 'COMPLIANCE_OFFICER';

  // `unverified` is the floor, not a rung, so the ladder is four rungs tall.
  const rungs = LEVEL_ORDER.length - 1;
  const reached = rankOf(overview.ladder.level);
  const next = LEVEL_ORDER[reached + 1];
  const nextDefinition = next ? LEVEL_DEFINITIONS[next] : null;

  const expiries = overview.ladder.rungs
    .filter((rung) => rung.state === 'verified' && rung.expiresAt)
    .map((rung) => new Date(rung.expiresAt!).getTime())
    .sort((a, b) => a - b);
  const nextExpiry = expiries[0] ?? null;
  const daysToExpiry =
    nextExpiry === null ? null : Math.round((nextExpiry - Date.now()) / 86_400_000);

  return (
    <>
      <PageHeader
        title="Security"
        description="What this workspace has proven about itself, and how you prove it is you."
        actions={
          <Link
            href="/console/registry"
            className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors duration-[140ms] hover:text-ink motion-reduce:transition-none"
          >
            EU Registry
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="flex flex-col gap-12 px-8 py-8">
        <StatRow>
          <StatTile
            label="Verification level"
            value={LEVEL_DEFINITIONS[overview.ladder.level].label}
            context={`rung ${reached} of ${rungs}`}
            tone={reached === 0 ? 'caution' : reached >= 3 ? 'positive' : 'accent'}
          />
          <StatTile
            label="Next rung"
            value={nextDefinition ? nextDefinition.label : 'Top reached'}
            context={
              nextDefinition
                ? nextDefinition.implemented
                  ? 'you can climb it today'
                  : 'not implemented — see below'
                : 'nothing further to prove'
            }
            tone={nextDefinition && !nextDefinition.implemented ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Next thing to lapse"
            value={
              daysToExpiry === null ? '—' : `${daysToExpiry} ${daysToExpiry === 1 ? 'day' : 'days'}`
            }
            context={
              nextExpiry === null
                ? 'nothing expires yet'
                : new Date(nextExpiry).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
            }
            tone={daysToExpiry !== null && daysToExpiry <= 30 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Your two-factor"
            value={mfa.enabled ? 'On' : 'Off'}
            context={
              mfa.enabled
                ? `${mfa.recoveryRemaining} recovery ${mfa.recoveryRemaining === 1 ? 'code' : 'codes'} left`
                : 'required before anything irreversible'
            }
            tone={mfa.enabled ? 'positive' : 'caution'}
          />
        </StatRow>

        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-line bg-surface px-5 py-4">
          <Meter
            value={(reached / rungs) * 100}
            size={48}
            tone={reached >= 3 ? 'positive' : reached === 0 ? 'critical' : 'accent'}
            label={`${reached} of ${rungs} rungs`}
            sublabel="operator verification"
          />
          <p className="min-w-56 flex-1 text-sm leading-relaxed text-ink-muted">
            {reached === 0
              ? 'Nothing has been established beyond the account that signed up. Confirm the workspace contact address to publish anything at all.'
              : reached >= 3
                ? 'Everything this product can prove has been proven. The last rung is a qualified electronic seal, which no vendor in this market currently holds — including us, and we say so rather than drawing a fourth tick.'
                : `Each rung is cumulative. ${nextDefinition?.unlocks ?? ''}`}
          </p>
        </div>

        <LadderPanel
          ladder={overview.ladder}
          pendingReviews={overview.pendingReviews}
          openDomainChallenge={overview.openDomainChallenge}
          canReview={canReview}
        />

        <div className="border-t border-line pt-10">
          <MfaPanel status={mfa} />
        </div>
      </div>
    </>
  );
}
