/**
 * Access tiers for a textile Digital Product Passport.
 *
 * The ESPR framework does not give one linear ladder of privilege: a waste
 * operator legitimately needs disassembly and fibre-separation detail that a
 * wholesale buyer has no claim to, while that buyer sees commercial terms the
 * recycler never does. Modelling this as a rank (`public < restricted <
 * authority`) forces one of those audiences to over-share.
 *
 * So a field declares the *set* of audiences that may read it, with two
 * standing rules:
 *   1. `authority` reads everything — market surveillance is not negotiable.
 *   2. anything marked `public` is readable by every audience.
 */
export const ACCESS_TIERS = [
  'public',
  'consumer',
  'retailer',
  'repairer',
  'recycler',
  'authority',
] as const;

export type AccessTier = (typeof ACCESS_TIERS)[number];

export const TIER_LABELS: Record<AccessTier, string> = {
  public: 'Anyone',
  consumer: 'Verified owner',
  retailer: 'Trade partner',
  repairer: 'Repair partner',
  recycler: 'Waste operator',
  authority: 'Authority',
};

export const TIER_DESCRIPTIONS: Record<AccessTier, string> = {
  public: 'Visible to anyone who scans the label or opens the link.',
  consumer: 'Visible to the person who has registered ownership of this item.',
  retailer: 'Visible to wholesale, franchise and marketplace partners.',
  repairer: 'Visible to repair partners, including spare parts and construction detail.',
  recycler: 'Visible to sorters and recyclers, including fibre separation detail.',
  authority: 'Visible to market-surveillance and customs authorities. Sees everything.',
};

/** One row of the field registry: what a field is, and who may read it. */
export interface FieldEntry {
  /**
   * Dot-path into the passport payload. `*` is permitted only as a whole
   * segment, standing for "every element of this array/object", so that
   * repeated structures (fibres, facilities, certifications) are covered by
   * one rule rather than by an unmaintainable enumeration.
   */
  path: string;
  /** Audiences permitted to read the field. `authority` is always implied. */
  audiences: readonly AccessTier[];
  /** Short human label used in the field-visibility UI and in exports. */
  label: string;
  /** Why this field exists — the regulation, standard or scheme that asks for it. */
  basis: string;
  /** Whether a passport cannot be published without it. */
  required?: boolean;
  /** Marks data that is commercially sensitive, for the "what will be public" preview. */
  sensitive?: boolean;
  /**
   * Explicit regulated classification, where it differs from what the audience
   * set would imply. Set this only with a citation in `basis`.
   */
  regulated?: RegulatedTier;
  /**
   * `true` when the field is part of the content the JRC proposes to mandate
   * for textile apparel. Everything else Polytrail carries is either another
   * instrument's requirement (national law, EPR, the Forced Labour Regulation)
   * or a voluntary differentiator — and the product should never imply
   * otherwise to a brand filling it in.
   */
  espr?: boolean;
}

/** Does `caller` get to read a field offered to `audiences`? */
export function tierAllows(caller: AccessTier, audiences: readonly AccessTier[]): boolean {
  if (caller === 'authority') return true;
  if (audiences.includes('public')) return true;
  return audiences.includes(caller);
}

/**
 * The three tiers the textile delegated act is expected to recognise.
 *
 * Polytrail models audiences more finely than this — a repairer and a recycler
 * want different things, and a brand that wants to name its mills publicly
 * should be able to. But the regulator's vocabulary is three tiers, so every
 * field also carries its regulated classification, and exports aimed at an
 * authority or a registry speak in these terms rather than in ours.
 *
 * Source: JRC, "Study on DPP content for textile apparel products under ESPR"
 * (González-Torres & Arcipowska, 13 May 2026), §9.2.
 */
export const REGULATED_TIERS = ['public', 'legitimate_interest', 'authority'] as const;
export type RegulatedTier = (typeof REGULATED_TIERS)[number];

export const REGULATED_TIER_LABELS: Record<RegulatedTier, string> = {
  public: 'Public',
  legitimate_interest: 'Legitimate interest',
  authority: 'Authority only',
};

/**
 * Derive the regulated tier from the audience set, unless the entry states one.
 *
 * The derivation is deliberately conservative: anything not open to everyone is
 * treated as at least legitimate-interest, and anything only an authority may
 * read stays authority-only. Entries where the JRC's proposed classification is
 * stricter or looser than that derivation carry an explicit `regulated` value.
 */
export function regulatedTierOf(entry: FieldEntry): RegulatedTier {
  if (entry.regulated) return entry.regulated;
  if (entry.audiences.includes('public')) return 'public';
  if (entry.audiences.length === 1 && entry.audiences[0] === 'authority') return 'authority';
  return 'legitimate_interest';
}
