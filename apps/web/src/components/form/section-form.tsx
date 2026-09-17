'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { AlertCircle, Check, Lock, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { labelFor } from './registry';
import {
  IDLE_SAVE_STATE,
  createHelpers,
  type FieldHelpers,
  type SectionAction,
} from './types';

/**
 * The frame every section sits in.
 *
 * One section is one form and one save, because a passport is filled in over
 * months by different people and a single giant form would make every save a
 * claim about data the saver has never seen. The hidden `_sections` field tells
 * the action which top-level keys this form is authoritative for, so clearing
 * the last row of a list actually clears it.
 */
export function SectionForm({
  title,
  description,
  owns,
  payload,
  action,
  readOnly,
  readOnlyNotice,
  gateErrors,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  owns: readonly string[];
  payload: unknown;
  action: SectionAction;
  readOnly: boolean;
  readOnlyNotice?: React.ReactNode;
  gateErrors?: Record<string, string[]>;
  children: (f: FieldHelpers) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_SAVE_STATE);
  const form = React.useRef<HTMLFormElement>(null);
  // Scoped to the fields themselves, not the whole form: the save bar and the
  // counter re-render on every save, and a change-detector that watches its own
  // confirmation message would report unsaved work the moment work was saved.
  const fields = React.useRef<HTMLFieldSetElement>(null);
  const filled = useFilledCount(fields);
  const { dirty, markClean } = useDirtyTracking(fields, readOnly);

  // A completed round trip is the point at which what is on screen matches what
  // is stored, whether or not anything actually changed.
  React.useEffect(() => {
    if (state.status === 'saved' || state.status === 'unchanged') markClean();
  }, [state.status, state.at, markClean]);

  const f = createHelpers({ payload, errors: state.errors, gate: gateErrors, readOnly });
  const issues = Object.entries(state.errors ?? {});

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="_sections" value={owns.join(',')} />

      <header className="flex flex-col gap-1.5">
        <h2 className="display text-2xl">{title}</h2>
        {description ? (
          <p className="max-w-prose text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
        <p className="text-xs text-ink-subtle tabular-nums" aria-live="polite">
          {filled.filled} of {filled.total} fields on this page have an answer
        </p>
      </header>

      {readOnly && readOnlyNotice ? readOnlyNotice : null}

      <fieldset
        ref={fields}
        disabled={readOnly}
        className="flex min-w-0 flex-col gap-8 border-0 p-0"
      >
        {children(f)}
      </fieldset>

      {issues.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-critical-border bg-critical-soft px-4 py-3"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-critical">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {state.message ?? 'Some values could not be saved.'}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {issues.map(([path, messages]) => (
              <li key={path} className="text-xs text-critical">
                <a href={`#${path}`} className="underline underline-offset-2">
                  {labelFor(path)}
                </a>
                {' — '}
                {messages[0]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {readOnly ? null : (
        <div
          className={cn(
            'sticky bottom-4 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border px-5 py-4',
            'bg-surface/95 shadow-sm backdrop-blur',
            'transition-[border-color,box-shadow] duration-[220ms] ease-[cubic-bezier(.32,.72,0,1)]',
            dirty ? 'border-caution-border' : 'border-line',
          )}
        >
          <SaveStatus dirty={dirty} status={state.status} version={state.version} />

          <div className="min-w-56 flex-1">
            <label htmlFor="_changeReason" className="text-xs font-medium text-ink">
              What changed, and why?
            </label>
            <Input
              id="_changeReason"
              name="_changeReason"
              placeholder="Recorded against this version in the audit trail"
              maxLength={300}
              className="mt-1.5"
            />
          </div>

          <Button type="submit" loading={pending} disabled={!dirty} className="shrink-0">
            {dirty ? 'Save section' : 'Saved'}
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * One line that is always true.
 *
 * The old bar said nothing until a save came back, so the only way to know
 * whether your edits were safe was to press the button and see. Unsaved work is
 * the thing a person is actually anxious about, so it gets said first and it
 * gets the caution colour — with the confirmation replacing it, not stacking
 * beneath it.
 */
function SaveStatus({
  dirty,
  status,
  version,
}: {
  dirty: boolean;
  status: string;
  version?: number;
}) {
  return (
    <p className="flex min-w-44 shrink-0 items-center gap-1.5 self-center text-xs" aria-live="polite">
      {dirty ? (
        <>
          <PencilLine className="size-3.5 shrink-0 text-caution" aria-hidden />
          <span className="font-medium text-caution">Unsaved changes</span>
        </>
      ) : status === 'saved' ? (
        <>
          <Check className="size-3.5 shrink-0 text-positive" aria-hidden />
          <span className="text-positive tabular-nums">Saved as version {version}</span>
        </>
      ) : status === 'unchanged' ? (
        <span className="text-ink-muted">Nothing had changed.</span>
      ) : (
        <span className="text-ink-subtle">No changes to save.</span>
      )}
    </p>
  );
}

/** The notice shown in place of the save bar when the passport is locked. */
export function ReadOnlyNotice({
  statusLabel,
  children,
}: {
  statusLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-line-strong bg-surface-sunken px-4 py-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          This passport is {statusLabel.toLowerCase()} and cannot be edited.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Content is frozen once a passport leaves draft so that the version a reviewer approved is
          the version that gets published. Use the actions at the top of the page to move it back.
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * Has anything on this page been touched since it was last stored?
 *
 * Read from DOM events rather than from controlled inputs, for the same reason
 * the rest of the editor is uncontrolled: rows are added and removed, and
 * lifting every value into React state to answer one boolean would make that
 * fragile. Adding or removing a repeatable row counts as a change, because it
 * is one.
 */
function useDirtyTracking(scope: React.RefObject<HTMLElement | null>, readOnly: boolean) {
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    const node = scope.current;
    if (!node || readOnly) return;

    const touch = (event: Event) => {
      // The change-reason box is metadata about the save, not passport content,
      // so typing in it alone must not claim there is something to save.
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLElement && target.getAttribute('name')?.startsWith('_')) return;
      setDirty(true);
    };

    node.addEventListener('input', touch);
    node.addEventListener('change', touch);

    // Adding or removing a repeatable row is a change, and it fires no input
    // event, so the structure is watched as well as the values. Only nodes
    // carrying form controls count: a section redraws for plenty of reasons the
    // user did not cause — a composition preview appearing on mount, a field
    // error clearing after a save — and none of those are unsaved work.
    const observer = new MutationObserver((records) => {
      const touched = records.some(
        (record) =>
          [...record.addedNodes].some(carriesControl) ||
          [...record.removedNodes].some(carriesControl),
      );
      if (touched) setDirty(true);
    });
    observer.observe(node, { childList: true, subtree: true });

    return () => {
      node.removeEventListener('input', touch);
      node.removeEventListener('change', touch);
      observer.disconnect();
    };
  }, [scope, readOnly]);

  // Closing the tab mid-edit loses work the server has never seen. The browser
  // decides the wording; all we can do is ask for the prompt.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const markClean = React.useCallback(() => setDirty(false), []);

  return { dirty, markClean };
}

/** Is this node, or anything inside it, somewhere a passport value lives? */
function carriesControl(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLInputElement) return node.type !== 'hidden';
  if (node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement) return true;
  return node.querySelector('input:not([type="hidden"]), select, textarea') !== null;
}

/**
 * How much of this page is answered, counted live.
 *
 * The registry-scored completeness in the rail only moves when a section is
 * saved. This is the cheap, honest companion to it: what is on screen, right
 * now, with something in it.
 */
function useFilledCount(scope: React.RefObject<HTMLElement | null>) {
  const [count, setCount] = React.useState({ filled: 0, total: 0 });

  React.useEffect(() => {
    const node = scope.current;
    if (!node) return;

    const recompute = () => {
      const inputs = node.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        '[data-content]',
      );
      let filled = 0;
      for (const input of inputs) if (input.value.trim() !== '') filled += 1;
      // Bail when nothing moved, or a mutation that changes no count would
      // re-render, mutate the DOM again, and keep the observer busy forever.
      setCount((previous) =>
        previous.filled === filled && previous.total === inputs.length
          ? previous
          : { filled, total: inputs.length },
      );
    };

    recompute();
    node.addEventListener('input', recompute);
    node.addEventListener('change', recompute);
    const observer = new MutationObserver(recompute);
    observer.observe(node, { childList: true, subtree: true });

    return () => {
      node.removeEventListener('input', recompute);
      node.removeEventListener('change', recompute);
      observer.disconnect();
    };
  }, [scope]);

  return count;
}
