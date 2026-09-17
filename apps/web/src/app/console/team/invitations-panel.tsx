'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { CircleAlert, CircleSlash, Clock, MailCheck, MailPlus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { resendInvitation, withdrawInvitation, type TeamState } from './actions';
import { InviteLink } from './invite-panel';

export interface InvitationView {
  id: string;
  email: string;
  role: Role;
  invitedByName: string | null;
  createdAtLabel: string;
  expiresAtLabel: string;
  /** Negative once it has lapsed. */
  daysLeft: number;
  state: 'pending' | 'expired' | 'accepted' | 'revoked';
}

/**
 * Outstanding and historical invitations. The token itself is never here — only
 * its state — so the list is safe to render, print and screenshot.
 *
 * Split in two, because the two halves are read for different reasons. The top
 * half is a queue: someone has not replied and an admin may need to chase them,
 * so it is ranked by how little time is left and every row carries an action.
 * The bottom half is a record, and a record does not need to shout.
 */
export function InvitationsPanel({ invitations }: { invitations: InvitationView[] }) {
  const [resendState, resendAction, resending] = useActionState<TeamState, FormData>(
    resendInvitation,
    {},
  );
  const [withdrawState, withdrawAction, withdrawing] = useActionState<TeamState, FormData>(
    withdrawInvitation,
    {},
  );
  const error = resendState.error ?? withdrawState.error;

  // Expired first — those are the ones that need a decision — then by how
  // little time is left. A list that presents a link expiring tonight in the
  // same weight as one with six days on it has stopped being a queue.
  const open = invitations
    .filter((invitation) => invitation.state === 'pending' || invitation.state === 'expired')
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const settled = invitations.filter(
    (invitation) => invitation.state === 'accepted' || invitation.state === 'revoked',
  );

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-ink">
        Invitations
        {open.length > 0 ? (
          <span className="ml-2 text-xs font-normal text-ink-muted tabular-nums">
            {open.length} waiting
          </span>
        ) : null}
      </h2>
      <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-muted">
        A link lasts seven days. We store only its fingerprint, so resending mints a new link and
        invalidates the old one.
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {resendState.inviteLink ? (
        <InviteLink email={resendState.inviteEmail ?? ''} link={resendState.inviteLink} />
      ) : null}

      {open.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-5 py-8 text-center">
          <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-surface text-ink-subtle">
            <MailPlus className="size-4.5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-ink">Nobody is waiting on a reply</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
            {settled.length === 0
              ? 'Invite a colleague, a compliance reviewer or a supplier using the form above. They pick their own password; you choose what they may do.'
              : 'Every invitation this workspace has sent has been accepted or withdrawn.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {open.map((invitation) => {
            const lapsed = invitation.state === 'expired';
            const urgent = !lapsed && invitation.daysLeft <= 2;
            return (
              <li key={invitation.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                <span
                  aria-hidden
                  className={cn(
                    'h-10 w-0.5 shrink-0 rounded-full',
                    lapsed ? 'bg-critical' : urgent ? 'bg-caution' : 'bg-line-strong',
                  )}
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {invitation.email}
                  </span>
                  <span className="block truncate text-2xs text-ink-subtle">
                    {ROLE_LABELS[invitation.role]} · invited by{' '}
                    {invitation.invitedByName ?? 'someone since removed'} on{' '}
                    {invitation.createdAtLabel}
                  </span>
                </span>

                <span className="shrink-0">
                  {lapsed ? (
                    <Badge tone="critical">
                      <CircleAlert aria-hidden />
                      Expired {invitation.expiresAtLabel}
                    </Badge>
                  ) : (
                    <span className="flex flex-col items-end gap-1">
                      <Badge tone={urgent ? 'caution' : 'neutral'}>
                        <Clock aria-hidden />
                        {invitation.daysLeft <= 0
                          ? 'Expires today'
                          : `${invitation.daysLeft} ${invitation.daysLeft === 1 ? 'day' : 'days'} left`}
                      </Badge>
                      {/* Seven days is the whole life of a link, so the track is
                          a denominator rather than decoration. */}
                      <span
                        className="h-0.5 w-20 overflow-hidden rounded-full bg-surface-sunken"
                        role="img"
                        aria-label={`${invitation.daysLeft} of 7 days remaining`}
                      >
                        <span
                          className={cn(
                            'block h-full rounded-full',
                            urgent ? 'bg-caution' : 'bg-line-hover',
                          )}
                          style={{
                            width: `${Math.max(4, Math.min(100, (invitation.daysLeft / 7) * 100))}%`,
                          }}
                        />
                      </span>
                    </span>
                  )}
                </span>

                <span className="flex shrink-0 gap-1">
                  <form action={resendAction} className="contents">
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <Button type="submit" variant="secondary" size="xs" loading={resending}>
                      <RefreshCw aria-hidden />
                      {lapsed ? 'Send a new link' : 'Resend'}
                    </Button>
                  </form>
                  <form action={withdrawAction} className="contents">
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <Button type="submit" variant="ghost" size="xs" loading={withdrawing}>
                      <CircleSlash aria-hidden />
                      Withdraw
                    </Button>
                  </form>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {settled.length > 0 ? (
        <details className="group mt-4">
          <summary className="cursor-pointer list-none text-sm text-ink-muted transition-colors duration-[140ms] hover:text-ink motion-reduce:transition-none">
            <span className="group-open:hidden">
              Show {settled.length} settled {settled.length === 1 ? 'invitation' : 'invitations'}
            </span>
            <span className="hidden group-open:inline">Hide settled invitations</span>
          </summary>

          <div className="mt-3">
            <Table>
              <THead>
                <tr>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Invited by</TH>
                  <TH>Outcome</TH>
                </tr>
              </THead>
              <TBody>
                {settled.map((invitation) => (
                  <TR key={invitation.id}>
                    <TD className="text-ink">{invitation.email}</TD>
                    <TD className="text-ink-muted">{ROLE_LABELS[invitation.role]}</TD>
                    <TD className="text-xs text-ink-muted">
                      {invitation.invitedByName ?? 'Unknown'}
                      <span className="block text-2xs tabular-nums text-ink-subtle">
                        {invitation.createdAtLabel}
                      </span>
                    </TD>
                    <TD>
                      {invitation.state === 'accepted' ? (
                        <Badge tone="positive">
                          <MailCheck aria-hidden />
                          Accepted
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          <CircleSlash aria-hidden />
                          Withdrawn
                        </Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
