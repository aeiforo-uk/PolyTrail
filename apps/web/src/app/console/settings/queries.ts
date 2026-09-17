import 'server-only';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { passports, tenantBranding, tenants } from '@/lib/db/schema';
import { resolveBranding, type Branding } from '@/lib/branding';

export interface WorkspaceSettings {
  tenant: typeof tenants.$inferSelect;
  branding: Branding;
  usage: {
    plan: string;
    quota: number;
    /** Every passport that exists, published or not — quota is counted on creation. */
    used: number;
    published: number;
  };
}

export async function getSettings(tenantId: string): Promise<WorkspaceSettings | null> {
  const [[tenant], [branding], [usage]] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    db.select().from(tenantBranding).where(eq(tenantBranding.tenantId, tenantId)).limit(1),
    db
      .select({
        used: count(),
        published: sql<number>`count(*) filter (where ${passports.status} = 'published')`.mapWith(
          Number,
        ),
      })
      .from(passports)
      .where(and(eq(passports.tenantId, tenantId), isNull(passports.deletedAt))),
  ]);

  if (!tenant) return null;

  return {
    tenant,
    branding: resolveBranding(
      branding
        ? {
            accentColor: branding.accentColor,
            displayFont: branding.displayFont,
            logoUrl: branding.logoUrl,
            logoDarkUrl: branding.logoDarkUrl,
            faviconUrl: branding.faviconUrl,
            footerText: branding.footerText,
            supportUrl: branding.supportUrl,
            customDomain: branding.customDomain,
          }
        : null,
    ),
    usage: {
      plan: tenant.plan,
      quota: tenant.passportQuota,
      used: usage?.used ?? 0,
      published: usage?.published ?? 0,
    },
  };
}

/** Whether the custom domain has been verified, which the settings page reports but cannot change. */
export async function getDomainVerification(tenantId: string): Promise<Date | null> {
  const [row] = await db
    .select({ verifiedAt: tenantBranding.customDomainVerifiedAt })
    .from(tenantBranding)
    .where(eq(tenantBranding.tenantId, tenantId))
    .limit(1);
  return row?.verifiedAt ?? null;
}
