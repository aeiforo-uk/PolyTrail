'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import {
  dataRequestPassports,
  dataRequests,
  partners,
  passports,
} from '@/lib/db/schema';
import { getSession, type Session } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/roles';
import { savePassportPayload } from '@/lib/passport/service';
import { ApiError } from '@/lib/api/errors';
import { recordSupplyAudit } from '@/lib/partners/audit';
import { anchorsFor } from './anchors';
import { fieldFor } from './fields';
import { issueAccessToken } from './tokens';
import { currentPayload } from './queries';
import { describeMerge, mergeSubmission, type MergeConflict } from './merge';
import { readSubmission, type RequestSubmission, type SubmissionReview } from './submission';

/**
 * Console-side mutations for data requests.
 *
 * The interesting one is `reviewRequest`. Approval is not "write the answers
 * into the passport" — it is "write the answers the reviewer accepted, into
 * the fields where the passport had nothing to say, and stop if the supplier
 * contradicts something already recorded". The merge decides that; this file
 * only persists what it decided and writes the audit entry.
 */

const AUTHORS: readonly Role[] = ['BRAND_ADMIN', 'PRODUCT_MANAGER'];
const REVIEWERS: readonly Role[] = ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER'];

export interface RequestFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Conflicts the reviewer has to settle before approval can proceed. */
  conflicts?: Array<{ path: string; field: string; existing: string; incoming: string }>;
}

async function requireRole(allowed: readonly Role[]): Promise<{
  session: Session;
  tenantId: string;
}> {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!allowed.includes(session.role)) {
    throw new Error(`This action requires one of: ${allowed.join(', ')}.`);
  }
  return { session, tenantId: session.tenantId };
}

// ───────────────────────────────────────────────────────────────────────────
// Create and send
// ───────────────────────────────────────────────────────────────────────────

export async function createRequest(
  _prev: RequestFormState,
  form: FormData,
): Promise<RequestFormState> {
  const { session, tenantId } = await requireRole(AUTHORS);

  const title = String(form.get('title') ?? '').trim();
  const message = String(form.get('message') ?? '').trim();
  const partnerId = String(form.get('partnerId') ?? '').trim();
  const dueRaw = String(form.get('dueAt') ?? '').trim();
  const send = String(form.get('intent') ?? '') === 'send';

  const passportIds = form.getAll('passportIds').map(String).filter(Boolean);
  const requestedFields = form
    .getAll('fields')
    .map(String)
    .filter((path) => fieldFor(path) !== null);

  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = 'Give the request a title the supplier will understand.';
  if (!partnerId) fieldErrors.partnerId = 'Choose which supplier you are asking.';
  if (requestedFields.length === 0) {
    fieldErrors.fields = 'Pick at least one field. An empty request wastes everybody’s time.';
  }

  const dueAt = dueRaw ? new Date(`${dueRaw}T23:59:59Z`) : null;
  if (dueRaw && Number.isNaN(dueAt?.getTime())) fieldErrors.dueAt = 'That is not a valid date.';

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // Confirm the supplier belongs to this workspace before writing a row that
  // points at it.
  const [partner] = await db
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(
      and(eq(partners.tenantId, tenantId), eq(partners.id, partnerId), isNull(partners.deletedAt)),
    )
    .limit(1);
  if (!partner) return { fieldErrors: { partnerId: 'That supplier is not in this workspace.' } };

  const owned = passportIds.length
    ? await db
        .select({ id: passports.id })
        .from(passports)
        .where(
          and(
            eq(passports.tenantId, tenantId),
            inArray(passports.id, passportIds),
            isNull(passports.deletedAt),
          ),
        )
    : [];

  const issued = send ? issueAccessToken() : null;
  const now = new Date();

  const requestId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dataRequests)
      .values({
        tenantId,
        partnerId: partner.id,
        title,
        message: message || null,
        requestedFields,
        status: send ? 'sent' : 'draft',
        accessTokenHash: issued?.hash ?? null,
        dueAt,
        sentAt: send ? now : null,
        createdBy: session.userId,
      })
      .returning({ id: dataRequests.id });

    if (owned.length > 0) {
      await tx
        .insert(dataRequestPassports)
        .values(owned.map((p) => ({ dataRequestId: row!.id, passportId: p.id })));
    }

    return row!.id;
  });

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'data_request.created',
    subjectType: 'data_request',
    subjectId: requestId,
    metadata: {
      partnerId: partner.id,
      partnerName: partner.name,
      fields: requestedFields.length,
      passports: owned.length,
      sent: send,
    },
  });

  revalidatePath('/console/requests');
  redirect(`/console/requests/${requestId}${issued ? `?link=${issued.token}` : ''}`);
}

