import 'server-only';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  credentials,
  passportEvents,
  passportStatusHistory,
  passportVersions,
  passports,
  products,
  tenants,
  users,
} from '@/lib/db/schema';
import { canonicalHash } from '@/lib/crypto/canonical';
import { notFound } from '@/lib/api/errors';
import { normalizeDppId, passportUrl } from '@/lib/passport/identifier';
import { ACCESS_TIERS } from '@/lib/tier/types';

/**
 * The regulator evidence pack.
 *
 * What a market-surveillance authority asks for under Article 4 of the ESPR is
 * not a screenshot of a passport page. It is: show me what this product claimed,
 * show me every version of that claim and when it changed, show me who changed
 * it, show me the signed attestations, and show me that none of it has been
 * edited since. So the bundle carries all five, and a manifest whose
 * `bundleHash` is taken over the canonical form of everything else in it — so
 * the authority can hash the file they were sent, compare, and know they are
 * reading the bundle that was generated rather than one edited on the way.
 *
 * Everything is included at full fidelity. Access tiers govern what a *public*
 * reader sees; an authority is entitled to the complete record, and a pack that
 * quietly applied the public projection would be evidence of nothing.
 */

export const EVIDENCE_PACK_FORMAT = 'polytrail-evidence-pack/1.0';

export interface EvidencePack {
  manifest: {
    formatVersion: string;
    generatedAt: string;
    subject: string;
    bundleHash: string;
    hashAlgorithm: 'SHA-256';
    canonicalization: 'RFC 8785 (JCS)';
    contents: Record<string, number>;
    note: string;
  };
  issuer: Record<string, unknown>;
  passport: Record<string, unknown>;
  versions: Array<Record<string, unknown>>;
  statusHistory: Array<Record<string, unknown>>;
  lifecycleEvents: Array<Record<string, unknown>>;
  credentials: Array<Record<string, unknown>>;
  accessTiers: readonly string[];
}

