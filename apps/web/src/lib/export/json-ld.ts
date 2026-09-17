import type { PublicPassport } from '@/lib/passport/public';
import { passportUrl } from '@/lib/passport/identifier';
import { FIBRES } from '@/lib/passport/vocab';

/**
 * JSON-LD projection of a passport.
 *
 * Two failure modes are common in this market and both are avoided here.
 *
 * The first is a seven-line `schema.org/Product` block in a `<script>` tag —
 * name, image, price — presented as "the passport in JSON-LD". That is search
 * engine optimisation wearing a compliance label; it carries none of the data a
 * passport exists to carry.
 *
 * The second is worse: minting a private namespace, `https://<vendor>.com/dpp#`,
 * and hanging every field off it. That produces a document that looks like
 * linked data and links to nothing — no other system has those IRIs, so nothing
 * can join on them, and the vendor has quietly made themselves the vocabulary
 * authority for a regulated data format.
 *
 * So this maps only to IRIs that are already published and already resolvable:
 * schema.org for product identity and materials, Dublin Core for provenance
 * dates. Every passport field with no published IRI — care symbols, supply
 * steps, fibre custody models, durability test results — is carried in
 * `_unmapped`, which is deliberately *not* in the context and therefore
 * contributes no triples. A reader gets the data; a triple store gets only
 * statements that mean something outside Polytrail.
 *
 * That list shrinks as the standards land. EN 18223 (system interoperability)
 * and the textile delegated act will name a vocabulary; when they do, terms
 * move from `_unmapped` into the context and nothing else changes.
 */

const CONTEXT = {
  schema: 'https://schema.org/',
  dcterms: 'http://purl.org/dc/terms/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',

  name: 'schema:name',
  description: 'schema:description',
  url: { '@id': 'schema:url', '@type': '@id' },
  image: { '@id': 'schema:image', '@type': '@id' },
  identifier: 'schema:identifier',
  gtin: 'schema:gtin',
  sku: 'schema:sku',
  color: 'schema:color',
  size: 'schema:size',
  brand: 'schema:brand',
  manufacturer: 'schema:manufacturer',
  material: 'schema:material',
  countryOfOrigin: 'schema:countryOfOrigin',
  weight: 'schema:weight',
  value: 'schema:value',
  unitCode: 'schema:unitCode',
  propertyID: 'schema:propertyID',
  additionalProperty: 'schema:additionalProperty',
  datePublished: { '@id': 'schema:datePublished', '@type': 'xsd:dateTime' },
  dateModified: { '@id': 'dcterms:modified', '@type': 'xsd:dateTime' },
  conformsTo: { '@id': 'dcterms:conformsTo', '@type': '@id' },
} as const;

export interface JsonLdOptions {
  /** Overrides the resolver base, for generating a document for another host. */
  baseUrl?: string;
}

