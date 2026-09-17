'use client';

import { useActionState } from 'react';
import { CircleAlert, CircleCheck, Link2, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { verifyChain, type VerificationState } from './actions';

/**
 * The hero of the page.
 *
 * A list of events is only evidence if somebody can show it has not been
 * edited, and this is the control that shows it. So it is the largest thing on
 * the screen, it says in one sentence what a pass actually proves rather than
 * printing a green tick, and when it fails it says exactly where — because
 * "verification failed" is not something an incident can be run from.
 */
export function VerifyPanel({
  entryCount,
  firstEntryAt,
  lastEntryAt,
}: {
  entryCount: number;
  firstEntryAt?: string | null;
  lastEntryAt?: string | null;
}) {
  const [state, formAction, pending] = useActionState<VerificationState, FormData>(verifyChain, {
    status: 'idle',
  });

  const broken = state.status === 'broken' || state.status === 'error';
  const count = entryCount.toLocaleString('en-GB');

  return (
    <section
      aria-labelledby="chain-heading"
      className={cn(
        'overflow-hidden rounded-lg border',
        state.status === 'valid'
          ? 'border-positive-border bg-positive-soft'
          : broken
            ? 'border-critical-border bg-critical-soft'
            : 'border-line-strong bg-surface',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-6 p-6">
        <div className="min-w-0 max-w-prose">
          <p className="eyebrow flex items-center gap-1.5">
            <Link2 className="size-3" aria-hidden />
            Chain integrity
          </p>
          <h2 id="chain-heading" className="display mt-2 text-2xl text-ink">
            Prove this log has not been touched
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Every entry stores the hash of the one before it. Verifying re-derives all {count}{' '}
            {entryCount === 1 ? 'hash' : 'hashes'} from the records themselves — not from our
            assurance — and that is what proves nothing has been edited, deleted or reordered since
            it was written.
          </p>
          {firstEntryAt && lastEntryAt ? (
            <p className="mt-2 text-xs text-ink-subtle tabular-nums">
              Covering {firstEntryAt} to {lastEntryAt}. Filters do not narrow the check; it always
              runs over the whole chain.
            </p>
          ) : null}
        </div>

        <form action={formAction} className="shrink-0">
          <Button type="submit" loading={pending} variant="primary">
            <ShieldCheck aria-hidden />
            Verify the chain
          </Button>
        </form>
      </div>

      {state.status !== 'idle' ? (
        <div
          className={cn(
            'border-t px-6 py-5',
            state.status === 'valid'
              ? 'border-positive-border bg-surface/50'
              : 'border-critical-border bg-surface/50',
          )}
          role="status"
        >
          {state.status === 'valid' ? (
            <div className="flex items-start gap-3">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-positive">Intact</p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink">
                  All {(state.checked ?? 0).toLocaleString('en-GB')} entries re-derived, in
                  sequence, from the first entry onward. Nothing has been edited, deleted or
                  reordered since it was written.
                </p>
                {state.at ? (
                  <p className="mono mt-2 text-2xs text-ink-subtle">Checked {state.at}</p>
                ) : null}
              </div>
            </div>
          ) : state.status === 'broken' ? (
            <div className="flex items-start gap-3">
              <ShieldX className="mt-0.5 size-5 shrink-0 text-critical" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-critical">
                  Broken at entry {(state.brokenAt ?? 0) + 1} of {count}
                </p>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink">{state.reason}</p>
                <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-xs sm:grid-cols-2">
                  <div className="flex items-baseline gap-2">
                    <dt className="text-ink-muted">Still proven</dt>
                    <dd className="text-ink tabular-nums">
                      {state.brokenAt && state.brokenAt > 0
                        ? `entries 1 to ${state.brokenAt}`
                        : 'none'}
                    </dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="text-ink-muted">Unproven</dt>
                    <dd className="text-critical tabular-nums">
                      entries {(state.brokenAt ?? 0) + 1} to {count}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 max-w-prose text-xs leading-relaxed text-ink-muted">
                  Treat this as an incident. Export the log now, so the state you found it in is
                  preserved, and contact support before making further changes.
                </p>
                {state.at ? (
                  <p className="mono mt-2 text-2xs text-ink-subtle">Checked {state.at}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="flex items-start gap-3 text-sm text-critical">
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              {state.reason}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
