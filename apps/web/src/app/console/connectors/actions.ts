'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import { getSession } from '@/lib/auth/session';
import { canConfigureConnectors } from '@/lib/import/access';
import { pullIntoJob, testConnector } from '@/lib/connectors/service';
import type { ConnectorFormState, PullState, TestState } from './state';
import { createConnector, deleteConnector, updateConnector } from '@/lib/connectors/store';
import { CONNECTOR_KINDS, DEFAULT_REST_SETTINGS, type ConnectorKind, type PaginationSettings, type RestSettings } from '@/lib/connectors/types';

/**
 * Connector mutations.
 *
 * The credential is the only field here that is write-only: it goes in, it is
 * encrypted, and no action in this file ever returns it. A form that re-renders
 * a stored token so the user "can check it" has already leaked it into a
 * browser cache, a screenshot and a support ticket.
 */

export async function createConnectorAction(
  _state: ConnectorFormState,
  formData: FormData,
): Promise<ConnectorFormState> {
  const session = await getSession();
  if (!canConfigureConnectors(session)) {
    return { status: 'error', message: 'Only a brand admin can add a connected system.' };
  }

  const read = (key: string) => String(formData.get(key) ?? '').trim();
  const kind = read('kind') as ConnectorKind;
  if (!CONNECTOR_KINDS.includes(kind)) {
    return { status: 'error', message: 'Choose a connector type.' };
  }

  const errors: Record<string, string[]> = {};
  const name = read('name');
  if (!name) errors.name = ['Give it a name.'];

  const settings = kind === 'rest' ? restSettingsFrom(formData, errors) : {};

  if (Object.keys(errors).length > 0) {
    return { status: 'error', message: 'Check the highlighted fields.', errors };
  }

  let id: string;
  try {
    const created = await createConnector(session, {
      kind,
      name,
      settings,
      secret: read('secret') || null,
    });
    id = created.id;
  } catch (error) {
    if (error instanceof ApiError) return { status: 'error', message: error.message };
    if (error instanceof Error) return { status: 'error', message: error.message };
    throw error;
  }

  revalidatePath('/console/connectors');
  redirect(`/console/connectors/${id}`);
}

export async function updateConnectorAction(
  _state: ConnectorFormState,
  formData: FormData,
): Promise<ConnectorFormState> {
  const session = await getSession();
  if (!canConfigureConnectors(session)) {
    return { status: 'error', message: 'Only a brand admin can change a connected system.' };
  }

  const id = String(formData.get('id') ?? '');
  const kind = String(formData.get('kind') ?? '') as ConnectorKind;
  const read = (key: string) => String(formData.get(key) ?? '').trim();

  const errors: Record<string, string[]> = {};
  const settings = kind === 'rest' ? restSettingsFrom(formData, errors) : undefined;
  if (Object.keys(errors).length > 0) {
    return { status: 'error', message: 'Check the highlighted fields.', errors };
  }

  // A blank credential field means "leave it alone". Clearing one is an
  // explicit act, not something a form submission does by omission.
  const secretInput = read('secret');
  const clearSecret = formData.get('clearSecret') === 'on';

  try {
    await updateConnector(session, id, {
      name: read('name'),
      settings,
      secret: clearSecret ? null : secretInput ? secretInput : undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) return { status: 'error', message: error.message };
    if (error instanceof Error) return { status: 'error', message: error.message };
    throw error;
  }

  revalidatePath(`/console/connectors/${id}`);
  return { status: 'idle' };
}

export async function deleteConnectorAction(id: string): Promise<void> {
  const session = await getSession();
  if (!canConfigureConnectors(session)) return;

  await deleteConnector(session, id);
  revalidatePath('/console/connectors');
  redirect('/console/connectors');
}

/** Run a live request and hand back what came back, unedited. */
export async function testConnectorAction(id: string): Promise<TestState> {
  const session = await getSession();
  if (!canConfigureConnectors(session)) {
    return { ran: false, message: 'Only a brand admin can test a connected system.' };
  }

  try {
    return { ran: true, result: await testConnector(session, id) };
  } catch (error) {
    if (error instanceof ApiError) return { ran: false, message: error.message };
    return { ran: false, message: error instanceof Error ? error.message : 'The test failed.' };
  }
}

/**
 * Fetch records and park them as an import job.
 *
 * The redirect goes to the mapping step, not to a finished import. An API is
 * not more trustworthy than a spreadsheet; it is only less typing.
 */
export async function pullConnectorAction(id: string): Promise<PullState> {
  const session = await getSession();
  if (!canConfigureConnectors(session)) {
    return { ok: false, message: 'Only a brand admin can run a connected system.' };
  }

  try {
    const outcome = await pullIntoJob(session, id);
    revalidatePath('/console/imports');
    return { ok: true, jobId: outcome.jobId, rows: outcome.rows };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : 'The pull failed.' };
  }
}

/** Parse the REST form. Validation errors are collected, not thrown one at a time. */
function restSettingsFrom(formData: FormData, errors: Record<string, string[]>): RestSettings {
  const read = (key: string) => String(formData.get(key) ?? '').trim();

  const baseUrl = read('baseUrl');
  if (!baseUrl) errors.baseUrl = ['Give the URL that returns the records.'];
  else if (!/^https?:\/\//i.test(baseUrl)) errors.baseUrl = ['Start the URL with https://'];

  const maxRecords = Number(read('maxRecords') || DEFAULT_REST_SETTINGS.maxRecords);
  if (!Number.isFinite(maxRecords) || maxRecords < 1) {
    errors.maxRecords = ['A record limit is a whole number of at least 1.'];
  }

  const authTemplate = read('authTemplate') || DEFAULT_REST_SETTINGS.authTemplate;
  if (!authTemplate.includes('{{secret}}') && read('secret')) {
    errors.authTemplate = ['Put {{secret}} where the credential belongs in the header value.'];
  }

  return {
    baseUrl,
    method: read('method') === 'POST' ? 'POST' : 'GET',
    authHeader: read('authHeader') || DEFAULT_REST_SETTINGS.authHeader,
    authTemplate,
    recordSelector: read('recordSelector'),
    fieldMap: pairsFrom(read('fieldMap')),
    query: pairsFrom(read('query')),
    pagination: paginationFrom(formData),
    maxRecords: Math.min(Math.max(Math.trunc(maxRecords) || 1, 1), 20_000),
  };
}

function paginationFrom(formData: FormData): PaginationSettings {
  const read = (key: string) => String(formData.get(key) ?? '').trim();
  const style = read('paginationStyle');
  const pageSize = Math.min(Math.max(Number(read('pageSize')) || 100, 1), 1000);

  if (style === 'page') {
    return {
      style: 'page',
      pageParam: read('pageParam') || 'page',
      sizeParam: read('sizeParam') || 'limit',
      pageSize,
      startAt: Number(read('startAt')) === 0 ? 0 : 1,
    };
  }
  if (style === 'cursor') {
    return {
      style: 'cursor',
      cursorParam: read('cursorParam') || 'cursor',
      cursorPath: read('cursorPath') || 'next',
      sizeParam: read('sizeParam') || 'limit',
      pageSize,
    };
  }
  return { style: 'none' };
}

/**
 * `key = value` per line. A textarea rather than a repeater because the people
 * who configure these are reading an API document with a list in it, and
 * pasting a list beats twelve rounds of "add another row".
 */
function pairsFrom(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}
