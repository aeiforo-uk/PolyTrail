import 'server-only';
import { createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { invitations, tenants, users } from '@/lib/db/schema';
import { hashPassword, randomToken } from '@/lib/auth/password';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { sendEmail } from '@/lib/email';

/**
 * Workspace invitations.
 *
 * The plaintext token exists in exactly two places: the link handed to the
 * admin at the moment of creation, and the email we send. The database only
 * ever holds its SHA-256. That is why "resend" mints a new token and revokes
 * the old one rather than re-showing the original — we genuinely cannot
 * recover it, and an invitation system that could is one database read away
 * from being an account-takeover primitive.
 */

/** Seven days is long enough for a supplier to get round to it, short enough that a leaked link expires. */
const EXPIRY_DAYS = 7;

/** Same `0x`-prefixed SHA-256 shape used by the audit chain and API keys. */
export function hashInviteToken(token: string): string {
  return '0x' + createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  message: string | null;
  invitedByName: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** `tokenHash` is deliberately absent from the projection — it never leaves the server. */
export async function listInvitations(tenantId: string): Promise<InvitationRow[]> {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      message: invitations.message,
      invitedByName: users.name,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(eq(invitations.tenantId, tenantId))
    .orderBy(desc(invitations.createdAt));
}

export interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: Role;
  invitedBy: string;
  message?: string | null;
}

export interface CreatedInvitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  /** Shown once, then unrecoverable. */
  token: string;
}

export async function createInvitation(input: CreateInvitationInput): Promise<CreatedInvitation> {
  const email = input.email.trim().toLowerCase();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db
    .insert(invitations)
    .values({
      tenantId: input.tenantId,
      email,
      role: input.role,
      tokenHash: hashInviteToken(token),
      invitedBy: input.invitedBy,
      message: input.message?.trim() || null,
      expiresAt,
    })
    .returning({ id: invitations.id });

  return { id: row!.id, email, role: input.role, expiresAt, token };
}

/** Returns the pending invitation for an email, if one is outstanding. */
export async function findPendingInvitation(tenantId: string, email: string) {
  const [row] = await db
    .select({ id: invitations.id, role: invitations.role, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(
      and(
        eq(invitations.tenantId, tenantId),
        eq(invitations.email, email.trim().toLowerCase()),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function revokeInvitation(tenantId: string, invitationId: string) {
  const [row] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.tenantId, tenantId),
        isNull(invitations.acceptedAt),
      ),
    )
    .returning({ id: invitations.id, email: invitations.email, role: invitations.role });
  return row ?? null;
}

export interface ResolvedInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  message: string | null;
  workspaceName: string;
  /** Why the invitation cannot be used, or `null` when it is good. */
  problem: 'expired' | 'accepted' | 'revoked' | null;
}

/**
 * Look an invitation up by its plaintext token.
 *
 * The only query in the codebase that intentionally does not filter on
 * `tenantId`: the person following the link has no session yet, so the token
 * itself is what establishes which workspace they are joining. The unique
 * index on `token_hash` is what makes that safe.
 */
export async function resolveInvitationToken(token: string): Promise<ResolvedInvitation | null> {
  const [row] = await db
    .select({
      id: invitations.id,
      tenantId: invitations.tenantId,
      email: invitations.email,
      role: invitations.role,
      message: invitations.message,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .where(eq(invitations.tokenHash, hashInviteToken(token)))
    .limit(1);

  if (!row) return null;

  const [tenant] = await db
    .select({ legalName: tenants.legalName, tradeName: tenants.tradeName })
    .from(tenants)
    .where(eq(tenants.id, row.tenantId))
    .limit(1);

  const problem: ResolvedInvitation['problem'] = row.revokedAt
    ? 'revoked'
    : row.acceptedAt
      ? 'accepted'
      : row.expiresAt.getTime() < Date.now()
        ? 'expired'
        : null;

  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    role: row.role,
    message: row.message,
    workspaceName: tenant?.tradeName ?? tenant?.legalName ?? 'this workspace',
    problem,
  };
}

export interface AcceptInvitationInput {
  token: string;
  name: string;
  password: string;
}

/**
 * Turn an invitation into an active account.
 *
 * Runs in one transaction with the acceptance stamp, because an account that
 * exists against an invitation still marked pending would let the same link be
 * redeemed twice.
 */
export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<{ userId: string; tenantId: string; role: Role; email: string; name: string }> {
  const resolved = await resolveInvitationToken(input.token);
  if (!resolved) throw new Error('That invitation link is not valid.');
  if (resolved.problem === 'expired') throw new Error('That invitation has expired. Ask for a new one.');
  if (resolved.problem === 'revoked') throw new Error('That invitation was withdrawn.');
  if (resolved.problem === 'accepted') throw new Error('That invitation has already been used.');

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.email, resolved.email))
      .limit(1);

    let userId: string;

    if (existing) {
      // An invited-but-never-activated row, or someone re-invited after being
      // removed. Either way the invitation is the authority on role and
      // workspace, so it overwrites both.
      await tx
        .update(users)
        .set({
          tenantId: resolved.tenantId,
          name: input.name.trim(),
          passwordHash,
          role: resolved.role,
          status: 'active',
          deletedAt: null,
          failedSignInCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const [created] = await tx
        .insert(users)
        .values({
          tenantId: resolved.tenantId,
          email: resolved.email,
          name: input.name.trim(),
          passwordHash,
          role: resolved.role,
          status: 'active',
        })
        .returning({ id: users.id });
      userId = created!.id;
    }

    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, resolved.id));

    return {
      userId,
      tenantId: resolved.tenantId,
      role: resolved.role,
      email: resolved.email,
      name: input.name.trim(),
    };
  });
}

/** Absolute URL an invitee follows. Built here so the shape lives in one place. */
export function invitationLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/invite/${token}`;
}

/**
 * Actually send the invitation.
 *
 * Until this function existed, the module's own comment about "the email we
 * send" was a lie — the only delivery path was an admin copying the link by
 * hand. Delivery failure never fails the invite: the link still exists and is
 * still shown to the admin, so the return value is a fact for the UI to state,
 * not an error to throw.
 */
export async function sendInvitationEmail(options: {
  tenantId: string;
  email: string;
  role: Role;
  link: string;
  invitedByName: string;
  expiresAt: Date;
  message?: string;
}): Promise<boolean> {
  const [tenant] = await db
    .select({ tradeName: tenants.tradeName, legalName: tenants.legalName })
    .from(tenants)
    .where(eq(tenants.id, options.tenantId))
    .limit(1);
  const workspace = tenant?.tradeName ?? tenant?.legalName ?? 'a Polytrail workspace';

  try {
    await sendEmail({
      to: options.email,
      subject: `${options.invitedByName} invited you to ${workspace} on Polytrail`,
      text: [
        `${options.invitedByName} has invited you to join ${workspace} as ${ROLE_LABELS[options.role]}.`,
        ...(options.message ? ['', `"${options.message}"`] : []),
        '',
        'Accept the invitation and set your password here:',
        options.link,
        '',
        `The link works once and expires on ${options.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        'If you were not expecting this, you can ignore this email.',
      ].join('\n'),
    });
    return true;
  } catch (error) {
    console.error('[team] invitation email failed', { email: options.email, error });
    return false;
  }
}
