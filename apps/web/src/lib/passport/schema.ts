import { z } from 'zod';
import { CARE_SYMBOLS, CATEGORIES, CERTIFICATION_SCHEMES, COMPONENT_KINDS, CUSTODY_MODELS, FIBRES, RECYCLED_SOURCES, RECYCLING_DISRUPTORS } from './vocab';

/**
 * The textile Digital Product Passport payload.
 *
 * Structure follows the shape the ESPR framework asks a passport to carry —
 * identity, composition, substances, supply chain, environmental footprint,
 * durability, care, circularity, social due diligence, claims — rather than
 * mirroring any one vendor's schema, so that mappings out to GS1, UNTP and a
 * future EU registry are each a projection of this, not a rewrite of it.
 *
 * Almost everything is optional. A passport is built up over months as
 * suppliers answer data requests, so the schema has to describe a partially
 * complete passport without complaining; `publishableSchema` is the stricter
 * gate that runs only at publication.
 */

const keyOf = <T extends Record<string, unknown>>(obj: T) =>
  z.enum(Object.keys(obj) as [string, ...string[]]);

const iso3166 = z
  .string()
  .length(2, 'Use a two-letter ISO 3166-1 country code, e.g. PT for Portugal.')
  .regex(/^[A-Z]{2}$/, 'Country codes are uppercase, e.g. IT.');

const percentage = z.number().min(0).max(100);
const isoDate = z.iso.date();
const url = z.url();

/** A localised string. `en` is always required so there is a fallback. */
const localized = z.object({ en: z.string().min(1) }).catchall(z.string());

// ───────────────────────────────────────────────────────────────────────────
// Identity
// ───────────────────────────────────────────────────────────────────────────

export const economicOperatorSchema = z.object({
  name: z.string().min(1),
  role: z.enum([
    'manufacturer',
    'importer',
    'authorised_representative',
    'distributor',
    'fulfilment_service_provider',
  ]),
  address: z.object({
    line1: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    country: iso3166,
  }),
  email: z.email().optional(),
  /** ISO 17442 Legal Entity Identifier. */
  lei: z.string().length(20).optional(),
  /** EU Economic Operators Registration and Identification number. */
  eori: z.string().max(17).optional(),
  vat: z.string().max(20).optional(),
  /** GS1 Global Location Number. */
  gln: z.string().length(13).optional(),
  did: z.string().startsWith('did:').optional(),
});

