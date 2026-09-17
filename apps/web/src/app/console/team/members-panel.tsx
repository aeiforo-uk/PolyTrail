'use client';

import * as React from 'react';
import { useActionState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  CircleSlash,
  MailOpen,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { RelativeTime } from '@/components/ui/relative-time';
import { NativeSelect } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import {
  changeMemberRole,
  removeMember,
  setMemberSuspended,
  type TeamState,
} from './actions';

export interface MemberView {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'invited' | 'active' | 'suspended';
  jobTitle: string | null;
  /** ISO instant, rendered through RelativeTime. */
  lastSignInAt: string | null;
  mfaEnabled: boolean;
  /** Temporarily refused sign-in after failed attempts — needs help, not discipline. */
  lockedOut: boolean;
  isSelf: boolean;
}

type DialogKind = 'role' | 'suspend' | 'remove';

/**
 * The member list.
 *
 * Every state-changing control is behind a dialog with a named consequence,
 * because "suspend" and "remove" read identically in a dropdown and mean very
 * different things to the person on the other end.
 */
export function MembersPanel({ members, roles }: { members: MemberView[]; roles: Role[] }) {
  const [open, setOpen] = React.useState<{ kind: DialogKind; member: MemberView } | null>(null);

  // Ranked, not alphabetical. A suspended account and an invitation nobody has
  // taken up are the two rows an admin came here to deal with; everybody else
  // is reference. Sorting by name buries both in the middle of the list.
  const ordered = [...members].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
  const active = members.filter((member) => member.status === 'active').length;

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-ink">
        Members
        <span className="ml-2 text-xs font-normal text-ink-muted tabular-nums">
          {active} of {members.length} active
        </span>
      </h2>
      <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-muted">
        Suspended accounts and unused invitations are listed first. Removing someone keeps their
        name on everything they touched — the evidence trail is not editable.
      </p>

      <Table>
        <THead>
          <tr>
            <TH className="w-1 px-0" />
            <TH>Person</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Last active</TH>
            <TH className="text-right">Manage</TH>
          </tr>
        </THead>
        <TBody>
          {ordered.map((member) => (
            <TR key={member.id}>
              <TD className="w-1 px-0">
                <span
                  aria-hidden
                  className={cn(
                    'ml-4 block h-9 w-0.5 rounded-full',
                    member.status === 'suspended'
                      ? 'bg-critical'
                      : member.status === 'invited'
                        ? 'bg-caution'
                        : member.lastSignInAt === null
                          ? 'bg-caution'
                          : 'bg-transparent',
                  )}
                />
              </TD>
              <TD>
                <span className="flex items-center gap-3">
                  <Avatar name={member.name} size="md" />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">
                      {member.name}
                      {member.isSelf ? (
                        <span className="ml-2 text-2xs font-normal text-ink-subtle">you</span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-ink-subtle">{member.email}</span>
                    {member.jobTitle ? (
                      <span className="block text-2xs text-ink-subtle">{member.jobTitle}</span>
                    ) : null}
                  </span>
                </span>
              </TD>
              <TD>
                <span className="text-ink">{ROLE_LABELS[member.role]}</span>
                <span className="block max-w-64 text-2xs text-ink-subtle">
                  {ROLE_DESCRIPTIONS[member.role]}
                </span>
              </TD>
              <TD>
                <span className="flex flex-wrap items-center gap-1.5">
                  <MemberStatus status={member.status} />
                  {member.lockedOut ? <Badge tone="critical">Locked out</Badge> : null}
                </span>
                {/* Security posture belongs on this screen: an admin deciding
                    who may publish should see who has a second factor. */}
                <span
                  className={cn(
                    'mt-1 flex items-center gap-1 text-2xs',
                    member.mfaEnabled ? 'text-positive' : 'text-ink-subtle',
                  )}
                >
                  {member.mfaEnabled ? (
                    <ShieldCheck className="size-3" aria-hidden />
                  ) : (
                    <ShieldOff className="size-3" aria-hidden />
                  )}
                  {member.mfaEnabled ? 'Two-factor on' : 'No second factor'}
                </span>
              </TD>
              <TD className="text-xs tabular-nums">
                {member.lastSignInAt ? (
                  <RelativeTime value={member.lastSignInAt} className="text-ink-muted" />
                ) : (
                  <span className="text-caution">Never</span>
                )}
              </TD>
              <TD className="text-right">
                {member.isSelf ? (
                  <span className="text-xs text-ink-subtle">
                    Ask another admin to change your own access
                  </span>
                ) : (
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setOpen({ kind: 'role', member })}
                    >
                      <UserCog aria-hidden />
                      Role
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setOpen({ kind: 'suspend', member })}
                    >
                      {member.status === 'suspended' ? (
                        <CircleCheck aria-hidden />
                      ) : (
                        <CircleSlash aria-hidden />
                      )}
                      {member.status === 'suspended' ? 'Restore' : 'Suspend'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setOpen({ kind: 'remove', member })}
                    >
                      <Trash2 aria-hidden />
                      Remove
                    </Button>
                  </div>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <DialogContent>
          {open ? (
            <MemberDialog
              key={`${open.kind}-${open.member.id}`}
              kind={open.kind}
              member={open.member}
              roles={roles}
              onDone={() => setOpen(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Suspended, then unaccepted, then never-used, then everyone else. */
function rank(member: MemberView): number {
  if (member.status === 'suspended') return 0;
  if (member.status === 'invited') return 1;
  if (member.lastSignInAt === null) return 2;
  return 3;
}

function MemberStatus({ status }: { status: MemberView['status'] }) {
  if (status === 'active') {
    return (
      <Badge tone="positive">
        <CircleCheck aria-hidden />
        Active
      </Badge>
    );
  }
  if (status === 'suspended') {
    return (
      <Badge tone="critical">
        <CircleSlash aria-hidden />
        Suspended
      </Badge>
    );
  }
  return (
    <Badge tone="caution">
      <MailOpen aria-hidden />
      Invited
    </Badge>
  );
}

function MemberDialog({
  kind,
  member,
  roles,
  onDone,
}: {
  kind: DialogKind;
  member: MemberView;
  roles: Role[];
  onDone: () => void;
}) {
  const action =
    kind === 'role' ? changeMemberRole : kind === 'suspend' ? setMemberSuspended : removeMember;
  const [state, formAction, pending] = useActionState<TeamState, FormData>(action, {});
  const [role, setRole] = React.useState<Role>(member.role);
  const suspending = member.status !== 'suspended';

  React.useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const copy = {
    role: {
      title: `Change ${member.name}'s role`,
      description: 'Takes effect the next time they load a page. It is recorded in the audit log.',
      confirm: 'Change role',
      variant: 'primary' as const,
    },
    suspend: {
      title: suspending ? `Suspend ${member.name}` : `Restore ${member.name}`,
      description: suspending
        ? 'They stay in the workspace and keep their name on everything they have done, but cannot sign in.'
        : 'They can sign in again with their existing password.',
      confirm: suspending ? 'Suspend' : 'Restore access',
      variant: 'secondary' as const,
    },
    remove: {
      title: `Remove ${member.name}`,
      description:
        'Their account is closed and they lose access immediately. Their name stays on the passports, versions and audit entries they touched, because removing those would break the evidence trail.',
      confirm: 'Remove from workspace',
      variant: 'destructive' as const,
    },
  }[kind];

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={member.id} />
      {kind === 'suspend' ? (
        <input type="hidden" name="suspend" value={String(suspending)} />
      ) : null}
      {kind === 'role' ? <input type="hidden" name="role" value={role} /> : null}

      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>

      <DialogBody className="flex flex-col gap-4">
        {state.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}

        {kind === 'role' ? (
          <Field label="New role" htmlFor="member-role" hint={ROLE_DESCRIPTIONS[role]}>
            <NativeSelect
              id="member-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {roles.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant={copy.variant} loading={pending}>
          {copy.confirm}
        </Button>
      </DialogFooter>
    </form>
  );
}
