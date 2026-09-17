'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { AlertCircle, ScanLine, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lookUp, type LookupState } from './actions';

/**
 * Display-only echo of what the server will make of what is typed.
 *
 * Not imported from `@/lib/passport/identifier`: that module also mints
 * identifiers and so pulls in `node:crypto`, which has no place in a browser
 * bundle. The server re-normalises with the canonical helper before looking
 * anything up, so this copy decides nothing — it only shows the person that
 * their dashes and their lowercase are fine.
 */
function normalise(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
    .slice(0, 16);
}

function group(normalized: string): string {
  return (normalized.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * The way in.
 *
 * Sized for a bench, not a desk. The field is 64px tall with 24px type because
 * the person using it is standing up, holding a garment, and quite possibly
 * wearing a glove on the hand that is not holding the phone — a 36px input with
 * 14px type is a desk control, and at arm's length it is a guess.
 *
 * A barcode scanner types the identifier and presses Enter, so the field is
 * autofocused and the form submits on Enter with no second control to hit. A
 * person typing it off a care label gets the same field: the input is grouped
 * in fours as they type, a counter says how many of the sixteen characters are
 * in, and separators, lowercase and the classic 0/O and 1/I misreadings are
 * normalised before anything is looked up.
 */
export function LookupForm({ autoFocus = true }: { autoFocus?: boolean }) {
  const [state, action, pending] = useActionState<LookupState, FormData>(lookUp, {});
  const [value, setValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const normalized = normalise(value);
  const display = group(normalized);
  const count = normalized.length;
  const complete = count === 16;

  return (
    <form action={action} className="flex flex-col">
      <label htmlFor="dppId" className="eyebrow block">
        Passport identifier
      </label>

      <div className="relative mt-2.5">
        <ScanLine
          className={cn(
            'pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none',
            complete ? 'text-accent' : 'text-ink-subtle',
          )}
          aria-hidden
        />
        <input
          ref={inputRef}
          id="dppId"
          name="dppId"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          aria-describedby="dppId-hint"
          placeholder="XK4T-9PMB-2QW7-5RHC"
          className={cn(
            'mono h-16 w-full rounded-lg border bg-surface pr-14 pl-13 text-xl tracking-[0.08em] text-ink uppercase sm:text-2xl',
            'placeholder:text-ink-subtle placeholder:normal-case placeholder:tracking-normal',
            'transition-[border-color,box-shadow] duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none',
            'hover:border-line-hover focus:border-info focus:ring-4 focus:ring-info-soft focus:outline-none',
            complete ? 'border-accent' : 'border-line-strong',
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
            className="absolute top-1/2 right-1.5 flex size-12 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle transition-colors duration-[140ms] hover:bg-surface-sunken hover:text-ink motion-reduce:transition-none"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Clear the identifier</span>
          </button>
        ) : null}
      </div>

      {/* A denominator, not a bare field: sixteen characters is a long thing to
          type on a phone and knowing how many are in stops a silent typo. */}
      <div className="mt-3 flex items-center gap-3">
        <span
          className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken"
          role="img"
          aria-label={`${count} of 16 characters entered`}
        >
          <span
            className={cn(
              'block h-full rounded-full transition-[width] duration-[220ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none',
              complete ? 'bg-accent' : 'bg-line-strong',
            )}
            style={{ width: `${(count / 16) * 100}%` }}
          />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-subtle">{count} of 16</span>
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={cn(
          'mt-4 flex h-16 w-full items-center justify-center gap-2.5 rounded-lg text-lg font-medium',
          'bg-accent text-on-accent shadow-xs',
          'transition-[background-color,box-shadow,transform] duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none',
          'hover:bg-accent-hover hover:shadow-sm active:translate-y-px',
          'disabled:pointer-events-none disabled:opacity-45',
        )}
      >
        {pending ? (
          <svg className="size-5 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
            <path
              d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
        Find the item
      </button>

      <p id="dppId-hint" className="mt-3 text-sm leading-relaxed text-ink-muted">
        {display && display !== value ? (
          <>
            Reading this as <span className="mono text-ink">{display}</span>. Dashes and case do not
            matter.
          </>
        ) : (
          'Sixteen characters, in four groups of four. Dashes and case do not matter.'
        )}
      </p>

      {state.error ? (
        <p
          className="mt-4 flex items-start gap-2.5 rounded-lg border border-critical-border bg-critical-soft px-4 py-3 text-base leading-relaxed text-critical"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
