'use client';

import { useActionState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import type { RequestFormState } from '@/lib/data-requests/actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { DiffHeader, DiffRow, verdictOf, type ReviewItem } from './answer-diff';

export type { ReviewConflict, ReviewExisting, ReviewItem } from './answer-diff';

/**
 * Field-level review, laid out as a diff.
 *
 * Every answer defaults to accepted, because the common case is a supplier who
 * filled the form in honestly and a reviewer who is checking rather than
 * adjudicating. Rejecting is one click, and the reason goes to the supplier
 * rather than into a private note — a rejection they cannot act on produces a
 * second wrong answer and a lost fortnight.
 *
 * Conflicts are the exception: where the supplier contradicts something the
 * passport already says, nothing is applied until somebody chooses.
 */
export function ReviewPanel({
  action,
  items,
}: {
  action: (state: RequestFormState, form: FormData) => Promise<RequestFormState>;
  items: ReviewItem[];
}) {
  const [state, submit, pending] = useActionState<RequestFormState, FormData>(action, {});

  const answered = items.filter((item) => item.answered);
  const blank = items.length - answered.length;
  const conflicting = items.filter((item) => verdictOf(item) === 'conflict').length;

  return (
    <form action={submit} className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Review the answers</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            <span className="tabular-nums">{answered.length}</span> answered
            {blank > 0 ? (
              <>
                , <span className="tabular-nums">{blank}</span> left blank
              </>
            ) : null}
            {conflicting > 0 ? (
              <>
                , <span className="font-medium text-caution tabular-nums">{conflicting}</span>{' '}
                disagreeing with a passport
              </>
            ) : null}
            . Accepted answers are merged into every passport this request covers; anything already
            recorded is never overwritten without you saying so.
          </p>
        </header>

        {state.error ? (
          <p
            role="alert"
            className="m-5 flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}

        <DiffHeader />

        <ul className="divide-y divide-line">
          {items.map((item) => (
            <DiffRow
              key={item.path}
              item={item}
              decision={
                item.answered ? (
                  <fieldset className="flex shrink-0 items-center gap-1 rounded-md border border-line-strong p-0.5">
                    <legend className="sr-only">Decision for {item.label}</legend>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs text-ink-muted transition-colors duration-[140ms] has-checked:bg-positive-soft has-checked:text-positive">
                      <input
                        type="radio"
                        name={`decision:${item.path}`}
                        value="accept"
                        defaultChecked
                        className="sr-only"
                      />
                      <Check className="size-3.5" aria-hidden />
                      Accept
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs text-ink-muted transition-colors duration-[140ms] has-checked:bg-critical-soft has-checked:text-critical">
                      <input
                        type="radio"
                        name={`decision:${item.path}`}
                        value="reject"
                        className="sr-only"
                      />
                      <X className="size-3.5" aria-hidden />
                      Reject
                    </label>
                  </fieldset>
                ) : null
              }
              conflictControl={
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink">
                  <input
                    type="checkbox"
                    name={`overwrite:${item.path}`}
                    value="1"
                    className="size-4 rounded-xs border-line-strong accent-accent"
                  />
                  Replace what the passport says with this answer
                </label>
              }
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <Field
          label="Note to the supplier"
          htmlFor="reviewNotes"
          hint="Required when you send it back. They see exactly this text, so name the field and say what is wrong with it."
          error={state.fieldErrors?.reviewNotes}
        >
          <Textarea id="reviewNotes" name="reviewNotes" rows={3} />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="verdict" value="approve" loading={pending}>
            <Check aria-hidden />
            Approve and merge
          </Button>
          <Button type="submit" name="verdict" value="reject" variant="secondary" disabled={pending}>
            <X aria-hidden />
            Send back with a reason
          </Button>
        </div>
      </section>
    </form>
  );
}
