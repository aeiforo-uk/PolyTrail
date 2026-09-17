import type { Role } from '@/lib/auth/roles';
import type { Session } from '@/lib/auth/session';

/**
 * Who may run an import, and who may configure a connector.
 *
 * An import writes to every passport in the catalogue at once, so it is not a
 * capability an external counterparty gets by being signed in — a supplier
 * answering a data request must never be one URL away from overwriting the
 * brand's product data.
 *
 * Connectors are narrower still, because configuring one means handing the
 * workspace a credential for another system. That is an owner's decision.
 */
export const IMPORT_ROLES: readonly Role[] = ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'PLATFORM_ADMIN'];

export const CONNECTOR_ROLES: readonly Role[] = ['BRAND_ADMIN', 'PLATFORM_ADMIN'];

export function canImport(session: Session | null): session is Session {
  return Boolean(session?.tenantId) && IMPORT_ROLES.includes(session!.role);
}

export function canConfigureConnectors(session: Session | null): session is Session {
  return Boolean(session?.tenantId) && CONNECTOR_ROLES.includes(session!.role);
}
