import {
  bigint,
  boolean,
  char,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Drizzle has no built-in `bytea`; this is the standard escape hatch. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Enums
// ═══════════════════════════════════════════════════════════════════════════

export const roleEnum = pgEnum('role', [
  'PLATFORM_ADMIN',
  'BRAND_ADMIN',
  'PRODUCT_MANAGER',
  'COMPLIANCE_OFFICER',
  'SUPPLIER',
  'CERTIFIER',
  'REPAIRER',
  'RECYCLER',
  'AUTHORITY',
]);

export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'suspended']);

export const tenantStatusEnum = pgEnum('tenant_status', [
  'onboarding',
  'active',
  'suspended',
  'closed',
]);

/**
 * Passport lifecycle. `draft` and `in_review` are private; everything from
 * `published` onward is resolvable at the public URL, because the ESPR expects
 * a passport to stay reachable for the product's lifetime — a withdrawn
 * product still needs a passport a recycler can read.
 */
export const passportStatusEnum = pgEnum('passport_status', [
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'published',
  'suspended',
  'recalled',
  'withdrawn',
  'archived',
]);

/** What the passport identifies: one style, one production batch, or one garment. */
export const passportScopeEnum = pgEnum('passport_scope', ['model', 'batch', 'item']);

/** Where a partner sits in the textile value chain. */
export const supplyTierEnum = pgEnum('supply_tier', [
  'tier_0_retail',
  'tier_1_assembly',
  'tier_2_material',
  'tier_3_processing',
  'tier_4_raw_material',
]);

export const partnerRoleEnum = pgEnum('partner_role', [
  'brand',
  'importer',
  'authorised_representative',
  'manufacturer',
  'cut_make_trim',
  'weaving',
  'knitting',
  'dyeing',
  'printing',
  'finishing',
  'tanning',
  'spinning',
  'ginning',
  'farm',
  'fibre_producer',
  'trim_supplier',
  'logistics',
  'retailer',
  'repairer',
  'recycler',
  'certifier',
  'laboratory',
]);

/**
 * Who may read a given slice of a passport. Ordered from most to least open;
 * `rankOf` in `src/lib/tier` relies on this order.
 */
export const accessTierEnum = pgEnum('access_tier', [
  'public',
  'consumer',
  'retailer',
  'repairer',
  'recycler',
  'authority',
]);

export const dataRequestStatusEnum = pgEnum('data_request_status', [
  'draft',
  'sent',
  'in_progress',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'expired',
  'cancelled',
]);

export const credentialStatusEnum = pgEnum('credential_status', [
  'active',
  'expired',
  'revoked',
  'superseded',
]);

/**
 * Why a passport changed hands.
 *
 * Textile ownership moves for different reasons than industrial equipment: most
 * transfers are a consumer reselling a garment, not a fleet operator handing
 * over an asset. The reason is recorded because it determines what the new
 * owner may do — a take-back transfer grants a recycler disassembly access that
 * a resale transfer does not.
 */
export const transferReasonEnum = pgEnum('transfer_reason', [
  'resale',
  'gift',
  'warranty_claim',
  'repair_exchange',
  'take_back',
  'recycling',
  'brand_acquisition',
  'licensing',
  'other',
]);

export const transferStatusEnum = pgEnum('transfer_status', [
  'initiated',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
]);

export const importStatusEnum = pgEnum('import_status', [
  'uploaded',
  'mapping',
  'validating',
  'ready',
  'importing',
  'completed',
  'failed',
  'cancelled',
]);

/**
 * How strongly an operator's identity has been established.
 *
 * The DPP Registry requires a qualified electronic seal from a QTSP before an
 * operator may file, and no vendor in this market currently implements it. The
 * ladder is modelled now so the gate exists before it is needed.
 */
export const verificationLevelEnum = pgEnum('verification_level', [
  'unverified',
  'email_confirmed',
  'domain_verified',
  'document_verified',
  'qualified_seal',
]);

