import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  /** Explains the field before the user gets it wrong, not after. */
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  /** The regulation or standard that asks for this field. Builds trust while filling forms. */
  basis?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  basis,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {required ? (
            <span className="ml-1 text-critical" aria-label="required">
              *
            </span>
          ) : null}
        </label>
        {basis ? (
          <span className="text-2xs text-ink-subtle" title={basis}>
            {basis}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-critical" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
