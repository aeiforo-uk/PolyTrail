'use server';

import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import { getSession, type Session } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/errors';
import {
  beginEnrolment,
  confirmEnrolment,
  confirmStepUp,
  disableMfa,
  regenerateRecoveryCodes,
} from '@/lib/mfa/service';
import { StepUpRequiredError } from '@/lib/mfa/step-up';
import { storeDocument } from '@/lib/documents/storage';
import {
  confirmEmailToken,
  recordDocumentReview,
  revokeVerification,
  startDomainVerification,
  startEmailConfirmation,
  submitVerificationDocuments,
  verifyDomain,
  type DocumentMetadata,
} from '@/lib/verification/service';

/**
 * Server actions for the security page.
 *
 * Nothing here returns a secret except the two things that have to be shown
 * exactly once — the TOTP secret during enrolment and the recovery codes after
 * it. Both are held in React state on the client and never written anywhere
 * else, which is why they come back as return values rather than being
 * revalidated onto the page.
 */

const PAGE = '/console/security';

export interface SecurityState {
  error?: string;
  message?: string;
  /** Set when the action needs an authenticator code before it can proceed. */
  stepUpRequired?: boolean;
}

// ── Verification ladder ────────────────────────────────────────────────────

export async function sendEmailChallengeAction(
  _previous: SecurityState,
  _formData: FormData,
): Promise<SecurityState> {
  try {
    const session = await requireSession();
    const result = await startEmailConfirmation(session);
    revalidatePath(PAGE);
    return {
      message:
        `A code is on its way to ${result.sentTo}. It works once and stops working in 24 hours.` +
        (result.previewPath ? ` (Written to ${result.previewPath} in development.)` : ''),
    };
  } catch (error) {
    return toState(error);
  }
}

export async function confirmEmailAction(
  _previous: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  try {
    const session = await requireSession();
    await confirmEmailToken(session, String(formData.get('token') ?? ''));
    revalidatePath(PAGE);
    return { message: 'Contact address confirmed.' };
  } catch (error) {
    return toState(error);
  }
}

export interface DomainChallengeState extends SecurityState {
  challenge?: { verificationId: string; domain: string; recordName: string; recordValue: string };
  found?: string[];
}

export async function startDomainAction(
  _previous: DomainChallengeState,
  formData: FormData,
): Promise<DomainChallengeState> {
  try {
    const session = await requireSession();
    const challenge = await startDomainVerification(session, String(formData.get('domain') ?? ''));
    revalidatePath(PAGE);
    return {
      challenge: {
        verificationId: challenge.verificationId,
        domain: challenge.domain,
        recordName: challenge.recordName,
        recordValue: challenge.recordValue,
      },
      message: 'Publish the TXT record below, then check it. DNS can take up to an hour.',
    };
  } catch (error) {
    return toState(error);
  }
}

export async function verifyDomainAction(
  _previous: DomainChallengeState,
  formData: FormData,
): Promise<DomainChallengeState> {
  try {
    const session = await requireSession();
    const outcome = await verifyDomain(session, String(formData.get('verificationId') ?? ''));
    revalidatePath(PAGE);
    return outcome.verified
      ? { message: outcome.detail }
      : { error: outcome.detail, found: outcome.found };
  } catch (error) {
    return toState(error);
  }
}

export async function submitDocumentsAction(
  _previous: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  try {
    const session = await requireSession();
    if (!session.tenantId) return { error: 'Your account is not attached to a workspace.' };

    // The bytes, not a description of them. The file is stored content-hashed
    // in the documents table; what this rung records is the metadata that
    // proves which bytes the reviewer decided on.
    const kind = String(formData.get('documentKind') ?? '').trim();
    const reference = String(formData.get('documentReference') ?? '').trim();
    const file = formData.get('documentFile');

    if (!kind) return { error: 'Say what the document is.' };
    if (!(file instanceof File) || file.size === 0) {
      return { error: 'Attach the document itself — a PDF, image, CSV or text file.' };
    }

    const stored = await storeDocument({
      tenantId: session.tenantId,
      file,
      kind,
      visibility: 'authority',
      uploadedBy: session.userId,
    });

    const documents: DocumentMetadata[] = [
      {
        kind,
        fileName: stored.filename,
        sizeBytes: stored.sizeBytes,
        contentHash: stored.contentHash,
        documentId: stored.id,
        reference: reference || undefined,
      },
    ];

    await submitVerificationDocuments(session, documents, String(formData.get('notes') ?? ''));
    revalidatePath(PAGE);
    return { message: 'Submitted for review. A brand admin or compliance officer will decide.' };
  } catch (error) {
    return toState(error);
  }
}

