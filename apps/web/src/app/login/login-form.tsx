'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Check, KeyRound } from 'lucide-react';
import { completeMfa, signIn, type SignInState } from '@/lib/auth/sign-in';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export interface DemoAccount {
  email: string;
  role: string;
  note: string;
}

export function LoginForm({
  demo,
  demoPassword,
}: {
  /** Present in development only — the server decides, not this component. */
  demo?: DemoAccount[];
  demoPassword?: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  // Middleware puts the intended destination here when it bounces an
  // unauthenticated request; the action re-validates it before redirecting.
  const next = useSearchParams().get('next');

  // Once a password is accepted and a second factor is outstanding, the same
  // page swaps to the code step rather than navigating — the password is
  // already gone from the DOM and there is nothing to preserve across a route
  // change. The completed step stays on screen above the new field, so it reads
  // as one flow continuing rather than as a second screen arriving. The return
  // sits below every hook so the hook order never varies.
  if (state.mfaRequired) return <MfaStep next={next} initial={state} email={email} />;

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {state.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}

        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
        </Field>

        <Button type="submit" size="lg" loading={pending} className="mt-2">
          Sign in
        </Button>
      </form>

      {demo && demo.length > 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface-sunken/50 p-4">
          <p className="flex items-baseline justify-between gap-3">
            <span className="eyebrow">Demo accounts</span>
            <span className="text-2xs text-ink-subtle">development only</span>
          </p>
          <ul className="mt-2.5 flex flex-col gap-px overflow-hidden rounded-md bg-line">
            {demo.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(demoPassword ?? '');
                  }}
                  className="flex w-full flex-col bg-surface px-3 py-2 text-left transition-colors duration-[140ms] hover:bg-surface-sunken motion-reduce:transition-none"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="mono truncate text-2xs text-ink">{account.email}</span>
                    <span className="shrink-0 text-2xs text-ink-muted">{account.role}</span>
                  </span>
                  <span className="text-2xs text-ink-subtle">{account.note}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-2xs text-ink-muted">
            Click one to fill the form. Password{' '}
            <span className="mono text-ink">{demoPassword}</span>.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The second factor, as a continuation.
 *
 * The password step stays on screen as a settled row rather than being replaced
 * — the previous version swapped the whole panel for a bare code field, which
 * reads as a different page having loaded and is where people start wondering
 * whether their password went through.
 */
function MfaStep({
  next,
  initial,
  email,
}: {
  next: string | null;
  initial: SignInState;
  email: string;
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(completeMfa, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex items-center gap-2.5 rounded-md border border-positive-border bg-positive-soft px-3 py-2.5">
        <Check className="size-4 shrink-0 text-positive" aria-hidden />
        <span className="min-w-0 flex-1 text-sm text-ink">
          Password accepted
          {email ? <span className="block truncate text-2xs text-ink-muted">{email}</span> : null}
        </span>
        <a
          href="/login"
          className="shrink-0 text-2xs text-ink-muted transition-colors duration-[140ms] hover:text-ink motion-reduce:transition-none"
        >
          Not you?
        </a>
      </div>

      <div className="flex gap-2.5">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">One more step</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
            Open your authenticator app and enter the current six-digit code. A recovery code works
            too.
          </p>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <Field label="Code" htmlFor="code" error={state.fieldErrors?.code}>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="000000"
          className="mono h-12 text-lg tracking-[0.3em]"
          aria-invalid={Boolean(state.fieldErrors?.code)}
        />
      </Field>

      <Button type="submit" size="lg" loading={pending}>
        Verify
      </Button>
    </form>
  );
}
