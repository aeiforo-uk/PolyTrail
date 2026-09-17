'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, tooManyRequests } from '@/lib/api/errors';
import { getSession, setSessionCookie } from '@/lib/auth/session';
import { clientKey, rateLimit } from '@/lib/security/rate-limit';
import {
  acceptTransfer,
  createRecipientWorkspace,
  isTransferReason,
  rejectTransfer,
} from '@/lib/transfers';

/**
 * Deciding on an offer, from outside the product.
 *
 * Everything here is reachable by a stranger holding a token, so every action
 * is rate-limited by IP before it touches the database. The token is checked
 * inside the service with a constant-time compare; nothing in this file ever
 * puts it in a log, a redirect or an error message.
 */

export interface DecisionState {
  error?: string;
  field?: 'workspaceName' | 'country' | 'name' | 'password' | 'reason';
}

async function throttle(prefix: string, limit: number): Promise<void> {
  const incoming = await headers();
  const request = new Request('https://polytrail.invalid/', {
    headers: new Headers(Array.from(incoming.entries())),
  });
  const result = rateLimit(clientKey(request, prefix), limit, 60_000);
  if (!result.ok) {
    throw tooManyRequests(
      `Too many attempts. Try again in ${result.retryAfterSeconds} seconds.`,
    );
  }
}

function toState(error: unknown): DecisionState {
  if (error instanceof ApiError) return { error: error.message };
  console.error('[transfer-acceptance] action failed', error);
  return { error: 'Something went wrong. Try again.' };
}

/** Accept using the workspace the person is already signed in to. */
export async function acceptAsSignedIn(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const token = String(formData.get('token') ?? '');
  let destination: string;

  try {
    await throttle('transfer-accept', 10);
    const session = await getSession();
    if (!session?.tenantId) {
      return { error: 'Sign in first, then open this link again.' };
    }

    const result = await acceptTransfer(token, {
      userId: session.userId,
      name: session.name,
      email: session.email,
      tenantId: session.tenantId,
      role: session.role,
    });
    destination = landingFor(session.role, result.dppId, result.transferId);
  } catch (error) {
    return toState(error);
  }

  redirect(destination);
}

/** Accept by creating a workspace on the spot. */
export async function acceptWithNewWorkspace(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const token = String(formData.get('token') ?? '');
  const reason = String(formData.get('reason') ?? '');
  if (!isTransferReason(reason)) return { error: 'This offer is no longer readable.', field: 'reason' };

  let destination: string;

  try {
    await throttle('transfer-accept', 10);

    const session = await createRecipientWorkspace({
      workspaceName: String(formData.get('workspaceName') ?? ''),
      country: String(formData.get('country') ?? ''),
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      reason,
    });

    const result = await acceptTransfer(token, {
      userId: session.userId,
      name: session.name,
      email: session.email,
      tenantId: session.tenantId!,
      role: session.role,
    });

    // Signed in only after the transfer lands, so a failed acceptance does not
    // leave somebody logged into an empty workspace wondering what happened.
    await setSessionCookie(session);
    destination = landingFor(session.role, result.dppId, result.transferId);
  } catch (error) {
    return toState(error);
  }

  redirect(destination);
}

export async function reject(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const token = String(formData.get('token') ?? '');
  const reason = String(formData.get('rejectionReason') ?? '').trim();

  try {
    await throttle('transfer-reject', 10);
    const session = await getSession();
    await rejectTransfer(
      token,
      reason,
      session?.tenantId
        ? {
            userId: session.userId,
            name: session.name,
            email: session.email,
            tenantId: session.tenantId,
          }
        : null,
    );
  } catch (error) {
    return toState(error);
  }

  redirect('/t/declined');
}

/**
 * A repairer or recycler belongs in the partner portal, not the brand console.
 * Sending everyone to the console would be the cut-down-console mistake the
 * partner surface exists to avoid.
 */
function landingFor(role: string, dppId: string, transferId: string): string {
  return role === 'REPAIRER' || role === 'RECYCLER'
    ? `/partner/${dppId}`
    : `/console/transfers/${transferId}`;
}