export const identitySchema = z.object({
  productName: localized,
  brandName: z.string().min(1),
  /** Manufacturer's own style/model reference. */
  styleNumber: z.string().max(128).optional(),
  sku: z.string().max(128).optional(),
  gtin: z.string().regex(/^\d{8,14}$/, 'A GTIN is 8 to 14 digits.').optional(),
  /** GS1 Global Model Number — identifies the style across colours and sizes. */
  gmn: z.string().max(25).optional(),
  category: keyOf(CATEGORIES),
  /** Combined Nomenclature / HS code used at customs. */
  hsCode: z.string().regex(/^\d{4,10}$/).optional(),
  colourName: z.string().max(128).optional(),
  colourCode: z.string().max(64).optional(),
  size: z.string().max(32).optional(),
  sizeSystem: z.enum(['EU', 'UK', 'US', 'IT', 'FR', 'JP', 'alpha', 'numeric', 'none']).optional(),
  season: z.string().max(32).optional(),
  /**
   * Country of origin in the customs sense: where the last substantial
   * transformation happened. Deliberately separate from the supply-chain
   * facility list, because "Made in Portugal" and "the fabric came from
   * Türkiye" are both true and consumers conflate them.
   */
  countryOfOrigin: iso3166.optional(),
  netWeightGrams: z.number().positive().optional(),
  description: localized.optional(),
  images: z
    .array(
      z.object({
        url,
        alt: z.string().max(300).optional(),
        kind: z.enum(['hero', 'detail', 'label', 'flat', 'worn', 'construction']).default('detail'),
      }),
    )
    .max(20)
    .optional(),
  economicOperators: z.array(economicOperatorSchema).max(10).optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Composition
// ───────────────────────────────────────────────────────────────────────────

export const fibreEntrySchema = z.object({
  fibre: keyOf(FIBRES),
  /** Percentage by weight of the component this fibre belongs to. */
  percentage,
  /** Where the raw fibre was grown, reared or produced. */
  originCountry: iso3166.optional(),
  recycled: z
    .object({
      share: percentage,
      source: keyOf(RECYCLED_SOURCES),
      custodyModel: keyOf(CUSTODY_MODELS),
      feedstock: z.string().max(200).optional(),
    })
    .optional(),
  organic: z
    .object({
      share: percentage,
      scheme: keyOf(CERTIFICATION_SCHEMES),
      custodyModel: keyOf(CUSTODY_MODELS),
    })
    .optional(),
  /** IDs of credentials in this passport that substantiate the fibre's claims. */
  certificationRefs: z.array(z.string()).max(20).optional(),
  supplierRef: z.string().max(128).optional(),
});

export const componentSchema = z.object({
  /** Stable key used to cross-reference this component from other sections. */
  ref: z.string().min(1).max(128),
  kind: keyOf(COMPONENT_KINDS),
  name: z.string().max(200).optional(),
  weightGrams: z.number().nonnegative().optional(),
  /** Share of total product weight. Lets a recycler reason about yield. */
  weightShare: percentage.optional(),
  fibres: z.array(fibreEntrySchema).max(30),
  /** Knit, woven, non-woven — determines the recycling route. */
  construction: z
    .enum(['woven', 'knitted', 'non_woven', 'braided', 'moulded', 'leather', 'other'])
    .optional(),
  fabricWeightGsm: z.number().positive().optional(),
  colour: z.string().max(128).optional(),
  removable: z.boolean().optional(),
  supplierRef: z.string().max(128).optional(),
});

export const compositionSchema = z.object({
  components: z.array(componentSchema).max(60),
  /**
   * Whole-product fibre breakdown. Derived from components when a full bill of
   * materials exists, but storable on its own — most brands can state the
   * headline composition long before they can decompose it by component.
   */
  overall: z.array(fibreEntrySchema).max(30).optional(),
  totalWeightGrams: z.number().positive().optional(),
  /** True when the product is a single fibre type throughout, trims aside. */
  monomaterial: z.boolean().optional(),
  totalRecycledContent: percentage.optional(),
  /**
   * Non-textile parts of animal origin, which Article 12 of Regulation
   * 1007/2011 requires to be declared — leather trim, horn buttons, fur.
   */
  nonTextileAnimalParts: z
    .array(z.object({ description: z.string().max(200), species: z.string().max(120).optional() }))
    .max(20)
    .optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Substances
// ───────────────────────────────────────────────────────────────────────────

export const substanceSchema = z.object({
  name: z.string().min(1).max(300),
  casNumber: z.string().regex(/^\d{2,7}-\d{2}-\d$/).optional(),
  ecNumber: z.string().max(20).optional(),
  /** Whether the substance is on the REACH Candidate List. */
  svhc: z.boolean().default(false),
  concentrationRange: z
    .enum(['below_0_1', '0_1_to_1', '1_to_10', 'above_10', 'unknown'])
    .optional(),
  /** Which component it sits in, by `component.ref`. */
  componentRef: z.string().max(128).optional(),
  /** ECHA SCIP database submission number. */
  scipNumber: z.string().max(64).optional(),
  safeUseInstructions: localized.optional(),
});

export const substancesSchema = z.object({
  substancesOfConcern: z.array(substanceSchema).max(100).optional(),
  /** Declared absence claims — only meaningful with a test report behind them. */
  restrictedSubstanceTests: z
    .array(
      z.object({
        standard: z.string().max(200),
        analyte: z.string().max(200),
        result: z.enum(['pass', 'fail', 'detected_below_limit']),
        limitValue: z.string().max(64).optional(),
        measuredValue: z.string().max(64).optional(),
        laboratory: z.string().max(200).optional(),
        testedOn: isoDate.optional(),
        reportDocumentId: z.string().optional(),
      }),
    )
    .max(200)
    .optional(),
  pfasStatus: z.enum(['none_intentionally_added', 'present', 'not_assessed']).optional(),
  /** Wet-processing chemical management programme the dyehouse works to. */
  chemicalManagement: z
    .object({
      zdhcConformance: z.enum(['level_1', 'level_2', 'level_3', 'none']).optional(),
      wastewaterTested: z.boolean().optional(),
      mrslVersion: z.string().max(64).optional(),
    })
    .optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Supply chain
// ───────────────────────────────────────────────────────────────────────────

export const supplyStepSchema = z.object({
  /** Stable key so events and components can point at a step. */
  ref: z.string().min(1).max(128),
  tier: z.enum(['tier_0_retail', 'tier_1_assembly', 'tier_2_material', 'tier_3_processing', 'tier_4_raw_material']),
  process: z.enum([
    'design',
    'cut_make_trim',
    'assembly',
    'embroidery',
    'printing',
    'washing',
    'dyeing',
    'finishing',
    'weaving',
    'knitting',
    'spinning',
    'ginning',
    'scouring',
    'tanning',
    'fibre_production',
    'farming',
    'material_recovery',
    'packing',
    'distribution',
  ]),
  facilityName: z.string().max(255).optional(),
  /** Withholding the name but publishing the country is a legitimate position. */
  facilityDisclosed: z.boolean().default(true),
  country: iso3166,
  city: z.string().max(128).optional(),
  /** Open Supply Hub ID — the public, deduplicated registry of textile facilities. */
  osId: z.string().max(32).optional(),
  gln: z.string().length(13).optional(),
  coordinates: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .optional(),
  /** Components this step contributed to, by `component.ref`. */
  componentRefs: z.array(z.string()).max(60).optional(),
  certificationRefs: z.array(z.string()).max(20).optional(),
  /** How the brand knows this is true. */
  evidence: z
    .enum(['self_declared', 'supplier_declared', 'document_verified', 'third_party_audited'])
    .optional(),
  workerCount: z.number().int().nonnegative().optional(),
});

export const supplyChainSchema = z.object({
  steps: z.array(supplyStepSchema).max(200),
  /** How far the brand has actually mapped. Honest, and it is what buyers ask. */
  traceabilityDepth: z
    .enum(['tier_1', 'tier_2', 'tier_3', 'tier_4', 'full'])
    .optional(),
  chainOfCustodyModel: keyOf(CUSTODY_MODELS).optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Environment
// ───────────────────────────────────────────────────────────────────────────

export const environmentSchema = z.object({
  /**
   * Class of performance for the environmental footprint, A–E, derived from
   * the PEFCR benchmark for the product category.
   *
   * This — not the absolute figure — is what the JRC proposes to make public
   * for textile apparel, on the reasoning that a class is comparable between
   * products and a raw score is not. The absolute value stays available to
   * parties with a legitimate interest.
   */
  footprintClass: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
  /**
   * Product Environmental Footprint result. Recorded with its method version
   * because PEF scores from different rule versions are not comparable, and
   * presenting them as if they were is the fastest way to mislead.
   */
  pef: z
    .object({
      score: z.number(),
      unit: z.literal('mPt').default('mPt'),
      methodVersion: z.string().max(64),
      categoryRules: z.string().max(200).optional(),
      calculatedOn: isoDate.optional(),
      verifiedBy: z.string().max(200).optional(),
    })
    .optional(),
  carbon: z
    .object({
      totalKgCo2e: z.number().nonnegative(),
      /** Cradle-to-gate is the honest default; cradle-to-grave needs use-phase assumptions. */
      boundary: z.enum(['cradle_to_gate', 'cradle_to_grave', 'gate_to_gate']),
      methodology: z.string().max(200).optional(),
      byStage: z
        .object({
          rawMaterial: z.number().nonnegative().optional(),
          processing: z.number().nonnegative().optional(),
          manufacturing: z.number().nonnegative().optional(),
          transport: z.number().nonnegative().optional(),
          use: z.number().nonnegative().optional(),
          endOfLife: z.number().nonnegative().optional(),
        })
        .optional(),
      verifiedBy: z.string().max(200).optional(),
      calculatedOn: isoDate.optional(),
    })
    .optional(),
  water: z
    .object({
      litres: z.number().nonnegative().optional(),
      scarcityWeightedM3: z.number().nonnegative().optional(),
      methodology: z.string().max(200).optional(),
    })
    .optional(),
  energyMj: z.number().nonnegative().optional(),
  landUseM2Year: z.number().nonnegative().optional(),
  /**
   * Microplastic release. Regulators are moving toward mandatory disclosure for
   * synthetics and there is no settled test method yet, so the method is stored
   * beside the number rather than assumed.
   */
  microplastics: z
    .object({
      testMethod: z.string().max(200),
      releaseMgPerKgWash: z.number().nonnegative().optional(),
      mitigation: z.string().max(500).optional(),
    })
    .optional(),
  lcaDocumentId: z.string().optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Durability & care
// ───────────────────────────────────────────────────────────────────────────

export const durabilitySchema = z.object({
  /**
   * Robustness score, 0-100.
   *
   * One of the four design options the JRC put forward for the textile
   * delegated act, evidenced by visual inspection (ISO 15487), spirality
   * (ISO 16322-3) and dimensional change (ISO 3759), all measured on the
   * finished sellable product after five wash cycles at the care-label
   * setting (ISO 6330).
   *
   * Note that repairability was assessed by the JRC and *rejected* as not
   * objectively quantifiable, so `repairabilityScore` below is a voluntary
   * brand claim and is labelled as one in the interface.
   */
  robustnessScore: z.number().min(0).max(100).optional(),
  robustnessEvidence: z
    .object({
      visualInspection: z.object({ standard: z.string().max(120), grade: z.number() }).optional(),
      spiralityPercent: z.number().optional(),
      dimensionalChangePercent: z.number().optional(),
      washCycles: z.number().int().positive().optional(),
    })
    .optional(),
  /** Test results that back a durability claim, each against a named standard. */
  dimensionalStability: z
    .object({ standard: z.string().max(120), changePercent: z.number(), wash: z.string().max(64).optional() })
    .optional(),
  colourFastness: z
    .array(
      z.object({
        standard: z.string().max(120),
        against: z.enum(['washing', 'light', 'rubbing_dry', 'rubbing_wet', 'perspiration', 'water']),
        grade: z.number().min(1).max(8),
      }),
    )
    .max(20)
    .optional(),
  pillingResistance: z.object({ standard: z.string().max(120), grade: z.number().min(1).max(5) }).optional(),
  abrasionResistance: z
    .object({ standard: z.string().max(120), martindaleCycles: z.number().int().positive() })
    .optional(),
  tensileStrengthN: z.number().positive().optional(),
  seamSlippage: z.object({ standard: z.string().max(120), passed: z.boolean() }).optional(),
  /** Modelled or tested number of wash cycles before the garment fails its spec. */
  expectedWashCycles: z.number().int().positive().optional(),
  warrantyMonths: z.number().int().nonnegative().optional(),
  /** 0-100, the brand's own scoring until an EU repairability index exists for textiles. */
  repairabilityScore: z.number().min(0).max(100).optional(),
});

export const careSchema = z.object({
  symbols: z.array(keyOf(CARE_SYMBOLS)).max(10).optional(),
  instructions: localized.optional(),
  /** Advice that measurably reduces use-phase impact. Consumers act on this. */
  lowImpactTips: z.array(localized).max(10).optional(),
  repair: z
    .object({
      instructions: localized.optional(),
      guideUrl: url.optional(),
      sparePartsAvailable: z.boolean().optional(),
      sparePartsUntil: isoDate.optional(),
      spareParts: z
        .array(z.object({ name: z.string().max(200), reference: z.string().max(128).optional() }))
        .max(40)
        .optional(),
      /** Partner refs from the supply chain that are authorised to repair. */
      partnerRefs: z.array(z.string()).max(40).optional(),
    })
    .optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Circularity
// ───────────────────────────────────────────────────────────────────────────

export const circularitySchema = z.object({
  recyclability: z
    .object({
      /** Recyclability score, 0-100. A proposed ESPR information requirement. */
      score: z.number().min(0).max(100).optional(),
      recyclableShare: percentage.optional(),
      route: z.enum(['mechanical', 'chemical', 'thermal', 'none_available']).optional(),
      disruptors: z.array(keyOf(RECYCLING_DISRUPTORS)).max(20).optional(),
      /** Ordered instructions for getting the garment apart. Written for a sorter. */
      disassemblySteps: z
        .array(
          z.object({
            order: z.number().int().positive(),
            instruction: localized,
            componentRef: z.string().max(128).optional(),
            toolRequired: z.string().max(120).optional(),
            estimatedSeconds: z.number().int().positive().optional(),
          }),
        )
        .max(40)
        .optional(),
      separationNotes: localized.optional(),
    })
    .optional(),
  takeBack: z
    .object({
      available: z.boolean(),
      url: url.optional(),
      instructions: localized.optional(),
      incentive: z.string().max(200).optional(),
    })
    .optional(),
  resale: z
    .object({
      brandAuthorised: z.boolean(),
      url: url.optional(),
      authenticationSupported: z.boolean().optional(),
    })
    .optional(),
  rental: z.object({ available: z.boolean(), url: url.optional() }).optional(),
  /**
   * Extended producer responsibility registrations. Textile EPR is rolling out
   * country by country, so this is a list rather than a single number.
   */
  eprRegistrations: z
    .array(
      z.object({
        country: iso3166,
        scheme: z.string().max(200),
        producerNumber: z.string().max(128),
        validUntil: isoDate.optional(),
      }),
    )
    .max(40)
    .optional(),
  /** European Waste Catalogue code for the garment at end of life. */
  wasteCode: z.string().max(16).optional(),
  endOfLifeInstructions: localized.optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Social due diligence
// ───────────────────────────────────────────────────────────────────────────

export const socialSchema = z.object({
  dueDiligenceStatementUrl: url.optional(),
  policies: z
    .array(z.object({ kind: z.string().max(120), url, updatedOn: isoDate.optional() }))
    .max(30)
    .optional(),
  audits: z
    .array(
      z.object({
        stepRef: z.string().max(128).optional(),
        standard: keyOf(CERTIFICATION_SCHEMES),
        conductedOn: isoDate,
        outcome: z.enum(['pass', 'pass_with_findings', 'fail', 'in_remediation']),
        findingsSummary: z.string().max(1000).optional(),
        reportDocumentId: z.string().optional(),
      }),
    )
    .max(100)
    .optional(),
  livingWage: z
    .object({
      programme: z.string().max(200).optional(),
      benchmarkSource: z.string().max(200).optional(),
      coveredStepRefs: z.array(z.string()).max(100).optional(),
    })
    .optional(),
  grievanceMechanismUrl: url.optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// Claims & certifications
// ───────────────────────────────────────────────────────────────────────────

/**
 * An environmental or social claim made about the product.
 *
 * Every claim must name its evidence. The Empowering Consumers Directive bans
 * generic environmental claims without recognised substantiation, so a claim
 * with no `evidence` is not a nearly-finished claim — it is a liability, and
 * `publishableSchema` rejects it.
 */
export const claimSchema = z.object({
  id: z.string().min(1).max(128),
  statement: localized,
  kind: z.enum([
    'recycled_content',
    'organic_content',
    'animal_welfare',
    'carbon',
    'water',
    'chemical_safety',
    'labour',
    'durability',
    'recyclability',
    'circular_design',
    'other',
  ]),
  scope: z.enum(['whole_product', 'component', 'material', 'facility']).default('whole_product'),
  scopeRef: z.string().max(128).optional(),
  /** Credential or document IDs in this passport that substantiate the claim. */
  evidence: z.array(z.string()).min(1),
  verifiedBy: z.string().max(200).optional(),
  validUntil: isoDate.optional(),
});

export const certificationSchema = z.object({
  id: z.string().min(1).max(128),
  scheme: keyOf(CERTIFICATION_SCHEMES),
  licenceNumber: z.string().max(128).optional(),
  scope: z.string().max(500).optional(),
  issuedBy: z.string().max(255),
  validFrom: isoDate.optional(),
  validUntil: isoDate.optional(),
  /** ID of the stored verifiable credential, when the certifier issued one. */
  credentialId: z.string().optional(),
  documentId: z.string().optional(),
  /** Which steps or components the certificate actually covers. */
  appliesToStepRefs: z.array(z.string()).max(100).optional(),
  appliesToComponentRefs: z.array(z.string()).max(60).optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// The passport
// ───────────────────────────────────────────────────────────────────────────

export const passportPayloadSchema = z.object({
  /** Schema version, so old payloads stay readable after the model moves on. */
  schemaVersion: z.literal('1.0'),
  identity: identitySchema,
  composition: compositionSchema.optional(),
  substances: substancesSchema.optional(),
  supplyChain: supplyChainSchema.optional(),
  environment: environmentSchema.optional(),
  durability: durabilitySchema.optional(),
  care: careSchema.optional(),
  circularity: circularitySchema.optional(),
  social: socialSchema.optional(),
  claims: z.array(claimSchema).max(60).optional(),
  certifications: z.array(certificationSchema).max(60).optional(),
  commercial: z
    .object({
      launchDate: isoDate.optional(),
      marketsPlaced: z.array(iso3166).max(60).optional(),
      recommendedRetailPrice: z
        .object({ amount: z.number().nonnegative(), currency: z.string().length(3) })
        .optional(),
    })
    .optional(),
  /** Brand-defined extras. Never projected publicly unless registered. */
  custom: z.record(z.string(), z.unknown()).optional(),
});

export type PassportPayload = z.infer<typeof passportPayloadSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type Composition = z.infer<typeof compositionSchema>;
export type SupplyStep = z.infer<typeof supplyStepSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Certification = z.infer<typeof certificationSchema>;

/**
 * The stricter gate applied at publication.
 *
 * Draft passports are allowed to be incomplete; published ones are not. The
 * split exists so the console can save whatever the user has so far without
 * nagging, and still refuse to put an unsubstantiated claim in front of a
 * consumer.
 */
export const publishableSchema = passportPayloadSchema
  .refine((p) => Boolean(p.identity.productName.en), {
    message: 'A product name is required before publishing.',
    path: ['identity', 'productName'],
  })
  .refine((p) => Boolean(p.composition?.overall?.length || p.composition?.components?.length), {
    message:
      'Fibre composition is required before publishing — it is the one field every reader expects.',
    path: ['composition'],
  })
  .refine(
    (p) => {
      const overall = p.composition?.overall;
      if (!overall?.length) return true;
      const total = overall.reduce((sum, f) => sum + f.percentage, 0);
      return Math.abs(total - 100) < 0.51;
    },
    {
      message: 'Overall fibre percentages must add up to 100%.',
      path: ['composition', 'overall'],
    },
  )
  .refine((p) => Boolean(p.identity.countryOfOrigin), {
    message: 'Country of origin is required before publishing.',
    path: ['identity', 'countryOfOrigin'],
  })
  .refine((p) => Boolean(p.care?.symbols?.length || p.care?.instructions), {
    message: 'Care information is required before publishing.',
    path: ['care'],
  })
  .refine((p) => (p.identity.economicOperators?.length ?? 0) > 0, {
    message:
      'Name the economic operator responsible for this product. Regulation (EU) 2019/1020 Art. 4 requires a contactable operator established in the Union.',
    path: ['identity', 'economicOperators'],
  })
  .refine(
    (p) =>
      (p.identity.economicOperators ?? []).every(
        (operator) => operator.name.trim().length > 0 && operator.address.country.length === 2,
      ),
    {
      message: 'Every economic operator needs a name and a country.',
      path: ['identity', 'economicOperators'],
    },
  )
  .refine(
    (p) => {
      // Optional chaining short-circuits to `undefined`, not to an empty
      // array, so each of these needs its own fallback before it is spread.
      const certifications = p.certifications ?? [];
      const evidenceIds = new Set<string>(
        certifications
          .flatMap((c) => [c.id, c.credentialId, c.documentId])
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );
      return (p.claims ?? []).every((claim) => claim.evidence.some((e) => evidenceIds.has(e)));
    },
    {
      message:
        'Every claim must point at evidence that exists in this passport. Unsubstantiated environmental claims are prohibited by Directive (EU) 2024/825.',
      path: ['claims'],
    },
  );

/** Validate a draft. Returns field-level issues rather than throwing. */
export function validateDraft(payload: unknown) {
  return passportPayloadSchema.safeParse(payload);
}

/** Validate for publication, applying the stricter refinements. */
export function validateForPublication(payload: unknown) {
  return publishableSchema.safeParse(payload);
}
