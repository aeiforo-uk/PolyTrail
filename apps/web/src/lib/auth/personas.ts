import type { Role } from './roles';

/**
 * Where each role belongs.
 *
 * Polytrail has five genuinely different product surfaces, not one console with
 * things hidden. A recycler is not a brand user with fewer buttons: they arrive
 * holding a garment, they need fibre-separation detail a brand manager never
 * looks at, and they have exactly one thing to record. Giving them the brand
 * console with 80% greyed out would be both worse to use and a standing
 * invitation to a permissions mistake.
 *
 * So role decides which application you land in, and the route prefixes below
 * are the boundary the middleware and each layout enforce.
 */
export interface Persona {
  /** Where a member of this role lands after signing in. */
  home: string;
  /** Route prefixes this role may enter. Everything else is refused. */
  allows: readonly string[];
  label: string;
  /** One line shown on the sign-in page and in the account menu. */
  summary: string;
}

const BRAND_SURFACE = ['/console'] as const;

export const PERSONAS: Record<Role, Persona> = {
  PLATFORM_ADMIN: {
    home: '/console',
    allows: ['/console', '/authority'],
    label: 'Platform',
    summary: 'Operates Polytrail itself.',
  },
  BRAND_ADMIN: {
    home: '/console',
    allows: BRAND_SURFACE,
    label: 'Brand console',
    summary: 'Full control of this workspace, including members and billing.',
  },
  PRODUCT_MANAGER: {
    home: '/console/passports',
    allows: BRAND_SURFACE,
    label: 'Brand console',
    summary: 'Create and maintain passports and supplier requests.',
  },
  COMPLIANCE_OFFICER: {
    home: '/console/review',
    allows: BRAND_SURFACE,
    label: 'Brand console',
    summary: 'Review and approve passports for publication.',
  },
  SUPPLIER: {
    // Suppliers normally arrive on a magic link and never sign in at all. An
    // account exists only for the few who answer requests repeatedly.
    home: '/supplier',
    allows: ['/supplier', '/s'],
    label: 'Supplier portal',
    summary: 'Answer data requests for what you supply.',
  },
  CERTIFIER: {
    home: '/certifier',
    allows: ['/certifier'],
    label: 'Certifier portal',
    summary: 'Issue and revoke certification credentials.',
  },
  REPAIRER: {
    home: '/partner',
    allows: ['/partner'],
    label: 'Repair partner',
    summary: 'Look up a garment and record a repair.',
  },
  RECYCLER: {
    home: '/partner',
    allows: ['/partner'],
    label: 'Waste operator',
    summary: 'Read end-of-life detail and record collection or recycling.',
  },
  AUTHORITY: {
    home: '/authority',
    allows: ['/authority'],
    label: 'Authority',
    summary: 'Read the complete record for enforcement.',
  },
};

export function homeFor(role: Role): string {
  return PERSONAS[role].home;
}

/**
 * May this role open this path?
 *
 * Prefix matching with a boundary check, so `/console` does not accidentally
 * authorise `/console-admin` if such a route is ever added.
 */
export function canEnter(role: Role, pathname: string): boolean {
  return PERSONAS[role].allows.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Route prefixes that require a session at all. */
export const PROTECTED_PREFIXES = [
  '/console',
  '/partner',
  '/authority',
  '/supplier',
  '/certifier',
] as const;

export function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
