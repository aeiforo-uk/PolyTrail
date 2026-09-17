import type { FieldEntry } from './types';

/**
 * The authoritative record of every field a passport may carry, and who may
 * read it.
 *
 * This file is the product's compliance surface. Two rules keep it honest:
 *
 *   1. The projector is deny-by-default, so a field absent from this list is
 *      invisible to everyone but an authority. Adding a field to the payload
 *      schema without adding it here fails the registry test.
 *   2. Every entry names the instrument that asks for it in `basis`. If no
 *      regulation, standard or scheme wants a field, it does not belong in a
 *      passport — it belongs in the brand's own PIM.
 *
 * Audience choices worth explaining:
 *   • Facility *names* default to trade-only while facility *countries* are
 *     public. Country-level disclosure satisfies the transparency expectation
 *     without forcing every brand to expose its sourcing list on day one; a
 *     brand that wants full public disclosure raises it per-field in settings.
 *   • Disassembly and fibre-separation detail is open to recyclers regardless
 *     of what else the brand restricts, because withholding it defeats the
 *     purpose of the passport.
 *   • Audit findings and substance concentrations stay with authorities.
 */
/**
 * The single most useful citation in this file.
 *
 * The JRC's preparatory study is what the textile delegated act will be built
 * from: it carries the candidate field list, the proposed granularity for each
 * field, and the proposed access tier for each field. Where Polytrail's default
 * differs from it, the entry says so and explains why.
 *
 * @see https://susproc.jrc.ec.europa.eu/product-bureau/sites/default/files/2026-05/Textiles_DPP_20260513.pdf
 */
const JRC = 'JRC, DPP content for textile apparel under ESPR (13 May 2026)';