/** Events appended to a passport after it enters circulation. */
export const lifecycleEventEnum = pgEnum('lifecycle_event', [
  'manufactured',
  'placed_on_market',
  'sold',
  'registered_by_owner',
  'repaired',
  'refurbished',
  'altered',
  'resold',
  'rented',
  'returned',
  'donated',
  'collected',
  'sorted',
  'recycled',
  'incinerated',
  'landfilled',
  'lost',
]);

// ═══════════════════════════════════════════════════════════════════════════
// Tenancy & identity
// ═══════════════════════════════════════════════════════════════════════════

/** A brand workspace. Every row in almost every other table hangs off one. */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 63 }).notNull().unique(),
    legalName: varchar('legal_name', { length: 255 }).notNull(),
    tradeName: varchar('trade_name', { length: 255 }),
    /** ISO 3166-1 alpha-2 of the establishment placing products on the market. */
    country: char('country', { length: 2 }).notNull(),
    vatNumber: varchar('vat_number', { length: 64 }),
    /** EU Economic Operators Registration and Identification number. */
    eoriNumber: varchar('eori_number', { length: 64 }),
    /** ISO 17442 Legal Entity Identifier — the identifier ESPR registries prefer. */
    lei: char('lei', { length: 20 }),
    /** GS1 Global Location Number for the legal entity. */
    gln: char('gln', { length: 13 }),
    /** GS1 company prefix, used to mint GTIN-based Digital Link URIs. */
    gs1CompanyPrefix: varchar('gs1_company_prefix', { length: 12 }),
    /** Decentralised identifier this tenant signs credentials with. */
    did: varchar('did', { length: 512 }),
    registeredAddress: jsonb('registered_address').$type<PostalAddress>(),
    contactEmail: varchar('contact_email', { length: 320 }),
    website: varchar('website', { length: 2048 }),
    status: tenantStatusEnum('status').notNull().default('onboarding'),
    plan: varchar('plan', { length: 32 }).notNull().default('trial'),
    /** Hard ceiling on published passports for the current plan. */
    passportQuota: integer('passport_quota').notNull().default(100),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('idx_tenants_status').on(t.status)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL only for PLATFORM_ADMIN, who exists above every workspace. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    passwordHash: text('password_hash'),
    role: roleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('invited'),
    jobTitle: varchar('job_title', { length: 255 }),
    locale: varchar('locale', { length: 10 }).notNull().default('en'),
    avatarUrl: varchar('avatar_url', { length: 2048 }),
    mfaSecret: text('mfa_secret'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
    /** Consecutive failed sign-ins; drives progressive lockout. */
    failedSignInCount: integer('failed_sign_in_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_users_email').on(t.email),
    index('idx_users_tenant').on(t.tenantId),
    index('idx_users_tenant_role').on(t.tenantId, t.role),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 320 }).notNull(),
    role: roleEnum('role').notNull(),
    /** SHA-256 of the invite token. The plaintext only ever exists in the email. */
    tokenHash: char('token_hash', { length: 66 }).notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id),
    message: text('message'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_invitations_tenant').on(t.tenantId), index('idx_invitations_email').on(t.email)],
);

/** White-label appearance for the public passport and the console. */
export const tenantBranding = pgTable('tenant_branding', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  logoUrl: varchar('logo_url', { length: 2048 }),
  logoDarkUrl: varchar('logo_dark_url', { length: 2048 }),
  faviconUrl: varchar('favicon_url', { length: 2048 }),
  /** OKLCH or hex accent used across the public passport. */
  accentColor: varchar('accent_color', { length: 32 }),
  /** Editorial typeface for the public passport headline stack. */
  displayFont: varchar('display_font', { length: 64 }),
  customDomain: varchar('custom_domain', { length: 255 }),
  customDomainVerifiedAt: timestamp('custom_domain_verified_at', { withTimezone: true }),
  footerText: text('footer_text'),
  supportUrl: varchar('support_url', { length: 2048 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    /** Displayed in the UI so a key is recognisable without revealing it. */
    prefix: varchar('prefix', { length: 16 }).notNull(),
    keyHash: char('key_hash', { length: 66 }).notNull().unique(),
    scopes: text('scopes').array().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_api_keys_tenant').on(t.tenantId)],
);

// ═══════════════════════════════════════════════════════════════════════════
// Products & passports
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A style: the design-level product a brand sells, before it is split into
 * colourways and sizes. "Merino Crew Neck, AW26" is one product; the navy
 * size-M garment a customer buys is a passport with `scope = 'item'`.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    styleNumber: varchar('style_number', { length: 128 }),
    /** Internal product taxonomy key, e.g. `apparel.tops.knitwear.jumper`. */
    category: varchar('category', { length: 128 }).notNull(),
    /** EU Combined Nomenclature / HS customs code. */
    hsCode: varchar('hs_code', { length: 16 }),
    season: varchar('season', { length: 32 }),
    /** Gender/age target, as used by retail merchandising. */
    targetMarket: varchar('target_market', { length: 32 }),
    description: text('description'),
    heroImageUrl: varchar('hero_image_url', { length: 2048 }),
    /** Reusable defaults copied into every passport created from this style. */
    baseline: jsonb('baseline').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_products_tenant').on(t.tenantId),
    index('idx_products_category').on(t.tenantId, t.category),
    unique('uq_products_tenant_style').on(t.tenantId, t.styleNumber),
  ],
);

