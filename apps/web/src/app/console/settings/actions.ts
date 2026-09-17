'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantBranding, tenants } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/record';
import { brandingSchema } from '@/lib/branding';
import { workspaceIdentitySchema } from './validation';

export interface SettingsState {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session?.tenantId || session.role !== 'BRAND_ADMIN') return null;
  return session;
}

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    fieldErrors[issue.path.join('.')] = issue.message;
  }
  return fieldErrors;
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '');

/**
 * Save the workspace's legal identity.
 *
 * Audited as `tenant.updated` with a list of the fields that actually moved,
 * not the values: this record has to survive a subject access request, and the
 * fact that the VAT number changed is the auditable event — a second copy of
 * the number in the log is a liability, not evidence.
 */
export async function saveIdentity(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can change workspace settings.' };

  const parsed = workspaceIdentitySchema.safeParse({
    legalName: text(formData, 'legalName'),
    tradeName: text(formData, 'tradeName'),
    country: text(formData, 'country'),
    vatNumber: text(formData, 'vatNumber'),
    eoriNumber: text(formData, 'eoriNumber'),
    lei: text(formData, 'lei'),
    gln: text(formData, 'gln'),
    gs1CompanyPrefix: text(formData, 'gs1CompanyPrefix'),
    contactEmail: text(formData, 'contactEmail'),
    website: text(formData, 'website'),
    addressLine1: text(formData, 'addressLine1'),
    addressLine2: text(formData, 'addressLine2'),
    addressCity: text(formData, 'addressCity'),
    addressRegion: text(formData, 'addressRegion'),
    addressPostalCode: text(formData, 'addressPostalCode'),
    addressCountry: text(formData, 'addressCountry'),
  });

  if (!parsed.success) {
    return { error: 'Some values need attention.', fieldErrors: issues(parsed.error) };
  }

  const value = parsed.data;
  const hasAddress = Boolean(
    value.addressLine1 || value.addressCity || value.addressPostalCode || value.addressCountry,
  );

  try {
    const [before] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1);
    if (!before) return { error: 'This workspace no longer exists.' };

    await db
      .update(tenants)
      .set({
        legalName: value.legalName,
        tradeName: value.tradeName,
        country: value.country,
        vatNumber: value.vatNumber,
        eoriNumber: value.eoriNumber,
        lei: value.lei,
        gln: value.gln,
        gs1CompanyPrefix: value.gs1CompanyPrefix,
        contactEmail: value.contactEmail,
        website: value.website,
        registeredAddress: hasAddress
          ? {
              ...(value.addressLine1 ? { line1: value.addressLine1 } : {}),
              ...(value.addressLine2 ? { line2: value.addressLine2 } : {}),
              ...(value.addressCity ? { city: value.addressCity } : {}),
              ...(value.addressRegion ? { region: value.addressRegion } : {}),
              ...(value.addressPostalCode ? { postalCode: value.addressPostalCode } : {}),
              country: value.addressCountry ?? value.country,
            }
          : null,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, session.tenantId));

    const tracked = [
      'legalName',
      'tradeName',
      'country',
      'vatNumber',
      'eoriNumber',
      'lei',
      'gln',
      'gs1CompanyPrefix',
      'contactEmail',
      'website',
    ] as const;

    const changed: string[] = tracked.filter(
      (key) => (before[key] ?? null) !== (value[key] ?? null),
    );
    if (hasAddress !== Boolean(before.registeredAddress)) changed.push('registeredAddress');

    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: 'tenant.updated',
      subjectType: 'tenant',
      subjectId: session.tenantId,
      metadata: { fields: changed },
    });

    revalidatePath('/console/settings');
    return { ok: 'Workspace identity saved.' };
  } catch (error) {
    console.error('[settings] identity save failed', error);
    return { error: 'The changes could not be saved. Try again.' };
  }
}

/**
 * Save branding.
 *
 * Changing the custom domain clears its verification stamp, because a verified
 * flag that outlives the hostname it verified is worse than no flag: it would
 * let a brand point the passport at a domain nobody checked.
 */
export async function saveBranding(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can change branding.' };

  const parsed = brandingSchema.safeParse({
    accentColor: text(formData, 'accentColor'),
    displayFont: text(formData, 'displayFont'),
    logoUrl: text(formData, 'logoUrl'),
    logoDarkUrl: text(formData, 'logoDarkUrl'),
    faviconUrl: text(formData, 'faviconUrl'),
    footerText: text(formData, 'footerText'),
    supportUrl: text(formData, 'supportUrl'),
    customDomain: text(formData, 'customDomain'),
  });

  if (!parsed.success) {
    return { error: 'Some values need attention.', fieldErrors: issues(parsed.error) };
  }

  const value = parsed.data;

  try {
    const [existing] = await db
      .select({ customDomain: tenantBranding.customDomain })
      .from(tenantBranding)
      .where(eq(tenantBranding.tenantId, session.tenantId))
      .limit(1);

    const domainChanged = (existing?.customDomain ?? null) !== value.customDomain;

    await db
      .insert(tenantBranding)
      .values({
        tenantId: session.tenantId,
        ...value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tenantBranding.tenantId,
        set: {
          ...value,
          ...(domainChanged ? { customDomainVerifiedAt: null } : {}),
          updatedAt: new Date(),
        },
      });

    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: 'tenant.branding_updated',
      subjectType: 'tenant',
      subjectId: session.tenantId,
      metadata: {
        accentColor: value.accentColor,
        displayFont: value.displayFont,
        customDomain: value.customDomain,
        domainChanged,
      },
    });

    revalidatePath('/console/settings');
    return {
      ok: domainChanged && value.customDomain
        ? 'Branding saved. The new domain still needs to be verified before it serves passports.'
        : 'Branding saved.',
    };
  } catch (error) {
    console.error('[settings] branding save failed', error);
    return { error: 'The changes could not be saved. Try again.' };
  }
}
