'use client';

import * as React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { fieldName, type FieldKind } from './parse';
import type { FieldHelpers } from './types';

/**
 * Inputs that know their own path.
 *
 * Each field derives its name, its current value, its error, its label anchor
 * and its regulatory basis from one `path` prop. That is deliberate: a section
 * file then reads as a list of the things a passport carries, and there is no
 * second place where a path can be mistyped.
 */

export interface Option {
  value: string;
  label: string;
}

interface Base {
  f: FieldHelpers;
  path: string;
  label: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
}

/** A publication-gate failure reads as a warning until the user tries to publish. */
function decorate(f: FieldHelpers, path: string, hint: React.ReactNode) {
  const error = f.error(path);
  const gate = error ? null : f.gate(path);
  return {
    error,
    gate,
    hint: gate ? <span className="text-caution">{gate}</span> : hint,
    invalid: Boolean(error),
    shell: fieldShell(error, gate),
  };
}

/**
 * How a field says something is wrong.
 *
 * A red message under a red-ringed input is easy to scroll straight past in a
 * form this long, and a red-filled box is shouting. A coloured rail down the
 * left edge, with a wash behind it, reads as a margin annotation: findable from
 * the other end of the page, quiet once you are looking at it. Publication-gate
 * warnings get the same shape a step quieter, because they are a forecast of a
 * refusal rather than a refusal.
 */
function fieldShell(error: string | null, gate: string | null): string {
  if (error) return 'rounded-sm border-l-2 border-critical bg-critical-soft/50 py-2 pr-2 pl-3';
  if (gate) return 'rounded-sm border-l-2 border-caution/50 py-2 pr-2 pl-3';
  return '';
}

/** Anchored error links land the input below the sticky header, not under it. */
const ANCHOR = 'scroll-mt-28';