/** Issue a link and mark the request sent. Also used to re-issue after expiry. */
export async function sendRequest(requestId: string): Promise<void> {
  const { session, tenantId } = await requireRole(AUTHORS);
  const issued = issueAccessToken();
  const now = new Date();

  const [row] = await db
    .update(dataRequests)
    .set({ status: 'sent', accessTokenHash: issued.hash, sentAt: now, updatedAt: now })
    .where(
      and(
        eq(dataRequests.id, requestId),
        eq(dataRequests.tenantId, tenantId),
        inArray(dataRequests.status, ['draft', 'expired', 'cancelled']),
      ),
    )
    .returning({ id: dataRequests.id, partnerId: dataRequests.partnerId });

  if (!row) throw new Error('That request cannot be sent in its current state.');

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'data_request.sent',
    subjectType: 'data_request',
    subjectId: row.id,
    metadata: { partnerId: row.partnerId },
  });

  revalidatePath('/console/requests');
  redirect(`/console/requests/${requestId}?link=${issued.token}`);
}

/**
 * Nudge a supplier.
 *
 * The existing link is replaced rather than re-sent. A reminder usually means
 * the first email went to the wrong person or was forwarded around a factory
 * office, and the safe assumption is that the old link is in more inboxes than
 * it should be. Replacing it also resets the expiry, which is the behaviour a
 * supplier expects from a chasing email.
 */
export async function remindRequest(requestId: string): Promise<void> {
  const { session, tenantId } = await requireRole(AUTHORS);
  const issued = issueAccessToken();
  const now = new Date();

  const [row] = await db
    .update(dataRequests)
    .set({ accessTokenHash: issued.hash, sentAt: now, updatedAt: now })
    .where(
      and(
        eq(dataRequests.id, requestId),
        eq(dataRequests.tenantId, tenantId),
        inArray(dataRequests.status, ['sent', 'in_progress', 'rejected']),
      ),
    )
    .returning({ id: dataRequests.id, partnerId: dataRequests.partnerId });

  if (!row) throw new Error('There is nothing to remind anybody about on this request.');

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'data_request.reminded',
    subjectType: 'data_request',
    subjectId: row.id,
    metadata: { partnerId: row.partnerId, remindedAt: now.toISOString() },
  });

  revalidatePath(`/console/requests/${requestId}`);
  redirect(`/console/requests/${requestId}?link=${issued.token}&reminder=1`);
}

