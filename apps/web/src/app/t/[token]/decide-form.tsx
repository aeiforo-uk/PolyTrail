'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { TRANSFER_REASON_META, type TransferReason } from '@/lib/transfers/types';
import {
  acceptAsSignedIn,
  acceptWithNewWorkspace,
  reject,
  type DecisionState,
} from './actions';

/**
 * Accept, or decline with a reason.
 *
 * Declining is offered as plainly as accepting. A page that makes "no" hard to
 * find gets a "yes" that means nothing, and the whole value of a counter-signed
 * transfer is that the acceptance was a real decision.
 */
export function DecideForm({
  token,
  reason,
  toEmail,
  expiresAt,
  signedInAs,
}: {
  token: string;
  reason: TransferReason;
  toEmail: string | null;
  expiresAt: string | null;
  signedInAs: { name: string; email: string } | null;
}) {
  const [declining, setDeclining] = React.useState(false);
  const meta = TRANSFER_REASON_META[reason];

  return (
    <div>
      {declining ? (
        <DeclinePanel token={token} onBack={() => setDeclining(false)} />
      ) : signedInAs ? (
        <SignedInPanel token={token} who={signedInAs} onDecline={() => setDeclining(true)} />
      ) : (
        <NewWorkspacePanel
          token={token}
          reason={reason}
          toEmail={toEmail}
          workspaceHint={meta.becomesBrandOfRecord}
          onDecline={() => setDeclining(true)}
        />
      )}

      {expiresAt ? (
        <p className="mt-4 text-xs text-ink-subtle">
          This link works until{' '}
          {new Date(expiresAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          .
        </p>
      ) : null}
    </div>
  );
}

function SignedInPanel({
  token,
  who,
  onDecline,
}: {
  token: string;
  who: { name: string; email: string };
  onDecline: () => void;
}) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(acceptAsSignedIn, {});

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-ink-muted">
        You are signed in as <span className="font-medium text-ink">{who.name}</span> ({who.email}).
        Accepting puts this item into that workspace.
      </p>
      <Problem message={state.error} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          <Check aria-hidden />
          Accept the transfer
        </Button>
        <Button type="button" variant="ghost" onClick={onDecline}>
          <X aria-hidden />
          Decline
        </Button>
      </div>
    </form>
  );
}

function NewWorkspacePanel({
  token,
  reason,
  toEmail,
  workspaceHint,
  onDecline,
}: {
  token: string;
  reason: TransferReason;
  toEmail: string | null;
  workspaceHint: boolean;
  onDecline: () => void;
}) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(
    acceptWithNewWorkspace,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="reason" value={reason} />

      <div>
        <h2 className="display text-xl">Accept it</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Ownership belongs to a workspace, so this creates one for you. If you already have an
          account,{' '}
          <Link href="/login" className="text-accent hover:underline">
            sign in
          </Link>{' '}
          and open this link again instead.
        </p>
      </div>

      <Field label="Your name" htmlFor="name" required>
        <Input id="name" name="name" autoComplete="name" required minLength={2} />
      </Field>

      <Field
        label="Email"
        htmlFor="email"
        required
        hint={toEmail ? 'The address this offer was sent to.' : undefined}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={toEmail ?? ''}
          readOnly={Boolean(toEmail)}
        />
      </Field>

      <Field
        label="Workspace name"
        htmlFor="workspaceName"
        required
        hint={
          workspaceHint
            ? 'Your company name — it appears as the brand of record on this passport.'
            : 'Your name, or your company name. You can change it later.'
        }
      >
        <Input id="workspaceName" name="workspaceName" required minLength={2} />
      </Field>

      <Field label="Country" htmlFor="country" required hint="Two-letter code, such as GB or PT.">
        <Input
          id="country"
          name="country"
          required
          maxLength={2}
          pattern="[A-Za-z]{2}"
          className="w-24 uppercase"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        hint="At least 12 characters. Length beats complexity."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>

      <Problem message={state.error} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          <Check aria-hidden />
          Accept the transfer
        </Button>
        <Button type="button" variant="ghost" onClick={onDecline}>
          <X aria-hidden />
          Decline
        </Button>
      </div>
    </form>
  );
}

function DeclinePanel({ token, onBack }: { token: string; onBack: () => void }) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(reject, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <h2 className="display text-xl">Decline it</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Nothing moves. The sender is told you declined, and the reason you give goes on the
          record alongside their offer.
        </p>
      </div>

      <Field label="Why are you declining?" htmlFor="rejectionReason" required>
        <Textarea
          id="rejectionReason"
          name="rejectionReason"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder="Wrong item, not expecting this, already sold on…"
        />
      </Field>

      <Problem message={state.error} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="destructive" loading={pending}>
          <X aria-hidden />
          Decline the transfer
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}

function Problem({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 text-sm text-critical" role="alert">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
