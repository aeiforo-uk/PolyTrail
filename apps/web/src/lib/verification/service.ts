import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenants, verifications } from '@/lib/db/schema';
import { timingSafeEqual } from '@/lib/crypto/canonical';
import { badRequest, conflict, forbidden, notFound } from '@/lib/api/errors';
import { sendEmail } from '@/lib/email';
import { notifyRoles } from '@/lib/notifications';
import { rateLimit } from '@/lib/security/rate-limit';
import type { Session } from '@/lib/auth/session';
import { recordExtendedAudit } from './audit';
import {
  checkDomainChallenge,
  generateDomainChallenge,
  isValidDomain,
  normalizeDomain,
  challengeRecordName,
} from './domain';
import {
  DOMAIN_CHALLENGE_TTL_DAYS,
  EMAIL_TOKEN_TTL_HOURS,
  LEVEL_DEFINITIONS,
  LEVEL_ORDER,
  METHOD_FOR_LEVEL,
  rankOf,
  type LadderRung,
  type LadderStatus,
  type VerificationLevel,
} from './types';

/**
 * The operator verification ladder, as state in the `verifications` table.
 *
 * One row per attempt, never updated in place except to record its outcome, so
 * a regulator asking "when did this brand prove it controlled that domain, and
 * with what" gets an answer rather than a current-state boolean.
 *
 * Subject is always `('tenant', tenantId)` here. The table also carries partner
 * subjects, which is why the type is a string rather than an implied constant.
 */

const SUBJECT_TENANT = 'tenant';

type VerificationRow = typeof verifications.$inferSelect;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function expiryFrom(level: VerificationLevel, verifiedAt: Date): Date | null {
  const days = LEVEL_DEFINITIONS[level].validForDays;
  return days == null ? null : new Date(verifiedAt.getTime() + days * 86_400_000);
}

async function rowsFor(tenantId: string): Promise<VerificationRow[]> {
  return db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.tenantId, tenantId),
        eq(verifications.subjectType, SUBJECT_TENANT),
        eq(verifications.subjectId, tenantId),
      ),
    )
    .orderBy(desc(verifications.createdAt));
}

function stateOf(row: VerificationRow | undefined, level: VerificationLevel): LadderRung['state'] {
  if (!LEVEL_DEFINITIONS[level].implemented) return 'unavailable';
  if (!row) return 'not_started';
  if (row.revokedAt) return 'revoked';
  if (!row.verifiedAt) return 'pending';
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return 'expired';
  return 'verified';
}

function summaryOf(row: VerificationRow | undefined): string | null {
  if (!row) return null;
  const evidence = row.evidence ?? {};
  if (typeof evidence.domain === 'string') return evidence.domain;
  if (typeof evidence.email === 'string') return evidence.email;
  if (Array.isArray(evidence.documents)) {
    return `${evidence.documents.length} document${evidence.documents.length === 1 ? '' : 's'} on file`;
  }
  return row.notes;
}

/** The whole ladder, with what stands and what has lapsed. */
export async function getLadderStatus(tenantId: string): Promise<LadderStatus> {
  const rows = await rowsFor(tenantId);

  const rungs: LadderRung[] = LEVEL_ORDER.filter((level) => level !== 'unverified').map((level) => {
    // Most recent attempt at this level. Ordering is already newest-first.
    const row = rows.find((candidate) => candidate.level === level);
    return {
      definition: LEVEL_DEFINITIONS[level],
      state: stateOf(row, level),
      verifiedAt: row?.verifiedAt?.toISOString() ?? null,
      expiresAt: row?.expiresAt?.toISOString() ?? null,
      summary: summaryOf(row),
    };
  });

  // The level reached is the highest rung standing — not the highest attempted.
  // A lapsed domain proof does not keep a workspace at `domain_verified`.
  let level: VerificationLevel = 'unverified';
  for (const rung of rungs) {
    if (rung.state === 'verified' && rankOf(rung.definition.level) > rankOf(level)) {
      level = rung.definition.level;
    }
  }

  return { level, rungs };
}

export async function currentVerificationLevel(tenantId: string): Promise<VerificationLevel> {
  return (await getLadderStatus(tenantId)).level;
}

