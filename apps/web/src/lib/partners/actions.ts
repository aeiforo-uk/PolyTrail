'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { partners, type PostalAddress } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/roles';
import { recordSupplyAudit } from './audit';
import { partnerInputFromForm, type PartnerInput } from './schema';

/**
 * Mutations for the supplier directory.
 *
 * These are server actions rather than route handlers so the forms keep
 * working with scripting disabled — the same reason the supplier portal is
 * built the way it is. A brand's sourcing team is often on a locked-down
 * corporate laptop, and there is no reason a form that only writes a row
 * should need a client bundle to do it.
 */

const WRITERS: readonly Role[] = ['BRAND_ADMIN', 'PRODUCT_MANAGER'];

export interface PartnerFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireWriter() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!WRITERS.includes(session.role)) {
    throw new Error('Only a brand admin or product manager may change the supplier list.');
  }
  return { session, tenantId: session.tenantId };
}

function toRow(input: PartnerInput) {
  const address: PostalAddress | null =
    input.line1 || input.city || input.postalCode
      ? {
          ...(input.line1 ? { line1: input.line1 } : {}),
          ...(input.line2 ? { line2: input.line2 } : {}),
          ...(input.city ? { city: input.city } : {}),
          ...(input.region ? { region: input.region } : {}),
          ...(input.postalCode ? { postalCode: input.postalCode } : {}),
          country: input.country,
        }
      : null;

  return {
    name: input.name,
    legalName: input.legalName,
    tier: input.tier,
    roles: input.roles,
    country: input.country,
    address,
    latitude: input.latitude,
    longitude: input.longitude,
    gln: input.gln,
    osId: input.osId,
    lei: input.lei,
    did: input.did,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    workerCount: input.workerCount,
    capabilities: input.capabilities,
    notes: input.notes,
  };
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    errors[key] ??= issue.message;
  }
  return errors;
}

export async function createPartner(
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const { session, tenantId } = await requireWriter();

  const parsed = partnerInputFromForm(form);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const [row] = await db
    .insert(partners)
    .values({ tenantId, ...toRow(parsed.data) })
    .returning({ id: partners.id, name: partners.name });

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'partner.created',
    subjectType: 'partner',
    subjectId: row!.id,
    metadata: { name: row!.name, tier: parsed.data.tier, country: parsed.data.country },
  });

  revalidatePath('/console/partners');
  redirect(`/console/partners/${row!.id}`);
}

export async function updatePartner(
  partnerId: string,
  _prev: PartnerFormState,
  form: FormData,
): Promise<PartnerFormState> {
  const { session, tenantId } = await requireWriter();

  const parsed = partnerInputFromForm(form);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const [row] = await db
    .update(partners)
    .set({ ...toRow(parsed.data), updatedAt: new Date() })
    // Tenant predicate on an update is not belt-and-braces: without it a
    // guessed id from another workspace would be writable.
    .where(
      and(eq(partners.id, partnerId), eq(partners.tenantId, tenantId), isNull(partners.deletedAt)),
    )
    .returning({ id: partners.id, name: partners.name });

  if (!row) return { error: 'That supplier no longer exists.' };

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'partner.updated',
    subjectType: 'partner',
    subjectId: row.id,
    metadata: { name: row.name, tier: parsed.data.tier, country: parsed.data.country },
  });

  revalidatePath('/console/partners');
  revalidatePath(`/console/partners/${partnerId}`);
  redirect(`/console/partners/${partnerId}`);
}

/**
 * Soft delete. A partner named in a published passport cannot be erased —
 * the passport has to keep resolving for the life of the product — so the row
 * is retired rather than removed.
 */
export async function archivePartner(partnerId: string): Promise<void> {
  const { session, tenantId } = await requireWriter();

  const [row] = await db
    .update(partners)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(partners.id, partnerId), eq(partners.tenantId, tenantId), isNull(partners.deletedAt)),
    )
    .returning({ id: partners.id, name: partners.name });

  if (!row) return;

  await recordSupplyAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'partner.archived',
    subjectType: 'partner',
    subjectId: row.id,
    metadata: { name: row.name },
  });

  revalidatePath('/console/partners');
  redirect('/console/partners');
}
