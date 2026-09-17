'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { NativeSelect } from '@/components/ui/select';
import { labelFor } from '@/components/form/registry';
import { IDLE_TRANSITION_STATE, type TransitionState } from './transition-state';
import { SECTIONS } from './config';

export interface TransitionOption {
  to: string;
  label: string;
  description: string;
  requiresReason?: boolean;
  confirm?: boolean;
}

const FORM_ID = 'passport-status';

/**
 * The lifecycle controls.
 *
 * Only the transitions the state machine allows for this status *and* this role
 * are rendered, so there is no such thing as a button that turns out to be
 * forbidden. Anything that needs a written reason or that other people will see
 * asks for it first — a recall notice cannot be issued by a stray click.
 */
export function StatusBar({
  dppId,
  statusLabel,
  transitions,
  action,
}: {
  dppId: string;
  statusLabel: string;
  transitions: readonly TransitionOption[];
  action: (state: TransitionState, formData: FormData) => Promise<TransitionState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_TRANSITION_STATE);
  const [active, setActive] = React.useState<TransitionOption | null>(null);

  // A completed transition re-renders the page around this bar; closing the
  // dialog here stops it hanging over the new status.
  React.useEffect(() => {
    if (state.status === 'done') setActive(null);
  }, [state.status, state.at]);

  const blocking = Object.entries(state.errors ?? {});

  return (
    <div className="flex flex-col gap-3">
      <form id={FORM_ID} action={formAction} className="flex flex-wrap items-center gap-2">
        {transitions.length === 0 ? (
          <p className="text-xs text-ink-muted">
            No further changes are available to you while this passport is{' '}
            {statusLabel.toLowerCase()}.
          </p>
        ) : (
          transitions.map((transition) =>
            transition.requiresReason || transition.confirm ? (
              <Button
                key={transition.to}
                type="button"
                variant={transition.to === 'published' ? 'primary' : 'secondary'}
                size="sm"
                title={transition.description}
                onClick={() => setActive(transition)}
              >
                {transition.label}
              </Button>
            ) : (
              <Button
                key={transition.to}
                type="submit"
                name="to"
                value={transition.to}
                variant="secondary"
                size="sm"
                loading={pending}
                title={transition.description}
              >
                {transition.label}
              </Button>
            ),
          )
        )}
      </form>

      {state.status === 'error' ? (
        <div
          role="alert"
          className="rounded-md border border-critical-border bg-critical-soft px-4 py-3"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-critical">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {state.message}
          </p>
          {blocking.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {blocking.map(([path, messages]) => (
                <li key={path} className="text-xs text-critical">
                  <Link
                    href={`/console/passports/${dppId}/edit/${sectionSlugFor(path)}#${path}`}
                    className="underline underline-offset-2"
                  >
                    {labelFor(path)}
                  </Link>
                  {' — '}
                  {messages[0]}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Dialog open={active !== null} onOpenChange={(open) => (open ? null : setActive(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active?.label}</DialogTitle>
            <DialogDescription>{active?.description}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-5">
            {active?.requiresReason ? (
              <Field
                label="Reason"
                htmlFor="transition-reason"
                required
                hint="Written into the audit trail and shown to whoever picks this up next."
              >
                <Input
                  id="transition-reason"
                  name="reason"
                  form={FORM_ID}
                  required
                  maxLength={500}
                  autoFocus
                />
              </Field>
            ) : null}

            {active?.to === 'recalled' ? (
              <>
                <Field label="Severity" htmlFor="recall-severity">
                  <NativeSelect
                    id="recall-severity"
                    name="recallSeverity"
                    form={FORM_ID}
                    defaultValue="medium"
                  >
                    <option value="low">Low — cosmetic or minor</option>
                    <option value="medium">Medium — stop using until checked</option>
                    <option value="high">High — safety risk, act now</option>
                  </NativeSelect>
                </Field>
                <Field
                  label="What should owners do?"
                  htmlFor="recall-instructions"
                  required
                  hint="Published at the top of the passport. Write it for the person holding the garment."
                >
                  <Textarea
                    id="recall-instructions"
                    name="recallInstructions"
                    form={FORM_ID}
                    required
                    rows={4}
                    maxLength={2000}
                  />
                </Field>
              </>
            ) : null}

            {active?.confirm ? (
              <p className="rounded-md border border-caution-border bg-caution-soft px-3 py-2 text-xs text-caution">
                {active.to === 'published'
                  ? 'Publishing makes this passport resolvable to anyone who scans the label. It stays resolvable afterwards, even if you withdraw it.'
                  : 'People outside your workspace will see this change.'}
              </p>
            ) : null}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              name="to"
              value={active?.to ?? ''}
              loading={pending}
              variant={active?.to === 'recalled' ? 'destructive' : 'primary'}
            >
              {active?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Send a blocking issue to the section that owns the field it names. */
function sectionSlugFor(path: string): string {
  const root = path.split('.')[0] ?? '';
  return SECTIONS.find((section) => section.owns.includes(root))?.slug ?? 'identity';
}
