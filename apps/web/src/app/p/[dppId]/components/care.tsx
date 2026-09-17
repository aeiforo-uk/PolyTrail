import { CARE_SYMBOLS, type CareSymbol } from '@/lib/passport/vocab';
import type { PassportPayload } from '@/lib/passport/schema';
import { CareSymbolIcon } from './care-symbol';
import { Eyebrow, Row } from './section';

/**
 * Care and repair.
 *
 * Symbols *and* words, always. The pictogram system is genuinely useful to
 * people who know it and a puzzle to everyone else, and there is no reason a
 * digital surface should reproduce the constraint of a woven label that had
 * five centimetres to work with.
 */
export function CareSection({ payload, locale }: { payload: Partial<PassportPayload>; locale: string }) {
  const care = payload.care;
  if (!care?.symbols?.length && !care?.instructions) {
    return (
      <p className="rounded-md border border-dashed border-line-strong bg-surface-sunken/50 px-4 py-3 text-sm text-ink-muted">
        Care information has not been published for this product yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-9">
      {care.symbols?.length ? (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
          {care.symbols.map((symbol) => (
            <li key={symbol} className="flex items-center gap-3">
              <CareSymbolIcon symbol={symbol as CareSymbol} className="size-9 shrink-0 text-ink" />
              <span className="text-sm leading-tight text-ink-muted">
                {CARE_SYMBOLS[symbol as CareSymbol]?.label ?? symbol}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {care.instructions ? (
        <p className="max-w-prose text-sm leading-relaxed text-ink">
          {localize(care.instructions, locale)}
        </p>
      ) : null}

      {care.lowImpactTips?.length ? (
        <div>
          <Eyebrow>Making it last</Eyebrow>
          <ul className="flex flex-col gap-2.5">
            {care.lowImpactTips.map((tip, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" aria-hidden />
                {localize(tip, locale)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {care.repair ? (
        <div>
          <Eyebrow>Repair</Eyebrow>
          {care.repair.instructions ? (
            <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink">
              {localize(care.repair.instructions, locale)}
            </p>
          ) : null}
          {care.repair.sparePartsAvailable !== undefined ? (
            <Row
              label="Spare parts"
              value={care.repair.sparePartsAvailable ? 'Available' : 'Not available'}
              note={
                care.repair.sparePartsUntil
                  ? `until ${formatDate(care.repair.sparePartsUntil)}`
                  : undefined
              }
            />
          ) : null}
          {care.repair.spareParts?.map((part, i) => (
            <Row key={i} indent={1} label={part.name} value={part.reference ?? '—'} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function localize(
  value: Record<string, string> | undefined,
  locale: string,
): string | undefined {
  if (!value) return undefined;
  return value[locale] ?? value.en ?? Object.values(value)[0];
}

export function formatDate(value: string | null | undefined, locale = 'en-GB'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
