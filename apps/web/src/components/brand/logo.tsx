import { cn } from '@/lib/utils';

/**
 * The Polytrail mark and wordmark.
 *
 * The wordmark was previously the product name set in Instrument Serif at
 * 16px, which read as a magazine masthead rather than as software — and it was
 * repeated as loose markup in four shells, so nothing kept them consistent.
 * This is the single source for both.
 *
 * The mark is a twill swatch: the rising diagonal that denim, gabardine and
 * chino are all woven in, knocked out of a solid squircle.
 *
 * Two earlier attempts failed at the size it actually gets used. A plain weave
 * broken at every crossing collapsed into an asterisk at 20px; the same weave
 * with one break per thread rendered as a hashtag, which is worse, because it
 * reads as something else entirely rather than as nothing. A twill is three
 * parallel strokes, so it survives being 16px in a browser tab, and the solid
 * ground gives it the presence a monoline glyph never has next to bold text.
 *
 * The knockout is a mask rather than strokes painted in a background colour,
 * so the page shows through and the mark is correct on any surface — the
 * sidebar, the inverted partner bar, a favicon — with no second asset and no
 * dark-mode variant.
 */

/*
 * The mask id is fixed rather than generated. Two marks on one page produce
 * duplicate ids, but both definitions are byte-identical, so every reference
 * resolves to the same shape. Generating one would mean a `useId` hook, which
 * would make this a client component and push a boundary into four server
 * shells for no visible difference.
 */
const MASK_ID = 'polytrail-twill';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-5 shrink-0', className)} aria-hidden>
      <mask id={MASK_ID}>
        <rect width="24" height="24" rx="6.5" fill="#fff" />
        <g stroke="#000" strokeWidth="2.8" strokeLinecap="round">
          <path d="M-2 10 10 -2" />
          <path d="M-2 22 22 -2" />
          <path d="M8 26 26 8" />
        </g>
      </mask>
      <rect width="24" height="24" rx="6.5" fill="currentColor" mask={`url(#${MASK_ID})`} />
    </svg>
  );
}

export function Logo({
  size = 'sm',
  tone = 'brand',
  subtitle,
  className,
}: {
  size?: 'sm' | 'md';
  /**
   * `brand` paints the mark in ink against a normal surface — dark, not the
   * accent, because the accent's job is to mark the action a person should
   * take, and a brand mark sitting permanently in a corner is not that.
   * `inherit`
   * takes `currentColor` for both, which is what an inverted bar needs — a
   * madder mark on near-black ink is unreadable, and hardcoding `text-ink`
   * there would paint the word the same colour as its background.
   */
  tone?: 'brand' | 'inherit';
  subtitle?: string;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark
        className={cn(size === 'md' ? 'size-6' : 'size-5', tone === 'brand' && 'text-ink')}
      />
      <span
        className={cn(
          // Geist 600 with tighter-than-body tracking. A wordmark is read as a
          // shape rather than letter by letter, so it takes the tracking a
          // heading would at twice the size.
          'font-sans font-semibold',
          tone === 'brand' && 'text-ink',
          size === 'md' ? 'text-[1.3125rem]' : 'text-[0.9375rem]',
        )}
        style={{ letterSpacing: '-0.022em' }}
      >
        Polytrail
      </span>
      {subtitle ? (
        <>
          <span
            className={cn(
              'h-3.5 w-px shrink-0',
              tone === 'brand' ? 'bg-line-strong' : 'bg-current opacity-30',
            )}
            aria-hidden
          />
          <span className={cn('eyebrow', tone === 'brand' ? 'text-ink-subtle' : 'opacity-70')}>
            {subtitle}
          </span>
        </>
      ) : null}
    </span>
  );
}
