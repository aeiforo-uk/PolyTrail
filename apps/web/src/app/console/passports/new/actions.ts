'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api/errors';
import { getSession } from '@/lib/auth/session';
import { validateGtin } from '@/lib/gs1/digital-link';
import { createPassport } from '@/lib/passport/service';
import { CATEGORIES } from '@/lib/passport/vocab';
import type { CreateState } from './state';

const GRANULARITIES = ['model', 'batch', 'item'] as const;

/**
 * Create a passport and go straight to its editor.
 *
 * Only the fields that decide what the passport *is* are asked for here — the
 * product, its category and its identifiers. Everything else is filled in over
 * the months that follow, which is why the rest of the editor exists.
 */
export async function createPassportAction(
  _state: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const session = await getSession();
  if (!session?.tenantId) {
    return { status: 'error', message: 'Your session has expired. Sign in again.' };
  }

  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };

  const productName = read('productName');
  const category = read('category');
  const gtin = read('gtin');
  const scope = read('scope');

  const errors: Record<string, string[]> = {};
  if (!productName) errors.productName = ['Give the product a name.'];
  if (!(category in CATEGORIES)) errors.category = ['Choose a category.'];

  // The browser checks this too, but a check digit is the whole point of a
  // GTIN and the server is the only place that decides what gets stored.
  if (gtin) {
    const check = validateGtin(gtin);
    if (!check.valid) errors.gtin = [check.reason ?? 'That GTIN is not valid.'];
  }

  if (Object.keys(errors).length > 0) {
    return { status: 'error', message: 'Check the highlighted fields.', errors };
  }

  let dppId: string;
  try {
    const passport = await createPassport(session, {
      productName,
      category,
      styleNumber: read('styleNumber') || undefined,
      sku: read('sku') || undefined,
      gtin: gtin || undefined,
      colourName: read('colourName') || undefined,
      size: read('size') || undefined,
      scope: (GRANULARITIES as readonly string[]).includes(scope)
        ? (scope as (typeof GRANULARITIES)[number])
        : 'model',
    });
    dppId = passport.dppId;
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: 'error', message: error.message, errors: error.errors };
    }
    throw error;
  }

  revalidatePath('/console/passports');
  redirect(`/console/passports/${dppId}/edit/identity`);
}
