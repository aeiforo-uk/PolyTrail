'use client';

import * as React from 'react';
import { ReadOnlyNotice, SectionForm } from '@/components/form/section-form';
import type { FieldHelpers } from '@/components/form/types';
import { cn } from '@/lib/utils';
import type { SectionProps } from './types';

/** Boilerplate every section shares, so a section file is only its fields. */
export function SectionFrame({
  section,
  payload,
  action,
  readOnly,
  statusLabel,
  gateErrors,
  children,
}: SectionProps & { children: (f: FieldHelpers) => React.ReactNode }) {
  return (
    <SectionForm
      title={section.label}
      description={section.description}
      owns={section.owns}
      payload={payload}
      action={action}
      readOnly={readOnly}
      readOnlyNotice={<ReadOnlyNotice statusLabel={statusLabel} />}
      gateErrors={gateErrors}
    >
      {children}
    </SectionForm>
  );
}

/** A titled run of related fields. */
export function Group({
  title,
  description,
  columns = 2,
  children,
}: {
  title?: string;
  description?: React.ReactNode;
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      {title ? <h3 className="text-sm font-semibold text-ink">{title}</h3> : null}
      {description ? (
        <p className="-mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      <div
        className={cn(
          'grid gap-5',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Fields inside a repeatable row, which never needs its own heading. */
export function Row({ columns = 2, children }: { columns?: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {children}
    </div>
  );
}
