/**
 * API key scopes.
 *
 * Scopes are named `<resource>:<verb>` and are deliberately coarse. A scope
 * model fine enough to express every combination is a scope model nobody reads
 * before ticking every box, which leaves every integration holding a key that
 * can publish. Six scopes is few enough that the person minting a key actually
 * chooses.
 *
 * `passports:write` is separate from `passports:publish` because the common
 * integration — a PLM system pushing product data — should not be able to put
 * a passport in front of a consumer without a human in the loop.
 */
export const API_SCOPES = [
  'passports:read',
  'passports:write',
  'passports:publish',
  'credentials:read',
  'credentials:issue',
  'exports:read',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  'passports:read': 'Read passports',
  'passports:write': 'Create and edit passports',
  'passports:publish': 'Change passport status, including publish and recall',
  'credentials:read': 'Read verifiable credentials',
  'credentials:issue': 'Issue verifiable credentials',
  'exports:read': 'Download CSV exports and regulator evidence packs',
};

export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  'passports:read': 'List passports, read one passport and its version history.',
  'passports:write': 'Create passports and write new versions. Cannot publish.',
  'passports:publish':
    'Move a passport between states — submit, approve, publish, suspend, recall. Grant sparingly.',
  'credentials:read': 'Read the signed credentials attached to a passport.',
  'credentials:issue': 'Sign a new passport credential with the workspace key.',
  'exports:read': 'Generate the CSV exports and the regulator evidence pack.',
};

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === 'string' && (API_SCOPES as readonly string[]).includes(value);
}

/**
 * Does this key hold every scope the operation needs?
 *
 * All-of rather than any-of: an operation that declares two scopes needs both,
 * so adding a scope requirement to an existing route can only ever narrow
 * access, never silently widen it.
 */
export function hasScopes(held: readonly string[], required: readonly ApiScope[]): boolean {
  return required.every((scope) => held.includes(scope));
}
