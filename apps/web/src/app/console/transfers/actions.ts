'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ApiError, forbidden, unauthorized } from '@/lib/api/errors';
import {
  DEFAULT_EXPIRY_DAYS,
  acceptTransferById,
  cancelTransfer,
  initiateTransfer,
  isTransferReason,
  rejectTransferById,
} from '@/lib/transfers';

/**
 * Transfer actions for the console.
 *
 * Thin by design: the ownership rules, the credential and the audit entry all
 * live in `src/lib/transfers`. What belongs here is form parsing and the one
 * thing the service cannot decide — where to send the person next.
 */

export interface TransferFormState {
  error?: string;
  /** The live acceptance link, shown once so a bounced email is recoverable. */
  acceptUrl?: string;
  emailDelivered?: boolean;
}

function toState(error: unknown): TransferFormState {
  if (error instanceof ApiError) return { error: error.message };
  console.error('[transfers] action failed', error);
  return { error: 'Something went wrong. Try again.' };
}

async function requireActor() {
  const session = await getSession();
  if (!session) throw unauthorized();
  if (!session.tenantId) throw forbidden('Your account is not attached to a workspace.');
  return {
    userId: session.userId,
    name: session.name,
    email: session.email,
    tenantId: session.tenantId,
    role: session.role,
  };
}

export async function initiate(
  _prev: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const dppId = String(formData.get('dppId') ?? '').trim();
  const reason = String(formData.get('reason') ?? '');
  const toEmail = String(formData.get('toEmail') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const expiresInDays = Number(formData.get('expiresInDays') ?? DEFAULT_EXPIRY_DAYS);

  if (!dppId) return { error: 'Choose which item you are handing over.' };
  if (!isTransferReason(reason)) return { error: 'Choose a reason for the transfer.' };

  try {
    const actor = await requireActor();
    const result = await initiateTransfer(actor, {
      dppId,
      reason,
      toEmail,
      note: note || null,
      expiresInDays,
    });
    revalidatePath('/console/transfers');
    return { acceptUrl: result.acceptUrl, emailDelivered: result.emailDelivered };
  } catch (error) {
    return toState(error);
  }
}

export interface CancelState {
  error?: string;
}

export async function cancel(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const transferId = String(formData.get('transferId') ?? '');
  if (!transferId) return { error: 'That transfer no longer exists.' };

  try {
    const actor = await requireActor();
    await cancelTransfer(actor, transferId);
  } catch (error) {
    return toState(error);
  }

  revalidatePath('/console/transfers');
  revalidatePath(`/console/transfers/${transferId}`);
  redirect(`/console/transfers/${transferId}`);
}

/**
 * Deciding on an incoming offer from inside the console.
 *
 * A workspace the transfer was addressed to has already proved who it is by
 * signing in, so it decides here rather than going back to the emailed link.
 * The bearer token exists for recipients who have no account.
 */
export async function acceptIncoming(
  _prev: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const transferId = String(formData.get('transferId') ?? '');
  if (!transferId) return { error: 'That transfer no longer exists.' };

  try {
    const actor = await requireActor();
    await acceptTransferById(transferId, actor);
  } catch (error) {
    return toState(error);
  }

  revalidatePath('/console/transfers');
  revalidatePath(`/console/transfers/${transferId}`);
  return {};
}

export async function declineIncoming(
  _prev: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const transferId = String(formData.get('transferId') ?? '');
  const reason = String(formData.get('rejectionReason') ?? '').trim();
  if (!transferId) return { error: 'That transfer no longer exists.' };

  try {
    const actor = await requireActor();
    await rejectTransferById(transferId, reason, actor);
  } catch (error) {
    return toState(error);
  }

  revalidatePath('/console/transfers');
  revalidatePath(`/console/transfers/${transferId}`);
  return {};
}
