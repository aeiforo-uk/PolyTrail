import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { DNS_CHALLENGE_PREFIX } from './types';

/**
 * Domain control, proven the way every certificate authority proves it.
 *
 * A TXT record under a scoped label is the only check on this ladder that a
 * brand cannot pass by controlling an inbox. It is also the one that matters
 * for a passport, because GS1's provisional ESPR standard prefers the
 * brand-owner domain over `id.gs1.org` — so the domain in a garment's QR code
 * is a claim about identity, and it should have been proven.
 */

/** `example.com` — no scheme, no path, no trailing dot, lower case. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function isValidDomain(domain: string): boolean {
  return DOMAIN.test(domain);
}

/**
 * The value the operator publishes.
 *
 * 128 bits of entropy, prefixed so that a DNS administrator reading a zone file
 * in two years' time can tell what it is for without asking anyone.
 */
export function generateDomainChallenge(): string {
  return `polytrail-site-verification=${randomBytes(16).toString('base64url')}`;
}

export function challengeRecordName(domain: string): string {
  return `${DNS_CHALLENGE_PREFIX}.${domain}`;
}

export type DomainCheckOutcome = 'verified' | 'not_found' | 'mismatch' | 'lookup_failed';

export interface DomainCheckResult {
  outcome: DomainCheckOutcome;
  /** What to tell the operator, in the words they need to act on. */
  detail: string;
  /** Values actually found at the record, for the "here is what we saw" panel. */
  found: string[];
}

/** Injected in tests. Production passes `node:dns/promises`. */
export type TxtResolver = (hostname: string) => Promise<string[][]>;

export async function checkDomainChallenge(
  domain: string,
  expected: string,
  resolver: TxtResolver = resolveTxt,
): Promise<DomainCheckResult> {
  const name = challengeRecordName(domain);

  let chunks: string[][];
  try {
    chunks = await resolver(name);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return {
        outcome: 'not_found',
        detail: `No TXT record exists at ${name}. DNS changes can take up to an hour to propagate — if you have just added it, wait and check again.`,
        found: [],
      };
    }
    return {
      outcome: 'lookup_failed',
      detail: `The DNS lookup for ${name} failed${code ? ` (${code})` : ''}. This is a problem at our end or your resolver's, not with your record.`,
      found: [],
    };
  }

  // A TXT record longer than 255 bytes arrives split into chunks, and a
  // resolver that returns them unjoined is the classic reason a correct record
  // "does not verify".
  const values = chunks.map((chunk) => chunk.join(''));

  if (values.length === 0) {
    return {
      outcome: 'not_found',
      detail: `No TXT record exists at ${name}.`,
      found: [],
    };
  }

  if (values.some((value) => value.trim() === expected)) {
    return { outcome: 'verified', detail: `Found the expected record at ${name}.`, found: values };
  }

  return {
    outcome: 'mismatch',
    detail: `${name} exists but none of its values match the challenge. Check for a truncated paste, or an old challenge left in place.`,
    found: values,
  };
}