// ───────────────────────────────────────────────────────────────────────────
// Email confirmation
// ───────────────────────────────────────────────────────────────────────────

export interface EmailChallengeResult {
  sentTo: string;
  expiresAt: string;
  /** Only populated when email is writing to disk in development. */
  previewPath?: string;
}

/**
 * Send a confirmation token to the workspace contact address.
 *
 * Deliberately to the *workspace* contact, not to the signed-in user: the
 * point of the rung is that the address a regulator or a supplier would write
 * to actually reaches someone, and letting an admin confirm their own inbox
 * would prove nothing about that.
 */
export async function startEmailConfirmation(session: Session): Promise<EmailChallengeResult> {
  const tenantId = requireTenant(session);

  const limit = rateLimit(`verification:email:${tenantId}`, 5, 60 * 60_000);
  if (!limit.ok) {
    throw conflict(
      `Five confirmation emails have already gone out this hour. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.`,
    );
  }

  const [tenant] = await db
    .select({ contactEmail: tenants.contactEmail, legalName: tenants.legalName })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
    .limit(1);

  if (!tenant) throw notFound('Workspace not found.');
  if (!tenant.contactEmail) {
    throw badRequest(
      'This workspace has no contact address. Add one in Settings — it is the address the Registry and your suppliers will use to reach you.',
    );
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_HOURS * 3_600_000);

  await db.insert(verifications).values({
    tenantId,
    subjectType: SUBJECT_TENANT,
    subjectId: tenantId,
    level: 'email_confirmed',
    method: METHOD_FOR_LEVEL.email_confirmed!,
    // Only the digest is stored. The token exists in the email and nowhere else.
    challenge: hashToken(token),
    evidence: { email: tenant.contactEmail },
    expiresAt,
  });

  const result = await sendEmail({
    to: tenant.contactEmail,
    subject: 'Confirm the contact address for your Polytrail workspace',
    text:
      `Someone asked us to confirm ${tenant.contactEmail} as the contact address for ${tenant.legalName}.\n\n` +
      `Paste this code into Console → Security:\n\n  ${token}\n\n` +
      `It works once and stops working in ${EMAIL_TOKEN_TTL_HOURS} hours.\n\n` +
      'If you were not expecting this, you can ignore it — nothing changes until the code is used.',
  });

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'verification.challenge_issued',
    subjectType: 'verification',
    subjectId: tenantId,
    metadata: { level: 'email_confirmed', delivered: result.delivered },
  });

  return {
    sentTo: tenant.contactEmail,
    expiresAt: expiresAt.toISOString(),
    previewPath: result.path,
  };
}

export async function confirmEmailToken(session: Session, token: string): Promise<void> {
  const tenantId = requireTenant(session);
  const trimmed = token.trim();
  if (!trimmed) throw badRequest('Paste the code from the email.');

  const limit = rateLimit(`verification:email-confirm:${tenantId}`, 10, 15 * 60_000);
  if (!limit.ok) throw conflict('Too many attempts. Wait a few minutes and try again.');

  const digest = hashToken(trimmed);
  const candidates = await db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.tenantId, tenantId),
        eq(verifications.subjectType, SUBJECT_TENANT),
        eq(verifications.subjectId, tenantId),
        eq(verifications.level, 'email_confirmed'),
        isNull(verifications.verifiedAt),
        isNull(verifications.revokedAt),
      ),
    )
    .orderBy(desc(verifications.createdAt))
    .limit(10);

  // Constant-time compare against each open challenge, so a wrong code cannot
  // be distinguished from a stale one by how long the answer takes.
  const match = candidates.find(
    (row) => row.challenge != null && timingSafeEqual(row.challenge, digest),
  );

  if (!match) throw badRequest('That code is not right. Check it, or send a new one.');
  if (match.expiresAt && match.expiresAt.getTime() < Date.now()) {
    throw badRequest('That code has expired. Send a new one.');
  }

  const verifiedAt = new Date();
  await db
    .update(verifications)
    .set({
      verifiedAt,
      verifiedBy: session.userId,
      // The challenge is consumed, so the digest is cleared: a used token
      // should not be sitting in the table waiting to be replayed.
      challenge: null,
      expiresAt: expiryFrom('email_confirmed', verifiedAt),
    })
    .where(eq(verifications.id, match.id));

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'verification.level_reached',
    subjectType: 'verification',
    subjectId: match.id,
    metadata: { level: 'email_confirmed' },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Domain verification
