import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  passportTransfers,
  passportVersions,
  passports,
  products,
  tenants,
  users,
} from '@/lib/db/schema';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '@/lib/api/errors';
import { recordAudit, recordAuditSafe } from '@/lib/audit/record';
import type { AuditAction } from '@/lib/audit/index';
import { randomToken } from '@/lib/auth/password';
import { timingSafeEqual } from '@/lib/crypto/canonical';
import { sendEmail } from '@/lib/email';
import { notifyUser } from '@/lib/notifications';
import { formatDppId, normalizeDppId } from '@/lib/passport/identifier';
import { appendEvent } from '@/lib/lifecycle/events';
import { appUrl } from '@/lib/app-url';
import type { Role } from '@/lib/auth/roles';
import { buildAcceptanceCredential, buildTransferCredential, sealCredential } from './credential';
import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  MIN_EXPIRY_DAYS,
  canCancel,
  canDecide,
  canTransfer,
  hasExpired,
} from './state';
import {
  TRANSFER_REASON_META,
  isTransferReason,
  type TransferReason,
  type TransferStatus,
} from './types';

/**
 * Moving a passport from one holder to another.
 *
 * The protocol is deliberately two-sided. The sender signs an offer; the
 * recipient signs an acceptance; both documents are stored verbatim and
 * ownership moves only when the second one exists. The alternative — an UPDATE
 * on `owner_tenant_id` — would leave nothing behind to settle a disagreement
 * about what was handed over, on what terms, and when.
 *
 * The acceptance link is a bearer token, so only its SHA-256 is ever written
 * down. A leaked database gives an attacker a hash and nothing to do with it.
 */

/**
 * Audit vocabulary.
 *
 * `AUDIT_ACTIONS` has no `passport.transfer.*` entries yet, so transfers are
 * recorded as an update to the passport with the transfer stage in the
 * metadata. That keeps the chain complete and queryable today; the action names
 * should be added and this constant retired.
 */
const TRANSFER_AUDIT_ACTION: AuditAction = 'passport.updated';

export function hashAcceptToken(token: string): string {
  return '0x' + createHash('sha256').update(token, 'utf8').digest('hex');
}

export function acceptanceLink(token: string): string {
  const base = appUrl();
  return `${base}/t/${token}`;
}

export interface TransferInitiator {
  userId: string;
  name: string;
  email: string;
  tenantId: string | null;
  role: Role;
}

export interface InitiateTransferInput {
  dppId: string;
  reason: TransferReason;
  /** One of these is required. A tenant id is preferred when the recipient is known. */
  toEmail?: string | null;
  toTenantId?: string | null;
  note?: string | null;
  expiresInDays?: number;
}

export interface InitiateTransferResult {
  transferId: string;
  dppId: string;
  /** The live acceptance URL. Shown once to the sender so a bounced email is recoverable. */
  acceptUrl: string;
  emailDelivered: boolean;
  expiresAt: string;
}

