import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, isLocale, negotiateLocale } from '@/lib/i18n/config';

const load = (locale: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as Record<
    string,
    Record<string, string>
  >;

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('locale catalogues', () => {
  const english = load('en');
  const englishKeys = flatten(english).sort();

  it.each(LOCALES.filter((l) => l !== 'en'))(
    '%s carries exactly the English key set',
    (locale) => {
      // A missing key silently falls back to English at runtime, which means a
      // half-translated page ships without anyone noticing. This is the guard.
      expect(flatten(load(locale)).sort()).toEqual(englishKeys);
    },
  );

  it.each(LOCALES.filter((l) => l !== 'en'))('%s is actually translated', (locale) => {
    const other = load(locale);
    const differing = flatten(other).filter((path) => {
      const read = (o: Record<string, unknown>) =>
        path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o);
      return read(other) !== read(english);
    });
    // Proper nouns and a few terms legitimately match; most strings must not.
    expect(differing.length).toBeGreaterThan(englishKeys.length * 0.7);
  });

  it('keeps ICU plural placeholders intact across locales', () => {
    for (const locale of LOCALES) {
      const withheld = load(locale).passport!.withheld!;
      expect(withheld).toContain('{count, plural,');
      expect(withheld).toContain('other {');
    }
  });
});

describe('locale negotiation', () => {
  it('reads the highest-quality supported language', () => {
    expect(negotiateLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(negotiateLocale('de-AT,de;q=0.9')).toBe('de');
  });

  it('skips unsupported languages rather than failing', () => {
    expect(negotiateLocale('pl-PL,pl;q=0.9,nl;q=0.5')).toBe('nl');
  });

  it('falls back to English for nothing supported, empty, or missing', () => {
    expect(negotiateLocale('ja-JP')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale('')).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
  });

  it('recognises supported locale codes', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('xx')).toBe(false);
  });
});
