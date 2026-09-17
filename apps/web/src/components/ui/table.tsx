import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table primitives. Deliberately thin — the data tables in this product differ
 * enough per screen that a generic DataTable would be configured into
 * unreadability. These just carry the house styling.
 *
 * The styling is quiet on purpose. A compliance officer reads these rows for
 * hours, so the table gets out of the way: column headers are small grey caps
 * rather than bold ink, rows are separated by a hairline rather than by
 * banding, and the hover tint is barely there — enough to track which row the
 * pointer is on, not enough to read as a selection.
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-line text-ink-subtle', className)} {...props} />;
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        // Small caps with tracking: at this size a header stops competing with
        // the data under it and starts reading as a label for it.
        'px-4 py-2.5 text-[0.6875rem] font-medium tracking-[0.06em] whitespace-nowrap uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'transition-colors duration-[--duration-fast] hover:bg-surface-sunken/70',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  // Roomier than the 12px it was: rows that touch read as a wall of text, and
  // the density gained is not density anyone was asking for.
  return <td className={cn('px-4 py-3.5 align-middle', className)} {...props} />;
}