export async function initiateTransfer(
  actor: TransferInitiator,
  input: InitiateTransferInput,
): Promise<InitiateTransferResult> {
  const tenantId = actor.tenantId;
  if (!tenantId) throw forbidden('Your account is not attached to a workspace.');
  if (!isTransferReason(input.reason)) throw unprocessable('Choose a reason for the transfer.');

  const dppId = normalizeDppId(input.dppId);
  const [row] = await db
    .select({
      passport: passports,
      productName: products.name,
      senderName: tenants.legalName,
      senderTradeName: tenants.tradeName,
    })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .leftJoin(products, eq(products.id, passports.productId))
    .where(and(eq(passports.dppId, dppId), isNull(passports.deletedAt)))
    .limit(1);

  if (!row) throw notFound('No passport with that identifier.');
  const { passport } = row;

  const [inFlight] = await db
    .select({ id: passportTransfers.id })
    .from(passportTransfers)
    .where(
      and(eq(passportTransfers.passportId, passport.id), eq(passportTransfers.status, 'initiated')),
    )
    .limit(1);

  const verdict = canTransfer(
    {
      status: passport.status,
      tenantId: passport.tenantId,
      ownerTenantId: passport.ownerTenantId,
      transferInFlight: Boolean(inFlight),
    },
    actor,
  );
  if (!verdict.ok) throw forbidden(verdict.reason ?? 'This passport cannot be transferred.');

  const recipient = await resolveRecipient(tenantId, input);

  const days = clampExpiry(input.expiresInDays);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  const token = randomToken(32);
  const transferId = randomUUID();

  const [version] = passport.publishedVersion
    ? await db
        .select({ version: passportVersions.version, dataHash: passportVersions.dataHash })
        .from(passportVersions)
        .where(
          and(
            eq(passportVersions.passportId, passport.id),
            eq(passportVersions.version, passport.publishedVersion),
          ),
        )
        .limit(1)
    : [];

  const senderName = row.senderTradeName ?? row.senderName;
  const sealed = await sealCredential(
    tenantId,
    buildTransferCredential({
      transferId,
      dppId: passport.dppId,
      passportVersion: version?.version ?? null,
      passportDataHash: version?.dataHash ?? null,
      reason: input.reason,
      note: input.note?.trim() || null,
      fromName: senderName,
      fromTenantId: tenantId,
      toTenantId: recipient.tenantId,
      toEmail: recipient.email,
      at: now,
      expiresAt,
    }),
  );

  await db.transaction(async (tx) => {
    await tx.insert(passportTransfers).values({
      id: transferId,
      passportId: passport.id,
      fromTenantId: tenantId,
      toTenantId: recipient.tenantId,
      toEmail: recipient.email,
      reason: input.reason,
      status: 'initiated',
      note: input.note?.trim() || null,
      acceptTokenHash: hashAcceptToken(token),
      expiresAt,
      initiatedBy: actor.userId,
      initiatedAt: now,
      transferCredential: sealed.document,
      metadata: { credentialHash: sealed.documentHash },
    });

    await recordAudit({
      tenantId,
      actorId: actor.userId,
      actorLabel: actor.name,
      action: TRANSFER_AUDIT_ACTION,
      subjectType: 'passport_transfer',
      subjectId: transferId,
      metadata: {
        stage: 'transfer.initiated',
        dppId: passport.dppId,
        reason: input.reason,
        toTenantId: recipient.tenantId,
        toEmail: recipient.email,
        expiresAt: expiresAt.toISOString(),
        credentialHash: sealed.documentHash,
      },
    });
  });

  const meta = TRANSFER_REASON_META[input.reason];
  const url = acceptanceLink(token);
  const product = row.productName ?? 'an item';
  const delivery = await sendEmail({
    to: recipient.email,
    subject: `${senderName} is transferring ${product} to you`,
    text: [
      `${senderName} wants to transfer the digital product passport for ${product} to you.`,
      '',
      `Reason: ${meta.label}. ${meta.summary}`,
      `What you get: ${meta.grants}`,
      `Item: ${formatDppId(passport.dppId)}`,
      input.note?.trim() ? `Note from ${senderName}: ${input.note.trim()}` : null,
      '',
      'Review it and decide here:',
      url,
      '',
      `This link works until ${expiresAt.toUTCString()}. You do not need an account to read the offer.`,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  });

  if (recipient.tenantId) {
    await notifyRecipientWorkspace(recipient.tenantId, senderName, product);
  }

  return {
    transferId,
    dppId: passport.dppId,
    acceptUrl: url,
    emailDelivered: delivery.delivered,
    expiresAt: expiresAt.toISOString(),
  };
}

function clampExpiry(days: number | undefined): number {
  if (!days || Number.isNaN(days)) return DEFAULT_EXPIRY_DAYS;
  return Math.min(MAX_EXPIRY_DAYS, Math.max(MIN_EXPIRY_DAYS, Math.floor(days)));
}

async function resolveRecipient(
  fromTenantId: string,
  input: InitiateTransferInput,
): Promise<{ tenantId: string | null; email: string }> {
  const typedEmail = input.toEmail?.trim().toLowerCase() || null;

  if (input.toTenantId) {
    if (input.toTenantId === fromTenantId) {
      throw badRequest('A workspace cannot transfer a passport to itself.');
    }
    const [tenant] = await db
      .select({ id: tenants.id, contactEmail: tenants.contactEmail, name: tenants.legalName })
      .from(tenants)
      .where(and(eq(tenants.id, input.toTenantId), isNull(tenants.deletedAt)))
      .limit(1);
    if (!tenant) throw notFound('That workspace does not exist.');

    const email = typedEmail ?? tenant.contactEmail;
    if (!email) {
      throw badRequest(
        `${tenant.name} has no contact address on file. Add an email address to send the offer to.`,
      );
    }
    return { tenantId: tenant.id, email };
  }

  if (!typedEmail || !typedEmail.includes('@')) {
    throw badRequest('Enter the email address of whoever is taking this item on.');
  }

  // An email that already belongs to a workspace is bound to it now, so the
  // recipient signs in and accepts rather than being asked to create a second
  // workspace they do not need.
  const [existing] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(and(eq(users.email, typedEmail), isNull(users.deletedAt)))
    .limit(1);

  const boundTenant = existing?.tenantId ?? null;
  if (boundTenant && boundTenant === fromTenantId) {
    throw badRequest('That address belongs to this workspace. Transfer it to somebody else.');
  }

  return { tenantId: boundTenant, email: typedEmail };
}

async function notifyRecipientWorkspace(
  tenantId: string,
  senderName: string,
  product: string,
): Promise<void> {
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.status, 'active'), isNull(users.deletedAt)))
    .limit(25);

  for (const person of recipients) {
    await notifyUser(person.id, {
      tenantId,
      kind: 'transfer.incoming',
      title: `${senderName} is transferring ${product} to you`,
      body: 'Review the offer and decide whether to take it on.',
      // The acceptance link is not stored here. A notification row is durable,
      // readable by everyone in the workspace and backed up — a bearer token
      // does not belong in one. A signed-in workspace decides from the console
      // without needing the token at all.
      href: '/console/transfers',
      severity: 'info',
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Reading an offer by its token
// ───────────────────────────────────────────────────────────────────────────

export interface ResolvedOffer {
  transferId: string;
  dppId: string;
  productName: string | null;
  reason: TransferReason;
  status: TransferStatus;
  note: string | null;
  fromTenantId: string;
  fromName: string;
  toTenantId: string | null;
  toEmail: string | null;
  initiatedAt: string;
  initiatedByName: string | null;
  expiresAt: string | null;
  expired: boolean;
  passportStatus: string;
}

/**
 * Look an offer up by its plaintext token.
 *
 * Unscoped by tenant on purpose: whoever follows the link has no session, and
 * the token is the entire proof of entitlement. The hash is what is compared,
 * and it is compared in constant time even though it is only a digest, because
 * a lookup that leaks timing on a digest today leaks timing on whatever
 * replaces it tomorrow.
 */
export async function resolveTransferToken(token: string): Promise<ResolvedOffer | null> {
  if (!token || token.length < 16) return null;
  const hash = hashAcceptToken(token);

  const [row] = await db
    .select({
      transfer: passportTransfers,
      dppId: passports.dppId,
      passportStatus: passports.status,
      productName: products.name,
      fromLegalName: tenants.legalName,
      fromTradeName: tenants.tradeName,
      initiatedByName: users.name,
    })
    .from(passportTransfers)
    .innerJoin(passports, eq(passports.id, passportTransfers.passportId))
    .innerJoin(tenants, eq(tenants.id, passportTransfers.fromTenantId))
    .leftJoin(products, eq(products.id, passports.productId))
    .leftJoin(users, eq(users.id, passportTransfers.initiatedBy))
    .where(eq(passportTransfers.acceptTokenHash, hash))
    .limit(1);

  if (!row?.transfer.acceptTokenHash) return null;
  if (!timingSafeEqual(row.transfer.acceptTokenHash, hash)) return null;

  const { transfer } = row;
  const expired = hasExpired(transfer);

  // Expiry is recorded the first time anybody notices it, so the sender's list
  // stops saying "awaiting the recipient" about a link that stopped working.
  if (expired && transfer.status === 'initiated') {
    await db
      .update(passportTransfers)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(eq(passportTransfers.id, transfer.id), eq(passportTransfers.status, 'initiated')),
      );
  }

  return {
    transferId: transfer.id,
    dppId: row.dppId,
    productName: row.productName,
    reason: transfer.reason as TransferReason,
    status: (expired && transfer.status === 'initiated'
      ? 'expired'
      : transfer.status) as TransferStatus,
    note: transfer.note,
    fromTenantId: transfer.fromTenantId,
    fromName: row.fromTradeName ?? row.fromLegalName,
    toTenantId: transfer.toTenantId,
    toEmail: transfer.toEmail,
    initiatedAt: transfer.initiatedAt.toISOString(),
    initiatedByName: row.initiatedByName,
    expiresAt: transfer.expiresAt?.toISOString() ?? null,
    expired,
    passportStatus: row.passportStatus,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Deciding
// ───────────────────────────────────────────────────────────────────────────

export interface TransferAcceptor {
  userId: string;
  name: string;
  email: string;
  tenantId: string;
  role: Role;
}

export interface AcceptTransferResult {
  transferId: string;
  dppId: string;
  reason: TransferReason;
  /** Where this person should go next, given what they have just taken on. */
  becomesBrandOfRecord: boolean;
}

export async function acceptTransfer(
  token: string,
  acceptor: TransferAcceptor,
): Promise<AcceptTransferResult> {
  return completeAcceptance(await loadDecidableByToken(token, acceptor), acceptor);
}

/**
 * Accept from inside the console.
 *
 * A workspace the offer was addressed to does not need the bearer token — it
 * has already proved who it is by signing in, and asking it to go and find the
 * email would be security theatre. The token exists for recipients who have no
 * account, which is a different problem.
 */
export async function acceptTransferById(
  transferId: string,
  acceptor: TransferAcceptor,
): Promise<AcceptTransferResult> {
  return completeAcceptance(await loadDecidableById(transferId, acceptor), acceptor);
}

async function completeAcceptance(
  offer: DecidableOffer,
  acceptor: TransferAcceptor,
): Promise<AcceptTransferResult> {
  const reason = offer.reason;
  const meta = TRANSFER_REASON_META[reason];
  const acceptedAt = new Date();

  const sealed = await sealCredential(
    acceptor.tenantId,
    buildAcceptanceCredential({
      transferId: offer.transferId,
      dppId: offer.dppId,
      reason,
      acceptedAt,
      acceptorTenantId: acceptor.tenantId,
      acceptorName: acceptor.name,
      acceptorEmail: acceptor.email,
      transferCredentialHash:
        typeof offer.metadata.credentialHash === 'string' ? offer.metadata.credentialHash : null,
    }),
  );

  await db.transaction(async (tx) => {
    // Conditioned on `initiated` so two people opening the same link cannot
    // both move ownership; the loser updates nothing and is told why.
    const moved = await tx
      .update(passportTransfers)
      .set({
        status: 'accepted',
        toTenantId: acceptor.tenantId,
        completedBy: acceptor.userId,
        completedAt: acceptedAt,
        acceptanceCredential: sealed.document,
        acceptTokenHash: null,
        metadata: { ...offer.metadata, acceptanceCredentialHash: sealed.documentHash },
        updatedAt: acceptedAt,
      })
      .where(
        and(
          eq(passportTransfers.id, offer.transferId),
          eq(passportTransfers.status, 'initiated'),
        ),
      )
      .returning({ id: passportTransfers.id });

    if (moved.length === 0) {
      throw conflict('This transfer has already been decided.');
    }

    await tx
      .update(passports)
      .set({ ownerTenantId: acceptor.tenantId, updatedAt: acceptedAt })
      .where(eq(passports.id, offer.passportId));

    if (meta.event) {
      await appendEvent(
        {
          userId: acceptor.userId,
          name: acceptor.name,
          tenantId: acceptor.tenantId,
          role: acceptor.role,
        },
        {
          dppId: offer.dppId,
          eventType: meta.event,
          occurredAt: acceptedAt,
          summary: `${meta.label}: ${offer.fromName} → ${acceptor.name}`,
          details: { transferId: offer.transferId, reason },
          actingAs: 'owner',
        },
        tx,
      );
    }

    for (const tenantId of [offer.fromTenantId, acceptor.tenantId]) {
      await recordAudit({
        tenantId,
        actorId: acceptor.userId,
        actorLabel: acceptor.name,
        action: TRANSFER_AUDIT_ACTION,
        subjectType: 'passport_transfer',
        subjectId: offer.transferId,
        metadata: {
          stage: 'transfer.accepted',
          dppId: offer.dppId,
          reason,
          fromTenantId: offer.fromTenantId,
          toTenantId: acceptor.tenantId,
          acceptanceCredentialHash: sealed.documentHash,
        },
      });
    }
  });

  await tellTheSender(offer, {
    subject: `${acceptor.name} accepted the transfer of ${offer.productName ?? 'an item'}`,
    line: `${acceptor.name} has taken on ${offer.productName ?? 'the item'} (${formatDppId(offer.dppId)}). Ownership has moved.`,
    severity: 'success',
  });

  return {
    transferId: offer.transferId,
    dppId: offer.dppId,
    reason,
    becomesBrandOfRecord: meta.becomesBrandOfRecord,
  };
}

export interface RejectTransferResult {
  transferId: string;
  dppId: string;
}

export type TransferDecider = Pick<TransferAcceptor, 'userId' | 'name' | 'email' | 'tenantId'>;

export async function rejectTransfer(
  token: string,
  reason: string,
  decider: TransferDecider | null,
): Promise<RejectTransferResult> {
  const offer = await loadDecidableByToken(token, {
    email: decider?.email ?? null,
    tenantId: decider?.tenantId ?? null,
  });
  return completeRejection(offer, reason, decider);
}

/** Decline from inside the console, where signing in has already proved identity. */
export async function rejectTransferById(
  transferId: string,
  reason: string,
  decider: TransferDecider,
): Promise<RejectTransferResult> {
  return completeRejection(await loadDecidableById(transferId, decider), reason, decider);
}

async function completeRejection(
  offer: DecidableOffer,
  reason: string,
  decider: TransferDecider | null,
): Promise<RejectTransferResult> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw badRequest('Say why you are declining. The sender sees this, and so does the record.');
  }
  const decidedAt = new Date();

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(passportTransfers)
      .set({
        status: 'rejected',
        rejectionReason: trimmed,
        completedBy: decider?.userId ?? null,
        completedAt: decidedAt,
        acceptTokenHash: null,
        updatedAt: decidedAt,
      })
      .where(
        and(eq(passportTransfers.id, offer.transferId), eq(passportTransfers.status, 'initiated')),
      )
      .returning({ id: passportTransfers.id });

    if (updated.length === 0) throw conflict('This transfer has already been decided.');

    await recordAudit({
      tenantId: offer.fromTenantId,
      actorId: decider?.userId ?? null,
      actorLabel: decider?.name ?? offer.toEmail ?? 'Recipient',
      action: TRANSFER_AUDIT_ACTION,
      subjectType: 'passport_transfer',
      subjectId: offer.transferId,
      metadata: {
        stage: 'transfer.rejected',
        dppId: offer.dppId,
        reason: offer.reason,
        rejectionReason: trimmed,
      },
    });
  });

  await tellTheSender(offer, {
    subject: `Transfer of ${offer.productName ?? 'an item'} was declined`,
    line: `The transfer of ${offer.productName ?? 'the item'} (${formatDppId(offer.dppId)}) was declined. Reason given: ${trimmed}`,
    severity: 'warning',
  });

  return { transferId: offer.transferId, dppId: offer.dppId };
}

