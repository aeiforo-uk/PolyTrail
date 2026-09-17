'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/errors';
import { transitionPassport } from '@/lib/passport/service';
import type { PassportStatus } from '@/lib/passport/state';
import { formatChangeRequest, type RequestedField } from './change-request';

/**
 * Review decisions.
 *
 * Every one of these is a thin wrapper over `transitionPassport`: the state
 * machine, the role check, the validation gate and the audit entry all live
 * there. What this file adds is the reviewer's intent — which fields the
 * author has to fix — and the form plumbing.
 */

export interface ReviewState {
  error?: string;
  /** Field-level problems from the publication gate, keyed by dot-path. */
  fieldErrors?: Record<string, string[]>;
  ok?: string;
}

const REVIEWER_ROLES = ['BRAND_ADMIN', 'COMPLIANCE_OFFICER'] as const;

async function requireReviewer() {
  const session = await getSession();
  if (!session?.tenantId) throw new ApiError(401, 'Unauthorized', { detail: 'Sign in to continue.' });
  if (!(REVIEWER_ROLES as readonly string[]).includes(session.role)) {
    throw new ApiError(403, 'Forbidden', { detail: 'Only a compliance officer or brand admin can review passports.' });
  }
  return session;
}

/** Turn any thrown `ApiError` into something the form can render. */
function toState(error: unknown): ReviewState {
  if (error instanceof ApiError) {
    return { error: error.message, ...(error.errors ? { fieldErrors: error.errors } : {}) };
  }
  console.error('[review] action failed', error);
  return { error: 'Something went wrong. Try again.' };
}

export async function decidePassport(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const dppId = String(formData.get('dppId') ?? '');
  const to = String(formData.get('to') ?? '') as PassportStatus;
  const comment = String(formData.get('comment') ?? '').trim();

  // The reviewer ticked specific fields. Each checkbox carries both the path
  // and its label so the author reads "Fibre percentage", not a dot-path.
  const fields: RequestedField[] = formData
    .getAll('field')
    .map((raw) => String(raw))
    .map((raw) => {
      const separator = raw.indexOf('|');
      return separator === -1
        ? { path: raw, label: raw }
        : { path: raw.slice(0, separator), label: raw.slice(separator + 1) };
    });

  const extra = String(formData.get('otherField') ?? '').trim();
  if (extra) fields.push({ path: extra, label: extra });

  if (to === 'changes_requested') {
    if (!comment) {
      return { error: 'Say what needs to change. The author sees this, and so does the audit trail.' };
    }
    if (fields.length === 0) {
      return {
        error: 'Tick at least one field. A request the author cannot act on just bounces back.',
      };
    }
  }

  try {
    const session = await requireReviewer();
    await transitionPassport(session, {
      dppId,
      to,
      reason:
        to === 'changes_requested'
          ? formatChangeRequest({ comment, fields })
          : comment || undefined,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath('/console/review');
  revalidatePath(`/console/review/${dppId}`);
  revalidatePath(`/console/passports/${dppId}`);

  return { ok: 'Done.' };
}
