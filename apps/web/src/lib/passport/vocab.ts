/**
 * Controlled vocabularies for textile passports.
 *
 * Free text is the enemy of a passport: "organic cotton", "Organic Cotton" and
 * "cotton (org.)" are three different values to a recycler's sorting system and
 * one value to a human. Every field that a downstream system has to reason
 * about is therefore an enum here, and the display strings live alongside so
 * the UI never invents its own labels.
 */

/**
 * Fibre names as set out in Annex I to Regulation (EU) No 1007/2011 on textile
 * fibre names and labelling. Using the regulation's own list is what makes a
 * composition statement legally usable rather than merely descriptive.
 */
export const FIBRES = {
  // Natural — animal
  wool: { label: 'Wool', group: 'animal', annexIName: 'wool' },
  alpaca: { label: 'Alpaca', group: 'animal', annexIName: 'alpaca' },
  mohair: { label: 'Mohair', group: 'animal', annexIName: 'mohair' },
  cashmere: { label: 'Cashmere', group: 'animal', annexIName: 'cashmere' },
  camel: { label: 'Camel', group: 'animal', annexIName: 'camel' },
  angora: { label: 'Angora', group: 'animal', annexIName: 'angora' },
  silk: { label: 'Silk', group: 'animal', annexIName: 'silk' },
  down: { label: 'Down', group: 'animal', annexIName: 'down' },
  feather: { label: 'Feather', group: 'animal', annexIName: 'feather' },
  leather: { label: 'Leather', group: 'animal', annexIName: 'leather' },

  // Natural — plant
  cotton: { label: 'Cotton', group: 'plant', annexIName: 'cotton' },
  linen: { label: 'Linen / flax', group: 'plant', annexIName: 'flax' },
  hemp: { label: 'Hemp', group: 'plant', annexIName: 'hemp' },
  jute: { label: 'Jute', group: 'plant', annexIName: 'jute' },
  ramie: { label: 'Ramie', group: 'plant', annexIName: 'ramie' },
  kapok: { label: 'Kapok', group: 'plant', annexIName: 'kapok' },
  sisal: { label: 'Sisal', group: 'plant', annexIName: 'sisal' },

  // Man-made cellulosic
  viscose: { label: 'Viscose', group: 'cellulosic', annexIName: 'viscose' },
  modal: { label: 'Modal', group: 'cellulosic', annexIName: 'modal' },
  lyocell: { label: 'Lyocell', group: 'cellulosic', annexIName: 'lyocell' },
  cupro: { label: 'Cupro', group: 'cellulosic', annexIName: 'cupro' },
  acetate: { label: 'Acetate', group: 'cellulosic', annexIName: 'acetate' },
  triacetate: { label: 'Triacetate', group: 'cellulosic', annexIName: 'triacetate' },

  // Synthetic
  polyester: { label: 'Polyester', group: 'synthetic', annexIName: 'polyester' },
  polyamide: { label: 'Polyamide / nylon', group: 'synthetic', annexIName: 'polyamide or nylon' },
  acrylic: { label: 'Acrylic', group: 'synthetic', annexIName: 'acrylic' },
  modacrylic: { label: 'Modacrylic', group: 'synthetic', annexIName: 'modacrylic' },
  elastane: { label: 'Elastane', group: 'synthetic', annexIName: 'elastane' },
  polypropylene: { label: 'Polypropylene', group: 'synthetic', annexIName: 'polypropylene' },
  polyethylene: { label: 'Polyethylene', group: 'synthetic', annexIName: 'polyethylene' },
  aramid: { label: 'Aramid', group: 'synthetic', annexIName: 'aramid' },
  elastomultiester: {
    label: 'Elastomultiester',
    group: 'synthetic',
    annexIName: 'elastomultiester',
  },

  // Mineral / other
  glass: { label: 'Glass fibre', group: 'mineral', annexIName: 'glass fibre' },
  metal: { label: 'Metal fibre', group: 'mineral', annexIName: 'metal' },
} as const;

