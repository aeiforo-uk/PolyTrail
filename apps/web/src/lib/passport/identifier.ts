/**
 * Public passport identifiers.
 *
 * Constraints, in the order that decided the design:
 *   • It is printed on a care label and sometimes typed in by hand, so it has
 *     to be short and unambiguous. Crockford's base32 alphabet drops I, L, O
 *     and U, which removes the 1/I/l and 0/O confusions and the only letter
 *     combination that reliably produces an offensive string.
 *   • It must not leak volume. A sequential ID tells a competitor how many
 *     products you have published, so this is random, not counted.
 *   • 16 characters of base32 is 80 bits. At a billion passports the
 *     probability of any collision is around 4 × 10⁻⁴, and the unique index on
 *     `passports.dpp_id` catches even that.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 16;

/**
 * Uses Web Crypto rather than `node:crypto` deliberately.
 *
 * This module is imported by client components that only want `formatDppId` or
 * `normalizeDppId`, and a module-scope `node:crypto` import makes the whole
 * file unbundlable for the browser — a failure that type-checking does not
 * catch and that only shows up as a build error. `crypto.getRandomValues` is
 * present in Node 19+ and in every browser, so one implementation serves both.
 *
 * The alphabet has 32 members and 256 is a whole multiple of 32, so taking the
 * byte modulo the alphabet length introduces no bias.
 */
export function generateDppId(): string {
  const bytes = new Uint8Array(LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Normalise user input: strip separators, uppercase, fix common mistypes. */
export function normalizeDppId(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

export function isValidDppId(input: string): boolean {
  const normalized = normalizeDppId(input);
  return normalized.length === LENGTH && [...normalized].every((c) => ALPHABET.includes(c));
}

/** Display form, grouped in fours so a human can read it off a label. */
export function formatDppId(id: string): string {
  return (id.match(/.{1,4}/g) ?? [id]).join('-');
}

/** The canonical public URL for a passport. */
export function passportUrl(dppId: string, base?: string): string {
  const root = (
    base ??
    process.env.NEXT_PUBLIC_RESOLVER_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'http://localhost:3000'
  ).replace(/\/+$/, '');
  return `${root}/p/${dppId}`;
}
