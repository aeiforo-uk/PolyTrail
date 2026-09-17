'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { DISPLAY_FONTS, fontStack, isValidAccentColor } from '@/lib/branding';
import { saveBranding, type SettingsState } from './actions';

export interface BrandingValues {
  accentColor: string;
  displayFont: string;
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  footerText: string;
  supportUrl: string;
  customDomain: string;
}

/**
 * Branding, with the preview beside the controls rather than behind a button.
 *
 * The thing being styled is a document a stranger will read on a phone in a
 * shop, so the only useful feedback loop is seeing the header change as you
 * type. The preview is rendered from the same values that get saved.
 */
export function BrandingForm({
  values,
  brandName,
  domainVerifiedAt,
}: {
  values: BrandingValues;
  brandName: string;
  domainVerifiedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveBranding, {});
  const [draft, setDraft] = React.useState(values);
  const error = (key: keyof BrandingValues) => state.fieldErrors?.[key] ?? null;
  const set = (key: keyof BrandingValues) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const domainDirty = draft.customDomain !== values.customDomain;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <form action={formAction} className="flex min-w-0 flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Accent colour"
            htmlFor="accentColor"
            hint="Hex or oklch(). Used sparingly, for the header rule and links."
            error={error('accentColor')}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-9.5 shrink-0 rounded-md border border-line-strong"
                style={{
                  backgroundColor: isValidAccentColor(draft.accentColor)
                    ? draft.accentColor
                    : 'transparent',
                }}
              />
              <Input
                id="accentColor"
                name="accentColor"
                value={draft.accentColor}
                onChange={(event) => set('accentColor')(event.target.value)}
                placeholder="#8a2c25"
                className="mono"
              />
            </div>
          </Field>

          <Field label="Display typeface" htmlFor="displayFont" error={error('displayFont')}>
            <NativeSelect
              id="displayFont"
              name="displayFont"
              value={draft.displayFont}
              onChange={(event) => set('displayFont')(event.target.value)}
            >
              <option value="">Polytrail default</option>
              {DISPLAY_FONTS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Logo" htmlFor="logoUrl" hint="https:// only." error={error('logoUrl')}>
            <Input
              id="logoUrl"
              name="logoUrl"
              value={draft.logoUrl}
              onChange={(event) => set('logoUrl')(event.target.value)}
              placeholder="https://cdn.yourbrand.com/logo.svg"
            />
          </Field>

          <Field
            label="Logo for dark backgrounds"
            htmlFor="logoDarkUrl"
            error={error('logoDarkUrl')}
          >
            <Input
              id="logoDarkUrl"
              name="logoDarkUrl"
              value={draft.logoDarkUrl}
              onChange={(event) => set('logoDarkUrl')(event.target.value)}
            />
          </Field>

          <Field label="Favicon" htmlFor="faviconUrl" error={error('faviconUrl')}>
            <Input
              id="faviconUrl"
              name="faviconUrl"
              value={draft.faviconUrl}
              onChange={(event) => set('faviconUrl')(event.target.value)}
            />
          </Field>

          <Field
            label="Support link"
            htmlFor="supportUrl"
            hint="Where a shopper goes with a question."
            error={error('supportUrl')}
          >
            <Input
              id="supportUrl"
              name="supportUrl"
              value={draft.supportUrl}
              onChange={(event) => set('supportUrl')(event.target.value)}
            />
          </Field>

          <Field
            label="Footer text"
            htmlFor="footerText"
            className="sm:col-span-2"
            error={error('footerText')}
          >
            <Textarea
              id="footerText"
              name="footerText"
              className="min-h-16"
              value={draft.footerText}
              onChange={(event) => set('footerText')(event.target.value)}
              placeholder="© 2026 Your Brand Ltd. Registered in Portugal."
            />
          </Field>

          <Field
            label="Custom domain"
            htmlFor="customDomain"
            className="sm:col-span-2"
            hint="A bare hostname. Point a CNAME at us, then we verify it."
            error={error('customDomain')}
          >
            <Input
              id="customDomain"
              name="customDomain"
              value={draft.customDomain}
              onChange={(event) => set('customDomain')(event.target.value)}
              placeholder="passport.yourbrand.com"
              className="mono"
            />
          </Field>
        </div>

        {draft.customDomain ? (
          <p
            className={
              domainVerifiedAt && !domainDirty
                ? 'flex items-center gap-2 text-sm text-positive'
                : 'flex items-center gap-2 text-sm text-caution'
            }
          >
            {domainVerifiedAt && !domainDirty ? (
              <>
                <CircleCheck className="size-4 shrink-0" aria-hidden />
                Verified on {domainVerifiedAt}. Passports resolve at this domain.
              </>
            ) : (
              <>
                <CircleDashed className="size-4 shrink-0" aria-hidden />
                Not verified yet. Passports keep resolving at their Polytrail address until it is.
              </>
            )}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Save branding
          </Button>
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

      <PassportHeaderPreview draft={draft} brandName={brandName} />
    </div>
  );
}

/**
 * The top of the public passport, as it will actually be served.
 *
 * Not a swatch board: the same order, the same weights and the same type as
 * `/p/[dppId]`, in a device frame at roughly the width it is read at. The
 * question a brand is answering here is "does our colour survive on the paper
 * a stranger will read it on, in a shop, on a phone" — and a hex field next to
 * a coloured square cannot answer it.
 */
function PassportHeaderPreview({
  draft,
  brandName,
}: {
  draft: BrandingValues;
  brandName: string;
}) {
  const accent = isValidAccentColor(draft.accentColor) ? draft.accentColor : undefined;
  const font = fontStack(draft.displayFont);

  return (
    <aside className="min-w-0">
      <div className="sticky top-6">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="eyebrow">Public passport</p>
          <p className="text-2xs text-ink-subtle">live preview</p>
        </div>

        {/* A phone-shaped frame, because that is the only device this document
            is read on in practice. */}
        <div className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-xs">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-sunken px-3 py-1.5">
            <span className="mono truncate text-2xs text-ink-subtle">
              {draft.customDomain || 'polytrail.eu'}/p/XK4T-9PMB…
            </span>
            {draft.faviconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.faviconUrl} alt="" className="size-3.5 shrink-0 rounded-xs" />
            ) : (
              <span aria-hidden className="size-3.5 shrink-0 rounded-xs bg-line-strong" />
            )}
          </div>

          <div className="bg-canvas px-5 py-6">
            <div className="flex items-center justify-between gap-4">
              {draft.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.logoUrl}
                  alt={`${brandName} logo`}
                  className="h-5 max-w-28 object-contain"
                />
              ) : (
                <span className="text-sm font-semibold tracking-[-0.01em] text-ink">
                  {brandName}
                </span>
              )}
              <span className="eyebrow">Product passport</span>
            </div>

            <div className="mt-5 flex items-start gap-4">
              <span
                aria-hidden
                className="flex size-16 shrink-0 items-center justify-center rounded-md border border-line bg-surface-sunken"
              >
                <QrCode className="size-5 text-ink-subtle" />
              </span>
              <div className="min-w-0">
                <h3
                  className="text-3xl leading-tight text-ink"
                  style={{ fontFamily: font }}
                >
                  Merino Crew Neck
                </h3>
                <p className="mt-1.5 text-xs text-ink-muted">
                  Knitwear · Navy · Size M
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {[
                ['SKU', 'MC-2601-NV'],
                ['GTIN', '08712345678906'],
              ].map(([label, value]) => (
                <span
                  key={label}
                  className="inline-flex items-baseline gap-1.5 rounded-xl border border-line bg-surface-sunken px-2 py-0.5"
                >
                  <span className="text-2xs tracking-[0.07em] text-ink-subtle uppercase">
                    {label}
                  </span>
                  <span className="mono text-2xs text-ink">{value}</span>
                </span>
              ))}
            </div>

            {/* The accent earns its keep on exactly two things: the verdict rule
                and the links. Showing it anywhere else here would flatter it. */}
            <div className="mt-5 border-t border-line pt-4">
              <p
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: accent ?? 'var(--color-accent)' }}
              >
                <CircleCheck className="size-4 shrink-0" aria-hidden />
                Fully traceable to the fibre
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Four tiers mapped · 62% recycled content · repairable
              </p>
            </div>

            <div className="mt-5 border-t border-line pt-3">
              <p className="text-2xs leading-relaxed text-ink-subtle">
                {draft.footerText || 'Your footer text appears here.'}
              </p>
              {draft.supportUrl ? (
                <p
                  className="mt-1 text-2xs underline underline-offset-2"
                  style={{ color: accent ?? 'var(--color-accent)' }}
                >
                  Questions about this product
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <p className="mt-2 text-2xs leading-relaxed text-ink-subtle">
          {draft.customDomain
            ? `Served from ${draft.customDomain} once the domain is verified; until then, from your Polytrail address.`
            : 'Served from your Polytrail passport address. Add a custom domain above to serve it from your own.'}
        </p>
      </div>
    </aside>
  );
}