export type FibreKey = keyof typeof FIBRES;
export type FibreGroup = (typeof FIBRES)[FibreKey]['group'];

/** Fibres whose shedding contributes to microplastic release. */
export const SYNTHETIC_FIBRES: readonly FibreKey[] = (
  Object.keys(FIBRES) as FibreKey[]
).filter((k) => FIBRES[k].group === 'synthetic');

/**
 * Where recovered material came from. The distinction matters commercially and
 * legally: pre-consumer waste is factory offcuts that never reached a customer,
 * and claiming it as "recycled" without saying so is the single most common
 * greenwashing complaint in textiles.
 */
export const RECYCLED_SOURCES = {
  post_consumer: {
    label: 'Post-consumer',
    description: 'Recovered from products that reached and were discarded by an end user.',
  },
  pre_consumer: {
    label: 'Pre-consumer',
    description: 'Recovered from manufacturing waste such as cutting-room offcuts.',
  },
  mixed: { label: 'Mixed', description: 'A blend of post- and pre-consumer recovered material.' },
} as const;

/**
 * Chain-of-custody models as defined by ISO 22095 and used by every major
 * textile certification scheme. A passport that says "GRS certified" without
 * saying which model is in play is not telling the reader whether the recycled
 * content is physically in *this* garment.
 */
export const CUSTODY_MODELS = {
  identity_preserved: {
    label: 'Identity preserved',
    description: 'Material from a single source is kept separate throughout. Fully traceable.',
  },
  segregated: {
    label: 'Segregated',
    description: 'Certified material is kept apart from non-certified, but sources are mixed.',
  },
  mass_balance: {
    label: 'Mass balance',
    description:
      'Certified and non-certified material are mixed; certified volume is tracked administratively. This garment may contain none of it.',
  },
  controlled_blend: {
    label: 'Controlled blend',
    description: 'A declared ratio of certified to non-certified material, mixed deliberately.',
  },
} as const;

/** Certification schemes a textile passport commonly carries. */
export const CERTIFICATION_SCHEMES = {
  GOTS: { label: 'GOTS', full: 'Global Organic Textile Standard', covers: 'organic fibre' },
  OCS: { label: 'OCS', full: 'Organic Content Standard', covers: 'organic fibre content' },
  GRS: { label: 'GRS', full: 'Global Recycled Standard', covers: 'recycled content + social' },
  RCS: { label: 'RCS', full: 'Recycled Claim Standard', covers: 'recycled content' },
  RWS: { label: 'RWS', full: 'Responsible Wool Standard', covers: 'wool welfare' },
  RDS: { label: 'RDS', full: 'Responsible Down Standard', covers: 'down welfare' },
  RMS: { label: 'RMS', full: 'Responsible Mohair Standard', covers: 'mohair welfare' },
  OEKO_TEX_100: {
    label: 'OEKO-TEX Standard 100',
    full: 'OEKO-TEX Standard 100',
    covers: 'harmful substances',
  },
  OEKO_TEX_STEP: {
    label: 'OEKO-TEX STeP',
    full: 'Sustainable Textile Production',
    covers: 'facility environmental management',
  },
  BLUESIGN: { label: 'bluesign', full: 'bluesign SYSTEM', covers: 'chemical input management' },
  CRADLE_TO_CRADLE: {
    label: 'Cradle to Cradle',
    full: 'Cradle to Cradle Certified',
    covers: 'circular design',
  },
  EU_ECOLABEL: { label: 'EU Ecolabel', full: 'EU Ecolabel', covers: 'lifecycle environmental' },
  FSC: { label: 'FSC', full: 'Forest Stewardship Council', covers: 'wood-derived cellulosics' },
  PEFC: {
    label: 'PEFC',
    full: 'Programme for the Endorsement of Forest Certification',
    covers: 'wood-derived cellulosics',
  },
  BCI: { label: 'Better Cotton', full: 'Better Cotton Initiative', covers: 'cotton farming' },
  FAIRTRADE: { label: 'Fairtrade', full: 'Fairtrade International', covers: 'producer price' },
  SA8000: { label: 'SA8000', full: 'Social Accountability 8000', covers: 'labour conditions' },
  WRAP: {
    label: 'WRAP',
    full: 'Worldwide Responsible Accredited Production',
    covers: 'labour conditions',
  },
  AMFORI_BSCI: {
    label: 'amfori BSCI',
    full: 'amfori Business Social Compliance Initiative',
    covers: 'labour conditions',
  },
  SMETA: { label: 'SMETA', full: 'Sedex Members Ethical Trade Audit', covers: 'labour conditions' },
  ZDHC: {
    label: 'ZDHC',
    full: 'Zero Discharge of Hazardous Chemicals',
    covers: 'wastewater + chemical input',
  },
  LEATHER_WORKING_GROUP: {
    label: 'Leather Working Group',
    full: 'Leather Working Group',
    covers: 'tannery environmental',
  },
} as const;

