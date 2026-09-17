import { ROLES, type Role } from '@/lib/auth/roles';
import { STATUS_LABELS, TRANSITIONS, type PassportStatus } from '@/lib/passport/state';

/**
 * The permissions matrix an admin reads before handing someone a role.
 *
 * Derived from `TRANSITIONS`, never hand-written. A matrix maintained by hand
 * drifts the first time someone adds a transition, and a permissions table
 * that is quietly wrong is worse than no table at all — it is the thing an
 * admin trusts when deciding who gets to publish.
 */

export interface PermissionRow {
  /** Stable key for React and for tests: `draft>in_review`. */
  key: string;
  from: PassportStatus;
  to: PassportStatus;
  fromLabel: string;
  toLabel: string;
  action: string;
  description: string;
  roles: readonly Role[];
  requiresReason: boolean;
  validates: boolean;
}

export interface PermissionMatrix {
  /** Only roles that can actually do something, in the canonical `ROLES` order. */
  roles: Role[];
  rows: PermissionRow[];
}

export function buildPermissionMatrix(): PermissionMatrix {
  const rows: PermissionRow[] = [];
  const seen = new Set<Role>();

  for (const status of Object.keys(TRANSITIONS) as PassportStatus[]) {
    for (const transition of TRANSITIONS[status]) {
      for (const role of transition.roles) seen.add(role);
      rows.push({
        key: `${status}>${transition.to}`,
        from: status,
        to: transition.to,
        fromLabel: STATUS_LABELS[status],
        toLabel: STATUS_LABELS[transition.to],
        action: transition.label,
        description: transition.description,
        roles: transition.roles,
        requiresReason: transition.requiresReason ?? false,
        validates: transition.validates ?? false,
      });
    }
  }

  return { roles: ROLES.filter((role) => seen.has(role)), rows };
}

/** Every lifecycle action a role may take, for the role picker's "what this grants" line. */
export function actionsForRole(role: Role): string[] {
  return buildPermissionMatrix()
    .rows.filter((row) => row.roles.includes(role))
    .map((row) => row.action);
}
