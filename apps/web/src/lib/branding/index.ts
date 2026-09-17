import { z } from 'zod';

/**
 * White-label appearance for the public passport.
 *
 * Deliberately narrow: an accent colour, a display typeface, three image slots
 * and a little footer copy. A brand that can restyle every surface will
 * eventually produce a passport that does not look like a passport, and the
 * whole value of the document is that a market-surveillance officer can read
 * one in the same shape every time.
 */

/** Typefaces we can actually serve. Anything else is a broken preview in production. */
export const DISPLAY_FONTS = [
  { value: 'serif', label: 'Editorial serif', stack: 'Georgia, "Times New Roman", serif' },
  { value: 'sans', label: 'Neutral sans', stack: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { value: 'grotesk', label: 'Grotesk', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { value: 'humanist', label: 'Humanist', stack: 'Optima, Candara, "Gill Sans", sans-serif' },
  { value: 'mono', label: 'Monospace', stack: 'ui-monospace, "SF Mono", Menlo, monospace' },
] as const;

export type DisplayFont = (typeof DISPLAY_FONTS)[number]['value'];

export function fontStack(value: string | null | undefined): string {
  return DISPLAY_FONTS.find((f) => f.value === value)?.stack ?? DISPLAY_FONTS[0].stack;
}

/**
 * Accept only hex and OKLCH, and only in the two forms the public passport
 * writes into a CSS custom property. Anything freer is a stylesheet injection
 * dressed up as a colour picker.
 */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const OKLCH = /^oklch\(\s*\d{1,3}(?:\.\d+)?%\s+\d(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?\s*\)$/;

export function isValidAccentColor(value: string): boolean {
  return HEX.test(value.trim()) || OKLCH.test(value.trim());
}

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === '' || /^https:\/\//.test(v), {
    message: 'Use a full https:// address.',
  })
  .transform((v) => (v === '' ? null : v));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v));

export const brandingSchema = z.object({
  accentColor: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidAccentColor(v), {
      message: 'Use a hex colour like #8a2c25, or an oklch() value.',
    })
    .transform((v) => (v === '' ? null : v)),
  displayFont: z
    .string()
    .trim()
    .refine((v) => v === '' || DISPLAY_FONTS.some((f) => f.value === v), {
      message: 'Choose one of the listed typefaces.',
    })
    .transform((v) => (v === '' ? null : v)),
  logoUrl: optionalUrl,
  logoDarkUrl: optionalUrl,
  faviconUrl: optionalUrl,
  footerText: optionalText(500),
  supportUrl: optionalUrl,
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .refine((v) => v === '' || /^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/.test(v), {
      message: 'Enter a bare hostname, like passport.yourbrand.com — no https:// and no trailing slash.',
    })
    .transform((v) => (v === '' ? null : v)),
});

export type BrandingInput = z.input<typeof brandingSchema>;
export type Branding = z.output<typeof brandingSchema>;

/** What the public passport falls back to when a brand has set nothing. */
export const DEFAULT_BRANDING: Branding = {
  accentColor: null,
  displayFont: null,
  logoUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  footerText: null,
  supportUrl: null,
  customDomain: null,
};

export function resolveBranding(row: Partial<Branding> | null | undefined): Branding {
  return { ...DEFAULT_BRANDING, ...(row ?? {}) };
}
