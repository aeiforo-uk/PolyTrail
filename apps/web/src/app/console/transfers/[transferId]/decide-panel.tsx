'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { acceptIncoming, declineIncoming, type TransferFormState } from '../actions';

/**
 * Deciding on an offer made to this workspace.
 *
 * Accept and decline sit side by side at the same weight. Burying the decline
 * would get acceptances that mean nothing, and the counter-signature is only
 * worth storing if refusing was as easy as agreeing.
 */
export function DecidePanel({
  transferId,
  grants,
  fromName,
}: {
  transferId: string;
  grants: string;
  fromName: string;
}) {
  const [declining, setDeclining] = React.useState(false);

  return (
    <div className="mb-10 rounded-lg border border-accent-border bg-accent-soft/40 p-5">
      <h2 className="text-sm font-semibold text-ink">
        {fromName} is waiting on you
      </h2>
      <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
        Accepting moves ownership to this workspace and adds your signed acceptance to the record.{' '}
        {grants}
      </p>
      <div className="mt-4">
        {declining ? (
          <DeclineForm transferId={transferId} onBack={() => setDeclining(false)} />
        ) : (
          <AcceptForm transferId={transferId} onDecline={() => setDeclining(true)} />
        )}
      </div>
    </div>
  );
}

function AcceptForm({
  transferId,
  onDecline,
}: {
  transferId: string;
  onDecline: () => void;
}) {
  const [state, action, pending] = useActionState<TransferFormState, FormData>(acceptIncoming, {});

  return (
    <form action={action}>
      <input type="hidden" name="transferId" value={transferId} />
      <Problem message={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          <Check aria-hidden />
          Accept
        </Button>
        <Button type="button" variant="ghost" onClick={onDecline}>
          <X aria-hidden />
          Decline
        </Button>
      </div>
    </form>
  );
}

function DeclineForm({ transferId, onBack }: { transferId: string; onBack: () => void }) {
  const [state, action, pending] = useActionState<TransferFormState, FormData>(declineIncoming, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="transferId" value={transferId} />
      <Field label="Why are you declining?" htmlFor="rejectionReason" required>
        <Textarea
          id="rejectionReason"
          name="rejectionReason"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          placeholder="Wrong item, not expecting this, already handled elsewhere…"
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
    <p className="mb-3 flex items-start gap-2 text-sm text-critical" role="alert">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
