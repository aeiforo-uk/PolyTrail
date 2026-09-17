'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, Copy, KeyRound, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Meter } from '@/components/viz/meter';
import { cn } from '@/lib/utils';
import type { MfaStatus } from '@/lib/mfa/service';
import {
  beginMfaAction,
  confirmMfaAction,
  confirmStepUpAction,
  disableMfaAction,
  regenerateRecoveryAction,
  type EnrolmentState,
  type SecurityState,
} from './actions';

/** A full set is ten; the panel starts warning when a third of them are gone. */
const RECOVERY_SET = 10;

/**
 * Two-factor authentication.
 *
 * Enrolment is two steps: a secret is written, then it only becomes a factor
 * once the user proves they can produce a code from it. A one-step enrolment
 * locks people out of their own accounts with a secret they never captured,
 * and the person it happens to is invariably the one with the deadline.
 *
 * The flow is deliberately calm. Nothing here is coloured red until something
 * is actually wrong, the three steps are numbered in the order the hands do
 * them, and the QR sits beside the field rather than above a scroll.
 */
export function MfaPanel({ status }: { status: MfaStatus }) {
  const [enrolment, begin, beginning] = useActionState<EnrolmentState, FormData>(
    beginMfaAction,
    {},
  );
  const [confirmation, confirm, confirming] = useActionState<EnrolmentState, FormData>(
    confirmMfaAction,
    {},
  );
  const [regenerated, regenerate, regenerating] = useActionState<EnrolmentState, FormData>(
    regenerateRecoveryAction,
    {},
  );
  const [disabled, disable, disabling] = useActionState<SecurityState, FormData>(
    disableMfaAction,
    {},
  );

  const codes = confirmation.recoveryCodes ?? regenerated.recoveryCodes;
  const needsStepUp = regenerated.stepUpRequired || disabled.stepUpRequired;
  const low = status.recoveryRemaining <= 2;

  return (
    <section aria-labelledby="mfa-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="mfa-heading" className="text-sm font-semibold text-ink">
            Two-factor authentication
          </h2>
          <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-muted">
            A six-digit code from an authenticator app, on top of your password. Required before
            anything irreversible, whether or not you were asked for it when you signed in.
          </p>
        </div>
        {status.enabled ? (
          <Badge tone="positive">
            <ShieldCheck aria-hidden />
            On
          </Badge>
        ) : (
          <Badge tone="caution">
            <ShieldOff aria-hidden />
            Off
          </Badge>
        )}
      </div>

      {!status.configured ? (
        <p className="flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-3 py-2.5 text-sm leading-relaxed text-caution">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This deployment has no <span className="mono text-2xs">MFA_ENCRYPTION_KEY</span>, so
            secrets could only be stored in the clear. Enrolment is disabled until whoever operates
            it sets one.
          </span>
        </p>
      ) : null}

      <Notice state={enrolment} />
      <Notice state={confirmation} />
      <Notice state={regenerated} />
      <Notice state={disabled} />

      {needsStepUp ? <StepUpForm /> : null}

      {codes ? <RecoveryCodes codes={codes} /> : null}

      {status.enabled ? (
        <div className="rounded-lg border border-line bg-surface px-5 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <Meter
              value={(status.recoveryRemaining / RECOVERY_SET) * 100}
              size={44}
              tone={low ? 'caution' : 'positive'}
              label={`${status.recoveryRemaining} of ${RECOVERY_SET}`}
              sublabel="recovery codes left"
            />
            <div className="min-w-52 flex-1">
              <p className="text-sm text-ink">
                Enabled{' '}
                <span className="tabular-nums text-ink-muted">
                  {status.enabledAt ? new Date(status.enabledAt).toLocaleString('en-GB') : '—'}
                </span>
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                {low
                  ? 'Running low. Issue a new set before you are down to the last one — a spent code cannot be reused.'
                  : 'Each code works once. Issuing a new set invalidates every code in the old one.'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <form action={regenerate}>
              <Button type="submit" size="sm" variant="secondary" loading={regenerating}>
                <KeyRound aria-hidden />
                New recovery codes
              </Button>
            </form>
            <form action={disable}>
              <Button type="submit" size="sm" variant="ghost" loading={disabling}>
                <ShieldOff aria-hidden />
                Turn off
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface px-5 py-5">
          {enrolment.qrSvg ? (
            <EnrolmentSteps enrolment={enrolment} onConfirm={confirm} confirming={confirming} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-56 flex-1">
                <p className="text-sm font-medium text-ink">
                  {status.pending ? 'Enrolment started but never finished' : 'Not set up yet'}
                </p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
                  It takes about a minute: scan a code with an authenticator app, type the six
                  digits back, and keep the recovery codes we hand you afterwards.
                </p>
              </div>
              <form action={begin}>
                <Button type="submit" loading={beginning} disabled={!status.configured}>
                  <Smartphone aria-hidden />
                  {status.pending ? 'Start again' : 'Set up'}
                </Button>
              </form>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const STEPS = [
  {
    title: 'Scan the code',
    body: 'Any authenticator app — 1Password, Authy, Google Authenticator, your password manager.',
  },
  { title: 'Type the six digits it shows', body: 'They change every thirty seconds.' },
  {
    title: 'Keep the recovery codes',
    body: 'We hand them over once, immediately after. They are the only way back in without the phone.',
  },
];

function EnrolmentSteps({
  enrolment,
  onConfirm,
  confirming,
}: {
  enrolment: EnrolmentState;
  onConfirm: (formData: FormData) => void;
  confirming: boolean;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      <div className="shrink-0">
        {/* Rendered to SVG on the server, so the secret never passes through a
            client-side QR library. */}
        <div
          className="w-[172px] rounded-md border border-line bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: enrolment.qrSvg ?? '' }}
        />
        <button
          type="button"
          onClick={() => setShowSecret((open) => !open)}
          className="mt-2 text-xs text-accent transition-colors duration-[140ms] hover:underline motion-reduce:transition-none"
        >
          {showSecret ? 'Hide the setup key' : 'Cannot scan it?'}
        </button>
        {showSecret ? (
          <p className="mono mt-1.5 w-[172px] rounded-md border border-line bg-surface-sunken px-3 py-2 text-2xs break-all text-ink">
            {enrolment.secret}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-medium tabular-nums',
                  index === 0
                    ? 'bg-accent text-on-accent'
                    : 'bg-surface-sunken text-ink-muted',
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{step.title}</span>
                <span className="block text-xs leading-relaxed text-ink-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>

        <form action={onConfirm} className="flex items-end gap-2 border-t border-line pt-4">
          <Field label="Code from your app" htmlFor="mfa-code" className="w-44">
            <Input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="mono tracking-[0.25em]"
              required
            />
          </Field>
          <Button type="submit" loading={confirming}>
            Turn on
          </Button>
        </form>
      </div>
    </div>
  );
}

/**
 * Shown once and never again.
 *
 * Only the digests are stored, so there is no path by which this list can be
 * reproduced — which is the property that makes it safe, and the reason the
 * panel says so rather than quietly hoping the user copies them.
 */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-accent-border bg-accent-soft px-5 py-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-accent">
        <KeyRound className="size-4" aria-hidden />
        Recovery codes — shown once
      </h3>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        Each one works once. We store digests rather than the codes, so we cannot show them to you
        again and nor can anyone who gets into our database. Put them somewhere that is not the
        phone with the authenticator on it.
      </p>
      <ul className="mono mt-3 grid grid-cols-2 gap-1.5 text-xs text-ink sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code} className="rounded-sm bg-surface px-2 py-1.5 text-center tabular-nums">
            {code}
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="secondary"
        className="mt-3"
        onClick={() => {
          void navigator.clipboard.writeText(codes.join('\n'));
          setCopied(true);
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? 'Copied' : 'Copy all'}
      </Button>
    </div>
  );
}

function StepUpForm() {
  const [state, action, pending] = useActionState<SecurityState, FormData>(
    confirmStepUpAction,
    {},
  );

  return (
    <div className="rounded-lg border border-caution-border bg-caution-soft px-5 py-4">
      <h3 className="text-sm font-semibold text-caution">Confirm it is you</h3>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
        That action changes how you sign in, so it needs a fresh code. One confirmation covers the
        next ten minutes.
      </p>
      <form action={action} className="mt-3 flex items-end gap-2">
        <Field label="Code from your app" htmlFor="step-up-code" className="w-44">
          <Input
            id="step-up-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="mono tracking-[0.25em]"
            required
          />
        </Field>
        <Button type="submit" loading={pending}>
          Confirm
        </Button>
      </form>
      <Notice state={state} />
    </div>
  );
}

function Notice({ state }: { state: SecurityState }) {
  if (!state.error && !state.message) return null;
  const error = Boolean(state.error);
  return (
    <p
      role="status"
      className={
        error
          ? 'flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical'
          : 'flex items-start gap-2 rounded-md border border-positive-border bg-positive-soft px-3 py-2.5 text-sm text-positive'
      }
    >
      {error ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      {state.error ?? state.message}
    </p>
  );
}