// ───────────────────────────────────────────────────────────────────────────

export interface DomainChallenge {
  verificationId: string;
  domain: string;
  recordName: string;
  recordValue: string;
  expiresAt: string;
}

export async function startDomainVerification(
  session: Session,
  rawDomain: string,
): Promise<DomainChallenge> {
  const tenantId = requireTenant(session);
  const domain = normalizeDomain(rawDomain);

  if (!isValidDomain(domain)) {
    throw badRequest(`“${rawDomain}” is not a domain name. Enter it as example.com — no https, no path.`);
  }

  const challenge = generateDomainChallenge();
  const expiresAt = new Date(Date.now() + DOMAIN_CHALLENGE_TTL_DAYS * 86_400_000);

  const [row] = await db
    .insert(verifications)
    .values({
      tenantId,
      subjectType: SUBJECT_TENANT,
      subjectId: tenantId,
      level: 'domain_verified',
      method: METHOD_FOR_LEVEL.domain_verified!,
      challenge,
      evidence: { domain },
      expiresAt,
    })
    .returning();

  if (!row) throw conflict('The challenge could not be created. Try again.');

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'verification.challenge_issued',
    subjectType: 'verification',
    subjectId: row.id,
    metadata: { level: 'domain_verified', domain },
  });

  return {
    verificationId: row.id,
    domain,
    recordName: challengeRecordName(domain),
    recordValue: challenge,
    expiresAt: expiresAt.toISOString(),
  };
}

export interface DomainVerificationOutcome {
  verified: boolean;
  detail: string;
  found: string[];
}

export async function verifyDomain(
  session: Session,
  verificationId: string,
): Promise<DomainVerificationOutcome> {
  const tenantId = requireTenant(session);

  const limit = rateLimit(`verification:dns:${tenantId}`, 30, 60 * 60_000);
  if (!limit.ok) throw conflict('Too many DNS checks this hour. Wait a little and try again.');

  const [row] = await db
    .select()
    .from(verifications)
    // Tenant-scoped, so a verification id from another workspace resolves to
    // nothing rather than to someone else's challenge.
    .where(and(eq(verifications.id, verificationId), eq(verifications.tenantId, tenantId)))
    .limit(1);

  if (!row) throw notFound('That challenge does not exist.');
  if (row.revokedAt) throw conflict('That challenge was withdrawn. Start a new one.');
  if (row.verifiedAt) return { verified: true, detail: 'Already verified.', found: [] };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw conflict('That challenge has expired. Start a new one and publish the new record.');
  }

  const domain = typeof row.evidence?.domain === 'string' ? row.evidence.domain : null;
  if (!domain || !row.challenge) throw conflict('That challenge is incomplete. Start a new one.');

  const result = await checkDomainChallenge(domain, row.challenge);

  if (result.outcome !== 'verified') {
    return { verified: false, detail: result.detail, found: result.found };
  }

  const verifiedAt = new Date();
  await db
    .update(verifications)
    .set({
      verifiedAt,
      verifiedBy: session.userId,
      expiresAt: expiryFrom('domain_verified', verifiedAt),
      evidence: { domain, recordName: challengeRecordName(domain) },
      // Kept, not cleared: the published record has to stay in place, and the
      // renewal check a year from now compares against this same value.
    })
    .where(eq(verifications.id, row.id));

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'verification.level_reached',
    subjectType: 'verification',
    subjectId: row.id,
    metadata: { level: 'domain_verified', domain },
  });

  return { verified: true, detail: result.detail, found: result.found };
}

// ───────────────────────────────────────────────────────────────────────────
// Document review
// ───────────────────────────────────────────────────────────────────────────

export interface DocumentMetadata {
  /** What the document is — a registry extract, an LEI certificate, a VAT registration. */
  kind: string;
  fileName: string;
  sizeBytes: number;
  /** SHA-256 of the file, so a reviewer can confirm the bytes never changed. */
  contentHash: string;
  /** The stored file in the documents table, so a reviewer can open the bytes. */
  documentId?: string;
  reference?: string;
}

