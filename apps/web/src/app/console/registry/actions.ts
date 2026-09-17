'use server';

import { revalidatePath } from 'next/cache';
import { getSession, type Session } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/errors';
import { RegistryError } from '@/lib/registry/types';
import { StepUpRequiredError } from '@/lib/mfa/step-up';
import {
  checkSubmissionStatus,
  submitPassport,
  withdrawSubmission,
} from '@/lib/registry/service';

/**
 * Server actions for Registry filing.
 *
 * Each re-reads the session rather than trusting the form, because a server
 * action is a public endpoint with a nicer calling convention. The role check
 * itself lives in the service, so the API route and the console cannot drift
 * apart about who may file.
 */

const PAGE = '/console/registry';

export interface FilingState {
  error?: string;
  message?: string;
  /** Field paths the pre-flight refused on, so the UI can point at them. */
  blockedOn?: string[];
  /** Set when the action needs a fresh authenticator code first. */
  stepUpRequired?: boolean;
}

export async function submitFilingAction(
  _previous: FilingState,
  formData: FormData,
): Promise<FilingState> {
  try {
    const session = await requireSession();
    const outcome = await submitPassport(session, String(formData.get('dppId') ?? ''));
    revalidatePath(PAGE);

    const where = outcome.endpoint.authoritative
      ? 'the EU DPP Registry'
      : `the ${outcome.endpoint.mode === 'mock' ? 'rehearsal' : 'configured test'} endpoint`;

    return {
      message:
        `${outcome.resubmission ? 'Re-filed' : 'Filed'} with ${where} as ${outcome.registryId}. ` +
        `Proof of registration is valid until ${formatDate(outcome.expiresAt)}.`,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function checkStatusAction(
  _previous: FilingState,
  formData: FormData,
): Promise<FilingState> {
  try {
    const session = await requireSession();
    const status = await checkSubmissionStatus(session, String(formData.get('dppId') ?? ''));
    revalidatePath(PAGE);
    return {
      message: `The ${status.endpoint.mode === 'mock' ? 'rehearsal registry' : 'registry'} reports this registration as ${status.state.replace(/_/g, ' ')}.`,
    };
  } catch (error) {
    return toState(error);
  }
}

export async function withdrawFilingAction(
  _previous: FilingState,
  formData: FormData,
): Promise<FilingState> {
  try {
    const session = await requireSession();
    await withdrawSubmission(
      session,
      String(formData.get('dppId') ?? ''),
      String(formData.get('reason') ?? ''),
    );
    revalidatePath(PAGE);
    return { message: 'The registration was withdrawn. The audit entry keeps its identifier.' };
  } catch (error) {
    return toState(error);
  }
}

async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'Unauthorized', { detail: 'Sign in to continue.' });
  return session;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Surface the message we wrote; never the internals of anything we did not. */
function toState(error: unknown): FilingState {
  if (error instanceof StepUpRequiredError) {
    return { error: error.message, stepUpRequired: true };
  }
  if (error instanceof RegistryError) {
    const blockedOn = Array.isArray(error.detail)
      ? error.detail
          .map((issue) => (issue as { field?: unknown }).field)
          .filter((field): field is string => typeof field === 'string')
      : undefined;
    return { error: error.message, blockedOn };
  }
  if (error instanceof ApiError) return { error: error.message };
  console.error('[console/registry] action failed', error);
  return { error: 'Something went wrong. Try again, and tell us if it keeps happening.' };
}
