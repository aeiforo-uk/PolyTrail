/**
 * Polytrail role model.
 *
 * Roles are deliberately modelled on the real actors in a textile value chain
 * rather than on generic "admin/editor/viewer" tiers, because the access rules
 * the ESPR attaches to a Digital Product Passport are actor-specific: a
 * recycler may read fibre composition and disassembly data that a shopper
 * never sees, and a market-surveillance authority may read everything.
 */
export const ROLES = [
  /** Polytrail staff. Cross-tenant. Never touches passport content. */
  'PLATFORM_ADMIN',
  /** Owns a brand workspace: billing, members, branding, connected systems. */
  'BRAND_ADMIN',
  /** Day-to-day product data work: creates and edits passports. */
  'PRODUCT_MANAGER',
  /** Signs off passports before publication. Cannot edit what it approves. */
  'COMPLIANCE_OFFICER',
  /** External tier-1..4 supplier invited to answer a specific data request. */
  'SUPPLIER',
  /** Third-party certifier that issues verifiable claims (GOTS, GRS, OEKO-TEX). */
  'CERTIFIER',
  /** Authorised repair partner. Appends repair events to a passport. */
  'REPAIRER',
  /** Waste-management / fibre-recovery operator. Reads the recycler tier. */
  'RECYCLER',
  /** Market-surveillance or customs authority. Read-everything, write-nothing. */
  'AUTHORITY',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that belong to the brand's own workspace (vs. external counterparties). */
export const INTERNAL_ROLES: readonly Role[] = [
  'BRAND_ADMIN',
  'PRODUCT_MANAGER',
  'COMPLIANCE_OFFICER',
];

export const ROLE_LABELS: Record<Role, string> = {
  PLATFORM_ADMIN: 'Platform admin',
  BRAND_ADMIN: 'Brand admin',
  PRODUCT_MANAGER: 'Product manager',
  COMPLIANCE_OFFICER: 'Compliance officer',
  SUPPLIER: 'Supplier',
  CERTIFIER: 'Certifier',
  REPAIRER: 'Repair partner',
  RECYCLER: 'Recycler',
  AUTHORITY: 'Authority',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  PLATFORM_ADMIN: 'Operates Polytrail itself. Manages workspaces, never product data.',
  BRAND_ADMIN: 'Full control of one brand workspace, including members and billing.',
  PRODUCT_MANAGER: 'Creates and maintains product passports and supplier requests.',
  COMPLIANCE_OFFICER: 'Reviews and approves passports for publication.',
  SUPPLIER: 'Answers data requests for the components or processes they supply.',
  CERTIFIER: 'Issues and revokes certification credentials against products.',
  REPAIRER: 'Records repairs and spare-part replacements on a passport.',
  RECYCLER: 'Reads end-of-life data needed to sort and recover fibres.',
  AUTHORITY: 'Read-only access to the complete passport record for enforcement.',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
