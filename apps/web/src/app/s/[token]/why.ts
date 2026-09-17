/**
 * The regulatory basis, in words a factory office can act on.
 *
 * `FIELD_REGISTRY` names the instrument that asks for each field — "ESPR
 * Annex III — product identification", "Union Customs Code Art. 60". That is
 * exactly right for the console, where the reader is a compliance manager, and
 * exactly wrong for the supplier portal, where the reader is a production
 * manager in Tiruppur reading English as a third language on a phone.
 *
 * So the citation is kept, verbatim and visible, and a plain sentence is put
 * in front of it. Nothing here invents an obligation: the sentence explains the
 * instrument the registry already names, and where no rule is recognised the
 * field says plainly that the brand needs it for the passport rather than
 * dressing it up as law.
 */

interface Reason {
  match: RegExp;
  plain: string;
}

const REASONS: Reason[] = [
  {
    match: /^ESPR/i,
    plain: 'European law requires this on the product passport before the item can be sold in the EU.',
  },
  {
    match: /^JRC/i,
    plain:
      'The EU study that sets out what a textile passport must contain asks for this.',
  },
  {
    match: /^GS1/i,
    plain: 'This is the code that identifies the product anywhere in the world.',
  },
  {
    match: /Union Customs Code/i,
    plain: 'Customs uses this to decide which country the item counts as coming from.',
  },
  {
    match: /REACH|POPs?\b|CLP|SVHC|substance/i,
    plain:
      'Chemical safety law requires it. Buyers have to be able to show which substances are in the item.',
  },
  {
    match: /CSDDD|CSRD|ILO|forced labour|OECD|due diligence|Modern Slavery/i,
    plain:
      'Supply-chain due-diligence law requires it. It is about working conditions at the site, not about you personally.',
  },
  {
    match: /PEFCR|PEF\b|footprint|Green Claims|GHG|ISO 14/i,
    plain:
      'Environmental claims must be backed by real figures, so the number has to come from the site that did the work.',
  },
  {
    match: /Waste Framework|EPR|WEEE|recycl/i,
    plain: 'Recyclers and waste rules need it so the item can be handled correctly at the end of its life.',
  },
  {
    match: /Textile Labelling|EN 13402|EN 301 549|EN \d|ISO \d/i,
    plain: 'A European standard sets how this has to be described, so it has to be exact.',
  },
  {
    match: /accessibility/i,
    plain: 'So that people using a screen reader can understand the passport too.',
  },
  {
    match: /Consumer information/i,
    plain: 'Shoppers see this on the public passport when they scan the label.',
  },
  {
    match: /Trade identification|Product identification/i,
    plain: 'So your answer can be matched to the right product record and not mixed up with another style.',
  },
  {
    match: /certif|scheme|GOTS|GRS|OEKO|Bluesign/i,
    plain: 'A certification scheme covers this, and the passport has to point at the right licence.',
  },
  {
    match: /durab|repair|care/i,
    plain: 'Buyers are told how long the item should last and how to look after it, and that has to be true.',
  },
];

const FALLBACK =
  'The brand needs this to complete the product passport. No regulation names it, so an estimate is better than a blank.';

/** A sentence saying why the field is being asked for. */
export function plainReason(basis: string): string {
  for (const reason of REASONS) {
    if (reason.match.test(basis)) return reason.plain;
  }
  return FALLBACK;
}

/**
 * The citation itself, tidied for a reader who is not going to look it up: the
 * registry writes "ESPR Annex III — product identification", and only the part
 * before the dash names the instrument.
 */
export function citation(basis: string): string {
  return basis.split('—')[0]!.trim();
}
