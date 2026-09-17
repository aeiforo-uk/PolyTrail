'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, Boxes, Layers, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { validateGtin } from '@/lib/gs1/digital-link';
import { CATEGORIES } from '@/lib/passport/vocab';
import { basisFor } from '@/components/form/registry';
import { IDLE_CREATE_STATE, type CreateState } from './state';

/**
 * The one decision on this form that cannot be undone.
 *
 * Almost nobody arrives knowing which of these they want, and picking wrong
 * means re-issuing labels, so each option states what it is, when it is the
 * right answer, and — the part that actually decides it — what the barcode on
 * the garment has to carry as a result.
 */
const GRANULARITY = [
  {
    value: 'model',
    label: 'The model',
    icon: Layers,
    recommended: true,
    summary: 'One passport for the style. Every unit made to it points at the same record.',
    when: 'Your composition, footprint and supply chain are the same across the whole production run.',
    carries: '/01/09506000134352',
    carriesNote: 'The GTIN alone. One QR artwork for the entire style.',
  },
  {
    value: 'batch',
    label: 'A production batch',
    icon: Boxes,
    recommended: false,
    summary: 'One passport per lot, so two runs of the same style can tell the truth separately.',
    when: 'Facts differ between runs — a second mill, a different dyehouse, a new fibre certificate.',
    carries: '/01/09506000134352/10/LOT-24A',
    carriesNote: 'GTIN plus the lot number. A new QR for each run.',
  },
  {
    value: 'item',
    label: 'A single item',
    icon: Tag,
    recommended: false,
    summary: 'One passport per physical garment, carrying its own serial number.',
    when: 'The item has a life of its own — resale, repair history, ownership, authentication.',
    carries: '/01/09506000134352/21/000184',
    carriesNote: 'GTIN plus a serial. Every garment needs a unique code printed on it.',
  },
] as const;

export function CreatePassportForm({
  action,
}: {
  action: (state: CreateState, formData: FormData) => Promise<CreateState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_CREATE_STATE);
  const [gtinProblem, setGtinProblem] = React.useState<string | null>(null);

  /**
   * A GTIN's last digit is a checksum over the other thirteen, so a mistyped
   * one can be caught before it reaches the database — and long before it is
   * printed on a care label and scanned in a shop.
   */
  const checkGtin = (raw: string) => {
    const value = raw.trim();
    if (!value) return setGtinProblem(null);
    if (!/^\d+$/.test(value)) return setGtinProblem('A GTIN is digits only.');
    if (value.length < 8) return setGtinProblem('A GTIN is 8, 12, 13 or 14 digits.');
    const check = validateGtin(value);
    setGtinProblem(check.valid ? null : (check.reason ?? 'That GTIN is not valid.'));
  };

  const error = (key: string) => state.errors?.[key]?.[0] ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {state.message}
        </p>
      ) : null}

      <Field
        label="Product name"
        htmlFor="productName"
        required
        basis={basisFor('identity.productName')}
        error={error('productName')}
        hint="What a shopper would recognise it as."
      >
        <Input
          id="productName"
          name="productName"
          required
          autoFocus
          maxLength={200}
          aria-invalid={error('productName') ? true : undefined}
        />
      </Field>

      <Field
        label="Category"
        htmlFor="category"
        required
        basis={basisFor('identity.category')}
        error={error('category')}
        hint="Decides which footprint rules and size system apply."
      >
        <NativeSelect
          id="category"
          name="category"
          required
          defaultValue=""
          aria-invalid={error('category') ? true : undefined}
        >
          <option value="" disabled>
            Choose a category
          </option>
          {Object.entries(CATEGORIES).map(([value, entry]) => (
            <option key={value} value={value}>
              {entry.label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Style number"
          htmlFor="styleNumber"
          basis={basisFor('identity.styleNumber')}
          error={error('styleNumber')}
          hint="Your own reference for the style."
        >
          <Input id="styleNumber" name="styleNumber" maxLength={128} className="mono" />
        </Field>

        <Field
          label="SKU"
          htmlFor="sku"
          basis={basisFor('identity.sku')}
          error={error('sku')}
        >
          <Input id="sku" name="sku" maxLength={128} className="mono" />
        </Field>
      </div>

      <Field
        label="GTIN"
        htmlFor="gtin"
        basis={basisFor('identity.gtin')}
        error={gtinProblem ?? error('gtin')}
        hint="The barcode number, 8 to 14 digits. Leave it blank if one has not been assigned yet."
      >
        <Input
          id="gtin"
          name="gtin"
          inputMode="numeric"
          maxLength={14}
          className="mono"
          onChange={(event) => checkGtin(event.currentTarget.value)}
          aria-invalid={gtinProblem || error('gtin') ? true : undefined}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Colour"
          htmlFor="colourName"
          basis={basisFor('identity.colourName')}
          error={error('colourName')}
        >
          <Input id="colourName" name="colourName" maxLength={128} />
        </Field>

        <Field label="Size" htmlFor="size" basis={basisFor('identity.size')} error={error('size')}>
          <Input id="size" name="size" maxLength={32} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 border-t border-line pt-6">
        <legend className="text-sm font-medium text-ink">What does this passport cover?</legend>
        <p className="max-w-prose text-xs leading-relaxed text-ink-muted">
          This decides what the code on the label has to carry, so it cannot be changed later
          without creating a new passport and reprinting. Most brands start with the model and move
          to batches only when two runs of the same style stop being the same product.
        </p>

        <div className="mt-1 flex flex-col gap-2">
          {GRANULARITY.map((option, index) => (
            <label
              key={option.value}
              className={[
                'group flex cursor-pointer gap-3 rounded-md border border-line bg-surface px-4 py-3.5',
                'transition-[background-color,border-color] duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
                'hover:border-line-hover has-checked:border-accent-border has-checked:bg-accent-soft',
              ].join(' ')}
            >
              <input
                type="radio"
                name="scope"
                value={option.value}
                defaultChecked={index === 0}
                className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <option.icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                  <span className="text-sm font-medium text-ink">{option.label}</span>
                  {option.recommended ? (
                    <Badge tone="neutral">Most common</Badge>
                  ) : null}
                </span>

                <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                  {option.summary}
                </span>

                <span className="mt-2 grid gap-1.5 border-t border-line pt-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
                  <span className="eyebrow sm:pt-0.5">Choose it when</span>
                  <span className="text-xs leading-relaxed text-ink-muted">{option.when}</span>

                  <span className="eyebrow sm:pt-0.5">Label carries</span>
                  <span className="min-w-0 text-xs leading-relaxed text-ink-muted">
                    <span className="mono break-all text-ink">{option.carries}</span>
                    <span className="mt-0.5 block text-ink-subtle">{option.carriesNote}</span>
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit" loading={pending} disabled={Boolean(gtinProblem)}>
          Create passport
        </Button>
        <Button asChild variant="ghost">
          <Link href="/console/passports">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
