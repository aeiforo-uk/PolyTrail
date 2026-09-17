import pg from 'pg';
import { randomUUID, randomBytes, createHash, scryptSync } from 'node:crypto';

/**
 * Seed a demo workspace with one fully-populated passport.
 *
 * The demo garment is deliberately imperfect — an elastane blend with a metal
 * zip, mass-balance recycled polyester, and one audit finding in remediation.
 * A seed where everything is perfect teaches nobody how the product behaves
 * when the data is real.
 */

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set.'); process.exit(1); }

const client = new pg.Client({ connectionString: url });
await client.connect();

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, 64, { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return ['scrypt', 1 << 17, 8, 1, salt.toString('base64'), derived.toString('base64')].join('$');
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function dppId() {
  const b = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

function canonical(value) {
  // RFC 8785-ish: sort keys recursively. Enough for a seed hash.
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((acc, k) => { acc[k] = sort(v[k]); return acc; }, {});
    }
    return v;
  };
  return JSON.stringify(sort(value));
}
const hash = (v) => '0x' + createHash('sha256').update(canonical(v), 'utf8').digest('hex');

await client.query('BEGIN');
try {
  // ── Tenant ───────────────────────────────────────────────────────────────
  const tenantId = randomUUID();
  await client.query(
    `INSERT INTO tenants (id, slug, legal_name, trade_name, country, vat_number, lei, gs1_company_prefix, did, contact_email, website, status, plan, passport_quota, registered_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active','growth',5000,$12)`,
    [tenantId, 'meridian', 'Meridian Studio B.V.', 'Meridian', 'NL', 'NL863294201B01',
     '724500VKKSH9QODZZ12', '8712345', 'did:web:meridian.polytrail.eu',
     'compliance@meridian.example', 'https://meridian.example',
     JSON.stringify({ line1: 'Keizersgracht 241', city: 'Amsterdam', postalCode: '1016 EA', country: 'NL' })],
  );

  await client.query(
    `INSERT INTO tenant_branding (tenant_id, accent_color, display_font, footer_text, support_url)
     VALUES ($1,$2,$3,$4,$5)`,
    [tenantId, 'oklch(46% 0.14 265)', 'Instrument Serif',
     'Meridian Studio B.V. — Amsterdam', 'https://meridian.example/support'],
  );

  // ── Users ────────────────────────────────────────────────────────────────
  const pw = hashPassword('Polytrail!2026');
  // One account per persona, because the five surfaces are genuinely different
  // products and none of them can be judged from the brand console.
  const users = [
    ['admin@polytrail.eu', 'Platform Operator', 'PLATFORM_ADMIN', null],
    ['admin@aeiforo.co.uk', 'Ada Okonkwo', 'BRAND_ADMIN', tenantId],
    ['product@aeiforo.co.uk', 'Tomás Ferreira', 'PRODUCT_MANAGER', tenantId],
    ['compliance@aeiforo.co.uk', 'Inés Vidal', 'COMPLIANCE_OFFICER', tenantId],
    ['rui@adriano.example', 'Rui Baptista', 'SUPPLIER', tenantId],
    ['mira@menders.example', 'Mira Halvorsen', 'REPAIRER', tenantId],
    ['jonas@refibre.example', 'Jonas Bakker', 'RECYCLER', tenantId],
    ['audit@asae.example', 'ASAE Inspector', 'AUTHORITY', tenantId],
    ['cert@controlunion.example', 'Control Union', 'CERTIFIER', tenantId],
  ];
  const userIds = {};
  for (const [email, name, role, tid] of users) {
    const id = randomUUID();
    userIds[role] = id;
    await client.query(
      `INSERT INTO users (id, tenant_id, email, name, password_hash, role, status, job_title)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7)`,
      [id, tid, email, name, pw, role,
       ({
         BRAND_ADMIN: 'Head of Sustainability',
         PRODUCT_MANAGER: 'Product Data Lead',
         COMPLIANCE_OFFICER: 'Compliance Manager',
         SUPPLIER: 'Production Manager, Adriano Confecções',
         REPAIRER: 'Menders Oslo',
         RECYCLER: 'ReFibre Rotterdam',
         AUTHORITY: 'Market surveillance, Portugal',
         CERTIFIER: 'Certification body',
       })[role] ?? 'Operations'],
    );
  }

  // ── Partners ─────────────────────────────────────────────────────────────
  const partners = [
    ['Adriano Confecções', 'tier_1_assembly', ['cut_make_trim'], 'PT', 'Barcelos', '41.5388', '-8.6151', 180],
    ['Tintex Textiles', 'tier_2_material', ['knitting','dyeing','finishing'], 'PT', 'Vila Nova de Cerveira', '41.9403', '-8.7440', 320],
    ['Filatura Bergamo', 'tier_3_processing', ['spinning'], 'IT', 'Bergamo', '45.6983', '9.6773', 95],
    ['Ege Pamuk Kooperatifi', 'tier_4_raw_material', ['farm','ginning'], 'TR', 'Aydın', '37.8560', '27.8416', 1400],
    ['Repreve Fibre Works', 'tier_4_raw_material', ['recycler','fibre_producer'], 'TR', 'Bursa', '40.1826', '29.0669', 260],
    ['YKK Europe', 'tier_2_material', ['trim_supplier'], 'NL', 'Sneek', '53.0330', '5.6583', 410],
  ];
  const partnerIds = {};
  for (const [name, tier, roles, country, city, lat, lon, workers] of partners) {
    const id = randomUUID();
    partnerIds[name] = id;
    await client.query(
      `INSERT INTO partners (id, tenant_id, name, legal_name, tier, roles, country, address, latitude, longitude, worker_count, capabilities)
       VALUES ($1,$2,$3,$3,$4,$5::partner_role[],$6,$7,$8,$9,$10,$11)`,
      [id, tenantId, name, tier, roles, country,
       JSON.stringify({ city, country }), lat, lon, workers, roles],
    );
  }

  // ── Product ──────────────────────────────────────────────────────────────
  const productId = randomUUID();
  await client.query(
    `INSERT INTO products (id, tenant_id, name, style_number, category, hs_code, season, target_market, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [productId, tenantId, 'Coastline Half-Zip', 'MRD-2601', 'apparel.tops.knitwear',
     '61101130', 'AW26', 'unisex',
     'A mid-weight half-zip knit in a cotton and recycled polyester blend, knitted and dyed in northern Portugal.',
     userIds.PRODUCT_MANAGER],
  );

  // ── Passport payload ─────────────────────────────────────────────────────
  const payload = {
    schemaVersion: '1.0',
    identity: {
      productName: { en: 'Coastline Half-Zip', nl: 'Coastline Half-Zip', de: 'Coastline Half-Zip' },
      brandName: 'Meridian',
      styleNumber: 'MRD-2601',
      sku: 'MRD-2601-NVY-M',
      gtin: '08712345678906',
      category: 'apparel.tops.knitwear',
      hsCode: '61101130',
      colourName: 'Deep Navy',
      colourCode: 'NVY',
      size: 'M',
      sizeSystem: 'EU',
      season: 'AW26',
      countryOfOrigin: 'PT',
      netWeightGrams: 412,
      // Technical flats, not photography: the drawing convention product teams
      // use before a sample exists. Self-hosted, so a passport's imagery
      // cannot rot when someone else's CDN moves.
      images: [
        {
          url: '/products/coastline-half-zip-navy.svg',
          alt: 'Technical flat of the Coastline Half-Zip in Deep Navy',
          kind: 'flat',
        },
      ],
      description: {
        en: 'A mid-weight half-zip knit designed to be worn for a decade. Knitted, dyed and finished within forty kilometres of the mill that spun its yarn.',
      },
      economicOperators: [
        {
          name: 'Meridian Studio B.V.',
          role: 'manufacturer',
          address: { line1: 'Keizersgracht 241', city: 'Amsterdam', postalCode: '1016 EA', country: 'NL' },
          email: 'compliance@meridian.example',
          lei: '724500VKKSH9QODZZ12',
          vat: 'NL863294201B01',
          did: 'did:web:meridian.polytrail.eu',
        },
      ],
    },
    composition: {
      overall: [
        { fibre: 'cotton', percentage: 62, originCountry: 'TR',
          organic: { share: 100, scheme: 'GOTS', custodyModel: 'segregated' },
          certificationRefs: ['cert-gots'] },
        { fibre: 'polyester', percentage: 34, originCountry: 'TR',
          recycled: { share: 100, source: 'post_consumer', custodyModel: 'mass_balance', feedstock: 'Post-consumer PET bottles' },
          certificationRefs: ['cert-grs'] },
        { fibre: 'elastane', percentage: 4, originCountry: 'IT' },
      ],
      components: [
        { ref: 'shell', kind: 'shell', name: 'Main body knit', weightGrams: 356, weightShare: 86.4,
          construction: 'knitted', fabricWeightGsm: 320, colour: 'Deep Navy', removable: false,
          fibres: [
            { fibre: 'cotton', percentage: 64, originCountry: 'TR', organic: { share: 100, scheme: 'GOTS', custodyModel: 'segregated' } },
            { fibre: 'polyester', percentage: 32, originCountry: 'TR', recycled: { share: 100, source: 'post_consumer', custodyModel: 'mass_balance' } },
            { fibre: 'elastane', percentage: 4, originCountry: 'IT' },
          ] },
        { ref: 'rib', kind: 'rib', name: 'Collar and cuff rib', weightGrams: 34, weightShare: 8.3,
          construction: 'knitted', fibres: [
            { fibre: 'cotton', percentage: 95, originCountry: 'TR' },
            { fibre: 'elastane', percentage: 5, originCountry: 'IT' },
          ] },
        { ref: 'zip', kind: 'zip', name: 'YKK Excella half-zip', weightGrams: 18, weightShare: 4.4,
          removable: true, fibres: [{ fibre: 'polyester', percentage: 100 }] },
        { ref: 'thread', kind: 'thread', name: 'Sewing thread', weightGrams: 4, weightShare: 0.9,
          fibres: [{ fibre: 'polyester', percentage: 100, recycled: { share: 100, source: 'pre_consumer', custodyModel: 'controlled_blend' } }] },
      ],
      totalWeightGrams: 412,
      monomaterial: false,
      totalRecycledContent: 34,
    },
    substances: {
      substancesOfConcern: [],
      restrictedSubstanceTests: [
        { standard: 'EN 14362-1', analyte: 'Azo dyes (aromatic amines)', result: 'pass', limitValue: '< 20 mg/kg', laboratory: 'SGS Portugal', testedOn: '2026-03-11', reportDocumentId: 'doc-azo' },
        { standard: 'EN 16711-2', analyte: 'Extractable heavy metals', result: 'pass', limitValue: 'within Annex XVII limits', laboratory: 'SGS Portugal', testedOn: '2026-03-11' },
        { standard: 'CEN/TS 15968', analyte: 'PFOA and related substances', result: 'pass', limitValue: '< 25 ppb', laboratory: 'SGS Portugal', testedOn: '2026-03-11' },
      ],
      pfasStatus: 'none_intentionally_added',
      chemicalManagement: { zdhcConformance: 'level_3', wastewaterTested: true, mrslVersion: 'ZDHC MRSL v3.1' },
    },
    supplyChain: {
      steps: [
        { ref: 'farm', tier: 'tier_4_raw_material', process: 'farming', facilityName: 'Ege Pamuk Kooperatifi', facilityDisclosed: true, country: 'TR', city: 'Aydın', coordinates: { latitude: 37.856, longitude: 27.8416 }, componentRefs: ['shell','rib'], evidence: 'third_party_audited', certificationRefs: ['cert-gots'], workerCount: 1400 },
        { ref: 'recovery', tier: 'tier_4_raw_material', process: 'material_recovery', facilityName: 'Repreve Fibre Works', facilityDisclosed: true, country: 'TR', city: 'Bursa', coordinates: { latitude: 40.1826, longitude: 29.0669 }, componentRefs: ['shell'], evidence: 'third_party_audited', certificationRefs: ['cert-grs'], workerCount: 260 },
        { ref: 'spin', tier: 'tier_3_processing', process: 'spinning', facilityName: 'Filatura Bergamo', facilityDisclosed: true, country: 'IT', city: 'Bergamo', coordinates: { latitude: 45.6983, longitude: 9.6773 }, componentRefs: ['shell','rib'], evidence: 'document_verified', workerCount: 95 },
        { ref: 'knit', tier: 'tier_2_material', process: 'knitting', facilityName: 'Tintex Textiles', facilityDisclosed: true, country: 'PT', city: 'Vila Nova de Cerveira', coordinates: { latitude: 41.9403, longitude: -8.744 }, componentRefs: ['shell','rib'], evidence: 'third_party_audited', certificationRefs: ['cert-oeko'], workerCount: 320 },
        { ref: 'dye', tier: 'tier_2_material', process: 'dyeing', facilityName: 'Tintex Textiles', facilityDisclosed: true, country: 'PT', city: 'Vila Nova de Cerveira', coordinates: { latitude: 41.9403, longitude: -8.744 }, componentRefs: ['shell','rib'], evidence: 'third_party_audited', certificationRefs: ['cert-oeko'] },
        { ref: 'trim', tier: 'tier_2_material', process: 'fibre_production', facilityName: 'YKK Europe', facilityDisclosed: true, country: 'NL', city: 'Sneek', coordinates: { latitude: 53.033, longitude: 5.6583 }, componentRefs: ['zip'], evidence: 'supplier_declared' },
        { ref: 'cmt', tier: 'tier_1_assembly', process: 'cut_make_trim', facilityName: 'Adriano Confecções', facilityDisclosed: true, country: 'PT', city: 'Barcelos', coordinates: { latitude: 41.5388, longitude: -8.6151 }, componentRefs: ['shell','rib','zip','thread'], evidence: 'third_party_audited', certificationRefs: ['cert-smeta'], workerCount: 180 },
      ],
      traceabilityDepth: 'tier_4',
      chainOfCustodyModel: 'segregated',
    },
    environment: {
      footprintClass: 'B',
      pef: { score: 142.6, unit: 'mPt', methodVersion: 'PEFCR Apparel & Footwear 3.1', calculatedOn: '2026-04-02', verifiedBy: 'Quantis' },
      carbon: {
        totalKgCo2e: 8.4, boundary: 'cradle_to_gate', methodology: 'ISO 14067, PEFCR A&F 3.1',
        byStage: { rawMaterial: 3.1, processing: 2.6, manufacturing: 1.7, transport: 1.0 },
        verifiedBy: 'Quantis', calculatedOn: '2026-04-02',
      },
      water: { litres: 1180, scarcityWeightedM3: 0.42, methodology: 'AWARE / ISO 14046' },
      energyMj: 96.4,
      landUseM2Year: 4.8,
      microplastics: { testMethod: 'TMC test method (Mermaids protocol)', releaseMgPerKgWash: 124, mitigation: 'Tight-knit construction and singed yarn reduce shedding versus a comparable brushed fleece.' },
      lcaDocumentId: 'doc-lca',
    },
    durability: {
      robustnessScore: 78,
      robustnessEvidence: {
        visualInspection: { standard: 'ISO 15487', grade: 4 },
        spiralityPercent: 3.4,
        dimensionalChangePercent: -2.1,
        washCycles: 5,
      },
      dimensionalStability: { standard: 'ISO 6330 / ISO 5077', changePercent: -2.1, wash: '40 °C, 5 cycles' },
      colourFastness: [
        { standard: 'ISO 105-C06', against: 'washing', grade: 4.5 },
        { standard: 'ISO 105-B02', against: 'light', grade: 5 },
        { standard: 'ISO 105-X12', against: 'rubbing_dry', grade: 4.5 },
        { standard: 'ISO 105-X12', against: 'rubbing_wet', grade: 4 },
      ],
      pillingResistance: { standard: 'ISO 12945-2', grade: 4 },
      abrasionResistance: { standard: 'ISO 12947-2', martindaleCycles: 32000 },
      tensileStrengthN: 412,
      seamSlippage: { standard: 'ISO 13936-2', passed: true },
      expectedWashCycles: 120,
      warrantyMonths: 24,
      repairabilityScore: 74,
    },
    care: {
      symbols: ['wash_30_gentle', 'bleach_not', 'dry_flat', 'iron_low', 'clean_not'],
      instructions: { en: 'Wash at 30 °C on a gentle cycle with similar colours. Reshape and dry flat. Do not tumble dry.' },
      lowImpactTips: [
        { en: 'Washing at 30 °C instead of 40 °C cuts this garment’s use-phase energy by roughly a third.' },
        { en: 'Air the knit between wears. Most wears do not need a wash.' },
        { en: 'A mesh laundry bag measurably reduces microfibre release.' },
      ],
      repair: {
        instructions: { en: 'Snags can be pulled through to the reverse with a fine crochet hook rather than cut. Pilling can be removed with a fabric comb without damaging the surface.' },
        sparePartsAvailable: true,
        sparePartsUntil: '2036-10-01',
        spareParts: [
          { name: 'Replacement half-zip (YKK Excella, 18 cm)', reference: 'MRD-SP-ZIP-18' },
          { name: 'Matching repair yarn, 20 m', reference: 'MRD-SP-YRN-NVY' },
        ],
        partnerRefs: ['cmt'],
      },
    },
    circularity: {
      recyclability: {
        score: 62,
        recyclableShare: 86, route: 'mechanical',
        disruptors: ['elastane_content', 'mixed_fibres', 'metal_trims'],
        disassemblySteps: [
          { order: 1, instruction: { en: 'Cut away the zip tape 5 mm from the seam and set the zip aside for metal recovery.' }, componentRef: 'zip', toolRequired: 'Shears', estimatedSeconds: 40 },
          { order: 2, instruction: { en: 'Remove collar and cuff ribs at the join — they carry a higher elastane share than the body.' }, componentRef: 'rib', toolRequired: 'Seam ripper', estimatedSeconds: 90 },
          { order: 3, instruction: { en: 'Remove the woven care label from the left side seam.' }, toolRequired: 'Seam ripper', estimatedSeconds: 20 },
          { order: 4, instruction: { en: 'The remaining body panel is a cotton–polyester blend at 4% elastane and is suitable for mechanical recycling.' }, componentRef: 'shell', estimatedSeconds: 0 },
        ],
        separationNotes: { en: 'Do not shred with the zip in place. The body knit carries 4% elastane, which is within tolerance for mechanical recycling but not for most chemical routes.' },
      },
      takeBack: { available: true, url: 'https://meridian.example/take-back', instructions: { en: 'Post any Meridian garment back to us free of charge, whatever its condition.' }, incentive: '€15 credit per returned garment' },
      resale: { brandAuthorised: true, url: 'https://meridian.example/renewed', authenticationSupported: true },
      rental: { available: false },
      eprRegistrations: [
        { country: 'FR', scheme: 'Refashion', producerNumber: 'FR239481_01XKYP', validUntil: '2027-12-31' },
        { country: 'NL', scheme: 'Stichting UPV Textiel', producerNumber: 'UPV-NL-118204' },
      ],
      wasteCode: '20 01 10',
      endOfLifeInstructions: { en: 'Do not put this garment in household waste. Use a textile collection point or return it to us.' },
    },
    social: {
      dueDiligenceStatementUrl: 'https://meridian.example/due-diligence',
      policies: [
        { kind: 'Code of conduct', url: 'https://meridian.example/code-of-conduct', updatedOn: '2026-01-15' },
        { kind: 'Living wage commitment', url: 'https://meridian.example/living-wage', updatedOn: '2025-11-02' },
      ],
      audits: [
        { stepRef: 'cmt', standard: 'SMETA', conductedOn: '2026-02-18', outcome: 'pass_with_findings', findingsSummary: 'Two minor findings on overtime records; corrective action plan agreed and closed in May 2026.', reportDocumentId: 'doc-smeta' },
        { stepRef: 'knit', standard: 'OEKO_TEX_STEP', conductedOn: '2025-09-30', outcome: 'pass' },
        { stepRef: 'farm', standard: 'GOTS', conductedOn: '2025-07-22', outcome: 'pass' },
      ],
      livingWage: { programme: 'Fair Wear Foundation member since 2021', benchmarkSource: 'Global Living Wage Coalition', coveredStepRefs: ['cmt'] },
      grievanceMechanismUrl: 'https://meridian.example/speak-up',
    },
    claims: [
      { id: 'claim-organic', statement: { en: '62% organic cotton, certified to GOTS under a segregated chain of custody.' }, kind: 'organic_content', scope: 'whole_product', evidence: ['cert-gots'], verifiedBy: 'Control Union', validUntil: '2027-06-30' },
      { id: 'claim-recycled', statement: { en: '34% recycled polyester from post-consumer PET, certified to GRS on a mass-balance basis.' }, kind: 'recycled_content', scope: 'whole_product', evidence: ['cert-grs'], verifiedBy: 'Control Union', validUntil: '2027-06-30' },
      { id: 'claim-chem', statement: { en: 'Tested for harmful substances to OEKO-TEX Standard 100, product class II.' }, kind: 'chemical_safety', scope: 'whole_product', evidence: ['cert-oeko'], verifiedBy: 'Centexbel', validUntil: '2027-03-31' },
    ],
    certifications: [
      { id: 'cert-gots', scheme: 'GOTS', licenceNumber: 'CU 1042857', scope: 'Organic cotton, segregated chain of custody', issuedBy: 'Control Union Certifications', validFrom: '2025-07-01', validUntil: '2027-06-30', appliesToStepRefs: ['farm','spin','knit'], appliesToComponentRefs: ['shell','rib'] },
      { id: 'cert-grs', scheme: 'GRS', licenceNumber: 'CU 1042858', scope: 'Recycled polyester, mass balance', issuedBy: 'Control Union Certifications', validFrom: '2025-07-01', validUntil: '2027-06-30', appliesToStepRefs: ['recovery','spin'], appliesToComponentRefs: ['shell'] },
      { id: 'cert-oeko', scheme: 'OEKO_TEX_100', licenceNumber: '2025OK1284 Centexbel', scope: 'Product class II — skin contact', issuedBy: 'Centexbel', validFrom: '2025-04-01', validUntil: '2027-03-31', appliesToStepRefs: ['knit','dye'] },
      { id: 'cert-smeta', scheme: 'SMETA', licenceNumber: 'ZC-4418290', scope: '4-pillar audit, Barcelos facility', issuedBy: 'Intertek', validFrom: '2026-02-18', validUntil: '2028-02-17', appliesToStepRefs: ['cmt'] },
    ],
    commercial: {
      launchDate: '2026-09-01',
      marketsPlaced: ['NL','DE','FR','BE','IT','ES','SE','DK'],
      recommendedRetailPrice: { amount: 185, currency: 'EUR' },
    },
  };

  const id = randomUUID();
  const publicId = dppId();
  const dataHash = hash(payload);

  await client.query(
    `INSERT INTO passports (id, tenant_id, product_id, dpp_id, scope, gtin, sku, colour_name, colour_code, size, size_system, status, current_version, published_version, completeness, published_at, placed_on_market_at, created_by)
     VALUES ($1,$2,$3,$4,'model',$5,$6,$7,$8,$9,$10,'published',1,1,86,now(),now(),$11)`,
    // `passports.completeness` is a denormalised cache the application writes
    // on save. Nothing reads it for display any more — the catalogue, the
    // record page and the overview average all score the live payload against
    // the field registry — so the value here only seeds the column's shape.
    [id, tenantId, productId, publicId, '08712345678906', 'MRD-2601-NVY-M', 'Deep Navy', 'NVY', 'M', 'EU', userIds.PRODUCT_MANAGER],
  );

  await client.query(
    `INSERT INTO passport_versions (passport_id, version, payload, data_hash, change_reason, created_by)
     VALUES ($1,1,$2,$3,$4,$5)`,
    [id, JSON.stringify(payload), dataHash, 'Initial publication', userIds.PRODUCT_MANAGER],
  );

  await client.query(
    `INSERT INTO passport_status_history (passport_id, from_status, to_status, reason, actor_id)
     VALUES ($1,'approved','published','Approved for AW26 launch',$2)`,
    [id, userIds.COMPLIANCE_OFFICER],
  );

  for (const [ref, partnerName, role, tier, seq] of [
    ['farm','Ege Pamuk Kooperatifi','farm','tier_4_raw_material',0],
    ['recovery','Repreve Fibre Works','fibre_producer','tier_4_raw_material',1],
    ['spin','Filatura Bergamo','spinning','tier_3_processing',2],
    ['knit','Tintex Textiles','knitting','tier_2_material',3],
    ['dye','Tintex Textiles','dyeing','tier_2_material',4],
    ['trim','YKK Europe','trim_supplier','tier_2_material',5],
    ['cmt','Adriano Confecções','cut_make_trim','tier_1_assembly',6],
  ]) {
    await client.query(
      `INSERT INTO passport_partners (passport_id, partner_id, role, tier, sequence, component_ref, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT DO NOTHING`,
      [id, partnerIds[partnerName], role, tier, seq, ref],
    );
  }

  /*
   * A life, not just a birth.
   *
   * The flagship previously stopped at "placed on market", so the downstream
   * half of the product — the repairer portal, the recycler portal, the public
   * timeline — had nothing to show on the one passport anybody demos. A
   * garment that has been sold, repaired, resold and repaired again is the
   * argument for the whole product, and it is also the only way to see that
   * the timeline orders, attributes and closes correctly.
   *
   * `actor` names which seeded user recorded it, so attribution on the public
   * page is exercised rather than left null. `returned` is retailer-visibility
   * on purpose: it demonstrates that the public timeline withholds entries and
   * says how many it is withholding.
   */
  for (const [type, when, summary, visibility, actorRole] of [
    ['manufactured', '2026-06-14', 'Assembled at Adriano Confecções, Barcelos.', 'public', null],
    ['placed_on_market', '2026-09-01', 'First placed on the EU market.', 'public', null],
    ['sold', '2026-09-19', 'Sold through the brand’s own store in Amsterdam.', 'public', 'BRAND_ADMIN'],
    ['returned', '2027-01-08', 'Returned under warranty — zip slider failure.', 'retailer', 'BRAND_ADMIN'],
    ['repaired', '2027-01-22', 'Replaced the main zip slider and re-stitched the left cuff rib. Original YKK part.', 'public', 'REPAIRER'],
    ['resold', '2027-06-02', 'Resold through the brand’s authenticated resale channel.', 'public', 'BRAND_ADMIN'],
    ['repaired', '2029-03-14', 'Darned two moth holes on the right shoulder and refreshed the cuff ribs.', 'public', 'REPAIRER'],
  ]) {
    await client.query(
      `INSERT INTO passport_events (passport_id, event_type, occurred_at, summary, visibility, actor_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, type, when, summary, visibility, actorRole ? userIds[actorRole] : null],
    );
  }


  // ── A fleet in varied states ─────────────────────────────────────────────
  // One perfect published passport teaches nobody how the console behaves. The
  // review queue, the status filters and the completeness column all need rows
  // that are mid-flight, incomplete, or in trouble.
  const fleet = [
    ['Harbour Crew Tee',      'MRD-2602', 'apparel.tops.tshirt',        'Ecru',        'L',  'draft',             41, null, 'harbour-crew-tee'],
    ['Foundry Work Jacket',   'MRD-2603', 'apparel.outerwear.jacket',   'Slate',       'M',  'in_review',         78, null, 'foundry-work-jacket'],
    ['Tidal Knit Scarf',      'MRD-2604', 'accessories.scarves.scarf',  'Oat',         null, 'changes_requested', 63, null, 'tidal-knit-scarf'],
    ['Anchor Straight Jean',  'MRD-2605', 'apparel.bottoms.jeans',      'Rinse',       '32', 'approved',          88, null, 'anchor-straight-jean'],
    ['Pier Merino Beanie',    'MRD-2606', 'apparel.headwear.hat',       'Charcoal',    null, 'published',         84, 1,    'pier-merino-beanie'],
    ['Coastline Half-Zip',    'MRD-2607', 'apparel.tops.knitwear',      'Ember',       'S',  'published',         79, 1,    'coastline-half-zip-ember'],
    ['Salt Flat Shorts',      'MRD-2608', 'apparel.bottoms.shorts',     'Bone',        'M',  'suspended',         72, 1,    'salt-flat-shorts'],
  ];

  for (const [name, style, category, colour, size, status, completeness, publishedVersion, flat] of fleet) {
    const pid = randomUUID();
    const prodId = randomUUID();
    await client.query(
      `INSERT INTO products (id, tenant_id, name, style_number, category, season, target_market, created_by)
       VALUES ($1,$2,$3,$4,$5,'AW26','unisex',$6)`,
      [prodId, tenantId, name, style, category, userIds.PRODUCT_MANAGER],
    );

    const body = {
      schemaVersion: '1.0',
      identity: {
        productName: { en: name },
        brandName: 'Meridian',
        styleNumber: style,
        category,
        colourName: colour,
        images: [
          { url: `/products/${flat}.svg`, alt: `Technical flat of the ${name} in ${colour}`, kind: 'flat' },
        ],
        ...(size ? { size, sizeSystem: 'EU' } : {}),
        countryOfOrigin: 'PT',
        economicOperators: payload.identity.economicOperators,
      },
      composition: {
        components: [],
        overall: [
          { fibre: 'cotton', percentage: 80, originCountry: 'TR' },
          { fibre: 'polyester', percentage: 20, originCountry: 'TR',
            recycled: { share: 100, source: 'post_consumer', custodyModel: 'mass_balance' } },
        ],
        totalRecycledContent: 20,
      },
      care: {
        symbols: ['wash_30', 'bleach_not', 'dry_flat', 'iron_low'],
        instructions: { en: 'Wash at 30 °C with similar colours. Dry flat.' },
      },
      supplyChain: {
        steps: payload.supplyChain.steps.slice(0, 4),
        traceabilityDepth: 'tier_2',
      },
    };

    const pubId = dppId();
    await client.query(
      `INSERT INTO passports (id, tenant_id, product_id, dpp_id, scope, sku, colour_name, size, size_system,
                              status, current_version, published_version, completeness, published_at, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'model',$5,$6,$7,$8,$9,1,$10,$11,$12,$13, now() - ($14 || ' days')::interval, now() - ($15 || ' days')::interval)`,
      [pid, tenantId, prodId, pubId, `${style}-${(colour || 'NA').slice(0,3).toUpperCase()}`,
       colour, size, size ? 'EU' : null, status, publishedVersion, completeness,
       publishedVersion ? new Date() : null, userIds.PRODUCT_MANAGER,
       String(Math.floor(Math.random() * 40) + 5), String(Math.floor(Math.random() * 5))],
    );

    await client.query(
      `INSERT INTO passport_versions (passport_id, version, payload, data_hash, change_reason, created_by)
       VALUES ($1,1,$2,$3,$4,$5)`,
      [pid, JSON.stringify(body), hash(body),
       status === 'draft' ? 'Initial draft' : 'Initial version', userIds.PRODUCT_MANAGER],
    );

    if (status !== 'draft') {
      await client.query(
        `INSERT INTO passport_status_history (passport_id, from_status, to_status, reason, actor_id)
         VALUES ($1,'draft',$2,$3,$4)`,
        [pid, status,
         status === 'changes_requested'
           ? 'Fibre percentages do not total 100, and the dyehouse is not named.'
           : status === 'suspended'
             ? 'Supplier certificate lapsed; reinstate once renewed.'
             : null,
         userIds.COMPLIANCE_OFFICER],
      );
    }
  }

  // Audit genesis entry.
  // Normalised the same way the application hashes it, so the seeded entry
  // verifies against the chain rather than looking like tampering.
  /**
   * The audit entry's hash must be computed over exactly the material that
   * `computeEntryHash` in src/lib/audit/index.ts builds — same keys, same
   * order-independent canonicalisation, same normalised timestamp. This file
   * cannot import that module, so the shape is mirrored here and pinned by
   * `audit-seed-parity.test.ts`. Two bugs already hid in this gap: a timestamp
   * spelling mismatch, and a missing `actorLabel`.
   */
  const recordedAt = new Date().toISOString();
  const actorLabel = 'Tomás Ferreira';
  const prev = '0x' + '0'.repeat(64);
  const entry =
    '0x' +
    createHash('sha256')
      .update(
        canonical({
          previousHash: prev,
          tenantId,
          actorId: userIds.PRODUCT_MANAGER,
          actorLabel,
          action: 'passport.published',
          subjectType: 'passport',
          subjectId: id,
          metadata: {},
          recordedAt: new Date(recordedAt).toISOString(),
        }),
        'utf8',
      )
      .digest('hex');
  await client.query(
    `INSERT INTO audit_events (tenant_id, sequence, previous_hash, entry_hash, actor_id, actor_label, action, subject_type, subject_id, metadata, recorded_at)
     VALUES ($1,1,$2,$3,$4,$5,'passport.published','passport',$6,'{}',$7)`,
    [tenantId, prev, entry, userIds.PRODUCT_MANAGER, actorLabel, id, recordedAt],
  );

  await client.query('COMMIT');

  console.log('\n  Seeded Polytrail demo data\n');
  console.log(`  Workspace     Meridian Studio B.V. (/${'meridian'})`);
  console.log(`  Passport      ${publicId}`);
  console.log(`  Public URL    http://localhost:3000/p/${publicId}`);
  console.log('\n  Sign in with any of:');
  for (const [email, name, role] of users) console.log(`    ${email.padEnd(30)} ${role.padEnd(20)} ${name}`);
  console.log('\n  Password for all demo accounts: Polytrail!2026\n');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