/**
 * The passport itself. Content lives in `passport_versions`; this row holds
 * identity, addressing and state so that resolving a public URL is a single
 * indexed lookup.
 */
export const passports = pgTable(
  'passports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /**
     * Current owner. Starts equal to `tenantId` and moves only when a transfer
     * is accepted. Kept separate from the creator so that a resold or
     * taken-back garment still shows who made it.
     */
    ownerTenantId: uuid('owner_tenant_id').references(() => tenants.id),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),

    /** Public, URL-safe, collision-resistant identifier. Printed into the QR. */
    dppId: varchar('dpp_id', { length: 32 }).notNull().unique(),
    scope: passportScopeEnum('scope').notNull().default('model'),

    /** GS1 Global Trade Item Number, when the brand uses GS1. */
    gtin: varchar('gtin', { length: 14 }),
    /** GS1 serial for item-level passports (AI 21). */
    serialNumber: varchar('serial_number', { length: 64 }),
    /** GS1 batch/lot for batch-level passports (AI 10). */
    batchNumber: varchar('batch_number', { length: 64 }),
    /** Brand's own SKU. */
    sku: varchar('sku', { length: 128 }),

    colourName: varchar('colour_name', { length: 128 }),
    colourCode: varchar('colour_code', { length: 64 }),
    size: varchar('size', { length: 32 }),
    sizeSystem: varchar('size_system', { length: 16 }),

    status: passportStatusEnum('status').notNull().default('draft'),
    currentVersion: integer('current_version').notNull().default(0),
    /** Version currently served at the public URL. Lags `currentVersion` while a draft is open. */
    publishedVersion: integer('published_version'),

    /** 0-100 readiness score, recomputed on every save. Drives the console. */
    completeness: integer('completeness').notNull().default(0),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    placedOnMarketAt: timestamp('placed_on_market_at', { withTimezone: true }),

    /** Structured recall metadata, surfaced publicly when status = 'recalled'. */
    recallReason: text('recall_reason'),
    recallSeverity: varchar('recall_severity', { length: 16 }),
    recallInstructions: text('recall_instructions'),
    recalledAt: timestamp('recalled_at', { withTimezone: true }),

    /** Identifier returned by the EU DPP registry once the passport is filed. */
    registryId: varchar('registry_id', { length: 255 }),
    registryUrl: varchar('registry_url', { length: 2048 }),
    registrySubmittedAt: timestamp('registry_submitted_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_passports_tenant').on(t.tenantId),
    index('idx_passports_product').on(t.productId),
    index('idx_passports_status').on(t.tenantId, t.status),
    index('idx_passports_updated').on(t.tenantId, t.updatedAt),
    index('idx_passports_gtin').on(t.gtin),
    index('idx_passports_sku').on(t.tenantId, t.sku),
    unique('uq_passports_gtin_serial').on(t.gtin, t.serialNumber),
  ],
);