export function passportToJsonLd(
  passport: PublicPassport,
  options: JsonLdOptions = {},
): Record<string, unknown> {
  const id = passportUrl(passport.dppId, options.baseUrl);
  const payload = passport.payload;
  const identity = payload.identity;

  const mapped: Record<string, unknown> = {
    '@context': CONTEXT,
    '@id': id,
    '@type': 'schema:Product',
    url: id,
    identifier: [
      { '@type': 'schema:PropertyValue', propertyID: 'polytrail:dppId', value: passport.dppId },
      ...(identity?.styleNumber
        ? [{ '@type': 'schema:PropertyValue', propertyID: 'styleNumber', value: identity.styleNumber }]
        : []),
    ],
    dateModified: passport.updatedAt,
  };

  if (identity?.productName?.en) mapped.name = localised(identity.productName);
  if (identity?.description) mapped.description = localised(identity.description);
  if (identity?.gtin) mapped.gtin = identity.gtin;
  if (identity?.sku) mapped.sku = identity.sku;
  if (identity?.colourName) mapped.color = identity.colourName;
  if (identity?.size) mapped.size = identity.size;
  if (passport.publishedAt) mapped.datePublished = passport.publishedAt;

  mapped.brand = {
    '@type': 'schema:Brand',
    name: identity?.brandName ?? passport.brand.name,
    ...(passport.brand.website ? { url: passport.brand.website } : {}),
  };

  if (identity?.countryOfOrigin) {
    mapped.countryOfOrigin = { '@type': 'schema:Country', identifier: identity.countryOfOrigin };
  }

  if (identity?.netWeightGrams) {
    mapped.weight = {
      '@type': 'schema:QuantitativeValue',
      value: identity.netWeightGrams,
      // UN/CEFACT Recommendation 20 code for gram, which is what schema.org's
      // `unitCode` expects and what a customs system already speaks.
      unitCode: 'GRM',
    };
  }

  if (identity?.images?.length) {
    mapped.image = identity.images.map((image) => image.url);
  }

  const fibres = payload.composition?.overall;
  if (fibres?.length) {
    // Each fibre becomes a `schema:Product` used as material, with its share by
    // weight as an additional property. schema.org has no term for "23% of this
    // garment by mass", so the percentage is a PropertyValue rather than being
    // squeezed into a term that means something else.
    mapped.material = fibres.map((fibre) => ({
      '@type': 'schema:Product',
      name: FIBRES[fibre.fibre as keyof typeof FIBRES]?.label ?? fibre.fibre,
      additionalProperty: [
        {
          '@type': 'schema:PropertyValue',
          propertyID: 'shareByWeightPercent',
          value: fibre.percentage,
          unitCode: 'P1',
        },
        ...(fibre.originCountry
          ? [
              {
                '@type': 'schema:PropertyValue',
                propertyID: 'fibreOriginCountry',
                value: fibre.originCountry,
              },
            ]
          : []),
      ],
    }));
  }

  mapped.conformsTo = 'https://www.w3.org/TR/json-ld11/';

  return {
    ...mapped,
    /**
     * Not in the context, so a JSON-LD processor drops it and produces no
     * triples for it. Present because a human or a bespoke client reading this
     * document should still get the data, and because pretending the fields do
     * not exist would be a different kind of dishonesty.
     */
    _unmapped: {
      note: 'These fields have no published IRI in schema.org or any other vocabulary this document commits to. They carry no linked-data semantics here and are provided verbatim. They will move into the context as EN 18223 and the textile delegated act name a vocabulary.',
      passportStatus: passport.status,
      passportVersion: passport.version,
      accessTier: passport.tier,
      integrity: {
        algorithm: 'SHA-256',
        canonicalization: 'RFC 8785 (JCS)',
        hash: passport.dataHash,
      },
      substances: payload.substances ?? null,
      supplyChain: payload.supplyChain ?? null,
      environment: payload.environment ?? null,
      durability: payload.durability ?? null,
      care: payload.care ?? null,
      circularity: payload.circularity ?? null,
      social: payload.social ?? null,
      claims: payload.claims ?? null,
      certifications: payload.certifications ?? null,
      lifecycleEvents: passport.events,
      recall: passport.recall,
      withheld: passport.withheld.map((field) => ({
        path: field.path,
        label: field.label,
        releasedTo: field.audiences.filter((audience) => audience !== 'public'),
      })),
    },
  };
}

/**
 * A localised string becomes one JSON-LD value object per language, with `en`
 * first. An array of language-tagged values is the representation that
 * survives a round trip through a triple store; a value object with extra keys
 * bolted on is not valid JSON-LD and is silently discarded by processors.
 */
function localised(value: Record<string, string>): Array<Record<string, string>> {
  const english = { '@value': value.en ?? '', '@language': 'en' };
  const others = Object.entries(value)
    .filter(([language, text]) => language !== 'en' && text)
    .map(([language, text]) => ({ '@value': text, '@language': language }));
  return [english, ...others];
}