export interface CancelTransferResult {
  transferId: string;
  dppId: string;
}

export async function cancelTransfer(
  actor: TransferInitiator,
  transferId: string,
): Promise<CancelTransferResult> {
  if (!actor.tenantId) throw forbidden('Your account is not attached to a workspace.');

  const [row] = await db
    .select({ transfer: passportTransfers, dppId: passports.dppId })
    .from(passportTransfers)
    .innerJoin(passports, eq(passports.id, passportTransfers.passportId))
    .where(
      and(
        eq(passportTransfers.id, transferId),
        eq(passportTransfers.fromTenantId, actor.tenantId),
      ),
    )
    .limit(1);

  if (!row) throw notFound('That transfer does not exist in this workspace.');

  const verdict = canCancel(
    {
      status: row.transfer.status as TransferStatus,
      fromTenantId: row.transfer.fromTenantId,
      toTenantId: row.transfer.toTenantId,
      toEmail: row.transfer.toEmail,
      expiresAt: row.transfer.expiresAt,
    },
    actor,
  );
  if (!verdict.ok) throw conflict(verdict.reason ?? 'This transfer cannot be withdrawn.');

  const now = new Date();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(passportTransfers)
      .set({
        status: 'cancelled',
        completedBy: actor.userId,
        completedAt: now,
        // Killing the hash kills the link. A withdrawn offer that still opens
        // is not withdrawn.
        acceptTokenHash: null,
        updatedAt: now,
      })
      .where(
        and(eq(passportTransfers.id, transferId), eq(passportTransfers.status, 'initiated')),
      )
      .returning({ id: passportTransfers.id });

    if (updated.length === 0) throw conflict('This transfer has already been decided.');

    await recordAudit({
      tenantId: actor.tenantId!,
      actorId: actor.userId,
      actorLabel: actor.name,
      action: TRANSFER_AUDIT_ACTION,
      subjectType: 'passport_transfer',
      subjectId: transferId,
      metadata: { stage: 'transfer.cancelled', dppId: row.dppId, reason: row.transfer.reason },
    });
  });

  return { transferId, dppId: row.dppId };
}