/**
 * An immutable snapshot of passport content.
 *
 * `dataHash` is a SHA-256 over the RFC 8785 canonical form of `payload`, which
 * is what gets signed into the verifiable credential and — optionally —
 * anchored externally. Versions are never updated in place: correcting a
 * passport writes a new version with a `changeReason`, so the regulator can
 * always see what changed and why.
 */
export const passportVersions = pgTable(
  'passport_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passportId: uuid('passport_id')
      .notNull()
      .references(() => passports.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    dataHash: char('data_hash', { length: 66 }).notNull(),
    /** Hash of the signed credential envelope, once issued. */
    credentialHash: char('credential_hash', { length: 66 }),
    changeReason: text('change_reason'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_passport_versions_passport').on(t.passportId),
    unique('uq_passport_versions_version').on(t.passportId, t.version),
  ],
);

/** Audited status transitions, so "who published this and when" is answerable. */
export const passportStatusHistory = pgTable(
  'passport_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passportId: uuid('passport_id')
      .notNull()
      .references(() => passports.id, { onDelete: 'cascade' }),
    fromStatus: passportStatusEnum('from_status'),
    toStatus: passportStatusEnum('to_status').notNull(),
    reason: text('reason'),
    actorId: uuid('actor_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_status_history_passport').on(t.passportId, t.createdAt)],
);

/**
 * Post-market events: the part of the passport that keeps growing after the
 * garment is sold. Repairs, resales and recycling all land here, each one
 * attributable to the partner that recorded it.
 */
export const passportEvents = pgTable(
  'passport_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passportId: uuid('passport_id')
      .notNull()
      .references(() => passports.id, { onDelete: 'cascade' }),
    eventType: lifecycleEventEnum('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** Partner that performed the event, when it was not the brand itself. */
    partnerId: uuid('partner_id'),
    actorId: uuid('actor_id').references(() => users.id),
    location: jsonb('location').$type<PostalAddress>(),
    summary: varchar('summary', { length: 512 }),
    details: jsonb('details').$type<Record<string, unknown>>(),
    /** Minimum tier required to see this event on the public passport. */
    visibility: accessTierEnum('visibility').notNull().default('public'),
    evidenceDocumentId: uuid('evidence_document_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_passport_events_passport').on(t.passportId, t.occurredAt),
    index('idx_passport_events_type').on(t.eventType),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// Supply chain
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A facility or company somewhere in the chain. Modelled as a facility rather
 * than a company because textile due diligence is site-specific: two mills
 * owned by the same group can have very different audit records.
 */
export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    legalName: varchar('legal_name', { length: 255 }),
    tier: supplyTierEnum('tier').notNull(),
    roles: partnerRoleEnum('roles').array().notNull().default([]),
    country: char('country', { length: 2 }).notNull(),
    address: jsonb('address').$type<PostalAddress>(),
    /** Latitude/longitude for the supply-chain map on the public passport. */
    latitude: varchar('latitude', { length: 24 }),
    longitude: varchar('longitude', { length: 24 }),
    /** Open Supply Hub ID — the de facto public identifier for textile facilities. */
    osId: varchar('os_id', { length: 32 }),
    gln: char('gln', { length: 13 }),
    lei: char('lei', { length: 20 }),
    did: varchar('did', { length: 512 }),
    contactName: varchar('contact_name', { length: 255 }),
    contactEmail: varchar('contact_email', { length: 320 }),
    workerCount: integer('worker_count'),
    /** Free-form process capabilities, used to suggest partners when building a chain. */
    capabilities: text('capabilities').array().notNull().default([]),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_partners_tenant').on(t.tenantId),
    index('idx_partners_tier').on(t.tenantId, t.tier),
    index('idx_partners_country').on(t.country),
  ],
);

/** Which partners touched which passport, and at what step. */
export const passportPartners = pgTable(
  'passport_partners',
  {
    passportId: uuid('passport_id')
      .notNull()
      .references(() => passports.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    role: partnerRoleEnum('role').notNull(),
    tier: supplyTierEnum('tier').notNull(),
    /** Ordering hint for rendering the journey, lowest first. */
    sequence: integer('sequence').notNull().default(0),
    /** Which component this partner supplied, when the chain branches. */
    componentRef: varchar('component_ref', { length: 128 }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.passportId, t.partnerId, t.role] }),
    index('idx_passport_partners_partner').on(t.partnerId),
  ],
);