export async function submitVerificationDocuments(
  session: Session,
  documents: DocumentMetadata[],
  notes?: string,
): Promise<string> {
  const tenantId = requireTenant(session);
  if (documents.length === 0) throw badRequest('Attach at least one document.');

  const [row] = await db
    .insert(verifications)
    .values({
      tenantId,
      subjectType: SUBJECT_TENANT,
      subjectId: tenantId,
      level: 'document_verified',
      method: METHOD_FOR_LEVEL.document_verified!,
      evidence: { documents },
      notes: notes?.slice(0, 2000) ?? null,
    })
    .returning();

  if (!row) throw conflict('The submission could not be recorded. Try again.');

  await notifyRoles(['BRAND_ADMIN', 'COMPLIANCE_OFFICER'], {
    tenantId,
    kind: 'verification.review_due',
    title: 'Operator documents are waiting for review',
    body: `${documents.length} document${documents.length === 1 ? '' : 's'} submitted for identity verification.`,
    href: '/console/security',
    severity: 'info',
  });

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'verification.challenge_issued',
    subjectType: 'verification',
    subjectId: row.id,
    metadata: { level: 'document_verified', documentCount: documents.length },
  });

  return row.id;
}

/**
 * A reviewer's decision.
 *
 * Kept to compliance officers and brand admins, and recorded against the person
 * who made it: this rung exists precisely because somebody looked at a company
 * extract and took responsibility for what they saw.
 */
export async function recordDocumentReview(
  session: Session,
  verificationId: string,
  decision: 'approve' | 'reject',
  notes: string,
): Promise<void> {
  const tenantId = requireTenant(session);
  if (session.role !== 'BRAND_ADMIN' && session.role !== 'COMPLIANCE_OFFICER') {
    throw forbidden('Only a brand admin or compliance officer can record a verification decision.');
  }
  if (decision === 'reject' && !notes.trim()) {
    throw badRequest('Say why it was rejected. A rejection with no reason cannot be acted on.');
  }

  const [row] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.id, verificationId), eq(verifications.tenantId, tenantId)))
    .limit(1);

  if (!row) throw notFound('That submission does not exist.');
  if (row.level !== 'document_verified') throw badRequest('That is not a document submission.');
  if (row.verifiedAt || row.revokedAt) throw conflict('That submission has already been decided.');

  const now = new Date();
  await db
    .update(verifications)
    .set(
      decision === 'approve'
        ? {
            verifiedAt: now,
            verifiedBy: session.userId,
            expiresAt: expiryFrom('document_verified', now),
            notes: notes.slice(0, 2000) || row.notes,
          }
        : { revokedAt: now, verifiedBy: session.userId, notes: notes.slice(0, 2000) },
    )
    .where(eq(verifications.id, row.id));

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: decision === 'approve' ? 'verification.level_reached' : 'verification.review_recorded',
    subjectType: 'verification',
    subjectId: row.id,
    metadata: { level: 'document_verified', decision },
  });
}

export async function revokeVerification(
  session: Session,
  verificationId: string,
  reason: string,
): Promise<void> {
  const tenantId = requireTenant(session);
  if (session.role !== 'BRAND_ADMIN') {
    throw forbidden('Only a brand admin can withdraw a verification.');
  }

  const [row] = await db
    .select({ id: verifications.id, level: verifications.level })
    .from(verifications)
    .where(and(eq(verifications.id, verificationId), eq(verifications.tenantId, tenantId)))
    .limit(1);

  if (!row) throw notFound('That verification does not exist.');

  await db
    .update(verifications)
    .set({ revokedAt: new Date(), notes: reason.slice(0, 2000) })
    .where(eq(verifications.id, row.id));

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'verification.revoked',
    subjectType: 'verification',
    subjectId: row.id,
    metadata: { level: row.level },
  });
}

function requireTenant(session: Session): string {
  if (!session.tenantId) throw forbidden('Your account is not attached to a workspace.');
  return session.tenantId;
}