interface DecidableOffer {
  transferId: string;
  passportId: string;
  dppId: string;
  productName: string | null;
  reason: TransferReason;
  fromTenantId: string;
  fromName: string;
  toEmail: string | null;
  initiatedBy: string;
  metadata: Record<string, unknown>;
}

function decidableQuery() {
  return db
    .select({
      transfer: passportTransfers,
      passportId: passports.id,
      dppId: passports.dppId,
      productName: products.name,
      fromLegalName: tenants.legalName,
      fromTradeName: tenants.tradeName,
    })
    .from(passportTransfers)
    .innerJoin(passports, eq(passports.id, passportTransfers.passportId))
    .innerJoin(tenants, eq(tenants.id, passportTransfers.fromTenantId))
    .leftJoin(products, eq(products.id, passports.productId));
}

async function loadDecidableByToken(
  token: string,
  actor: { tenantId: string | null; email: string | null },
): Promise<DecidableOffer> {
  const hash = hashAcceptToken(token);
  const [row] = await decidableQuery()
    .where(eq(passportTransfers.acceptTokenHash, hash))
    .limit(1);

  if (!row?.transfer.acceptTokenHash || !timingSafeEqual(row.transfer.acceptTokenHash, hash)) {
    throw notFound('We do not recognise this link.');
  }
  return check(row, actor);
}