export async function buildEvidencePack(tenantId: string, rawDppId: string): Promise<EvidencePack> {
  const dppId = normalizeDppId(rawDppId);

  const [row] = await db
    .select({ passport: passports, product: products, tenant: tenants })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .leftJoin(products, eq(products.id, passports.productId))
    .where(
      and(eq(passports.tenantId, tenantId), eq(passports.dppId, dppId), isNull(passports.deletedAt)),
    )
    .limit(1);

  if (!row) throw notFound('That passport does not exist in this workspace.');

  const { passport, product, tenant } = row;

  const [versionRows, historyRows, eventRows, credentialRows] = await Promise.all([
    db
      .select({
        version: passportVersions.version,
        payload: passportVersions.payload,
        dataHash: passportVersions.dataHash,
        credentialHash: passportVersions.credentialHash,
        changeReason: passportVersions.changeReason,
        createdAt: passportVersions.createdAt,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(passportVersions)
      .leftJoin(users, eq(users.id, passportVersions.createdBy))
      .where(eq(passportVersions.passportId, passport.id))
      .orderBy(asc(passportVersions.version)),

    db
      .select({
        fromStatus: passportStatusHistory.fromStatus,
        toStatus: passportStatusHistory.toStatus,
        reason: passportStatusHistory.reason,
        createdAt: passportStatusHistory.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(passportStatusHistory)
      .leftJoin(users, eq(users.id, passportStatusHistory.actorId))
      .where(eq(passportStatusHistory.passportId, passport.id))
      .orderBy(asc(passportStatusHistory.createdAt)),

    db
      .select()
      .from(passportEvents)
      .where(eq(passportEvents.passportId, passport.id))
      .orderBy(asc(passportEvents.occurredAt)),

    db
      .select()
      .from(credentials)
      .where(and(eq(credentials.tenantId, tenantId), eq(credentials.passportId, passport.id)))
      .orderBy(desc(credentials.createdAt)),
  ]);

  const body = {
    issuer: {
      legalName: tenant.legalName,
      tradeName: tenant.tradeName,
      country: tenant.country,
      did: tenant.did,
      website: tenant.website,
    },
    passport: {
      dppId: passport.dppId,
      passportUrl: passportUrl(passport.dppId),
      productName: product?.name ?? null,
      styleNumber: product?.styleNumber ?? null,
      category: product?.category ?? null,
      scope: passport.scope,
      gtin: passport.gtin,
      serialNumber: passport.serialNumber,
      batchNumber: passport.batchNumber,
      sku: passport.sku,
      colourName: passport.colourName,
      size: passport.size,
      status: passport.status,
      currentVersion: passport.currentVersion,
      publishedVersion: passport.publishedVersion,
      completeness: passport.completeness,
      publishedAt: iso(passport.publishedAt),
      placedOnMarketAt: iso(passport.placedOnMarketAt),
      recall:
        passport.status === 'recalled'
          ? {
              reason: passport.recallReason,
              severity: passport.recallSeverity,
              instructions: passport.recallInstructions,
              recalledAt: iso(passport.recalledAt),
            }
          : null,
      registry: {
        id: passport.registryId,
        url: passport.registryUrl,
        submittedAt: iso(passport.registrySubmittedAt),
      },
      createdAt: iso(passport.createdAt),
      updatedAt: iso(passport.updatedAt),
    },
    versions: versionRows.map((version) => ({
      version: version.version,
      dataHash: version.dataHash,
      credentialHash: version.credentialHash,
      changeReason: version.changeReason,
      createdAt: iso(version.createdAt),
      author: version.authorName ? { name: version.authorName, email: version.authorEmail } : null,
      // Re-derived here rather than trusted from the column. If the two
      // disagree the payload was altered in the database after it was written,
      // which is exactly the tampering this pack exists to make visible.
      recomputedHash: canonicalHash(version.payload),
      payload: version.payload,
    })),
    statusHistory: historyRows.map((entry) => ({
      from: entry.fromStatus,
      to: entry.toStatus,
      reason: entry.reason,
      at: iso(entry.createdAt),
      actor: entry.actorName ? { name: entry.actorName, email: entry.actorEmail } : null,
    })),
    lifecycleEvents: eventRows.map((event) => ({
      type: event.eventType,
      occurredAt: iso(event.occurredAt),
      summary: event.summary,
      details: event.details,
      location: event.location,
      visibility: event.visibility,
      recordedAt: iso(event.createdAt),
    })),
    credentials: credentialRows.map((credential) => ({
      id: credential.id,
      scheme: credential.scheme,
      credentialType: credential.credentialType,
      licenceNumber: credential.licenceNumber,
      scopeDescription: credential.scopeDescription,
      issuerName: credential.issuerName,
      issuerDid: credential.issuerDid,
      subjectDid: credential.subjectDid,
      status: credential.status,
      documentHash: credential.documentHash,
      validFrom: iso(credential.validFrom),
      validUntil: iso(credential.validUntil),
      revokedAt: iso(credential.revokedAt),
      revocationReason: credential.revocationReason,
      document: credential.document,
    })),
    accessTiers: ACCESS_TIERS,
  };

  const generatedAt = new Date().toISOString();

  return {
    manifest: {
      formatVersion: EVIDENCE_PACK_FORMAT,
      generatedAt,
      subject: passportUrl(passport.dppId),
      // Over the body only. Including the manifest would be self-referential,
      // and including `generatedAt` would make the hash of an unchanged
      // passport differ on every download, which defeats comparison.
      bundleHash: canonicalHash(body),
      hashAlgorithm: 'SHA-256',
      canonicalization: 'RFC 8785 (JCS)',
      contents: {
        versions: body.versions.length,
        statusTransitions: body.statusHistory.length,
        lifecycleEvents: body.lifecycleEvents.length,
        credentials: body.credentials.length,
      },
      note: 'bundleHash is the SHA-256 of the RFC 8785 canonical form of every key in this document except `manifest`. Recompute it to confirm the bundle is unaltered. Version payloads are the complete record, not the public projection.',
    },
    ...body,
  };
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
