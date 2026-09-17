'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, CircleCheck, Copy, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  MIN_EXPIRY_DAYS,
} from '@/lib/transfers/state';
import {
  TRANSFER_REASON_META,
  TRANSFER_REASON_ORDER,
  type TransferReason,
} from '@/lib/transfers/types';
import { initiate, type TransferFormState } from '../actions';

export interface PassportOption {
  dppId: string;
  label: string;
  /** Pre-formatted on the server — see the note on the identifier helpers below. */
  display: string;
  status: string;
  transferInFlight: boolean;
}

/**
 * The offer form.
 *
 * The reason picker is the only field with consequences the sender cannot see
 * from its label — it decides what the recipient may read and which event goes
 * on the item's record — so the consequence is printed underneath the moment a
 * reason is chosen, rather than hidden in help text nobody opens.
 */
export function InitiateForm({
  options,
  preselected,
}: {
  options: PassportOption[];
  preselected: string | null;
}) {
  const [state, action, pending] = useActionState<TransferFormState, FormData>(initiate, {});
  const [reason, setReason] = React.useState<TransferReason>('resale');

  const available = options.filter((option) => !option.transferInFlight);
  const blocked = options.filter((option) => option.transferInFlight);
  const meta = TRANSFER_REASON_META[reason];

  if (state.acceptUrl) {
    return <Sent url={state.acceptUrl} delivered={state.emailDelivered ?? false} />;
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <Field
        label="Item"
        htmlFor="dppId"
        required
        hint="Only published passports this workspace still owns."
      >
        <NativeSelect
          id="dppId"
          name="dppId"
          required
          defaultValue={preselected ?? available[0]?.dppId ?? ''}
        >
          {available.map((option) => (
            <option key={option.dppId} value={option.dppId}>
              {option.label} — {option.display}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {blocked.length > 0 ? (
        <p className="-mt-3 text-xs text-ink-muted">
          {blocked.length} {blocked.length === 1 ? 'item already has' : 'items already have'} an
          offer out. Withdraw it before sending another.
        </p>
      ) : null}

      <Field label="Reason" htmlFor="reason" required>
        <NativeSelect
          id="reason"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as TransferReason)}
        >
          {TRANSFER_REASON_ORDER.map((key) => (
            <option key={key} value={key}>
              {TRANSFER_REASON_META[key].label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div className="rounded-md border border-line bg-surface-sunken/50 px-4 py-3">
        <p className="eyebrow">What the recipient gets</p>
        <p className="mt-1.5 text-sm text-ink">{meta.grants}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {meta.event
            ? `A “${meta.event.replace(/_/g, ' ')}” event is added to the item's record when they accept.`
            : 'No lifecycle event is recorded — this is a commercial transfer, not a movement of the garment.'}
        </p>
      </div>

      <Field
        label="Recipient email"
        htmlFor="toEmail"
        required
        hint="If this address already belongs to a workspace, the offer goes straight to it. If not, they can create one when they accept."
      >
        <Input
          id="toEmail"
          name="toEmail"
          type="email"
          required
          autoComplete="off"
          placeholder="name@example.com"
        />
      </Field>

      <Field
        label="Note"
        htmlFor="note"
        hint="Optional. Signed into the transfer credential, so it survives as part of the record."
      >
        <Textarea id="note" name="note" maxLength={1000} rows={3} />
      </Field>

      <Field
        label="Link expires after"
        htmlFor="expiresInDays"
        hint={`Between ${MIN_EXPIRY_DAYS} and ${MAX_EXPIRY_DAYS} days.`}
      >
        <Input
          id="expiresInDays"
          name="expiresInDays"
          type="number"
          min={MIN_EXPIRY_DAYS}
          max={MAX_EXPIRY_DAYS}
          defaultValue={DEFAULT_EXPIRY_DAYS}
          className="w-32"
        />
      </Field>

      {state.error ? (
        <p className="flex items-start gap-2 text-sm text-critical" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          <Send aria-hidden />
          Send the offer
        </Button>
        <Button asChild variant="ghost">
          <Link href="/console/transfers">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function Sent({ url, delivered }: { url: string; delivered: boolean }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <p className="flex items-center gap-2 text-sm font-medium text-positive">
        <CircleCheck className="size-4" aria-hidden />
        Offer sent
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {delivered
          ? 'The recipient has an email with the link. Ownership moves only once they accept.'
          : 'We could not deliver the email. Send them the link yourself — ownership moves only once they accept.'}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <code className="mono min-w-0 flex-1 truncate rounded-sm border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          {url}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          <Copy aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-subtle">
        This is the only time the link is shown. We store a hash of it, not the link itself.
      </p>

      <div className="mt-6 flex gap-3">
        <Button asChild size="sm">
          <Link href="/console/transfers">See all transfers</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/console/transfers/new">Transfer another</Link>
        </Button>
      </div>
    </div>
  );
}
