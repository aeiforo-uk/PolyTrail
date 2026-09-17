import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9.5 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink',
        'placeholder:text-ink-subtle',
        'transition-[border-color,box-shadow] duration-[140ms]',
        'hover:border-line-hover',
        // Informational blue, not the accent. The accent is madder, so a
        // focused field wore the same red as a failed one — every person who
        // tabbed into the form saw what looked like a validation error before
        // typing a character.
        'focus:border-info focus:outline-none focus:ring-3 focus:ring-info-soft',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle',
        'aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical-soft',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-20 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink',
      'placeholder:text-ink-subtle resize-y',
      'transition-[border-color,box-shadow] duration-[140ms]',
      'hover:border-line-hover',
      'focus:border-info focus:outline-none focus:ring-3 focus:ring-info-soft',
      'aria-[invalid=true]:border-critical aria-[invalid=true]:ring-critical-soft',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