/**
 * Load an offer addressed to the signed-in workspace.
 *
 * Scoped to `to_tenant_id` in the query rather than checked afterwards, so a
 * transfer belonging to somebody else reads as missing rather than forbidden
 * and the id space cannot be walked to learn who is transferring what.
 */
async function loadDecidableById(
  transferId: string,
  actor: { tenantId: string | null; email: string },
): Promise<DecidableOffer> {
  if (!actor.tenantId) throw forbidden('Your account is not attached to a workspace.');
  const [row] = await decidableQuery()
    .where(
      and(
        eq(passportTransfers.id, transferId),
        eq(passportTransfers.toTenantId, actor.tenantId),
      ),
    )
    .limit(1);

  if (!row) throw notFound('That transfer was not offered to this workspace.');
  return check(row, actor);
}

function check(
  row: Awaited<ReturnType<ReturnType<typeof decidableQuery>['execute']>>[number],
  actor: { tenantId: string | null; email: string | null },
): DecidableOffer {
  const { transfer } = row;
  const verdict = canDecide(
    {
      status: transfer.status as TransferStatus,
      fromTenantId: transfer.fromTenantId,
      toTenantId: transfer.toTenantId,
      toEmail: transfer.toEmail,
      expiresAt: transfer.expiresAt,
    },
    actor,
  );
  if (!verdict.ok) throw conflict(verdict.reason ?? 'This transfer cannot be decided.');

  return {
    transferId: transfer.id,
    passportId: row.passportId,
    dppId: row.dppId,
    productName: row.productName,
    reason: transfer.reason as TransferReason,
    fromTenantId: transfer.fromTenantId,
    fromName: row.fromTradeName ?? row.fromLegalName,
    toEmail: transfer.toEmail,
    initiatedBy: transfer.initiatedBy,
    metadata: transfer.metadata ?? {},
  };
}

