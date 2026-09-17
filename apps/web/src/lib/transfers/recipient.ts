import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenants, users } from '@/lib/db/schema';
import { badRequest, conflict } from '@/lib/api/errors';
import { hashPassword } from '@/lib/auth/password';
import { recordAudit } from '@/lib/audit/record';
import type { Role } from '@/lib/auth/roles';
import type { Session } from '@/lib/auth/session';
import { TRANSFER_REASON_META, type TransferReason } from './types';

/**
 * Giving a recipient somewhere to put the item.
 *
 * Ownership is held by a workspace, so somebody accepting a transfer with no
 * account needs one before ownership can move. The workspace is created from
 * the acceptance form rather than by sending them round a separate sign-up
 * flow: a person who has just been handed a coat should not have to read a
 * marketing page to keep the passport that came with it.
 *
 * The role they get is decided by the reason, not chosen by them. A recycler
 * accepting a recycling transfer lands in the partner portal with recycler
 * access; a buyer accepting a resale gets their own brand workspace. Letting
 * the recipient pick would make the reason field decorative.
 */

const ROLE_BY_REASON: Partial<Record<TransferReason, Role>> = {
  recycling: 'RECYCLER',
  repair_exchange: 'REPAIRER',
};

export function roleForReason(reason: TransferReason): Role {
  return ROLE_BY_REASON[reason] ?? 'BRAND_ADMIN';
}

export interface NewRecipientInput {
  workspaceName: string;
  /** ISO 3166-1 alpha-2 of where the recipient is established. */
  country: string;
  name: string;
  email: string;
  password: string;
  reason: TransferReason;
}

export async function createRecipientWorkspace(input: NewRecipientInput): Promise<Session> {
  const email = input.email.trim().toLowerCase();
  const workspaceName = input.workspaceName.trim();
  const name = input.name.trim();
  const country = input.country.trim().toUpperCase();

  if (name.length < 2) throw badRequest('Enter your name as you would sign it.');
  if (workspaceName.length < 2) throw badRequest('Give the workspace a name people will recognise.');
  if (!/^[A-Z]{2}$/.test(country)) throw badRequest('Enter a two-letter country code, such as GB.');
  if (!email.includes('@')) throw badRequest('That does not look like an email address.');
  if (input.password.length < 12) {
    throw badRequest('Use at least 12 characters. Length beats complexity.');
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  if (existing) {
    throw conflict('That address already has an account. Sign in and accept from there.');
  }

  const passwordHash = await hashPassword(input.password);
  const role = roleForReason(input.reason);

  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug: await uniqueSlug(workspaceName),
        legalName: workspaceName,
        country,
        contactEmail: email,
        status: 'active',
        plan: 'trial',
      })
      .returning({ id: tenants.id });

    const [user] = await tx
      .insert(users)
      .values({
        tenantId: tenant!.id,
        email,
        name,
        passwordHash,
        role,
        status: 'active',
        lastSignInAt: new Date(),
      })
      .returning({ id: users.id });

    await recordAudit({
      tenantId: tenant!.id,
      actorId: user!.id,
      actorLabel: name,
      action: 'tenant.created',
      subjectType: 'tenant',
      subjectId: tenant!.id,
      metadata: {
        origin: 'transfer_acceptance',
        reason: input.reason,
        grants: TRANSFER_REASON_META[input.reason].grants,
        role,
      },
    });

    return { userId: user!.id, tenantId: tenant!.id, role, email, name };
  });
}

/**
 * A readable slug that is still unique.
 *
 * Tried bare first so the common case gives `north-atlantic-wool` rather than
 * `north-atlantic-wool-4f2a`; the suffix only appears when it has to.
 */
async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'workspace';

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const [taken] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${randomSuffix()}${randomSuffix()}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