export type CertificationScheme = keyof typeof CERTIFICATION_SCHEMES;

/**
 * GINETEX care symbols — the five-symbol system printed on every care label in
 * Europe. Stored as codes so the public passport can render the pictograms and
 * read out the meaning in the viewer's language.
 */
export const CARE_SYMBOLS = {
  wash_30: { label: 'Machine wash at 30 °C', family: 'washing' },
  wash_40: { label: 'Machine wash at 40 °C', family: 'washing' },
  wash_60: { label: 'Machine wash at 60 °C', family: 'washing' },
  wash_30_gentle: { label: 'Machine wash at 30 °C, gentle cycle', family: 'washing' },
  wash_hand: { label: 'Hand wash only', family: 'washing' },
  wash_not: { label: 'Do not wash', family: 'washing' },
  bleach_not: { label: 'Do not bleach', family: 'bleaching' },
  bleach_oxygen: { label: 'Non-chlorine bleach only', family: 'bleaching' },
  dry_tumble_low: { label: 'Tumble dry, low heat', family: 'drying' },
  dry_tumble_not: { label: 'Do not tumble dry', family: 'drying' },
  dry_line: { label: 'Line dry', family: 'drying' },
  dry_flat: { label: 'Dry flat', family: 'drying' },
  iron_low: { label: 'Iron, low heat', family: 'ironing' },
  iron_medium: { label: 'Iron, medium heat', family: 'ironing' },
  iron_high: { label: 'Iron, high heat', family: 'ironing' },
  iron_not: { label: 'Do not iron', family: 'ironing' },
  clean_dry_p: { label: 'Dry clean, tetrachloroethylene', family: 'professional' },
  clean_dry_f: { label: 'Dry clean, hydrocarbons only', family: 'professional' },
  clean_wet: { label: 'Professional wet clean', family: 'professional' },
  clean_not: { label: 'Do not dry clean', family: 'professional' },
} as const;

export type CareSymbol = keyof typeof CARE_SYMBOLS;

/**
 * Things that stop a garment being recycled. Naming them explicitly is the
 * single most useful thing a passport does for a sorting facility, which
 * otherwise has to guess from the outside of the garment.
 */
export const RECYCLING_DISRUPTORS = {
  elastane_content: {
    label: 'Elastane content',
    detail: 'Elastane above roughly 5% prevents most mechanical and chemical recycling routes.',
  },
  mixed_fibres: {
    label: 'Mixed fibre blend',
    detail: 'Blends need fibre separation before recovery, which few facilities can do.',
  },
  metal_trims: { label: 'Metal trims', detail: 'Zips, rivets and buckles must be removed first.' },
  coatings: {
    label: 'Coatings or laminates',
    detail: 'Waterproof membranes and coatings contaminate fibre recovery.',
  },
  pu_print: { label: 'Plastisol or PU prints', detail: 'Large prints contaminate the fibre stream.' },
  sewn_in_padding: {
    label: 'Sewn-in padding',
    detail: 'Fillings bonded to the shell cannot be separated economically.',
  },
  glue_bonding: { label: 'Adhesive bonding', detail: 'Glued seams resist disassembly.' },
  flame_retardant: {
    label: 'Flame-retardant finish',
    detail: 'Chemical finishes may make the material unsuitable for recycling.',
  },
} as const;

