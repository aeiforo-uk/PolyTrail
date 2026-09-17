'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { AlertCircle, Check, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { decidePassport, type ReviewState } from './actions';

export interface DecisionOption {
  to: string;
  label: string;
  description: string;
  requiresReason: boolean;
  confirm: boolean;
  validates: boolean;
}

export interface FieldOption {
  path: string;
  label: string;
  /** The passport section it belongs to, so the picker groups the way the editor does. */
  section: string;
  /** Why this field is offered: "missing" or "changed in this version". */
  note: string;
}

/**
 * The three decisions, and the one that needs care.
 *
 * Approving is a single confirmation. Requesting changes is a form, because a
 * request that says only "not good enough" costs the author a round trip they
 * cannot shorten — so the field list is mandatory and pre-populated from the
 * two things we already know: what is missing, and what changed.
 */
export function DecisionPanel({
  dppId,
  options,
  fieldOptions,
}: {
  dppId: string;
  options: DecisionOption[];
  fieldOptions: FieldOption[];
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  const active = options.find((option) => option.to === open) ?? null;

  if (options.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        There is nothing to decide here. This passport is not in a state you can move it from.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const primary = option.to === 'approved' || option.to === 'published';
          const Icon = primary
            ? Check
            : option.to === 'changes_requested'
              ? MessageSquareWarning
              : AlertCircle;
          return (
            <button
              key={option.to}
              type="button"
              onClick={() => setOpen(option.to)}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left',
                'transition-[background-color,border-color] duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
                primary
                  ? 'border-accent-border bg-accent-soft hover:border-accent'
                  : 'border-line bg-surface hover:bg-surface-sunken',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  primary
                    ? 'text-accent'
                    : option.to === 'changes_requested'
                      ? 'text-caution'
                      : 'text-critical',
                )}
                aria-hidden
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm',
                    primary ? 'font-semibold text-ink' : 'font-medium text-ink',
                  )}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Dialog
        open={active !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <DialogContent className="max-w-xl">
          {active ? (
            <DecisionForm
              key={active.to}
              dppId={dppId}
              option={active}
              fieldOptions={fieldOptions}
              onDone={() => setOpen(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DecisionForm({
  dppId,
  option,
  fieldOptions,
  onDone,
}: {
  dppId: string;
  option: DecisionOption;
  fieldOptions: FieldOption[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(decidePassport, {});
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const needsFields = option.to === 'changes_requested';

  React.useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction}>
      <input type="hidden" name="dppId" value={dppId} />
      <input type="hidden" name="to" value={option.to} />
      {[...picked].map((value) => (
        <input key={value} type="hidden" name="field" value={value} />
      ))}

      <DialogHeader>
        <DialogTitle>{option.label}</DialogTitle>
        <DialogDescription>{option.description}</DialogDescription>
      </DialogHeader>

      <DialogBody className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
        {state.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}

        {state.fieldErrors ? (
          <div className="rounded-md border border-caution-border bg-caution-soft px-3 py-2.5">
            <p className="text-xs font-medium text-caution">
              The publication check found problems in these fields.
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {Object.entries(state.fieldErrors).map(([path, messages]) => (
                <li key={path} className="text-xs text-ink-muted">
                  <span className="mono text-2xs text-ink-subtle">{path}</span> — {messages.join('; ')}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {needsFields ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">Which fields need work?</legend>
            <p className="text-xs text-ink-muted">
              The author sees exactly this list next to their editor.
            </p>
            <div className="mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface">
              {fieldOptions.length === 0 ? (
                <p className="px-3 py-3 text-xs text-ink-subtle">
                  Nothing is missing and nothing changed, so name the field below.
                </p>
              ) : (
                groupBySection(fieldOptions).map((group) => (
                  <div key={group.section} className="border-b border-line last:border-b-0">
                    <p className="eyebrow sticky top-0 z-1 flex items-baseline justify-between gap-3 border-b border-line bg-surface-sunken px-3 py-1.5">
                      {group.section}
                      <span className="tabular-nums">{group.fields.length}</span>
                    </p>
                    <div className="flex flex-col divide-y divide-line">
                      {group.fields.map((field) => {
                        const value = `${field.path}|${field.label}`;
                        const id = `field-${field.path.replace(/[^a-zA-Z0-9]/g, '-')}`;
                        const missing = field.note.startsWith('required');
                        return (
                          <label
                            key={value}
                            htmlFor={id}
                            className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors duration-[140ms] hover:bg-surface-sunken/60"
                          >
                            <Checkbox
                              id={id}
                              checked={picked.has(value)}
                              onCheckedChange={(next) =>
                                setPicked((current) => {
                                  const updated = new Set(current);
                                  if (next === true) updated.add(value);
                                  else updated.delete(value);
                                  return updated;
                                })
                              }
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-2">
                                <span className="text-ink">{field.label}</span>
                                <span
                                  className={cn(
                                    'shrink-0 text-2xs',
                                    missing ? 'text-critical' : 'text-caution',
                                  )}
                                >
                                  {field.note}
                                </span>
                              </span>
                              <span className="mono block text-2xs break-all text-ink-subtle">
                                {field.path}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            {picked.size > 0 ? (
              <p className="text-xs text-ink-muted tabular-nums">
                {picked.size} {picked.size === 1 ? 'field' : 'fields'} selected.
              </p>
            ) : null}

            <Field
              label="Another field"
              htmlFor="otherField"
              hint="Optional. Use the dot-path, e.g. composition.overall.0.percentage."
            >
              <Input id="otherField" name="otherField" placeholder="section.field" />
            </Field>
          </fieldset>
        ) : null}

        <Field
          label={needsFields ? 'What the author needs to do' : 'Note for the record'}
          htmlFor="comment"
          required={needsFields || option.requiresReason}
          hint={
            needsFields
              ? 'Plain language. This is stored in the audit chain and cannot be edited later.'
              : 'Optional, but it is what a future auditor reads to understand the decision.'
          }
        >
          <Textarea
            id="comment"
            name="comment"
            required={needsFields || option.requiresReason}
            placeholder={
              needsFields
                ? 'The fibre percentages add up to 98%. Check the lining against the supplier declaration.'
                : 'Checked against the GOTS certificate and the lab report.'
            }
          />
        </Field>

        {option.confirm ? (
          <p className="flex items-start gap-2 text-xs text-caution">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            This is visible outside the workspace the moment it goes through.
          </p>
        ) : null}

        {option.validates ? (
          <p className="text-xs text-ink-subtle">
            Polytrail re-runs the publication check before this goes through. If something required
            is missing you will see it here rather than on the public passport.
          </p>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={pending}
          variant={option.to === 'approved' ? 'primary' : 'secondary'}
        >
          {option.label}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Group the picker the way the editor is laid out, so a reviewer ticking three
 * fibre fields sees them together rather than scattered down an alphabetical
 * list they have to scan twice.
 */
function groupBySection(fields: FieldOption[]): Array<{ section: string; fields: FieldOption[] }> {
  const order: string[] = [];
  const grouped = new Map<string, FieldOption[]>();
  for (const field of fields) {
    const key = field.section || 'Other';
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)!.push(field);
  }
  return order.map((section) => ({ section, fields: grouped.get(section)! }));
}