async function tellTheSender(
  offer: DecidableOffer,
  message: { subject: string; line: string; severity: 'success' | 'warning' },
): Promise<void> {
  const [sender] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.id, offer.initiatedBy), isNull(users.deletedAt)))
    .limit(1);
  if (!sender) return;

  await notifyUser(sender.id, {
    tenantId: offer.fromTenantId,
    kind: 'transfer.decided',
    title: message.subject,
    body: message.line,
    href: `/console/transfers/${offer.transferId}`,
    severity: message.severity,
  });

  await sendEmail({ to: sender.email, subject: message.subject, text: message.line });
}

/**
 * Mark offers whose links have run out.
 *
 * Called when the console lists transfers rather than from a scheduler, because
 * a status that is only correct once a cron job has run is a status the person
 * reading the list cannot trust.
 */
export async function expireStaleTransfers(tenantId: string): Promise<number> {
  const now = new Date();
  const expired = await db
    .update(passportTransfers)
    .set({ status: 'expired', acceptTokenHash: null, updatedAt: now })
    .where(
      and(
        eq(passportTransfers.fromTenantId, tenantId),
        eq(passportTransfers.status, 'initiated'),
        lte(passportTransfers.expiresAt, now),
      ),
    )
    .returning({ id: passportTransfers.id, passportId: passportTransfers.passportId });

  for (const row of expired) {
    await recordAuditSafe({
      tenantId,
      actorId: null,
      actorLabel: 'System',
      action: TRANSFER_AUDIT_ACTION,
      subjectType: 'passport_transfer',
      subjectId: row.id,
      metadata: { stage: 'transfer.expired' },
    });
  }
  return expired.length;
}