export const FIELD_REGISTRY: readonly FieldEntry[] = [
  // ── Identity ─────────────────────────────────────────────────────────────
  { path: 'schemaVersion', audiences: ['public'], label: 'Schema version', basis: 'ESPR Art. 9 — machine-readable passport', required: true },
  { path: 'identity.productName', audiences: ['public'], label: 'Product name', basis: 'ESPR Annex III — product identification', required: true },
  { path: 'identity.brandName', audiences: ['public'], label: 'Brand', basis: 'ESPR Annex III — product identification', required: true },
  { path: 'identity.styleNumber', audiences: ['public'], label: 'Style reference', basis: 'ESPR Annex III — model identifier' },
  { path: 'identity.sku', audiences: ['retailer'], label: 'SKU', basis: 'Trade identification' },
  { path: 'identity.gtin', audiences: ['public'], label: 'GTIN', basis: 'GS1 Digital Link / ESPR unique product identifier' , espr: true },
  { path: 'identity.gmn', audiences: ['public'], label: 'Global Model Number', basis: 'GS1 GMN — model identifier' },
  { path: 'identity.category', audiences: ['public'], label: 'Category', basis: 'ESPR product group classification', required: true },
  { path: 'identity.hsCode', audiences: ['retailer', 'recycler'], label: 'Customs code', basis: 'Union Customs Code — Combined Nomenclature' , espr: true },
  { path: 'identity.colourName', audiences: ['public'], label: 'Colour', basis: 'Product identification' },
  { path: 'identity.colourCode', audiences: ['retailer'], label: 'Colour code', basis: 'Trade identification' },
  { path: 'identity.size', audiences: ['public'], label: 'Size', basis: 'Product identification' },
  { path: 'identity.sizeSystem', audiences: ['public'], label: 'Size system', basis: 'EN 13402 — size designation of clothes' },
  { path: 'identity.season', audiences: ['retailer'], label: 'Season', basis: 'Trade identification' },
  { path: 'identity.countryOfOrigin', audiences: ['public'], label: 'Country of origin', basis: 'Union Customs Code Art. 60 — non-preferential origin', required: true },
  { path: 'identity.netWeightGrams', audiences: ['public'], label: 'Weight', basis: 'ESPR Annex III — mass; needed for EPR fee calculation' },
  { path: 'identity.description', audiences: ['public'], label: 'Description', basis: 'Consumer information' },
  { path: 'identity.images.*.url', audiences: ['public'], label: 'Product image', basis: 'Consumer information' },
  { path: 'identity.images.*.alt', audiences: ['public'], label: 'Image description', basis: 'EN 301 549 — accessibility' },
  { path: 'identity.images.*.kind', audiences: ['public'], label: 'Image type', basis: 'Consumer information' },

  // Economic operators — who is legally responsible for the product.
  { path: 'identity.economicOperators.*.name', audiences: ['public'], label: 'Economic operator', basis: 'ESPR Art. 4 — responsible economic operator', required: true },
  { path: 'identity.economicOperators.*.role', audiences: ['public'], label: 'Operator role', basis: 'ESPR Art. 4' },
  { path: 'identity.economicOperators.*.address.line1', audiences: ['public'], label: 'Operator street', basis: 'Regulation (EU) 2019/1020 Art. 4 — contactable operator' },
  { path: 'identity.economicOperators.*.address.city', audiences: ['public'], label: 'Operator city', basis: 'Regulation (EU) 2019/1020 Art. 4' },
  { path: 'identity.economicOperators.*.address.postalCode', audiences: ['public'], label: 'Operator postcode', basis: 'Regulation (EU) 2019/1020 Art. 4' },
  { path: 'identity.economicOperators.*.address.country', audiences: ['public'], label: 'Operator country', basis: 'Regulation (EU) 2019/1020 Art. 4' },
  { path: 'identity.economicOperators.*.email', audiences: ['public'], label: 'Operator contact', basis: 'Regulation (EU) 2019/1020 Art. 4' },
  { path: 'identity.economicOperators.*.lei', audiences: ['retailer', 'recycler'], label: 'Operator LEI', basis: 'ISO 17442 — legal entity identifier' },
  { path: 'identity.economicOperators.*.eori', audiences: ['authority'], label: 'Operator EORI', basis: 'Union Customs Code — customs identification' },
  { path: 'identity.economicOperators.*.vat', audiences: ['authority'], label: 'Operator VAT', basis: 'Tax identification' },
  { path: 'identity.economicOperators.*.gln', audiences: ['retailer'], label: 'Operator GLN', basis: 'GS1 Global Location Number' },
  { path: 'identity.economicOperators.*.did', audiences: ['public'], label: 'Operator DID', basis: 'W3C Decentralized Identifiers — credential issuer binding' },

  // ── Composition ──────────────────────────────────────────────────────────
  { path: 'composition.overall.*.fibre', audiences: ['public'], label: 'Fibre', basis: 'Regulation (EU) 1007/2011 Art. 5 — fibre names', required: true , espr: true },
  { path: 'composition.overall.*.percentage', audiences: ['public'], label: 'Fibre percentage', basis: 'Regulation (EU) 1007/2011 Art. 9 — multi-fibre composition', required: true , espr: true },
  { path: 'composition.overall.*.originCountry', audiences: ['public'], label: 'Fibre origin', basis: 'EU Strategy for Sustainable and Circular Textiles — traceability' },
  { path: 'composition.overall.*.recycled.share', audiences: ['public'], label: 'Recycled share', basis: 'ESPR Annex I (f) — recycled content' , espr: true },
  { path: 'composition.overall.*.recycled.source', audiences: ['public'], label: 'Recycled source', basis: 'ISO 14021 — pre/post-consumer distinction' , espr: true },
  { path: 'composition.overall.*.recycled.custodyModel', audiences: ['public'], label: 'Chain of custody', basis: 'ISO 22095 — chain of custody models' },
  { path: 'composition.overall.*.recycled.feedstock', audiences: ['recycler', 'retailer'], label: 'Recycled feedstock', basis: 'Recycling route determination' },
  { path: 'composition.overall.*.organic.share', audiences: ['public'], label: 'Organic share', basis: 'Directive (EU) 2024/825 — substantiated claims' },
  { path: 'composition.overall.*.organic.scheme', audiences: ['public'], label: 'Organic scheme', basis: 'Directive (EU) 2024/825 — certification-backed claims' },
  { path: 'composition.overall.*.organic.custodyModel', audiences: ['public'], label: 'Organic chain of custody', basis: 'ISO 22095' },
  { path: 'composition.overall.*.certificationRefs', audiences: ['public'], label: 'Fibre certificates', basis: 'Directive (EU) 2024/825 — claim substantiation' },
  { path: 'composition.overall.*.supplierRef', audiences: ['authority'], label: 'Fibre supplier', basis: 'CSDDD — supply chain due diligence', sensitive: true },

  { path: 'composition.components.*.ref', audiences: ['public'], label: 'Component reference', basis: 'ESPR Annex III — component breakdown' },
  { path: 'composition.components.*.kind', audiences: ['public'], label: 'Component', basis: 'ESPR Annex III — component breakdown' },
  { path: 'composition.components.*.name', audiences: ['public'], label: 'Component name', basis: 'ESPR Annex III' },
  { path: 'composition.components.*.weightGrams', audiences: ['recycler', 'repairer', 'retailer'], label: 'Component weight', basis: 'Recycling yield estimation' },
  { path: 'composition.components.*.weightShare', audiences: ['public'], label: 'Component weight share', basis: 'Recycling yield estimation' },
  { path: 'composition.components.*.fibres.*.fibre', audiences: ['public'], label: 'Component fibre', basis: 'Regulation (EU) 1007/2011 Art. 11 — multi-component products' },
  { path: 'composition.components.*.fibres.*.percentage', audiences: ['public'], label: 'Component fibre percentage', basis: 'Regulation (EU) 1007/2011 Art. 11' },
  { path: 'composition.components.*.fibres.*.originCountry', audiences: ['retailer', 'recycler'], label: 'Component fibre origin', basis: 'Traceability' },
  { path: 'composition.components.*.fibres.*.recycled.share', audiences: ['public'], label: 'Component recycled share', basis: 'ESPR Annex I (f)' },
  { path: 'composition.components.*.fibres.*.recycled.source', audiences: ['public'], label: 'Component recycled source', basis: 'ISO 14021' },
  { path: 'composition.components.*.fibres.*.recycled.custodyModel', audiences: ['recycler', 'retailer'], label: 'Component chain of custody', basis: 'ISO 22095' },
  { path: 'composition.components.*.fibres.*.organic.share', audiences: ['public'], label: 'Component organic share', basis: 'Directive (EU) 2024/825' },
  { path: 'composition.components.*.fibres.*.organic.scheme', audiences: ['public'], label: 'Component organic scheme', basis: 'Directive (EU) 2024/825' },
  { path: 'composition.components.*.fibres.*.organic.custodyModel', audiences: ['recycler', 'retailer'], label: 'Component organic custody', basis: 'ISO 22095' },
  { path: 'composition.components.*.fibres.*.certificationRefs', audiences: ['public'], label: 'Component certificates', basis: 'Claim substantiation' },
  { path: 'composition.components.*.fibres.*.supplierRef', audiences: ['authority'], label: 'Component fibre supplier', basis: 'CSDDD', sensitive: true },
  { path: 'composition.components.*.construction', audiences: ['public'], label: 'Construction', basis: 'Recycling route determination' },
  { path: 'composition.components.*.fabricWeightGsm', audiences: ['retailer', 'recycler', 'repairer'], label: 'Fabric weight', basis: 'Technical specification' },
  { path: 'composition.components.*.colour', audiences: ['public'], label: 'Component colour', basis: 'Product identification' },
  { path: 'composition.components.*.removable', audiences: ['public'], label: 'Removable', basis: 'ESPR Annex I (d) — ease of disassembly' },
  { path: 'composition.components.*.supplierRef', audiences: ['authority'], label: 'Component supplier', basis: 'CSDDD', sensitive: true },

  { path: 'composition.totalWeightGrams', audiences: ['public'], label: 'Total weight', basis: 'ESPR Annex III — mass' , espr: true },
  { path: 'composition.monomaterial', audiences: ['public'], label: 'Single-fibre product', basis: 'ESPR Annex I (b) — ease of recycling' },
  { path: 'composition.totalRecycledContent', audiences: ['public'], label: 'Total recycled content', basis: 'ESPR Annex I (f)' , espr: true },
  { path: 'composition.nonTextileAnimalParts.*.description', audiences: ['public'], label: 'Non-textile animal part', basis: 'Regulation (EU) 1007/2011 Art. 12 — animal origin declaration', required: true },
  { path: 'composition.nonTextileAnimalParts.*.species', audiences: ['public'], label: 'Species', basis: 'Regulation (EU) 1007/2011 Art. 12' },

  // ── Substances ───────────────────────────────────────────────────────────
  { path: 'substances.substancesOfConcern.*.name', audiences: ['public'], label: 'Substance of concern', basis: 'ESPR Art. 7(5) — substances of concern must be traceable', required: true , espr: true },
  { path: 'substances.substancesOfConcern.*.casNumber', audiences: ['public'], label: 'CAS number', basis: 'ESPR Art. 7(5)' , espr: true },
  { path: 'substances.substancesOfConcern.*.ecNumber', audiences: ['recycler', 'authority'], label: 'EC number', basis: 'REACH — substance identification' },
  { path: 'substances.substancesOfConcern.*.svhc', audiences: ['public'], label: 'SVHC', basis: 'REACH Art. 33 — candidate list communication' },
  { path: 'substances.substancesOfConcern.*.concentrationRange', audiences: ['public'], label: 'Concentration', basis: `ESPR Art. 7(5); ${JRC} proposes this public at batch level`, espr: true },
  { path: 'substances.substancesOfConcern.*.componentRef', audiences: ['recycler', 'repairer', 'authority'], label: 'Located in', basis: `ESPR Art. 7(5); ${JRC} classifies location as legitimate interest`, regulated: 'legitimate_interest', espr: true },
  { path: 'substances.substancesOfConcern.*.scipNumber', audiences: ['recycler', 'authority'], label: 'SCIP number', basis: 'Waste Framework Directive Art. 9(1)(i) — SCIP database' },
  { path: 'substances.substancesOfConcern.*.safeUseInstructions', audiences: ['public'], label: 'Safe use', basis: 'REACH Art. 33 — safe use information' , espr: true },
  { path: 'substances.restrictedSubstanceTests.*.standard', audiences: ['retailer', 'authority'], label: 'Test standard', basis: 'REACH Annex XVII — restricted substances' },
  { path: 'substances.restrictedSubstanceTests.*.analyte', audiences: ['retailer', 'authority'], label: 'Substance tested', basis: 'REACH Annex XVII' },
  { path: 'substances.restrictedSubstanceTests.*.result', audiences: ['retailer', 'authority'], label: 'Test result', basis: 'REACH Annex XVII' },
  { path: 'substances.restrictedSubstanceTests.*.limitValue', audiences: ['authority'], label: 'Limit value', basis: 'REACH Annex XVII' },
  { path: 'substances.restrictedSubstanceTests.*.measuredValue', audiences: ['authority'], label: 'Measured value', basis: 'REACH Annex XVII', sensitive: true },
  { path: 'substances.restrictedSubstanceTests.*.laboratory', audiences: ['authority'], label: 'Laboratory', basis: 'ISO/IEC 17025 — testing competence' },
  { path: 'substances.restrictedSubstanceTests.*.testedOn', audiences: ['retailer', 'authority'], label: 'Test date', basis: 'Evidence currency' },
  { path: 'substances.restrictedSubstanceTests.*.reportDocumentId', audiences: ['authority'], label: 'Test report', basis: 'Market surveillance evidence' },
  { path: 'substances.pfasStatus', audiences: ['public'], label: 'PFAS status', basis: 'REACH restriction proposal — per- and polyfluoroalkyl substances' },
  { path: 'substances.chemicalManagement.zdhcConformance', audiences: ['public'], label: 'ZDHC conformance', basis: 'ZDHC Roadmap to Zero — wastewater guidelines' },
  { path: 'substances.chemicalManagement.wastewaterTested', audiences: ['public'], label: 'Wastewater tested', basis: 'ZDHC Wastewater Guidelines' },
  { path: 'substances.chemicalManagement.mrslVersion', audiences: ['retailer', 'authority'], label: 'MRSL version', basis: 'ZDHC Manufacturing Restricted Substances List' },

  // ── Supply chain ─────────────────────────────────────────────────────────
  { path: 'supplyChain.steps.*.ref', audiences: ['public'], label: 'Step reference', basis: 'Traceability' },
  { path: 'supplyChain.steps.*.tier', audiences: ['public'], label: 'Supply tier', basis: 'EU Strategy for Sustainable and Circular Textiles — traceability' },
  { path: 'supplyChain.steps.*.process', audiences: ['public'], label: 'Process', basis: 'EU Strategy for Sustainable and Circular Textiles' },
  { path: 'supplyChain.steps.*.facilityName', audiences: ['public'], label: 'Facility name', basis: 'EN 18219 — facility identifier; CSDDD supply-chain due diligence', sensitive: true },
  { path: 'supplyChain.steps.*.facilityDisclosed', audiences: ['public'], label: 'Facility disclosed', basis: 'Transparency posture' },
  { path: 'supplyChain.steps.*.country', audiences: ['public'], label: 'Step country', basis: 'EU Strategy for Sustainable and Circular Textiles', required: true },
  { path: 'supplyChain.steps.*.city', audiences: ['public'], label: 'Step city', basis: 'Traceability' },
  { path: 'supplyChain.steps.*.osId', audiences: ['retailer', 'authority'], label: 'Open Supply Hub ID', basis: 'Open Supply Hub. Supplementary only \u2014 the JRC rejected it as not a formal standardised identifier scheme; the GLN is authoritative.' },
  { path: 'supplyChain.steps.*.gln', audiences: ['public'], label: 'Facility GLN', basis: `ESPR Annex III \u00b62 (ISO/IEC 15459); ${JRC} makes the manufacturing facility identifier public at batch level`, espr: true },
  { path: 'supplyChain.steps.*.coordinates.latitude', audiences: ['public'], label: 'Latitude', basis: 'Supply chain mapping' },
  { path: 'supplyChain.steps.*.coordinates.longitude', audiences: ['public'], label: 'Longitude', basis: 'Supply chain mapping' },
  { path: 'supplyChain.steps.*.componentRefs', audiences: ['public'], label: 'Components produced', basis: 'Traceability' },
  { path: 'supplyChain.steps.*.certificationRefs', audiences: ['public'], label: 'Step certificates', basis: 'Claim substantiation' },
  { path: 'supplyChain.steps.*.evidence', audiences: ['public'], label: 'Evidence level', basis: 'CSDDD — verification of due diligence' },
  { path: 'supplyChain.steps.*.workerCount', audiences: ['authority'], label: 'Workers at site', basis: 'CSDDD', sensitive: true },
  { path: 'supplyChain.traceabilityDepth', audiences: ['public'], label: 'Traceability depth', basis: 'EU Strategy for Sustainable and Circular Textiles' },
  { path: 'supplyChain.chainOfCustodyModel', audiences: ['public'], label: 'Chain of custody model', basis: 'ISO 22095' },

  // ── Environment ──────────────────────────────────────────────────────────
  { path: 'environment.pef.score', audiences: ['public'], label: 'Environmental footprint', basis: `PEFCR Apparel & Footwear v3.1 (29 Apr 2025). ${JRC} proposes the absolute value be legitimate-interest.`, regulated: 'legitimate_interest' },
  { path: 'environment.pef.unit', audiences: ['public'], label: 'Footprint unit', basis: 'PEFCR Apparel & Footwear' },
  { path: 'environment.pef.methodVersion', audiences: ['public'], label: 'PEF method version', basis: 'PEFCR Apparel & Footwear — comparability requires the method version' },
  { path: 'environment.pef.categoryRules', audiences: ['public'], label: 'Category rules', basis: 'PEFCR Apparel & Footwear' },
  { path: 'environment.pef.calculatedOn', audiences: ['public'], label: 'Calculated on', basis: 'Evidence currency' },
  { path: 'environment.pef.verifiedBy', audiences: ['public'], label: 'PEF verifier', basis: 'Directive (EU) 2024/825 — independent verification' },
  { path: 'environment.carbon.totalKgCo2e', audiences: ['public'], label: 'Carbon footprint', basis: `ESPR Annex I (h). Published voluntarily; ${JRC} proposes the absolute value be legitimate-interest and the class public.`, regulated: 'legitimate_interest' },
  { path: 'environment.carbon.boundary', audiences: ['public'], label: 'System boundary', basis: 'ISO 14067 — carbon footprint of products' },
  { path: 'environment.carbon.methodology', audiences: ['public'], label: 'Carbon methodology', basis: 'ISO 14067' },
  { path: 'environment.carbon.byStage.rawMaterial', audiences: ['public'], label: 'Carbon — raw material', basis: 'ISO 14067 — life cycle stages' },
  { path: 'environment.carbon.byStage.processing', audiences: ['public'], label: 'Carbon — processing', basis: 'ISO 14067' },
  { path: 'environment.carbon.byStage.manufacturing', audiences: ['public'], label: 'Carbon — manufacturing', basis: 'ISO 14067' },
  { path: 'environment.carbon.byStage.transport', audiences: ['public'], label: 'Carbon — transport', basis: 'ISO 14067' },
  { path: 'environment.carbon.byStage.use', audiences: ['public'], label: 'Carbon — use phase', basis: 'ISO 14067' },
  { path: 'environment.carbon.byStage.endOfLife', audiences: ['public'], label: 'Carbon — end of life', basis: 'ISO 14067' },
  { path: 'environment.carbon.verifiedBy', audiences: ['public'], label: 'Carbon verifier', basis: 'Directive (EU) 2024/825' },
  { path: 'environment.carbon.calculatedOn', audiences: ['public'], label: 'Carbon calculated on', basis: 'Evidence currency' },
  { path: 'environment.water.litres', audiences: ['public'], label: 'Water use', basis: 'PEFCR Apparel & Footwear — water scarcity' },
  { path: 'environment.water.scarcityWeightedM3', audiences: ['public'], label: 'Water scarcity footprint', basis: 'ISO 14046 — water footprint' },
  { path: 'environment.water.methodology', audiences: ['public'], label: 'Water methodology', basis: 'ISO 14046' },
  { path: 'environment.energyMj', audiences: ['public'], label: 'Energy use', basis: 'PEFCR Apparel & Footwear' },
  { path: 'environment.landUseM2Year', audiences: ['public'], label: 'Land use', basis: 'PEFCR Apparel & Footwear' },
  { path: 'environment.microplastics.testMethod', audiences: ['public'], label: 'Microplastic test method', basis: 'EU Strategy for Sustainable and Circular Textiles — microplastic release' },
  { path: 'environment.microplastics.releaseMgPerKgWash', audiences: ['public'], label: 'Microplastic release', basis: 'EU Strategy for Sustainable and Circular Textiles' },
  { path: 'environment.microplastics.mitigation', audiences: ['public'], label: 'Microplastic mitigation', basis: 'EU Strategy for Sustainable and Circular Textiles' },
  { path: 'environment.lcaDocumentId', audiences: ['retailer', 'authority'], label: 'LCA study', basis: 'Directive (EU) 2024/825 — substantiation evidence' },

  { path: 'environment.footprintClass', audiences: ['public'], label: 'Footprint class', basis: `PEFCR Apparel & Footwear v3.1; JRC, DPP content for textile apparel under ESPR (13 May 2026) proposes a class of performance as the public footprint field`, espr: true },

  // ── Durability ───────────────────────────────────────────────────────────
  { path: 'durability.robustnessScore', audiences: ['public'], label: 'Robustness score', basis: `JRC, DPP content for textile apparel under ESPR (13 May 2026) design option DO1 \u2014 proposed information requirement`, espr: true },
  { path: 'durability.robustnessEvidence.visualInspection.standard', audiences: ['public'], label: 'Visual inspection standard', basis: 'ISO 15487', espr: true },
  { path: 'durability.robustnessEvidence.visualInspection.grade', audiences: ['public'], label: 'Visual inspection grade', basis: 'ISO 15487', espr: true },
  { path: 'durability.robustnessEvidence.spiralityPercent', audiences: ['public'], label: 'Spirality', basis: 'ISO 16322-3', espr: true },
  { path: 'durability.robustnessEvidence.dimensionalChangePercent', audiences: ['public'], label: 'Dimensional change', basis: 'ISO 3759', espr: true },
  { path: 'durability.robustnessEvidence.washCycles', audiences: ['public'], label: 'Wash cycles tested', basis: 'ISO 6330 \u2014 five cycles at the care-label setting', espr: true },
  { path: 'durability.dimensionalStability.standard', audiences: ['public'], label: 'Shrinkage standard', basis: 'ESPR Annex I (a) — durability' },
  { path: 'durability.dimensionalStability.changePercent', audiences: ['public'], label: 'Shrinkage', basis: 'ESPR Annex I (a)' },
  { path: 'durability.dimensionalStability.wash', audiences: ['public'], label: 'Shrinkage test wash', basis: 'ESPR Annex I (a)' },
  { path: 'durability.colourFastness.*.standard', audiences: ['public'], label: 'Colour fastness standard', basis: 'ISO 105 series — colour fastness' },
  { path: 'durability.colourFastness.*.against', audiences: ['public'], label: 'Colour fastness to', basis: 'ISO 105 series' },
  { path: 'durability.colourFastness.*.grade', audiences: ['public'], label: 'Colour fastness grade', basis: 'ISO 105 series' },
  { path: 'durability.pillingResistance.standard', audiences: ['public'], label: 'Pilling standard', basis: 'ISO 12945 — pilling resistance' },
  { path: 'durability.pillingResistance.grade', audiences: ['public'], label: 'Pilling grade', basis: 'ISO 12945' },
  { path: 'durability.abrasionResistance.standard', audiences: ['public'], label: 'Abrasion standard', basis: 'ISO 12947 — Martindale abrasion' },
  { path: 'durability.abrasionResistance.martindaleCycles', audiences: ['public'], label: 'Martindale cycles', basis: 'ISO 12947' },
  { path: 'durability.tensileStrengthN', audiences: ['retailer', 'repairer'], label: 'Tensile strength', basis: 'ISO 13934 — tensile properties' },
  { path: 'durability.seamSlippage.standard', audiences: ['retailer', 'repairer'], label: 'Seam slippage standard', basis: 'ISO 13936 — seam slippage' },
  { path: 'durability.seamSlippage.passed', audiences: ['retailer', 'repairer'], label: 'Seam slippage result', basis: 'ISO 13936' },
  { path: 'durability.expectedWashCycles', audiences: ['public'], label: 'Expected wash cycles', basis: 'ESPR Annex I (a) — product lifetime' },
  { path: 'durability.warrantyMonths', audiences: ['public'], label: 'Warranty', basis: 'Directive (EU) 2024/825 — commercial guarantee information' , espr: true },
  { path: 'durability.repairabilityScore', audiences: ['public'], label: 'Repairability score', basis: `Voluntary brand claim. ${JRC} assessed a repairability requirement and rejected it as not objectively quantifiable.` },

  // ── Care & repair ────────────────────────────────────────────────────────
  { path: 'care.symbols', audiences: ['public'], label: 'Care symbols', basis: 'ISO 3758 / GINETEX — care labelling', required: true , espr: true },
  { path: 'care.instructions', audiences: ['public'], label: 'Care instructions', basis: 'ISO 3758', required: true , espr: true },
  { path: 'care.lowImpactTips', audiences: ['public'], label: 'Low-impact care', basis: 'ESPR Annex I — use-phase impact' },
  { path: 'care.repair.instructions', audiences: ['public'], label: 'Repair instructions', basis: 'ESPR Annex I (c) — ease of repair' },
  { path: 'care.repair.guideUrl', audiences: ['public'], label: 'Repair guide', basis: 'ESPR Annex I (c)' },
  { path: 'care.repair.sparePartsAvailable', audiences: ['public'], label: 'Spare parts available', basis: 'ESPR Annex I (c) — availability of spare parts' },
  { path: 'care.repair.sparePartsUntil', audiences: ['public'], label: 'Spare parts until', basis: 'ESPR Annex I (c)' },
  { path: 'care.repair.spareParts.*.name', audiences: ['public'], label: 'Spare part', basis: 'ESPR Annex I (c)' },
  { path: 'care.repair.spareParts.*.reference', audiences: ['repairer', 'retailer'], label: 'Spare part reference', basis: 'ESPR Annex I (c)' },
  { path: 'care.repair.partnerRefs', audiences: ['public'], label: 'Repair partners', basis: 'ESPR Annex I (c)' },

  // ── Circularity ──────────────────────────────────────────────────────────
  { path: 'circularity.recyclability.score', audiences: ['public'], label: 'Recyclability score', basis: `JRC, DPP content for textile apparel under ESPR (13 May 2026) design option DO2 \u2014 proposed information requirement`, espr: true },
  { path: 'circularity.recyclability.recyclableShare', audiences: ['public'], label: 'Recyclable share', basis: 'ESPR Annex I (b) — ease of recycling' },
  { path: 'circularity.recyclability.route', audiences: ['public'], label: 'Recycling route', basis: 'ESPR Annex I (b)' },
  { path: 'circularity.recyclability.disruptors', audiences: ['public'], label: 'Recycling disruptors', basis: 'ESPR Annex I (b) — presence of substances hampering recycling' },
  { path: 'circularity.recyclability.disassemblySteps.*.order', audiences: ['recycler', 'repairer'], label: 'Disassembly step order', basis: 'ESPR Annex I (d)', regulated: 'legitimate_interest', espr: true },
  { path: 'circularity.recyclability.disassemblySteps.*.instruction', audiences: ['recycler', 'repairer'], label: 'Disassembly instruction', basis: `ESPR Annex I (d); ${JRC} classifies disassembly and end-of-life information as legitimate interest`, regulated: 'legitimate_interest', espr: true },
  { path: 'circularity.recyclability.disassemblySteps.*.componentRef', audiences: ['recycler', 'repairer'], label: 'Disassembly component', basis: 'ESPR Annex I (d)', regulated: 'legitimate_interest', espr: true },
  { path: 'circularity.recyclability.disassemblySteps.*.toolRequired', audiences: ['recycler', 'repairer'], label: 'Tool required', basis: 'ESPR Annex I (d)', regulated: 'legitimate_interest', espr: true },
  { path: 'circularity.recyclability.disassemblySteps.*.estimatedSeconds', audiences: ['recycler', 'repairer'], label: 'Disassembly time', basis: 'ESPR Annex I (d)' },
  { path: 'circularity.recyclability.separationNotes', audiences: ['recycler', 'repairer'], label: 'Separation notes', basis: 'ESPR Annex I (b)', regulated: 'legitimate_interest', espr: true },
  { path: 'circularity.takeBack.available', audiences: ['public'], label: 'Take-back available', basis: 'Waste Framework Directive — separate collection of textiles' },
  { path: 'circularity.takeBack.url', audiences: ['public'], label: 'Take-back link', basis: 'Waste Framework Directive' },
  { path: 'circularity.takeBack.instructions', audiences: ['public'], label: 'Take-back instructions', basis: 'Waste Framework Directive' },
  { path: 'circularity.takeBack.incentive', audiences: ['public'], label: 'Take-back incentive', basis: 'Consumer information' },
  { path: 'circularity.resale.brandAuthorised', audiences: ['public'], label: 'Resale authorised', basis: 'ESPR Annex I — reuse' },
  { path: 'circularity.resale.url', audiences: ['public'], label: 'Resale link', basis: 'ESPR Annex I — reuse' },
  { path: 'circularity.resale.authenticationSupported', audiences: ['public'], label: 'Resale authentication', basis: 'ESPR Annex I — reuse' },
  { path: 'circularity.rental.available', audiences: ['public'], label: 'Rental available', basis: 'ESPR Annex I — reuse' },
  { path: 'circularity.rental.url', audiences: ['public'], label: 'Rental link', basis: 'ESPR Annex I — reuse' },
  { path: 'circularity.eprRegistrations.*.country', audiences: ['public'], label: 'EPR country', basis: 'Waste Framework Directive — extended producer responsibility for textiles' },
  { path: 'circularity.eprRegistrations.*.scheme', audiences: ['public'], label: 'EPR scheme', basis: 'Waste Framework Directive' },
  { path: 'circularity.eprRegistrations.*.producerNumber', audiences: ['retailer', 'recycler', 'authority'], label: 'EPR producer number', basis: 'Waste Framework Directive — producer registration' },
  { path: 'circularity.eprRegistrations.*.validUntil', audiences: ['retailer', 'recycler', 'authority'], label: 'EPR valid until', basis: 'Waste Framework Directive' },
  { path: 'circularity.wasteCode', audiences: ['public'], label: 'Waste code', basis: 'Commission Decision 2000/532/EC — European List of Waste' },
  { path: 'circularity.endOfLifeInstructions', audiences: ['public'], label: 'End-of-life instructions', basis: 'Waste Framework Directive' },

  // ── Social ───────────────────────────────────────────────────────────────
  { path: 'social.dueDiligenceStatementUrl', audiences: ['public'], label: 'Due diligence statement', basis: 'CSDDD — public due diligence reporting' },
  { path: 'social.policies.*.kind', audiences: ['public'], label: 'Policy', basis: 'CSDDD' },
  { path: 'social.policies.*.url', audiences: ['public'], label: 'Policy link', basis: 'CSDDD' },
  { path: 'social.policies.*.updatedOn', audiences: ['public'], label: 'Policy updated', basis: 'CSDDD' },
  { path: 'social.audits.*.stepRef', audiences: ['retailer', 'authority'], label: 'Audited step', basis: 'CSDDD — supplier audits' },
  { path: 'social.audits.*.standard', audiences: ['public'], label: 'Audit standard', basis: 'CSDDD' },
  { path: 'social.audits.*.conductedOn', audiences: ['public'], label: 'Audit date', basis: 'CSDDD' },
  { path: 'social.audits.*.outcome', audiences: ['retailer', 'authority'], label: 'Audit outcome', basis: 'CSDDD', sensitive: true },
  { path: 'social.audits.*.findingsSummary', audiences: ['authority'], label: 'Audit findings', basis: 'CSDDD', sensitive: true },
  { path: 'social.audits.*.reportDocumentId', audiences: ['authority'], label: 'Audit report', basis: 'CSDDD', sensitive: true },
  { path: 'social.livingWage.programme', audiences: ['public'], label: 'Living wage programme', basis: 'CSDDD — human rights due diligence' },
  { path: 'social.livingWage.benchmarkSource', audiences: ['public'], label: 'Living wage benchmark', basis: 'CSDDD' },
  { path: 'social.livingWage.coveredStepRefs', audiences: ['retailer', 'authority'], label: 'Living wage coverage', basis: 'CSDDD' },
  { path: 'social.grievanceMechanismUrl', audiences: ['public'], label: 'Grievance mechanism', basis: 'CSDDD Art. 14 — notification and complaints' },

  // ── Claims & certifications ──────────────────────────────────────────────
  { path: 'claims.*.id', audiences: ['public'], label: 'Claim reference', basis: 'Directive (EU) 2024/825' },
  { path: 'claims.*.statement', audiences: ['public'], label: 'Claim', basis: 'Directive (EU) 2024/825 — environmental claims' },
  { path: 'claims.*.kind', audiences: ['public'], label: 'Claim type', basis: 'Directive (EU) 2024/825' },
  { path: 'claims.*.scope', audiences: ['public'], label: 'Claim scope', basis: 'Directive (EU) 2024/825 — claims must state what they cover' },
  { path: 'claims.*.scopeRef', audiences: ['public'], label: 'Claim applies to', basis: 'Directive (EU) 2024/825' },
  { path: 'claims.*.evidence', audiences: ['public'], label: 'Claim evidence', basis: 'Directive (EU) 2024/825 — substantiation', required: true },
  { path: 'claims.*.verifiedBy', audiences: ['public'], label: 'Claim verifier', basis: 'Directive (EU) 2024/825 — independent verification' },
  { path: 'claims.*.validUntil', audiences: ['public'], label: 'Claim valid until', basis: 'Evidence currency' },

  { path: 'certifications.*.id', audiences: ['public'], label: 'Certificate reference', basis: 'Claim substantiation' },
  { path: 'certifications.*.scheme', audiences: ['public'], label: 'Certification scheme', basis: 'Directive (EU) 2024/825 — sustainability labels' },
  { path: 'certifications.*.licenceNumber', audiences: ['public'], label: 'Licence number', basis: 'Scheme verification — allows a reader to check the certifier database' },
  { path: 'certifications.*.scope', audiences: ['public'], label: 'Certificate scope', basis: 'Directive (EU) 2024/825' },
  { path: 'certifications.*.issuedBy', audiences: ['public'], label: 'Issued by', basis: 'Directive (EU) 2024/825' },
  { path: 'certifications.*.validFrom', audiences: ['public'], label: 'Valid from', basis: 'Evidence currency' },
  { path: 'certifications.*.validUntil', audiences: ['public'], label: 'Valid until', basis: 'Evidence currency' },
  { path: 'certifications.*.credentialId', audiences: ['public'], label: 'Verifiable credential', basis: 'W3C Verifiable Credentials — machine verification' },
  { path: 'certifications.*.documentId', audiences: ['retailer', 'authority'], label: 'Certificate document', basis: 'Market surveillance evidence' },
  { path: 'certifications.*.appliesToStepRefs', audiences: ['public'], label: 'Covers steps', basis: 'Scope transparency' },
  { path: 'certifications.*.appliesToComponentRefs', audiences: ['public'], label: 'Covers components', basis: 'Scope transparency' },

  // ── Commercial ───────────────────────────────────────────────────────────
  { path: 'commercial.launchDate', audiences: ['public'], label: 'Launch date', basis: 'Product information' },
  { path: 'commercial.marketsPlaced', audiences: ['retailer', 'authority'], label: 'Markets placed', basis: 'Regulation (EU) 2019/1020 — market surveillance scope' },
  { path: 'commercial.recommendedRetailPrice.amount', audiences: ['retailer'], label: 'RRP', basis: 'Trade information', sensitive: true },
  { path: 'commercial.recommendedRetailPrice.currency', audiences: ['retailer'], label: 'RRP currency', basis: 'Trade information' },
];

/** Every registry path, for the field-visibility settings UI. */
export const REGISTRY_PATHS = FIELD_REGISTRY.map((f) => f.path);

/** Fields a passport cannot be published without. */
export const REQUIRED_PATHS = FIELD_REGISTRY.filter((f) => f.required).map((f) => f.path);

export function findEntry(path: string): FieldEntry | undefined {
  return FIELD_REGISTRY.find((f) => f.path === path);
}