export function TextField({
  f,
  path,
  label,
  hint,
  required,
  className,
  kind = 'text',
  type = 'text',
  placeholder,
  maxLength,
  mono,
}: Base & {
  kind?: Extract<FieldKind, 'text' | 'upper' | 'list'>;
  type?: 'text' | 'url' | 'email' | 'date';
  placeholder?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  const { error, hint: resolved, invalid, shell } = decorate(f, path, hint);
  const raw = f.value(path);
  const value = Array.isArray(raw) ? raw.join(', ') : raw == null ? '' : String(raw);

  return (
    <Field
      label={label}
      htmlFor={path}
      error={error}
      hint={resolved}
      required={required ?? f.required(path)}
      basis={f.basis(path)}
      className={cn(shell, className)}
    >
      <Input
        id={path}
        name={fieldName(path, kind)}
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        data-content
        className={cn(ANCHOR, kind === 'upper' && 'uppercase', mono && 'mono')}
      />
    </Field>
  );
}

export function NumberField({
  f,
  path,
  label,
  hint,
  required,
  className,
  step,
  min,
  max,
  suffix,
  percentage,
}: Base & {
  step?: number | 'any';
  min?: number;
  max?: number;
  suffix?: string;
  /** Counted into a running total by `PercentageTotal`. */
  percentage?: boolean;
}) {
  const { error, hint: resolved, invalid, shell } = decorate(f, path, hint);
  const raw = f.value(path);

  return (
    <Field
      label={label}
      htmlFor={path}
      error={error}
      hint={resolved}
      required={required ?? f.required(path)}
      basis={f.basis(path)}
      className={cn(shell, className)}
    >
      <div className="relative">
        <Input
          id={path}
          name={fieldName(path, 'num')}
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          min={min}
          max={max}
          defaultValue={raw == null ? '' : String(raw)}
          aria-invalid={invalid || undefined}
          data-content
          data-percentage={percentage ? '' : undefined}
          className={cn(ANCHOR, 'tabular-nums', suffix && 'pr-12')}
        />
        {suffix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-subtle"
          >
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

export function TextAreaField({
  f,
  path,
  label,
  hint,
  required,
  className,
  rows,
  placeholder,
}: Base & { rows?: number; placeholder?: string }) {
  const { error, hint: resolved, invalid, shell } = decorate(f, path, hint);
  const raw = f.value(path);

  return (
    <Field
      label={label}
      htmlFor={path}
      error={error}
      hint={resolved}
      required={required ?? f.required(path)}
      basis={f.basis(path)}
      className={cn(shell, className)}
    >
      <Textarea
        id={path}
        name={fieldName(path)}
        className={ANCHOR}
        rows={rows ?? 3}
        placeholder={placeholder}
        defaultValue={raw == null ? '' : String(raw)}
        aria-invalid={invalid || undefined}
        data-content
      />
    </Field>
  );
}

export function SelectField({
  f,
  path,
  label,
  hint,
  required,
  className,
  options,
  placeholder = 'Not set',
  series,
}: Base & {
  options: readonly Option[];
  placeholder?: string;
  /** Marks this select as the thing that names its row in a composition bar. */
  series?: boolean;
}) {
  const { error, hint: resolved, invalid, shell } = decorate(f, path, hint);
  const raw = f.value(path);

  return (
    <Field
      label={label}
      htmlFor={path}
      error={error}
      hint={resolved}
      required={required ?? f.required(path)}
      basis={f.basis(path)}
      className={cn(shell, className)}
    >
      <NativeSelect
        id={path}
        name={fieldName(path)}
        className={ANCHOR}
        defaultValue={raw == null ? '' : String(raw)}
        aria-invalid={invalid || undefined}
        data-content
        data-series={series ? '' : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/**
 * A single yes/no.
 *
 * The hidden input in front of the checkbox is what makes "no" distinguishable
 * from "not answered": an unticked box sends nothing at all, and a passport
 * that says nothing about take-back is not the same as one that says there is
 * none.
 */
export function BoolField({
  f,
  path,
  label,
  hint,
  defaultOn,
}: Base & { defaultOn?: boolean }) {
  const stored = f.value(path);
  // A row that has never been saved takes the schema's own default rather than
  // silently answering "no" on the user's behalf.
  const checked = stored === undefined ? Boolean(defaultOn) : Boolean(stored);
  const error = f.error(path);
  const gate = error ? null : f.gate(path);

  return (
    <div className={cn('flex flex-col gap-1.5', fieldShell(error, gate))}>
      <div className="flex items-start gap-2.5">
        <input type="hidden" name={fieldName(path, 'bool')} value="false" />
        <Checkbox id={path} name={fieldName(path, 'bool')} value="true" defaultChecked={checked} />
        <label htmlFor={path} className="text-sm leading-5 text-ink">
          {label}
          {f.basis(path) ? (
            <span className="ml-2 text-2xs text-ink-subtle" title={f.basis(path)}>
              {f.basis(path)}
            </span>
          ) : null}
        </label>
      </div>
      {error ? (
        <p className="text-xs text-critical" role="alert">
          {error}
        </p>
      ) : gate ? (
        <p className="text-xs text-caution">{gate}</p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Many-from-a-list, as checkboxes rather than a multi-select nobody can use. */
export function CheckboxGroupField({
  f,
  path,
  label,
  hint,
  options,
  columns = 2,
}: Base & { options: readonly Option[]; columns?: 1 | 2 | 3 }) {
  const selected = new Set((f.value(path) as string[] | undefined) ?? []);
  const error = f.error(path);

  return (
    <fieldset className={cn('flex flex-col gap-2', fieldShell(error, null))}>
      <legend className="mb-1 flex w-full items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        {f.basis(path) ? (
          <span className="text-2xs text-ink-subtle" title={f.basis(path)}>
            {f.basis(path)}
          </span>
        ) : null}
      </legend>
      <div
        className={cn(
          'grid gap-x-4 gap-y-2',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {options.map((option) => {
          const id = `${path}.${option.value}`;
          return (
            <div key={option.value} className="flex items-start gap-2.5">
              <Checkbox
                id={id}
                name={fieldName(path, 'multi')}
                value={option.value}
                defaultChecked={selected.has(option.value)}
              />
              <label htmlFor={id} className="text-sm leading-5 text-ink">
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
      {error ? (
        <p className="text-xs text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </fieldset>
  );
}

/**
 * A publication gate failure that belongs to a whole section rather than to one
 * input — "fibre percentages must add up to 100%" has no single field to sit on.
 */
export function GateNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-3 py-2 text-xs text-caution">
      <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

// ── Option builders ────────────────────────────────────────────────────────

/** Turn a controlled vocabulary into options without restating its labels. */
export function vocabOptions(
  vocab: Record<string, string | { label: string }>,
): Option[] {
  return Object.entries(vocab).map(([value, entry]) => ({
    value,
    label: typeof entry === 'string' ? entry : entry.label,
  }));
}

/** Options for a Zod enum, with explicit labels where the raw key is not English. */
export function enumOptions(
  values: readonly string[],
  labels: Record<string, string> = {},
): Option[] {
  return values.map((value) => ({
    value,
    label: labels[value] ?? sentence(value),
  }));
}

function sentence(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
