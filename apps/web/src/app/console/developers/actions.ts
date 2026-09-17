'use server';

import { revalidatePath } from 'next/cache';
import { getSession, type Session } from '@/lib/auth/session';
import { ApiError } from '@/lib/api/errors';
import { createApiKey, revokeApiKey } from '@/lib/api-keys/service';
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  sendTestDelivery,
  setWebhookEndpointActive,
} from '@/lib/webhooks/service';
import { rotateTenantSigningKey } from '@/lib/credentials/keys';

/**
 * Server actions for the developer settings page.
 *
 * Every one re-reads the session rather than trusting anything the form sent,
 * and every one checks the role. A server action is a public HTTP endpoint with
 * a nicer calling convention; treating it as an internal function call is how
 * privilege checks get skipped.
 */

const PAGE = '/console/developers';

export interface CreateKeyState {
  error?: string;
  /** The secret, returned once. Held in React state, never persisted. */
  key?: string;
  keyName?: string;
}

export async function createApiKeyAction(
  _previous: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  try {
    const session = await requireBrandAdmin();
    const expiresIn = String(formData.get('expiresInDays') ?? '');

    const { key, row } = await createApiKey(session, {
      name: String(formData.get('name') ?? ''),
      scopes: formData.getAll('scopes').map(String),
      expiresInDays: expiresIn === '' || expiresIn === 'never' ? null : Number(expiresIn),
    });

    revalidatePath(PAGE);
    return { key, keyName: row.name };
  } catch (error) {
    return { error: message(error) };
  }
}

export interface ActionState {
  error?: string;
  message?: string;
}

export async function revokeApiKeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireBrandAdmin();
    const row = await revokeApiKey(session, String(formData.get('keyId') ?? ''));
    revalidatePath(PAGE);
    return { message: `“${row.name}” was revoked. Any integration using it will stop working now.` };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function createWebhookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState & { secret?: string; url?: string }> {
  try {
    const session = await requireBrandAdmin();
    const created = await createWebhookEndpoint(session, {
      url: String(formData.get('url') ?? ''),
      description: String(formData.get('description') ?? ''),
      events: formData.getAll('events').map(String),
    });
    revalidatePath(PAGE);
    return { secret: created.secret, url: created.url };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function toggleWebhookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireBrandAdmin();
    const active = String(formData.get('active')) === 'true';
    await setWebhookEndpointActive(session, String(formData.get('endpointId') ?? ''), active);
    revalidatePath(PAGE);
    return { message: active ? 'Endpoint re-enabled.' : 'Endpoint paused. Nothing will be delivered to it.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function deleteWebhookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireBrandAdmin();
    await deleteWebhookEndpoint(session, String(formData.get('endpointId') ?? ''));
    revalidatePath(PAGE);
    return { message: 'Endpoint deleted.' };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function testWebhookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireBrandAdmin();
    const outcome = await sendTestDelivery(session.tenantId!, String(formData.get('endpointId') ?? ''));
    revalidatePath(PAGE);

    if (outcome.ok) return { message: `Your endpoint answered ${outcome.status}.` };
    // The endpoint's own error text, verbatim. A test send that says only
    // "failed" sends the developer to their logs; this usually saves the trip.
    return {
      error: outcome.status
        ? `Your endpoint answered ${outcome.status}. ${outcome.error ?? ''}`.trim()
        : (outcome.error ?? 'The request did not complete.'),
    };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function rotateSigningKeyAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const session = await requireBrandAdmin();
    const key = await rotateTenantSigningKey(session.tenantId!);
    revalidatePath(PAGE);
    return {
      message: `New signing key ${key.keyId.split('#')[1]?.slice(0, 12)}… is active. Credentials already issued stay verifiable — the previous key remains published in your DID document.`,
    };
  } catch (error) {
    return { error: message(error) };
  }
}

async function requireBrandAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'Unauthorized', { detail: 'Sign in to continue.' });
  if (session.role !== 'BRAND_ADMIN') {
    throw new ApiError(403, 'Forbidden', {
      detail: 'Only a brand admin can manage API keys, webhooks and signing keys.',
    });
  }
  if (!session.tenantId) {
    throw new ApiError(403, 'Forbidden', { detail: 'Your account is not attached to a workspace.' });
  }
  return session;
}

/** Surface the message we wrote; never the internals of anything we did not. */
function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  console.error('[console/developers] action failed', error);
  return 'Something went wrong. Try again, and tell us if it keeps happening.';
}
