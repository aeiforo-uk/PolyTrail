'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Check, CircleAlert, Copy, Link2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { inviteMember, type TeamState } from './actions';

/**
 * Inviting someone.
 *
 * The role picker carries its own description, because "Compliance officer"
 * tells an admin nothing about what they are handing over. The link is shown
 * once and copied by hand — we store only its hash, so this is the single
 * moment it exists in a readable form.
 */
export function InvitePanel({
  roles,
  lifecycleActions,
}: {
  roles: Role[];
  lifecycleActions: Record<string, string[]>;
}) {
  const [state, formAction, pending] = useActionState<TeamState, FormData>(inviteMember, {});
  const [role, setRole] = React.useState<Role>(roles[0] ?? 'PRODUCT_MANAGER');
  const grants = lifecycleActions[role] ?? [];

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <UserPlus className="size-4 text-ink-subtle" aria-hidden />
        Invite someone
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        They get a link that expires in seven days. We store only its fingerprint, so the link
        below is the only copy.
      </p>

      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="invite-email" required>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="name@supplier.com"
            />
          </Field>

          <Field label="Role" htmlFor="invite-role" required hint={ROLE_DESCRIPTIONS[role]}>
            <NativeSelect
              id="invite-role"
              name="role"
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
        </div>

        {grants.length > 0 ? (
          <p className="rounded-md border border-line bg-surface-sunken/50 px-3 py-2.5 text-xs text-ink-muted">
            <span className="font-medium text-ink">This role can: </span>
            {grants.join(', ').toLowerCase()}.
          </p>
        ) : (
          <p className="rounded-md border border-line bg-surface-sunken/50 px-3 py-2.5 text-xs text-ink-muted">
            This role cannot move a passport through its lifecycle at all.
          </p>
        )}

        <Field label="Message" htmlFor="invite-message" hint="Optional. Included in the email.">
          <Textarea
            id="invite-message"
            name="message"
            className="min-h-16"
            placeholder="Hi — we need the mill certificates for AW26 by the end of the month."
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Create invitation
          </Button>
          {state.error ? (
            <span className="flex items-center gap-1.5 text-sm text-critical" role="alert">
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              {state.error}
            </span>
          ) : null}
        </div>
      </form>

      {state.inviteLink ? (
        <InviteLink email={state.inviteEmail ?? ''} link={state.inviteLink} />
      ) : null}
    </section>
  );
}

export function InviteLink({ email, link }: { email: string; link: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="mt-4 rounded-md border border-accent-border bg-accent-soft p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-accent">
        <Link2 className="size-4 shrink-0" aria-hidden />
        Invitation link for {email}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Send this to them. It will not be shown again — if it is lost, use Resend to mint a new
        one.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="mono min-w-0 flex-1 overflow-x-auto rounded-sm border border-line bg-surface px-2.5 py-2 text-2xs whitespace-nowrap text-ink">
          {link}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