export async function cancelRequest(requestId: string): Promise<void> {
  const { session, tenantId } = await requireRole(AUTHORS);

  const [row] = await db
    .update(dataRequests)
    // Clearing the hash is what actually kills the link; the status is only
    // how the console describes it.
    .set({ status: 'cancelled', accessTokenHash: null, updatedAt: new Date() })
    .where(and(eq(dataRequests.id, requestId), eq(dataRequests.tenantId, tenantId)))
    .returning({ id: dataRequests.id });

  if (!row) return;

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'data_request.cancelled',
    subjectType: 'data_request',
    subjectId: row.id,
  });

  revalidatePath('/console/requests');
  revalidatePath(`/console/requests/${requestId}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Review
// ───────────────────────────────────────────────────────────────────────────

export async function rejectRequest(
  requestId: string,
  _prev: RequestFormState,
  form: FormData,
): Promise<RequestFormState> {
  const { session, tenantId } = await requireRole(REVIEWERS);
  const reason = String(form.get('reviewNotes') ?? '').trim();

  if (!reason) {
    return {
      fieldErrors: {
        reviewNotes:
          'Say what is wrong. The supplier sees this, and a reason they cannot act on guarantees a second wrong answer.',
      },
    };
  }

  const now = new Date();
  const [row] = await db
    .update(dataRequests)
    .set({
      status: 'rejected',
      reviewNotes: reason,
      reviewedAt: now,
      reviewedBy: session.userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(dataRequests.id, requestId),
        eq(dataRequests.tenantId, tenantId),
        inArray(dataRequests.status, ['submitted', 'under_review']),
      ),
    )
    .returning({ id: dataRequests.id, partnerId: dataRequests.partnerId });

  if (!row) return { error: 'That request is not waiting for a decision.' };

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'data_request.rejected',
    subjectType: 'data_request',
    subjectId: row.id,
    metadata: { partnerId: row.partnerId, reason },
  });

  revalidatePath('/console/requests');
  revalidatePath(`/console/requests/${requestId}`);
  return {};
}

/**
 * Approve, and merge into every passport the request covers.
 *
 * Field-level decisions arrive as `decision:<path>` = accept | reject, and
 * `overwrite:<path>` marks a conflict the reviewer has settled in the
 * supplier's favour. An unresolved conflict stops the whole approval — not
 * just that field — because a half-applied submission is the hardest thing to
 * reason about afterwards.
 */
export async function approveRequest(
  requestId: string,
  _prev: RequestFormState,
  form: FormData,
): Promise<RequestFormState> {
  const { session, tenantId } = await requireRole(REVIEWERS);

  const [row] = await db
    .select({ request: dataRequests, partner: partners })
    .from(dataRequests)
    .leftJoin(partners, eq(partners.id, dataRequests.partnerId))
    .where(and(eq(dataRequests.id, requestId), eq(dataRequests.tenantId, tenantId)))
    .limit(1);

  if (!row) return { error: 'That request does not exist.' };
  if (!['submitted', 'under_review'].includes(row.request.status)) {
    return { error: 'That request is not waiting for a decision.' };
  }

  const submission = readSubmission(row.request.submission);
  const decisions: Record<string, 'accepted' | 'rejected'> = {};
  const accept: string[] = [];
  const overwrite: string[] = [];

  for (const path of row.request.requestedFields) {
    const verdict = String(form.get(`decision:${path}`) ?? 'accept');
    decisions[path] = verdict === 'reject' ? 'rejected' : 'accepted';
    if (form.get(`overwrite:${path}`) !== null) overwrite.push(path);

    // A document answer is a file name the supplier typed, not a document id.
    // Merging it would put a string into a field that is meant to point at a
    // stored file, so it stays out of the passport and is reported as skipped
    // until the portal can actually accept uploads.
    if (verdict !== 'reject' && fieldFor(path)?.kind !== 'document') accept.push(path);
  }

  const anchors = anchorsFor(
    row.partner?.id
      ? {
          id: row.partner.id,
          name: row.partner.name,
          tier: row.partner.tier,
          country: row.partner.country,
          roles: row.partner.roles,
          gln: row.partner.gln,
          osId: row.partner.osId,
        }
      : null,
  );

  const linked = await db
    .select({ passportId: dataRequestPassports.passportId, dppId: passports.dppId })
    .from(dataRequestPassports)
    .innerJoin(passports, eq(passports.id, dataRequestPassports.passportId))
    .where(
      and(
        eq(dataRequestPassports.dataRequestId, requestId),
        eq(passports.tenantId, tenantId),
        isNull(passports.deletedAt),
      ),
    );

  if (linked.length === 0) {
    return { error: 'Attach at least one passport before approving, or the answers go nowhere.' };
  }

  const merges: RequestSubmission['merges'] = [];
  const blocking: MergeConflict[] = [];
  const summaries: string[] = [];

  for (const target of linked) {
    const existing = await currentPayload(tenantId, target.passportId);
    const payload = existing?.payload ?? {};
    const result = mergeSubmission(payload, submission.values, { accept, overwrite, anchors });

    const unresolved = result.conflicts.filter((conflict) => !conflict.resolved);
    if (unresolved.length > 0) {
      blocking.push(...unresolved);
      continue;
    }

    if (result.changes.length === 0) {
      summaries.push(`${target.dppId}: nothing to change`);
      continue;
    }

    try {
      const saved = await savePassportPayload(session, {
        dppId: target.dppId,
        payload: result.merged,
        changeReason: `Supplier data accepted — ${row.request.title}`,
      });
      merges.push({
        at: new Date().toISOString(),
        passportId: target.passportId,
        dppId: target.dppId,
        version: saved.version,
        changes: result.changes,
        conflicts: result.conflicts,
      });
      summaries.push(`${target.dppId}: ${describeMerge(result)}`);
    } catch (error) {
      const detail =
        error instanceof ApiError ? error.message : 'The passport would not accept these values.';
      return { error: `${target.dppId} — ${detail}` };
    }
  }

  if (blocking.length > 0) {
    return {
      error:
        'The supplier disagrees with values already on the passport. Choose which to keep, then approve.',
      conflicts: blocking.map((conflict) => ({
        path: conflict.path,
        field: conflict.field,
        existing: String(conflict.existing),
        incoming: String(conflict.incoming),
      })),
    };
  }

  const review: SubmissionReview = {
    decisions,
    overwrite,
    ...(String(form.get('reviewNotes') ?? '').trim()
      ? { notes: String(form.get('reviewNotes')).trim() }
      : {}),
    decidedAt: new Date().toISOString(),
    decidedBy: session.userId,
  };

  const now = new Date();
  await db
    .update(dataRequests)
    .set({
      status: 'approved',
      submission: { ...submission, review, merges: [...(submission.merges ?? []), ...merges] },
      reviewedAt: now,
      reviewedBy: session.userId,
      reviewNotes: review.notes ?? null,
      // The link is spent. Leaving it live would let the supplier keep editing
      // answers that are already inside a versioned passport.
      accessTokenHash: null,
      updatedAt: now,
    })
    .where(and(eq(dataRequests.id, requestId), eq(dataRequests.tenantId, tenantId)));

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'data_request.approved',
    subjectType: 'data_request',
    subjectId: requestId,
    metadata: {
      partnerId: row.request.partnerId,
      accepted: accept.length,
      rejected: Object.values(decisions).filter((d) => d === 'rejected').length,
      merges: merges.map((m) => ({ dppId: m.dppId, version: m.version, changes: m.changes.length })),
      summary: summaries.join('; '),
    },
  });

  revalidatePath('/console/requests');
  revalidatePath(`/console/requests/${requestId}`);
  return {};
}


/**
 * One entry point for the review form.
 *
 * Approve and reject share a notes field and a set of per-field decisions, so
 * they share a form; the submit button carries the verdict. Two forms would
 * mean two copies of the reviewer's notes and a way to lose whichever one they
 * typed into first.
 */
export async function reviewRequest(
  requestId: string,
  prev: RequestFormState,
  form: FormData,
): Promise<RequestFormState> {
  return String(form.get('verdict') ?? '') === 'reject'
    ? rejectRequest(requestId, prev, form)
    : approveRequest(requestId, prev, form);
}
