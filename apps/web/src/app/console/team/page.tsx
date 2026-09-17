import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { StatRow, StatTile } from '@/components/viz/stat-tile';
import { BarChart, Legend, StackedBar } from '@/components/viz/bar-chart';
import { seriesColour } from '@/components/viz/tokens';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { listMembers } from '@/lib/team/members';
import { listInvitations } from '@/lib/team/invitations';
import { actionsForRole } from '@/lib/team/permissions';
import { MembersPanel, type MemberView } from './members-panel';
import { InvitePanel } from './invite-panel';
import { InvitationsPanel, type InvitationView } from './invitations-panel';
import { PermissionsMatrix } from './permissions-matrix';

export const metadata = { title: 'Team' };

/** A brand admin invites into their own workspace, so the platform role is not on offer. */
const ASSIGNABLE: Role[] = ROLES.filter((role) => role !== 'PLATFORM_ADMIN');

/** Invitation states, in the order one moves through them. */
const INVITATION_STATES = [
  { key: 'pending', label: 'Waiting', colour: 'var(--color-caution)' },
  { key: 'accepted', label: 'Accepted', colour: 'var(--color-positive)' },
  { key: 'expired', label: 'Expired', colour: 'var(--color-critical)' },
  { key: 'revoked', label: 'Withdrawn', colour: 'var(--color-ink-subtle)' },
] as const;

export default async function TeamPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (session.role !== 'BRAND_ADMIN') redirect('/console');

  const [members, invitations] = await Promise.all([
    listMembers(session.tenantId),
    listInvitations(session.tenantId),
  ]);

  const memberViews: MemberView[] = members.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    jobTitle: member.jobTitle,
    // The ISO instant, not a formatted string: the panel renders it through
    // RelativeTime, which paints the absolute date on the server and swaps in
    // "3 weeks ago" after mount — relative time computed during SSR is a
    // hydration mismatch by construction.
    lastSignInAt: member.lastSignInAt ? member.lastSignInAt.toISOString() : null,
    mfaEnabled: member.mfaEnabledAt != null,
    // A lockout is temporary sign-in refusal after failed attempts; without
    // this flag an admin watches a colleague "not bother signing in" instead
    // of seeing the account needs help.
    lockedOut: member.lockedUntil != null && member.lockedUntil.getTime() > Date.now(),
    isSelf: member.id === session.userId,
  }));

  const now = Date.now();
  const invitationViews: InvitationView[] = invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    invitedByName: invitation.invitedByName,
    createdAtLabel: formatDate(invitation.createdAt),
    expiresAtLabel: formatDate(invitation.expiresAt),
    daysLeft: Math.ceil((invitation.expiresAt.getTime() - now) / 86_400_000),
    state: invitation.acceptedAt
      ? 'accepted'
      : invitation.revokedAt
        ? 'revoked'
        : invitation.expiresAt.getTime() < now
          ? 'expired'
          : 'pending',
  }));

  // Computed on the server so the picker's "this role can…" line comes from the
  // same source as the matrix below it.
  const lifecycleActions = Object.fromEntries(
    ASSIGNABLE.map((role) => [role, actionsForRole(role)]),
  );

  const active = memberViews.filter((member) => member.status === 'active').length;
  const suspended = memberViews.filter((member) => member.status === 'suspended').length;
  const neverSignedIn = memberViews.filter((member) => member.lastSignInAt === null).length;
  const pending = invitationViews.filter((invitation) => invitation.state === 'pending');
  const expiringSoon = pending.filter((invitation) => invitation.daysLeft <= 2).length;
  const expired = invitationViews.filter((invitation) => invitation.state === 'expired').length;

  // Colour follows the role, indexed by its slot in the canonical order, so
  // filtering an empty role out never repaints the ones that remain.
  const roleMix = ASSIGNABLE.map((role) => ({
    key: role,
    label: ROLE_LABELS[role],
    value: memberViews.filter((member) => member.role === role).length,
    colour: seriesColour(ASSIGNABLE.indexOf(role)),
  })).filter((datum) => datum.value > 0);

  const publishers = memberViews.filter((member) =>
    (lifecycleActions[member.role] ?? []).some((action) => /publish/i.test(action)),
  ).length;

  const invitationMix = INVITATION_STATES.map((state) => ({
    key: state.key,
    label: state.label,
    value: invitationViews.filter((invitation) => invitation.state === state.key).length,
    colour: state.colour,
  })).filter((segment) => segment.value > 0);

  return (
    <>
      <PageHeader
        title="Team"
        description="Who is in this workspace, what they may do, and who has been asked to join."
      />

      <div className="flex flex-col gap-10 px-8 py-8">
        <StatRow>
          <StatTile
            label="People"
            value={memberViews.length}
            context={
              suspended > 0
                ? `${active} active · ${suspended} suspended`
                : `${active} active`
            }
            tone={suspended > 0 ? 'caution' : 'accent'}
          />
          <StatTile
            label="Can publish a passport"
            value={publishers}
            context={`of ${memberViews.length} ${memberViews.length === 1 ? 'person' : 'people'}`}
            tone={publishers === 0 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Invitations waiting"
            value={pending.length}
            context={
              pending.length === 0
                ? expired > 0
                  ? `${expired} expired unanswered`
                  : 'nobody outstanding'
                : expiringSoon > 0
                  ? `${expiringSoon} expire within two days`
                  : 'all still in date'
            }
            tone={expiringSoon > 0 || expired > 0 ? 'caution' : 'neutral'}
          />
          <StatTile
            label="Never signed in"
            value={neverSignedIn}
            context={
              neverSignedIn === 0
                ? 'everyone has been in'
                : 'accounts exist but are unused'
            }
            tone={neverSignedIn > 0 ? 'caution' : 'neutral'}
          />
        </StatRow>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <MembersPanel members={memberViews} roles={ASSIGNABLE} />
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Roles in use</h2>
              <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                {roleMix.length} of {ASSIGNABLE.length} roles are held by somebody. A workspace with
                everyone on one role has no separation between who writes and who signs off.
              </p>
              <BarChart
                data={roleMix}
                emptyMessage="Nobody has a role yet — which should not be possible."
              />
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Invitations</h2>
              {invitationMix.length === 0 ? (
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  Nobody has been invited yet. Use the form below — the link expires after seven
                  days and we only store its fingerprint.
                </p>
              ) : (
                <>
                  <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-muted">
                    Every invitation ever sent from this workspace, by what became of it.
                  </p>
                  <StackedBar
                    ariaLabel={invitationMix
                      .map((segment) => `${segment.value} ${segment.label}`)
                      .join(', ')}
                    segments={invitationMix}
                  />
                  <Legend
                    className="mt-3"
                    items={invitationMix.map((segment) => ({
                      key: segment.key,
                      label: segment.label,
                      value: String(segment.value),
                      colour: segment.colour,
                    }))}
                  />
                </>
              )}
            </section>
          </div>
        </div>

        <InvitePanel roles={ASSIGNABLE} lifecycleActions={lifecycleActions} />
        <InvitationsPanel invitations={invitationViews} />
        <PermissionsMatrix />
      </div>
    </>
  );
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
