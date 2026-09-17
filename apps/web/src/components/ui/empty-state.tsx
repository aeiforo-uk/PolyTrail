import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * An empty state should say what the thing is for and offer the next action.
 * "No results" tells a first-time user nothing about what they are looking at.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-sunken/40 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface text-ink-subtle">
          <Icon className="size-4.5" aria-hidden />
        </span>
      ) : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