/**
 * A request to a supplier for data the brand does not hold. This is the
 * mechanism that gets tier-3 and tier-4 information into a passport without
 * the brand having to invent it.
 */
export const dataRequests = pgTable(
  'data_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id').references(() => partners.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message'),
    /** JSON-schema-ish description of exactly which fields are being asked for. */
    requestedFields: jsonb('requested_fields').$type<string[]>().notNull().default([]),
    status: dataRequestStatusEnum('status').notNull().default('draft'),
    /** Hash of the magic-link token that lets a supplier respond without an account. */
    accessTokenHash: char('access_token_hash', { length: 66 }),
    /**
     * When that link stops working. Stored rather than derived from the due
     * date, because the expiry of a credential that grants access should not
     * move silently when someone edits an unrelated field.
     */
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewNotes: text('review_notes'),
    /** What the supplier sent back, before merge. */
    submission: jsonb('submission').$type<Record<string, unknown>>(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_data_requests_tenant').on(t.tenantId, t.status),
    index('idx_data_requests_partner').on(t.partnerId),
  ],
);

export const dataRequestPassports = pgTable(
  'data_request_passports',
  {
    dataRequestId: uuid('data_request_id')
      .notNull()
      .references(() => dataRequests.id, { onDelete: 'cascade' }),
    passportId: uuid('passport_id')
      .notNull()
      .references(() => passports.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.dataRequestId, t.passportId] })],
);

// ═══════════════════════════════════════════════════════════════════════════
// Evidence: credentials & documents
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A W3C Verifiable Credential attached to a passport — a GOTS certificate, a
 * GRS transaction certificate, a lab test report, a conformity declaration.
 * Storing the signed envelope verbatim means a third party can verify it
 * without trusting Polytrail.
 */
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    passportId: uuid('passport_id').references(() => passports.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id').references(() => partners.id, { onDelete: 'set null' }),
    /** e.g. `GOTS`, `GRS`, `OEKO_TEX_STANDARD_100`, `BLUESIGN`, `DCC`. */
    scheme: varchar('scheme', { length: 64 }).notNull(),
    credentialType: varchar('credential_type', { length: 128 }).notNull(),
    licenceNumber: varchar('licence_number', { length: 128 }),
    scopeDescription: text('scope_description'),
    issuerName: varchar('issuer_name', { length: 255 }).notNull(),
    issuerDid: varchar('issuer_did', { length: 512 }),
    subjectDid: varchar('subject_did', { length: 512 }),
    /** The signed VC exactly as issued. */
    document: jsonb('document').notNull().$type<Record<string, unknown>>(),
    documentHash: char('document_hash', { length: 66 }).notNull(),
    status: credentialStatusEnum('status').notNull().default('active'),
    /** Index into the tenant's StatusList2021 bitstring, for revocation. */
    statusListIndex: integer('status_list_index'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_credentials_tenant').on(t.tenantId),
    index('idx_credentials_passport').on(t.passportId),
    index('idx_credentials_scheme').on(t.scheme),
    index('idx_credentials_status').on(t.status),
  ],
);

/**
 * The bytes behind `documents`, content-addressed by SHA-256.
 *
 * In the database rather than on disk because the app deploys to hosts with no
 * persistent filesystem, and because it keeps exactly one backup story: the
 * evidence a regulator may ask for lives wherever the record of it lives.
 * Content addressing means the same certificate attached to forty passports is
 * stored once, and `documents.content_hash` is not a claim about the file —
 * it *is* the key the file is fetched by, so the two cannot drift.
 *
 * Deliberately tenant-free: rows here are unreadable except through a
 * `documents` join, and every such join filters on `tenant_id`.
 */
