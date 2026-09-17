'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, CircleCheck, Lock, Recycle, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { LIFECYCLE_EVENT_META, type LifecycleEventType } from '@/lib/lifecycle/vocab';
import { cn } from '@/lib/utils';
import { recordEvent, type RecordState } from '../actions';
import type { Persona } from '../queries';

/**
 * The one thing a partner is here to do.
 *
 * A repairer has a single action and gets a single button; a recycler has three
 * stages and picks one, because "collected" and "recycled" are days apart on a
 * real line and recording them as the same event would make the timeline lie.
 *
 * The terminal choice is not a slightly redder version of the others. It is a
 * larger target, in a block of its own, that says what it ends; selecting it
 * turns the submit control into something the hand has to mean, and adds a
 * checkbox that has to be ticked first. A mis-tap here destroys a passport, and
 * the person doing it is wearing gloves.
 */
const CHOICES: Record<Persona, readonly LifecycleEventType[]> = {
  repairer: ['repaired'],
  recycler: ['collected', 'sorted', 'recycled'],
};

export function RecordForm({ dppId, persona }: { dppId: string; persona: Persona }) {
  const [state, action, pending] = useActionState<RecordState, FormData>(recordEvent, {});
  const choices = CHOICES[persona];
  const [eventType, setEventType] = React.useState<LifecycleEventType>(choices[0]!);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const meta = LIFECYCLE_EVENT_META[eventType];
  const Icon = persona === 'repairer' ? Wrench : Recycle;

  const reversible = choices.filter((choice) => !LIFECYCLE_EVENT_META[choice].terminal);
  const terminal = choices.filter((choice) => LIFECYCLE_EVENT_META[choice].terminal);

  if (state.recorded) {
    const recordedMeta = LIFECYCLE_EVENT_META[state.recorded as LifecycleEventType];
    return (
      <div className="rounded-xl border border-positive-border bg-positive-soft p-6">
        <p className="flex items-center gap-2.5 text-lg font-medium text-positive">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          Recorded: {recordedMeta?.label ?? state.recorded}
        </p>
        <p className="mt-2 max-w-prose text-base leading-relaxed text-ink-muted">
          {recordedMeta?.terminal
            ? 'The passport is closed. Nothing further can be recorded against this item by anyone, including the brand.'
            : 'It is on the item’s passport now, and it cannot be edited or removed — a correction is recorded as another event.'}
        </p>
        <Button asChild size="lg" className="mt-5 h-14 w-full text-base sm:w-auto">
          <Link href="/partner">Next item</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink">
        <Icon className="size-5 text-ink-subtle" aria-hidden />
        {persona === 'repairer' ? 'Record the repair' : 'Record what you did'}
      </h2>

      {choices.length > 1 ? (
        <div className="mt-5 flex flex-col gap-3" role="radiogroup" aria-label="What happened">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {reversible.map((choice) => (
              <Choice
                key={choice}
                choice={choice}
                active={choice === eventType}
                onSelect={() => {
                  setEventType(choice);
                  setAcknowledged(false);
                }}
              />
            ))}
          </div>

          {terminal.map((choice) => (
            <Choice
              key={choice}
              choice={choice}
              active={choice === eventType}
              terminal
              onSelect={() => {
                setEventType(choice);
                setAcknowledged(false);
              }}
            />
          ))}
        </div>
      ) : null}

      <input type="hidden" name="dppId" value={dppId} />
      <input type="hidden" name="eventType" value={eventType} />

      <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-muted">
        {meta.description}
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <Field
          label={persona === 'repairer' ? 'What did you do?' : 'What happened?'}
          htmlFor="summary"
          required
          hint="One line. It appears on the item’s public passport."
        >
          <Input
            id="summary"
            name="summary"
            required
            minLength={3}
            maxLength={200}
            className="h-12 text-base"
            placeholder={
              persona === 'repairer'
                ? 'Replaced the main zip and reinforced the pocket seam'
                : 'Taken in at the Porto sorting facility'
            }
          />
        </Field>

        <Field label="When" htmlFor="occurredAt" hint="Leave it blank for today.">
          <Input id="occurredAt" name="occurredAt" type="date" className="h-12 w-52 text-base" />
        </Field>

        <Field
          label="Notes"
          htmlFor="detail"
          hint="Optional. Parts used, condition, anything the next person should know."
        >
          <Textarea id="detail" name="detail" rows={3} maxLength={1000} className="text-base" />
        </Field>
      </div>

      {meta.terminal ? (
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-critical-border bg-critical-soft px-4 py-3.5">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-critical)]"
          />
          <span className="text-base leading-relaxed text-ink">
            I understand this closes the passport permanently. No further event can be recorded
            against this item by anyone, including the brand.
          </span>
        </label>
      ) : null}

      {state.error ? (
        <p
          className="mt-5 flex items-start gap-2.5 rounded-lg border border-critical-border bg-critical-soft px-4 py-3 text-base text-critical"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        loading={pending}
        disabled={meta.terminal && !acknowledged}
        variant={meta.terminal ? 'destructive' : 'primary'}
        className={cn(
          'mt-6 w-full text-base',
          meta.terminal ? 'h-16 rounded-lg text-lg' : 'h-14 rounded-lg sm:w-auto sm:px-8',
        )}
      >
        {meta.terminal ? <Lock aria-hidden /> : null}
        {meta.terminal
          ? `Record ${meta.label.toLowerCase()} and close the passport`
          : `Record ${meta.label.toLowerCase()}`}
      </Button>
    </form>
  );
}

function Choice({
  choice,
  active,
  terminal = false,
  onSelect,
}: {
  choice: LifecycleEventType;
  active: boolean;
  terminal?: boolean;
  onSelect: () => void;
}) {
  const option = LIFECYCLE_EVENT_META[choice];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex min-h-16 flex-col justify-center rounded-lg border px-4 py-3 text-left',
        'transition-[border-color,box-shadow,background-color] duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none',
        terminal
          ? active
            ? 'border-critical bg-critical-soft ring-4 ring-critical-soft'
            : 'border-critical-border bg-surface hover:bg-critical-soft/50'
          : active
            ? 'border-accent bg-accent-soft ring-4 ring-accent-soft'
            : 'border-line-strong bg-surface hover:border-line-hover',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-2 text-base font-medium',
          terminal ? 'text-critical' : 'text-ink',
        )}
      >
        {terminal ? <Lock className="size-4 shrink-0" aria-hidden /> : null}
        {option.label}
      </span>
      <span
        className={cn('mt-0.5 block text-sm', terminal ? 'text-critical' : 'text-ink-subtle')}
      >
        {terminal ? 'Closes the passport for good' : 'Reversible — the item stays in circulation'}
      </span>
    </button>
  );
}
