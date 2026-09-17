'use client';

import { useActionState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Meter } from '@/components/viz/meter';
import { saveIdentity, type SettingsState } from './actions';
import { IDENTITY_GROUPS, identityFilled, type IdentityValues } from './identity-groups';

export type { IdentityValues };
/**
 * Workspace identity.
 *
 * Grouped by the instrument that asks for the field rather than run together as
 * one long form. The previous version put an LEI next to a postcode next to a
 * VAT number, which reads as a profile page; it is not one. A brand filling
 * this in is answering four different regulators, and telling them which is
 * which is the difference between a form that feels arbitrary and one that
 * explains itself.
 */
export function IdentityForm({ values }: { values: IdentityValues }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveIdentity, {});
  const error = (key: keyof IdentityValues) => state.fieldErrors?.[key] ?? null;

  return (
    <form action={formAction} className="flex flex-col gap-px overflow-hidden rounded-lg border border-line bg-line">
      {IDENTITY_GROUPS.map((group) => {
        const filled = identityFilled(values, group.fields);
        return (
          <section
            key={group.id}
            aria-labelledby={`identity-${group.id}`}
            className="bg-surface px-5 py-5"
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
              <div className="min-w-0">
                <h3 id={`identity-${group.id}`} className="text-sm font-semibold text-ink">
                  {group.title}
                </h3>
                <p className="mt-1 text-2xs text-ink-subtle">{group.instrument}</p>
                <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-muted">
                  {group.why}
                </p>
                <Meter
                  className="mt-3"
                  value={(filled / group.fields.length) * 100}
                  size={34}
                  thickness={3.5}
                  label={`${filled} of ${group.fields.length}`}
                  sublabel={filled === group.fields.length ? 'complete' : 'filled in'}
                />
              </div>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {group.id === 'law' ? (
                  <>
                    <Field
                      label="Registered legal name"
                      htmlFor="legalName"
                      required
                      error={error('legalName')}
                      className="sm:col-span-2"
                    >
                      <Input id="legalName" name="legalName" defaultValue={values.legalName} required />
                    </Field>

                    <Field
                      label="Trading name"
                      htmlFor="tradeName"
                      hint="Shown to shoppers where it differs from the legal name."
                      error={error('tradeName')}
                    >
                      <Input id="tradeName" name="tradeName" defaultValue={values.tradeName} />
                    </Field>

                    <Field
                      label="Country of establishment"
                      htmlFor="country"
                      required
                      hint="Two-letter ISO code, e.g. PT."
                      error={error('country')}
                    >
                      <Input
                        id="country"
                        name="country"
                        defaultValue={values.country}
                        maxLength={2}
                        className="mono uppercase"
                        required
                      />
                    </Field>
                  </>
                ) : null}

                {group.id === 'reach' ? (
                  <>
                    <Field
                      label="Contact email"
                      htmlFor="contactEmail"
                      hint="Published, so an authority or a repairer can reach you."
                      error={error('contactEmail')}
                    >
                      <Input
                        id="contactEmail"
                        name="contactEmail"
                        type="email"
                        defaultValue={values.contactEmail}
                      />
                    </Field>

                    <Field label="Website" htmlFor="website" error={error('website')}>
                      <Input id="website" name="website" type="url" defaultValue={values.website} />
                    </Field>

                    <Field
                      label="Street"
                      htmlFor="addressLine1"
                      error={error('addressLine1')}
                      className="sm:col-span-2"
                    >
                      <Input id="addressLine1" name="addressLine1" defaultValue={values.addressLine1} />
                    </Field>

                    <Field
                      label="Line 2"
                      htmlFor="addressLine2"
                      error={error('addressLine2')}
                      className="sm:col-span-2"
                    >
                      <Input id="addressLine2" name="addressLine2" defaultValue={values.addressLine2} />
                    </Field>

                    <Field label="City" htmlFor="addressCity" error={error('addressCity')}>
                      <Input id="addressCity" name="addressCity" defaultValue={values.addressCity} />
                    </Field>

                    <Field label="Region" htmlFor="addressRegion" error={error('addressRegion')}>
                      <Input id="addressRegion" name="addressRegion" defaultValue={values.addressRegion} />
                    </Field>

                    <Field
                      label="Postcode"
                      htmlFor="addressPostalCode"
                      error={error('addressPostalCode')}
                    >
                      <Input
                        id="addressPostalCode"
                        name="addressPostalCode"
                        defaultValue={values.addressPostalCode}
                      />
                    </Field>

                    <Field
                      label="Country"
                      htmlFor="addressCountry"
                      hint="Defaults to the country of establishment."
                      error={error('addressCountry')}
                    >
                      <Input
                        id="addressCountry"
                        name="addressCountry"
                        defaultValue={values.addressCountry}
                        maxLength={2}
                        className="mono uppercase"
                      />
                    </Field>
                  </>
                ) : null}

                {group.id === 'registry' ? (
                  <>
                    <Field
                      label="LEI"
                      htmlFor="lei"
                      hint="20 characters, ending in two check digits."
                      error={error('lei')}
                      basis="ISO 17442"
                      className="sm:col-span-2"
                    >
                      <Input
                        id="lei"
                        name="lei"
                        defaultValue={values.lei}
                        maxLength={20}
                        className="mono uppercase"
                      />
                    </Field>

                    <Field
                      label="GLN"
                      htmlFor="gln"
                      hint="13 digits, including the GS1 check digit."
                      error={error('gln')}
                      basis="GS1"
                    >
                      <Input
                        id="gln"
                        name="gln"
                        defaultValue={values.gln}
                        maxLength={13}
                        inputMode="numeric"
                        className="mono"
                      />
                    </Field>

                    <Field
                      label="GS1 company prefix"
                      htmlFor="gs1CompanyPrefix"
                      hint="6 to 12 digits. Mints GTIN-based Digital Link URIs."
                      error={error('gs1CompanyPrefix')}
                      basis="GS1"
                    >
                      <Input
                        id="gs1CompanyPrefix"
                        name="gs1CompanyPrefix"
                        defaultValue={values.gs1CompanyPrefix}
                        maxLength={12}
                        inputMode="numeric"
                        className="mono"
                      />
                    </Field>
                  </>
                ) : null}

                {group.id === 'customs' ? (
                  <>
                    <Field label="VAT number" htmlFor="vatNumber" error={error('vatNumber')}>
                      <Input
                        id="vatNumber"
                        name="vatNumber"
                        defaultValue={values.vatNumber}
                        className="mono"
                      />
                    </Field>

                    <Field
                      label="EORI number"
                      htmlFor="eoriNumber"
                      hint="Two-letter country code, then up to 15 characters."
                      error={error('eoriNumber')}
                    >
                      <Input
                        id="eoriNumber"
                        name="eoriNumber"
                        defaultValue={values.eoriNumber}
                        className="mono uppercase"
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 bg-surface px-5 py-4">
        <Button type="submit" loading={pending}>
          Save identity
        </Button>
        <p className="text-xs text-ink-muted">
          Changes apply to passports published from now on. Already-published passports keep the
          operator details they were published with.
        </p>
        {state.ok ? (
          <span className="flex items-center gap-1.5 text-sm text-positive" role="status">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {state.ok}
          </span>
        ) : null}
        {state.error ? (
          <span className="flex items-center gap-1.5 text-sm text-critical" role="alert">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
