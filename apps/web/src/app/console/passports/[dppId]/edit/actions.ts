'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api/errors';
import { getSession } from '@/lib/auth/session';
import { savePassportPayload, transitionPassport } from '@/lib/passport/service';
import type { PassportStatus } from '@/lib/passport/state';
import { parseFormPayload } from '@/components/form/parse';
import type { SaveState } from '@/components/form/types';
import { loadPassport } from './data';
import type { TransitionState } from './transition-state';

/**
 * Saving one section of a passport.
 *
 * The form posts only the section it owns, so the action reads the current
 * payload, replaces those top-level keys outright and hands the whole thing to
 * `savePassportPayload` — which is where versioning, validation and the audit
 * entry live. Replacing rather than merging is what makes deleting the last
 * fibre row actually delete it.
 */
export async function saveSectionAction(
  dppId: string,
  _state: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await getSession();
  if (!session?.tenantId) {
    return { status: 'error', message: 'Your session has expired. Sign in again.' };
  }

  const owns = String(formData.get('_sections') ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (owns.length === 0) {
    return { status: 'error', message: 'That form did not say what it was saving.' };
  }

  const detail = await loadPassport(session.tenantId, dppId);
  if (!detail) return { status: 'error', message: 'That passport no longer exists.' };

  const next: Record<string, unknown> = { ...detail.payload, schemaVersion: '1.0' };
  for (const key of owns) delete next[key];
  Object.assign(next, parseFormPayload(formData));

  const changeReason = String(formData.get('_changeReason') ?? '').trim();

  try {
    const result = await savePassportPayload(session, { dppId, payload: next, changeReason });
    revalidatePath(`/console/passports/${dppId}`);
    return result.unchanged
      ? { status: 'unchanged', at: Date.now() }
      : { status: 'saved', version: result.version, at: Date.now() };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        status: 'error',
        message: error.message,
        errors: error.errors,
        at: Date.now(),
      };
    }
    throw error;
  }
}

/**
 * Move the passport through its lifecycle.
 *
 * The state machine, the permission check and the publication gate all live in
 * the service; this only carries the form across and translates a refusal back
 * into something the editor can put on the right fields.
 */
export async function transitionAction(
  dppId: string,
  _state: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const session = await getSession();
  if (!session?.tenantId) {
    return { status: 'error', message: 'Your session has expired. Sign in again.' };
  }

  const to = String(formData.get('to') ?? '') as PassportStatus;
  const reason = String(formData.get('reason') ?? '').trim();
  const severity = String(formData.get('recallSeverity') ?? 'medium');
  const instructions = String(formData.get('recallInstructions') ?? '').trim();

  try {
    await transitionPassport(session, {
      dppId,
      to,
      reason: reason || undefined,
      ...(to === 'recalled'
        ? {
            recall: {
              severity: (['low', 'medium', 'high'] as const).includes(
                severity as 'low' | 'medium' | 'high',
              )
                ? (severity as 'low' | 'medium' | 'high')
                : 'medium',
              instructions,
            },
          }
        : {}),
    });
    revalidatePath(`/console/passports/${dppId}`);
    revalidatePath('/console/passports');
    return { status: 'done', to, at: Date.now() };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: 'error', message: error.message, errors: error.errors, at: Date.now() };
    }
    throw error;
  }
}