export async function reviewDocumentsAction(
  _previous: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  try {
    const session = await requireSession();
    const decision = String(formData.get('decision') ?? '') === 'approve' ? 'approve' : 'reject';
    await recordDocumentReview(
      session,
      String(formData.get('verificationId') ?? ''),
      decision,
      String(formData.get('notes') ?? ''),
    );
    revalidatePath(PAGE);
    return { message: decision === 'approve' ? 'Approved.' : 'Rejected, with your reason recorded.' };
  } catch (error) {
    return toState(error);
  }
}

export async function revokeVerificationAction(
  _previous: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  try {
    const session = await requireSession();
    await revokeVerification(
      session,
      String(formData.get('verificationId') ?? ''),
      String(formData.get('reason') ?? 'Withdrawn by a brand admin.'),
    );
    revalidatePath(PAGE);
    return { message: 'Withdrawn. The workspace drops back to the level below.' };
  } catch (error) {
    return toState(error);
  }
}

// ── Two-factor authentication ──────────────────────────────────────────────

export interface EnrolmentState extends SecurityState {
  /** Shown once, held in client state, never persisted anywhere. */
  secret?: string;
  otpauthUri?: string;
  qrSvg?: string;
  recoveryCodes?: string[];
}

export async function beginMfaAction(
  _previous: EnrolmentState,
  _formData: FormData,
): Promise<EnrolmentState> {
  try {
    const session = await requireSession();
    const enrolment = await beginEnrolment(session);

    // Rendered on the server so the secret never has to be handed to a
    // client-side QR library, and so the page works without its own JS bundle
    // doing anything with the secret beyond displaying it.
    const qrSvg = await QRCode.toString(enrolment.otpauthUri, {
      type: 'svg',
      margin: 0,
      width: 180,
      errorCorrectionLevel: 'M',
    });

    return { secret: enrolment.secret, otpauthUri: enrolment.otpauthUri, qrSvg };
  } catch (error) {
    return toState(error);
  }
}

export async function confirmMfaAction(
  _previous: EnrolmentState,
  formData: FormData,
): Promise<EnrolmentState> {
  try {
    const session = await requireSession();
    const result = await confirmEnrolment(session, String(formData.get('code') ?? ''));
    revalidatePath(PAGE);
    return {
      recoveryCodes: result.recoveryCodes,
      message: 'Two-factor authentication is on. Save the recovery codes now — they are shown once.',
    };
  } catch (error) {
    return toState(error);
  }
}

export async function regenerateRecoveryAction(
  _previous: EnrolmentState,
  _formData: FormData,
): Promise<EnrolmentState> {
  try {
    const session = await requireSession();
    const codes = await regenerateRecoveryCodes(session);
    revalidatePath(PAGE);
    return { recoveryCodes: codes, message: 'New codes issued. The old ones no longer work.' };
  } catch (error) {
    return toState(error);
  }
}

export async function disableMfaAction(
  _previous: SecurityState,
  _formData: FormData,
): Promise<SecurityState> {
  try {
    const session = await requireSession();
    await disableMfa(session);
    revalidatePath(PAGE);
    return { message: 'Two-factor authentication is off.' };
  } catch (error) {
    return toState(error);
  }
}

export async function confirmStepUpAction(
  _previous: SecurityState,
  formData: FormData,
): Promise<SecurityState> {
  try {
    const session = await requireSession();
    await confirmStepUp(session, String(formData.get('code') ?? ''));
    revalidatePath(PAGE);
    return { message: 'Confirmed. You have ten minutes before you will be asked again.' };
  } catch (error) {
    return toState(error);
  }
}

async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'Unauthorized', { detail: 'Sign in to continue.' });
  return session;
}

function toState(error: unknown): SecurityState {
  if (error instanceof StepUpRequiredError) {
    return { error: error.message, stepUpRequired: true };
  }
  if (error instanceof ApiError) return { error: error.message };
  console.error('[console/security] action failed', error);
  return { error: 'Something went wrong. Try again, and tell us if it keeps happening.' };
}
