/**
 * The operator verification ladder.
 *
 * The EU DPP Registry will not accept a filing from an operator whose identity
 * has not been established, and Art. 4 sets the bar at a qualified electronic
 * seal issued by a qualified trust service provider under eIDAS. No vendor in
 * the textile passport market mentions this requirement at all, which means
 * every "Registry-ready" claim currently on sale is missing its first gate.
 *
 * Polytrail models the whole ladder now. The first three rungs are real and
 * working; the fourth is described honestly as not implemented rather than
 * faked, because a product that reports a seal it does not hold is worse than
 * one that reports none.
 */

export const VERIFICATION_LEVELS = [
  'unverified',
  'email_confirmed',
  'domain_verified',
  'document_verified',
  'qualified_seal',
] as const;

export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

/** Ordinal rank, for "has this workspace reached at least X". */
export function rankOf(level: VerificationLevel): number {
  return VERIFICATION_LEVELS.indexOf(level);
}

export function atLeast(actual: VerificationLevel, required: VerificationLevel): boolean {
  return rankOf(actual) >= rankOf(required);
}

export interface LevelDefinition {
  level: VerificationLevel;
  label: string;
  /** How the level is proven, in one line. */
  method: string;
  /** What reaching it lets the workspace do. */
  unlocks: string;
  /** How long the evidence stands before it has to be re-established. `null` = indefinite. */
  validForDays: number | null;
  /** Why it expires when it does. */
  expiryBasis: string | null;
  /** The instrument that asks for it. */
  instrument: string;
  /** False where Polytrail describes the step but cannot yet perform it. */
  implemented: boolean;
}

export const LEVEL_DEFINITIONS: Record<VerificationLevel, LevelDefinition> = {
  unverified: {
    level: 'unverified',
    label: 'Unverified',
    method: 'Nothing has been established beyond the account that signed up.',
    unlocks: 'Draft passports. Nothing leaves the workspace.',
    validForDays: null,
    expiryBasis: null,
    instrument: '—',
    implemented: true,
  },
  email_confirmed: {
    level: 'email_confirmed',
    label: 'Email confirmed',
    method: 'A single-use token sent to the workspace contact address and returned.',
    unlocks: 'Publishing passports, and inviting suppliers to answer data requests.',
    // Deliberately indefinite: the address itself is re-confirmed whenever it
    // changes, so a fixed expiry would only produce busywork.
    validForDays: null,
    expiryBasis: null,
    instrument: 'Regulation (EU) 2019/1020 Art. 4 — contactable economic operator',
    implemented: true,
  },
  domain_verified: {
    level: 'domain_verified',
    label: 'Domain verified',
    method: 'A DNS TXT record published on the brand’s own domain and read back by Polytrail.',
    unlocks:
      'Passport URLs on your own domain, and the brand identity shown to anyone who scans a label.',
    validForDays: 365,
    expiryBasis: 'Domain registrations lapse and change hands, so control is re-proven yearly.',
    instrument: 'GS1 provisional ESPR standard — brand-owner domain resolution',
    implemented: true,
  },
  document_verified: {
    level: 'document_verified',
    label: 'Documents verified',
    method: 'Registration and identifier documents uploaded, then checked by a reviewer.',
    unlocks: 'Rehearsed Registry filings, and the operator identifier shown on the public passport.',
    validForDays: 730,
    expiryBasis: 'A company extract older than two years is no longer evidence of anything current.',
    instrument: 'EU DPP Registry Art. 4 — responsible economic operator identification',
    implemented: true,
  },
  qualified_seal: {
    level: 'qualified_seal',
    label: 'Qualified electronic seal',
    method:
      'A qualified electronic seal obtained from a QTSP on the EU Trusted List, applied to each filing.',
    unlocks: 'Filing of record with the EU DPP Registry.',
    // eIDAS permits up to three years for a qualified certificate; the Registry
    // inherits that ceiling for verified-operator status.
    validForDays: 1095,
    expiryBasis: 'A qualified certificate may be issued for at most three years under eIDAS.',
    instrument: 'Regulation (EU) 910/2014 (eIDAS) Art. 38 · EU DPP Registry Art. 4',
    implemented: false,
  },
};

export const LEVEL_ORDER: readonly VerificationLevel[] = VERIFICATION_LEVELS;

/** How a given level was established. Stored in `verifications.method`. */
export type VerificationMethod =
  | 'email_token'
  | 'dns_txt'
  | 'document_review'
  | 'qtsp_qualified_seal';

export const METHOD_FOR_LEVEL: Partial<Record<VerificationLevel, VerificationMethod>> = {
  email_confirmed: 'email_token',
  domain_verified: 'dns_txt',
  document_verified: 'document_review',
  qualified_seal: 'qtsp_qualified_seal',
};

/** The DNS label Polytrail looks under. Scoped so it cannot collide with SPF or DKIM. */
export const DNS_CHALLENGE_PREFIX = '_polytrail';

/** How long a challenge stays open before it has to be re-issued. */
export const EMAIL_TOKEN_TTL_HOURS = 24;
export const DOMAIN_CHALLENGE_TTL_DAYS = 30;

export interface LadderRung {
  definition: LevelDefinition;
  /** `verified` only when evidence exists, is unrevoked and is unexpired. */
  state: 'verified' | 'pending' | 'expired' | 'revoked' | 'not_started' | 'unavailable';
  verifiedAt: string | null;
  expiresAt: string | null;
  /** Free-text detail — the domain proven, the reviewer's note. Never evidence itself. */
  summary: string | null;
}

export interface LadderStatus {
  /** Highest level currently standing. */
  level: VerificationLevel;
  rungs: LadderRung[];
}
