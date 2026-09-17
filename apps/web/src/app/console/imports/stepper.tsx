import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Three steps, always all three on screen.
 *
 * An operator part-way through a two-thousand-row import needs to know how
 * much is left before they commit to anything, and a progress bar that only
 * appears once you are inside it answers that too late.
 */
const STEPS = [
  { key: 'upload', label: 'Upload', hint: 'Choose the file' },
  { key: 'mapping', label: 'Map fields', hint: 'Match columns to the passport' },
  { key: 'review', label: 'Review', hint: 'Fix anything wrong, then import' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

export function Stepper({ current }: { current: StepKey }) {
  const index = STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="flex flex-wrap items-stretch gap-2" aria-label="Import progress">
      {STEPS.map((step, position) => {
        const done = position < index;
        const active = position === index;
        return (
          <li
            key={step.key}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex min-w-48 flex-1 items-center gap-3 rounded-md border px-4 py-3',
              active
                ? 'border-accent-border bg-accent-soft'
                : done
                  ? 'border-line bg-surface'
                  : 'border-dashed border-line bg-surface-sunken/40',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                active
                  ? 'bg-accent text-on-accent'
                  : done
                    ? 'bg-positive-soft text-positive'
                    : 'bg-surface text-ink-subtle',
              )}
            >
              {done ? <Check className="size-3.5" /> : position + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block truncate text-sm font-medium',
                  active || done ? 'text-ink' : 'text-ink-subtle',
                )}
              >
                {step.label}
              </span>
              <span className="block truncate text-2xs text-ink-subtle">{step.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
