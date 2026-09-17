import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  dataRequestPassports,
  dataRequests,
  partners,
  passports,
  products,
  tenants,
} from '@/lib/db/schema';
import { timingSafeEqual } from '@/lib/crypto/canonical';
import { recordSupplyAudit, recordSupplyAuditSafe } from '@/lib/partners/audit';
import { checkAnswer, fieldFor, type RequestableField } from './fields';
import { hashAccessToken, isTokenExpired, tokenExpiresAt } from './tokens';
import { readSubmission, type RequestSubmission, type SubmissionDocument } from './submission';

/**
 * The supplier side of a data request: everything the portal at `/s/[token]`
 * is allowed to see and do.
 *
 * This module is the trust boundary. The caller has no session, no account and
 * no tenant — it has a string from a URL. So every read here is scoped by the
 * request the token resolves to, and nothing in the returned shape comes from
 * outside that request. In particular the supplier never learns the tenant id,
 * the passport payloads, the other suppliers on the same product, or any other
 * request addressed to them.
 */

export type PortalFailure = 'unknown' | 'expired' | 'closed';

export interface PortalQuestion {
  field: RequestableField;
  value: unknown;
}

export interface PortalView {
  requestId: string;
  brandName: string;
  partnerName: string;
  contactName: string | null;
  title: string;
  message: string | null;
  status: string;
  dueAt: Date | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  /** Product names only. Enough context to answer accurately, nothing more. */
  products: string[];
  questions: PortalQuestion[];
  documents: SubmissionDocument[];
  savedAt: string | null;
  respondent: RequestSubmission['respondent'];
  /** Set when the brand sent it back with a written reason. */
  rejectionReason: string | null;
}

export type PortalResult = { ok: true; view: PortalView } | { ok: false; reason: PortalFailure };

/** Statuses where the supplier can still type. */
const OPEN_STATUSES = ['sent', 'in_progress', 'rejected'];

interface LoadedRequest {
  request: typeof dataRequests.$inferSelect;
  brandName: string;
  partnerName: string | null;
  contactName: string | null;
}

async function loadByToken(token: string): Promise<LoadedRequest | null> {
  // A token that is not even the right shape never reaches the database.
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;

  const hash = hashAccessToken(token);

  const [row] = await db
    .select({
      request: dataRequests,
      brandName: tenants.legalName,
      partnerName: partners.name,
      contactName: partners.contactName,
    })
    .from(dataRequests)
    .innerJoin(tenants, eq(tenants.id, dataRequests.tenantId))
    .leftJoin(partners, eq(partners.id, dataRequests.partnerId))
    .where(eq(dataRequests.accessTokenHash, hash))
    .limit(1);

  if (!row?.request.accessTokenHash) return null;

  // The lookup above already matched on the hash, so this comparison cannot
  // fail in practice. It is here so that the equality check a reader goes
  // looking for is the constant-time one, and so that swapping the lookup for
  // anything cleverer later does not quietly introduce a timing oracle.
  if (!timingSafeEqual(row.request.accessTokenHash.trim(), hash)) return null;

  return {
    request: row.request,
    brandName: row.brandName,
    partnerName: row.partnerName,
    contactName: row.contactName,
  };
}

export async function resolvePortal(token: string): Promise<PortalResult> {
  const loaded = await loadByToken(token);
  if (!loaded) return { ok: false, reason: 'unknown' };

  const { request } = loaded;
  if (['cancelled', 'expired'].includes(request.status)) return { ok: false, reason: 'closed' };
  if (isTokenExpired(request)) return { ok: false, reason: 'expired' };
  if (request.status === 'draft') return { ok: false, reason: 'unknown' };

  const submission = readSubmission(request.submission);

  const linked = await db
    .select({ name: products.name })
    .from(dataRequestPassports)
    .innerJoin(passports, eq(passports.id, dataRequestPassports.passportId))
    .leftJoin(products, eq(products.id, passports.productId))
    .where(
      and(
        eq(dataRequestPassports.dataRequestId, request.id),
        eq(passports.tenantId, request.tenantId),
        isNull(passports.deletedAt),
      ),
    );

  const questions: PortalQuestion[] = [];
  for (const path of request.requestedFields) {
    const field = fieldFor(path);
    if (field) questions.push({ field, value: submission.values[path] ?? null });
  }

  return {
    ok: true,
    view: {
      requestId: request.id,
      brandName: loaded.brandName,
      partnerName: loaded.partnerName ?? 'your facility',
      contactName: loaded.contactName,
      title: request.title,
      message: request.message,
      status: request.status,
      dueAt: request.dueAt,
      expiresAt: tokenExpiresAt(request),
      submittedAt: request.submittedAt,
      products: linked.map((row) => row.name ?? 'a product'),
      questions,
      documents: submission.documents ?? [],
      savedAt: submission.savedAt ?? null,
      respondent: submission.respondent,
      rejectionReason: request.status === 'rejected' ? request.reviewNotes : null,
    },
  };
}

export interface PortalSaveResult {
  ok: boolean;
  /** Keyed by registry path. */
  fieldErrors?: Record<string, string>;
  reason?: PortalFailure | 'closed';
  savedAt?: string;
}

interface AnswerPayload {
  values: Record<string, unknown>;
  documents: SubmissionDocument[];
  respondent: { name?: string; email?: string; role?: string };
  errors: Record<string, string>;
}

/**
 * Read answers off a posted form.
 *
 * Fields are named `f:<registry path>` so a path containing dots survives the
 * round trip, and so an attacker cannot smuggle an arbitrary key in: anything
 * not in `requestedFields` is dropped, not merely ignored.
 */
