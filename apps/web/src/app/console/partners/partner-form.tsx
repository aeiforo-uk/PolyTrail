'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import type { PartnerFormState } from '@/lib/partners/actions';
import {
  COUNTRY_OPTIONS,
  PARTNER_ROLE_GROUPS,
  SUPPLY_TIERS,
  type PartnerRole,
  type SupplyTier,
} from '@/lib/partners/vocab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';

export interface PartnerFormValues {
  name?: string;
  legalName?: string | null;
  tier?: SupplyTier;
  roles?: readonly PartnerRole[];
  country?: string;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  gln?: string | null;
  osId?: string | null;
  lei?: string | null;
  did?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  workerCount?: number | null;
  capabilities?: readonly string[];
  notes?: string | null;
}

/**
 * One form for create and edit.
 *
 * Checkboxes rather than a multi-select for roles: a facility routinely holds
 * four or five, and a multi-select hides everything the user has not scrolled
 * to. The whole form posts as a plain `FormData`, so it submits with
 * JavaScript disabled and the client component only adds the pending state.
 */
export function PartnerForm({
  action,
  values = {},
  submitLabel,
  cancelHref,
}: {
  action: (state: PartnerFormState, form: FormData) => Promise<PartnerFormState>;
  values?: PartnerFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, submit, pending] = useActionState<PartnerFormState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};
  const selectedRoles = new Set(values.roles ?? []);

  return (
    <form action={submit} className="flex max-w-3xl flex-col gap-6">
      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>The facility</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={errors.name}>
            <Input id="name" name="name" defaultValue={values.name ?? ''} required autoFocus />
          </Field>

          <Field
            label="Registered name"
            htmlFor="legalName"
            hint="Only if it differs from the name you use day to day."
            error={errors.legalName}
          >
            <Input id="legalName" name="legalName" defaultValue={values.legalName ?? ''} />
          </Field>

          <Field label="Tier" htmlFor="tier" required error={errors.tier}>
            <NativeSelect id="tier" name="tier" defaultValue={values.tier ?? ''} required>
              <option value="" disabled>
                Choose a tier
              </option>
              {SUPPLY_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label} — {tier.hint}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Country" htmlFor="country" required error={errors.country}>
            <NativeSelect id="country" name="country" defaultValue={values.country ?? ''} required>
              <option value="" disabled>
                Choose a country
              </option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-ink">
              Roles
              <span className="ml-1 text-critical" aria-label="required">
                *
              </span>
            </legend>
            <p className="mt-1 mb-3 text-xs text-ink-muted">
              What this facility does for you. It decides which questions they are asked.
            </p>
            {errors.roles ? (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-critical" role="alert">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                {errors.roles}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              {PARTNER_ROLE_GROUPS.map((group) => (
                <div key={group.group}>
                  <p className="eyebrow mb-1.5">{group.group}</p>
                  <ul className="flex flex-col gap-1">
                    {group.roles.map((role) => (
                      <li key={role.value}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            name="roles"
                            value={role.value}
                            defaultChecked={selectedRoles.has(role.value)}
                            className="size-4 rounded-xs border-line-strong accent-accent"
                          />
                          {role.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identifiers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="GLN"
            htmlFor="gln"
            basis="ESPR Annex III ¶2"
            hint="13 digits. This is the authoritative facility identifier and the one that goes on the passport."
            error={errors.gln}
          >
            <Input
              id="gln"
              name="gln"
              className="mono"
              inputMode="numeric"
              maxLength={13}
              placeholder="5012345678900"
              defaultValue={values.gln ?? ''}
            />
          </Field>

          <Field
            label="Open Supply Hub ID"
            htmlFor="osId"
            basis="Supplementary only"
            hint="Useful for cross-referencing audits, but the JRC rejected Open Supply Hub as not a formal identifier scheme. It never replaces the GLN."
            error={errors.osId}
          >
            <Input
              id="osId"
              name="osId"
              className="mono"
              placeholder="PT2021046AB1CDE"
              defaultValue={values.osId ?? ''}
            />
          </Field>

          <Field label="LEI" htmlFor="lei" hint="20 characters, for the legal entity." error={errors.lei}>
            <Input id="lei" name="lei" className="mono" maxLength={20} defaultValue={values.lei ?? ''} />
          </Field>

          <Field
            label="DID"
            htmlFor="did"
            hint="If this facility already issues verifiable credentials."
            error={errors.did}
          >
            <Input id="did" name="did" className="mono" defaultValue={values.did ?? ''} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where it is</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="line1" error={errors.line1} className="sm:col-span-2">
            <Input id="line1" name="line1" defaultValue={values.line1 ?? ''} />
          </Field>
          <Field label="Address line 2" htmlFor="line2" error={errors.line2} className="sm:col-span-2">
            <Input id="line2" name="line2" defaultValue={values.line2 ?? ''} />
          </Field>
          <Field label="City" htmlFor="city" error={errors.city}>
            <Input id="city" name="city" defaultValue={values.city ?? ''} />
          </Field>
          <Field label="Region" htmlFor="region" error={errors.region}>
            <Input id="region" name="region" defaultValue={values.region ?? ''} />
          </Field>
          <Field label="Postcode" htmlFor="postalCode" error={errors.postalCode}>
            <Input id="postalCode" name="postalCode" defaultValue={values.postalCode ?? ''} />
          </Field>
          <div />
          <Field
            label="Latitude"
            htmlFor="latitude"
            hint="Shown on the public supply-chain map."
            error={errors.latitude}
          >
            <Input id="latitude" name="latitude" className="mono" defaultValue={values.latitude ?? ''} />
          </Field>
          <Field label="Longitude" htmlFor="longitude" error={errors.longitude}>
            <Input
              id="longitude"
              name="longitude"
              className="mono"
              defaultValue={values.longitude ?? ''}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who answers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="contactName" error={errors.contactName}>
            <Input id="contactName" name="contactName" defaultValue={values.contactName ?? ''} />
          </Field>
          <Field
            label="Contact email"
            htmlFor="contactEmail"
            hint="Where data requests are sent. No account is needed to answer one."
            error={errors.contactEmail}
          >
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={values.contactEmail ?? ''}
            />
          </Field>
          <Field label="Workers on site" htmlFor="workerCount" error={errors.workerCount}>
            <Input
              id="workerCount"
              name="workerCount"
              inputMode="numeric"
              defaultValue={values.workerCount?.toString() ?? ''}
            />
          </Field>
          <Field
            label="Capabilities"
            htmlFor="capabilities"
            hint="Comma separated, e.g. reactive dyeing, digital print, GOTS line."
            error={errors.capabilities}
          >
            <Input
              id="capabilities"
              name="capabilities"
              defaultValue={(values.capabilities ?? []).join(', ')}
            />
          </Field>
          <Field label="Notes" htmlFor="notes" error={errors.notes} className="sm:col-span-2">
            <Textarea id="notes" name="notes" rows={3} defaultValue={values.notes ?? ''} />
          </Field>
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
        Facility names are withheld from the public passport by default; the country is published.
        Change that per field in workspace settings.
      </p>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        <Button asChild variant="ghost" type="button">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