export const documentBlobs = pgTable('document_blobs', {
  contentHash: char('content_hash', { length: 66 }).primaryKey(),
  bytes: bytea('bytes').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    passportId: uuid('passport_id').references(() => passports.id, { onDelete: 'cascade' }),
    dataRequestId: uuid('data_request_id').references(() => dataRequests.id, {
      onDelete: 'set null',
    }),
    filename: varchar('filename', { length: 512 }).notNull(),
    contentType: varchar('content_type', { length: 128 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** SHA-256 of the bytes, so an auditor can prove the file is unmodified. */
    contentHash: char('content_hash', { length: 66 }).notNull(),
    storageKey: varchar('storage_key', { length: 1024 }).notNull(),
    /** e.g. `lab_report`, `certificate`, `lca_study`, `audit_report`, `image`. */
    kind: varchar('kind', { length: 64 }).notNull(),
    visibility: accessTierEnum('visibility').notNull().default('authority'),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_documents_tenant').on(t.tenantId),
    index('idx_documents_passport').on(t.passportId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// Observability
// ═══════════════════════════════════════════════════════════════════════════

/** Hash-chained, append-only. See `src/lib/audit`. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    previousHash: char('previous_hash', { length: 66 }).notNull(),
    entryHash: char('entry_hash', { length: 66 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    actorLabel: varchar('actor_label', { length: 255 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    subjectType: varchar('subject_type', { length: 64 }).notNull(),
    subjectId: varchar('subject_id', { length: 128 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_audit_tenant_sequence').on(t.tenantId, t.sequence),
    index('idx_audit_tenant_time').on(t.tenantId, t.recordedAt),
    index('idx_audit_subject').on(t.subjectType, t.subjectId),
  ],
);

/**
 * Every read of a public passport. Required to answer "how often is this
 * scanned, and by whom" — and deliberately stores no personal data beyond a
 * coarse country, so the log itself never becomes a GDPR liability.
 */
export const accessLogs = pgTable(
  'access_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passportId: uuid('passport_id')
      .notNull()
      .references(() => passports.id, { onDelete: 'cascade' }),
    tier: accessTierEnum('tier').notNull(),
    /** `qr`, `nfc`, `link`, `api`, `search`. */
    channel: varchar('channel', { length: 16 }).notNull(),
    countryCode: char('country_code', { length: 2 }),
    /** `mobile`, `desktop`, `tablet`, `bot`. */
    deviceClass: varchar('device_class', { length: 16 }),
    locale: varchar('locale', { length: 10 }),
    referrerHost: varchar('referrer_host', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_access_logs_passport').on(t.passportId, t.createdAt),
    index('idx_access_logs_created').on(t.createdAt),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    href: varchar('href', { length: 2048 }),
    severity: varchar('severity', { length: 16 }).notNull().default('info'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_notifications_user').on(t.userId, t.readAt)],
);

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2048 }).notNull(),
    description: varchar('description', { length: 255 }),
    events: text('events').array().notNull().default([]),
    secret: text('secret').notNull(),
    active: boolean('active').notNull().default(true),
    lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_webhook_endpoints_tenant').on(t.tenantId)],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    event: varchar('event', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    responseStatus: integer('response_status'),
    error: text('error'),
    attempt: integer('attempt').notNull().default(1),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_webhook_deliveries_endpoint').on(t.endpointId, t.createdAt)],
);

/** Per-tenant signing material for verifiable credentials. */
export const signingKeys = pgTable(
  'signing_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    did: varchar('did', { length: 512 }).notNull(),
    keyId: varchar('key_id', { length: 512 }).notNull(),
    algorithm: varchar('algorithm', { length: 16 }).notNull().default('ES256'),
    publicJwk: jsonb('public_jwk').notNull().$type<Record<string, unknown>>(),
    /** AES-256-GCM envelope. NULL when custody is delegated to an external KMS. */
    encryptedPrivateJwk: text('encrypted_private_jwk'),
    /** `platform` = Polytrail holds the key; `external` = customer KMS. */
    custody: varchar('custody', { length: 16 }).notNull().default('platform'),
    externalKeyRef: varchar('external_key_ref', { length: 512 }),
    active: boolean('active').notNull().default(true),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_signing_keys_tenant').on(t.tenantId),
    uniqueIndex('uq_signing_keys_kid').on(t.keyId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// Ownership transfer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A passport changing hands.
 *
 * Both sides sign: the sender issues a transfer credential and the receiver
 * issues an acceptance credential. Storing both means a later dispute can be
 * settled from the record rather than from anybody's word, which is the whole
 * reason to model a transfer as a two-party workflow instead of an UPDATE.
 */
export const passportTransfers = pgTable(
  'passport_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passportId: uuid('passport_id')
      .notNull()
      .references(() => passports.id, { onDelete: 'cascade' }),
    fromTenantId: uuid('from_tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** NULL while the recipient is identified only by email and has no workspace yet. */
    toTenantId: uuid('to_tenant_id').references(() => tenants.id),
    toEmail: varchar('to_email', { length: 320 }),
    reason: transferReasonEnum('reason').notNull(),
    status: transferStatusEnum('status').notNull().default('initiated'),
    note: text('note'),
    /** SHA-256 of the acceptance token sent to the recipient. */
    acceptTokenHash: char('accept_token_hash', { length: 66 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    initiatedBy: uuid('initiated_by')
      .notNull()
      .references(() => users.id),
    initiatedAt: timestamp('initiated_at', { withTimezone: true }).notNull().defaultNow(),
    completedBy: uuid('completed_by').references(() => users.id),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    /** The signed credential each side issued, stored verbatim. */
    transferCredential: jsonb('transfer_credential').$type<Record<string, unknown>>(),
    acceptanceCredential: jsonb('acceptance_credential').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_transfers_passport').on(t.passportId),
    index('idx_transfers_from').on(t.fromTenantId, t.status),
    index('idx_transfers_to').on(t.toTenantId, t.status),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// Bulk import
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A batch import run.
 *
 * The mapping and the per-row outcome are both stored because an import that
 * half-succeeded is the normal case, not the exception: a brand uploads two
 * thousand styles and forty of them have a bad GTIN. The operator needs to see
 * exactly which forty, fix them in place, and re-run only those.
 */
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 512 }).notNull(),
    /** `csv` or `api`. An API import records the same audit trail as a file one. */
    source: varchar('source', { length: 16 }).notNull().default('csv'),
    status: importStatusEnum('status').notNull().default('uploaded'),
    /** Column header → payload path. */
    mapping: jsonb('mapping').$type<Record<string, string>>().notNull().default({}),
    /** The parsed rows, kept so a failed import can be corrected and re-run. */
    rows: jsonb('rows').$type<Array<Record<string, unknown>>>(),
    /** Per-row outcome, aligned to `rows` by index. */
    results: jsonb('results')
      .$type<Array<{ ok: boolean; dppId?: string; errors?: Record<string, string[]> }>>(),
    totalRows: integer('total_rows').notNull().default(0),
    succeededRows: integer('succeeded_rows').notNull().default(0),
    failedRows: integer('failed_rows').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('idx_import_jobs_tenant').on(t.tenantId, t.createdAt)],
);

// ═══════════════════════════════════════════════════════════════════════════
// Identity verification
// ═══════════════════════════════════════════════════════════════════════════

/** Evidence that an operator or facility is who it says it is. */
export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** `tenant` or `partner`. */
    subjectType: varchar('subject_type', { length: 32 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    level: verificationLevelEnum('level').notNull().default('unverified'),
    method: varchar('method', { length: 64 }).notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>(),
    /** For domain verification: the TXT record value we expect to find. */
    challenge: varchar('challenge', { length: 255 }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_verifications_subject').on(t.subjectType, t.subjectId),
    index('idx_verifications_tenant').on(t.tenantId, t.level),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════
// Shared value types
// ═══════════════════════════════════════════════════════════════════════════

export interface PostalAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country: string;
}

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Passport = typeof passports.$inferSelect;
export type PassportVersion = typeof passportVersions.$inferSelect;
export type Partner = typeof partners.$inferSelect;
export type DataRequest = typeof dataRequests.$inferSelect;
export type Credential = typeof credentials.$inferSelect;
export type PassportEvent = typeof passportEvents.$inferSelect;
export type PassportTransfer = typeof passportTransfers.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type Verification = typeof verifications.$inferSelect;
