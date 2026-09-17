/**
 * Locales.
 *
 * The ESPR expects a passport to be readable in the language of the market
 * where the product is sold, so locale is a product requirement here, not a
 * nice-to-have. Locale is resolved from a cookie, then `Accept-Language`, and
 * never from a URL prefix — a QR code printed on a care label has to resolve
 * to one stable URL that then adapts to whoever scans it.
 */
export const LOCALES = ['en', 'de', 'fr', 'it', 'es', 'nl'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  nl: 'Nederlands',
};

export const LOCALE_COOKIE = 'polytrail_locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Best match from an `Accept-Language` header, falling back to English. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: (tag ?? '').toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
