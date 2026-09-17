import { cn } from '@/lib/utils';

/**
 * A person, at four sizes.
 *
 * This exists because the same eight lines of initials-from-a-name had been
 * written out three times — in the console rail, in the team table, and in the
 * partner bar — and the three had already drifted on size, ring and weight.
 * Initials are a tiny piece of logic with a surprising number of wrong
 * answers (one-word names, names with three parts, a name that is an email
 * address, an empty string), so it is worth having exactly one of them.
 *
 * There is deliberately no photograph. `users.avatar_url` exists in the
 * schema, but a compliance console that renders an arbitrary remote image for
 * every row is loading third-party assets onto a page showing regulated data,
 * and the identity question this element answers — "is this the right person"
 * — is already answered by the name next to it.
 */

const SIZES = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-7 text-2xs',
  md: 'size-8 text-2xs',
  lg: 'size-10 text-xs',
} as const;

export function Avatar({
  name,
  size = 'md',
  tone = 'default',
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  /** `rail` inverts it for the dark navigation ground. */
  tone?: 'default' | 'rail';
  className?: string;
}) {
  return (
    <span
      // Decorative: the name it belongs to is always rendered beside it, and a
      // screen reader announcing "AO" before "Ada Okonkwo" is noise.
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        SIZES[size],
        tone === 'rail'
          ? 'bg-rail-raised text-rail-ink ring-1 ring-white/10'
          : 'bg-surface-sunken text-ink-muted ring-1 ring-line',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Up to two letters from a name.
 *
 * An email address is reduced to its local part first, because "ad" from
 * `ada@…` is a better answer than "A@". Punctuation-only fragments are
 * skipped so `Jean-Luc Picard` gives JP rather than J-.
 */
export function initials(name: string): string {
  const source = name.includes('@') ? name.split('@')[0]! : name;
  const parts = source
    .split(/[\s._-]+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
