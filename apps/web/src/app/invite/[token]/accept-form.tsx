'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Check, CircleAlert, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { acceptInvite, type AcceptState } from './actions';

/**
 * Choosing a password, with the rules shown as they are met rather than
 * reported after the fact. The server still decides — this only stops someone
 * discovering on submit that a phrase they liked was two characters short.
 */
export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(acceptInvite, {});
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');

  const rules = [
    { label: 'At least 12 characters', met: password.length >= 12 },
    { label: 'Both entries match', met: confirm.length > 0 && password === confirm },
  ];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <Field label="Email" htmlFor="accept-email" hint="Set by the invitation and not editable.">
        <Input id="accept-email" value={email} readOnly disabled className="mono" />
      </Field>

      <Field label="Your name" htmlFor="accept-name" required error={state.fieldErrors?.name}>
        <Input id="accept-name" name="name" required autoComplete="name" autoFocus />
      </Field>

      <Field
        label="Password"
        htmlFor="accept-password"
        required
        error={state.fieldErrors?.password}
        hint="A memorable phrase beats a short scramble."
      >
        <Input
          id="accept-password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field
        label="Password again"
        htmlFor="accept-confirm"
        required
        error={state.fieldErrors?.confirm}
      >
        <Input
          id="accept-confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>

      <ul className="flex flex-col gap-1">
        {rules.map((rule) => (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            {rule.met ? (
              <Check className="size-3.5 shrink-0 text-positive" aria-hidden />
            ) : (
              <Minus className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
            )}
            <span className={cn(rule.met ? 'text-ink-muted' : 'text-ink-subtle')}>{rule.label}</span>
            <span className="sr-only">{rule.met ? '— met' : '— not yet met'}</span>
          </li>
        ))}
      </ul>

      <Button type="submit" size="lg" loading={pending} className="mt-2">
        Join the workspace
      </Button>
    </form>
  );
}