export type RecyclingDisruptor = keyof typeof RECYCLING_DISRUPTORS;

/**
 * Textile product categories. Deliberately shallow — three levels is enough to
 * drive a PEF category rule and a size system, and deeper trees just make data
 * entry worse without improving any downstream decision.
 */
export const CATEGORIES = {
  'apparel.tops.tshirt': { label: 'T-shirt', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.tops.shirt': { label: 'Shirt / blouse', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.tops.knitwear': { label: 'Knitwear', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.tops.sweatshirt': { label: 'Sweatshirt / hoodie', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.outerwear.jacket': { label: 'Jacket', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.outerwear.coat': { label: 'Coat', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.bottoms.trousers': { label: 'Trousers', pefCategory: 'apparel', sizeSystem: 'waist' },
  'apparel.bottoms.jeans': { label: 'Jeans', pefCategory: 'apparel', sizeSystem: 'waist' },
  'apparel.bottoms.skirt': { label: 'Skirt', pefCategory: 'apparel', sizeSystem: 'numeric' },
  'apparel.bottoms.shorts': { label: 'Shorts', pefCategory: 'apparel', sizeSystem: 'waist' },
  'apparel.dresses.dress': { label: 'Dress', pefCategory: 'apparel', sizeSystem: 'numeric' },
  'apparel.underwear.underwear': { label: 'Underwear', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.hosiery.socks': { label: 'Socks', pefCategory: 'apparel', sizeSystem: 'shoe' },
  'apparel.activewear.activewear': { label: 'Activewear', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'apparel.swimwear.swimwear': { label: 'Swimwear', pefCategory: 'apparel', sizeSystem: 'alpha' },
  'footwear.shoes.sneaker': { label: 'Trainers', pefCategory: 'footwear', sizeSystem: 'shoe' },
  'footwear.shoes.boot': { label: 'Boots', pefCategory: 'footwear', sizeSystem: 'shoe' },
  'footwear.shoes.formal': { label: 'Formal shoes', pefCategory: 'footwear', sizeSystem: 'shoe' },
  'accessories.bags.bag': { label: 'Bag', pefCategory: 'accessories', sizeSystem: 'none' },
  'accessories.headwear.hat': { label: 'Hat / cap', pefCategory: 'accessories', sizeSystem: 'alpha' },
  'accessories.scarves.scarf': { label: 'Scarf', pefCategory: 'accessories', sizeSystem: 'none' },
  'accessories.belts.belt': { label: 'Belt', pefCategory: 'accessories', sizeSystem: 'waist' },
  'home.bedding.bedlinen': { label: 'Bed linen', pefCategory: 'home', sizeSystem: 'bedding' },
  'home.bath.towel': { label: 'Towel', pefCategory: 'home', sizeSystem: 'none' },
  'home.living.curtain': { label: 'Curtains', pefCategory: 'home', sizeSystem: 'none' },
  'home.living.upholstery': { label: 'Upholstery fabric', pefCategory: 'home', sizeSystem: 'none' },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

/** Garment components a bill of materials is broken into. */
export const COMPONENT_KINDS = {
  shell: 'Shell / outer fabric',
  lining: 'Lining',
  interlining: 'Interlining',
  padding: 'Padding / filling',
  rib: 'Ribbing',
  pocket_bag: 'Pocket bag',
  thread: 'Sewing thread',
  zip: 'Zip',
  button: 'Buttons',
  rivet: 'Rivets',
  label: 'Labels',
  elastic: 'Elastic',
  drawcord: 'Drawcord',
  print: 'Print / applique',
  coating: 'Coating / membrane',
  hardware: 'Hardware',
  sole: 'Sole',
  upper: 'Upper',
  insole: 'Insole',
  laces: 'Laces',
} as const;

export type ComponentKind = keyof typeof COMPONENT_KINDS;