function readAnswers(form: FormData, requestedFields: readonly string[]): AnswerPayload {
  const values: Record<string, unknown> = {};
  const documents: SubmissionDocument[] = [];
  const errors: Record<string, string> = {};

  for (const path of requestedFields) {
    const field = fieldFor(path);
    if (!field) continue;

    const raw = form.getAll(`f:${path}`).map(String);
    // An unchecked checkbox posts nothing at all, which is indistinguishable
    // from "not answered" unless the form also posts a hidden marker.
    if (field.kind === 'boolean' && form.get(`present:${path}`) !== null) {
      values[path] = raw.length > 0 && raw[0] !== '';
      continue;
    }
    if (raw.length === 0) continue;

    const check = checkAnswer(field, raw.length === 1 ? raw[0]! : raw);
    if (!check.ok) {
      errors[path] = check.message ?? 'That value is not valid.';
      // Keep what they typed so the form comes back filled in rather than blank.
      values[path] = raw.length === 1 ? raw[0]! : raw;
      continue;
    }
    if (check.value !== null) values[path] = check.value;

    if (field.kind === 'document' && check.value) {
      documents.push({ field: path, filename: String(check.value) });
    }
  }

  return {
    values,
    documents,
    respondent: {
      ...(form.get('respondentName') ? { name: String(form.get('respondentName')) } : {}),
      ...(form.get('respondentEmail') ? { email: String(form.get('respondentEmail')) } : {}),
      ...(form.get('respondentRole') ? { role: String(form.get('respondentRole')) } : {}),
    },
    errors,
  };
}

/**
 * Autosave.
 *
 * Invalid answers are kept rather than rejected: a half-typed GLN is exactly
 * what a draft is for, and losing it because it does not validate yet is the
 * fastest way to make a supplier give up.
 */
export async function saveDraft(token: string, form: FormData): Promise<PortalSaveResult> {
  const loaded = await loadByToken(token);
  if (!loaded) return { ok: false, reason: 'unknown' };
  if (isTokenExpired(loaded.request)) return { ok: false, reason: 'expired' };
  if (!OPEN_STATUSES.includes(loaded.request.status)) return { ok: false, reason: 'closed' };

  const answers = readAnswers(form, loaded.request.requestedFields);
  const existing = readSubmission(loaded.request.submission);
  const savedAt = new Date().toISOString();

  const submission: RequestSubmission = {
    ...existing,
    values: { ...existing.values, ...(answers.values as RequestSubmission['values']) },
    documents: answers.documents.length ? answers.documents : existing.documents,
    respondent: { ...existing.respondent, ...answers.respondent },
    savedAt,
  };

  await db
    .update(dataRequests)
    .set({
      submission,
      // First save is the moment the supplier engaged; the brand wants to see
      // that even if the answers never arrive.
      status: loaded.request.status === 'sent' ? 'in_progress' : loaded.request.status,
      updatedAt: new Date(),
    })
    .where(eq(dataRequests.id, loaded.request.id));

  if (loaded.request.status === 'sent') {
    await recordSupplyAuditSafe({
      tenantId: loaded.request.tenantId,
      actorId: null,
      actorLabel: loaded.partnerName ?? 'Supplier',
      action: 'data_request.opened',
      subjectType: 'data_request',
      subjectId: loaded.request.id,
      metadata: { partnerId: loaded.request.partnerId },
    });
  }

  return { ok: true, savedAt, ...(Object.keys(answers.errors).length ? { fieldErrors: answers.errors } : {}) };
}

export interface PortalSubmitResult extends PortalSaveResult {
  submitted?: boolean;
}

export async function submitAnswers(
  token: string,
  form: FormData,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<PortalSubmitResult> {
  const loaded = await loadByToken(token);
  if (!loaded) return { ok: false, reason: 'unknown' };
  if (isTokenExpired(loaded.request)) return { ok: false, reason: 'expired' };
  if (!OPEN_STATUSES.includes(loaded.request.status)) return { ok: false, reason: 'closed' };

  const answers = readAnswers(form, loaded.request.requestedFields);
  if (Object.keys(answers.errors).length > 0) {
    // Save what is valid first, so a validation bounce never costs typing.
    await saveDraft(token, form);
    return { ok: false, fieldErrors: answers.errors };
  }

  const existing = readSubmission(loaded.request.submission);
  const now = new Date();

  const submission: RequestSubmission = {
    ...existing,
    values: { ...existing.values, ...(answers.values as RequestSubmission['values']) },
    documents: answers.documents.length ? answers.documents : existing.documents,
    respondent: { ...existing.respondent, ...answers.respondent },
    savedAt: now.toISOString(),
    submittedAt: now.toISOString(),
  };

  await db
    .update(dataRequests)
    .set({ submission, status: 'submitted', submittedAt: now, updatedAt: now })
    .where(eq(dataRequests.id, loaded.request.id));

  // This one throws on failure. A supplier submission the brand cannot prove
  // it received is worth failing the request over.
  await recordSupplyAudit({
    tenantId: loaded.request.tenantId,
    actorId: null,
    actorLabel: loaded.partnerName ?? 'Supplier',
    action: 'data_request.submitted',
    subjectType: 'data_request',
    subjectId: loaded.request.id,
    metadata: {
      partnerId: loaded.request.partnerId,
      answered: Object.keys(submission.values).length,
      requested: loaded.request.requestedFields.length,
      respondent: submission.respondent?.email ?? null,
    },
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  return { ok: true, submitted: true, savedAt: submission.savedAt };
}
