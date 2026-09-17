'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ApiError, forbidden, unauthorized } from '@/lib/api/errors';
import { isValidDppId, normalizeDppId } from '@/lib/passport/identifier';
import { appendEvent } from '@/lib/lifecycle/events';
import { isLifecycleEvent, type LifecycleEventType } from '@/lib/lifecycle/vocab';
import { personaFor } from './queries';

/**
 * Partner actions.
 *
 * A partner does two things: find an item, and say what they did to it. Both
 * live here so the portal's client components hold no rules — the authority
 * check, the closed-passport check and the audit entry are all inside
 * `appendEvent`, and this file only shapes the form.
 */

export interface LookupState {
  error?: string;
}

/** Events each persona may record from the portal. */
const RECORDABLE: Record<'repairer' | 'recycler', readonly LifecycleEventType[]> = {
  repairer: ['repaired'],
  recycler: ['collected', 'sorted', 'recycled'],
};

export async function lookUp(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const raw = String(formData.get('dppId') ?? '').trim();
  if (!raw) return { error: 'Type or scan an identifier first.' };

  const dppId = normalizeDppId(raw);
  if (!isValidDppId(dppId)) {
    return {
      error:
        'That is not a Polytrail identifier. It is 16 characters, printed in groups of four on the label.',
    };
  }

  redirect(`/partner/${dppId}`);
}

export interface RecordState {
  error?: string;
  recorded?: string;
}

export async function recordEvent(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const dppId = String(formData.get('dppId') ?? '');
  const eventType = String(formData.get('eventType') ?? '');
  const summary = String(formData.get('summary') ?? '').trim();
  const occurredAt = String(formData.get('occurredAt') ?? '').trim();
  const detail = String(formData.get('detail') ?? '').trim();

  if (!isLifecycleEvent(eventType)) return { error: 'Choose what you did.' };
  if (summary.length < 3) {
    return { error: 'Say what you did in a line. Somebody will read this in five years.' };
  }

  try {
    const session = await getSession();
    if (!session) throw unauthorized();
    const persona = personaFor(session.role);
    if (!persona) throw forbidden('This portal is for repair and recycling partners.');
    if (!RECORDABLE[persona].includes(eventType)) {
      throw forbidden(`A ${persona} cannot record that.`);
    }

    await appendEvent(
      {
        userId: session.userId,
        name: session.name,
        tenantId: session.tenantId,
        role: session.role,
      },
      {
        dppId,
        eventType,
        occurredAt: occurredAt || undefined,
        summary,
        details: detail ? { notes: detail, recordedVia: 'partner_portal' } : null,
      },
    );
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };
    console.error('[partner] could not record event', error);
    return { error: 'Something went wrong. Try again.' };
  }

  revalidatePath(`/partner/${dppId}`);
  revalidatePath('/partner');
  return { recorded: eventType };
}
