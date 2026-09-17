import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { passportVersions, passports, tenants } from '@/lib/db/schema';
import { currentVerificationLevel } from '@/lib/verification/service';
import type { VerificationLevel } from '@/lib/verification/types';
import { describeRegistryEndpoint } from './client';
import { buildRegistryRecord } from './record';
import { checkRegistryReadiness } from './preflight';
import { proofHealth, type ProofHealth, type RegistryEndpointDescription } from './types';

/**
 * Filing status for every passport in a workspace.
 *
 * One query, then the envelope is rebuilt in memory per passport so the console
 * can show readiness without a round-trip per row. Rebuilding is cheap — it is
 * a hash and some string work — and it means the list and the detail view can
 * never disagree about whether something is ready to file.
 */

export interface FilingRow {
  dppId: string;
  productName: string;
  status: string;
  scope: string;
  version: number;
  registryId: string | null;
  registryUrl: string | null;
  submittedAt: string | null;
  /** Null until a filing exists; 90 days after `submittedAt` once it does. */
  proofExpiresAt: string | null;
  proofHealth: ProofHealth | null;
  /** True when the passport has changed since it was filed. */
  staleFiling: boolean;
  blockingIssues: number;
  firstIssue: string | null;
  readyToFile: boolean;
}

export interface FilingOverview {
  endpoint: RegistryEndpointDescription;
  verificationLevel: VerificationLevel;
  rows: FilingRow[];
  counts: { filed: number; expiring: number; expired: number; ready: number; blocked: number };
}

function localise(payload: Record<string, unknown>): string {
  const identity = payload.identity;
  if (identity && typeof identity === 'object') {
    const name = (identity as Record<string, unknown>).productName;
    if (name && typeof name === 'object') {
      const en = (name as Record<string, unknown>).en;
      if (typeof en === 'string' && en) return en;
      const first = Object.values(name as Record<string, unknown>).find(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      if (first) return first;
    }
  }
  return 'Untitled passport';
}

export async function getFilingOverview(tenantId: string): Promise<FilingOverview> {
  const endpoint = describeRegistryEndpoint();
  const verificationLevel = await currentVerificationLevel(tenantId);

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    return {
      endpoint,
      verificationLevel,
      rows: [],
      counts: { filed: 0, expiring: 0, expired: 0, ready: 0, blocked: 0 },
    };
  }

  const candidates = await db
    .select({ passport: passports, version: passportVersions })
    .from(passports)
    .innerJoin(
      passportVersions,
      and(
        eq(passportVersions.passportId, passports.id),
        // The version the public URL serves is the one the Registry would be
        // pointed at, so it is the one whose hash gets filed.
        eq(passportVersions.version, passports.publishedVersion),
      ),
    )
    .where(and(eq(passports.tenantId, tenantId), isNull(passports.deletedAt)))
    .orderBy(desc(passports.updatedAt))
    .limit(500);

  const rows: FilingRow[] = candidates.map(({ passport, version }) => {
    const record = buildRegistryRecord(
      {
        dppId: passport.dppId,
        scope: passport.scope,
        gtin: passport.gtin,
        serialNumber: passport.serialNumber,
        batchNumber: passport.batchNumber,
      },
      { version: version.version, dataHash: version.dataHash, payload: version.payload },
      {
        legalName: tenant.legalName,
        tradeName: tenant.tradeName,
        country: tenant.country,
        lei: tenant.lei,
        eoriNumber: tenant.eoriNumber,
        gln: tenant.gln,
        did: tenant.did,
      },
    );

    const readiness = checkRegistryReadiness({
      record,
      passportStatus: passport.status,
      verificationLevel,
      authoritative: endpoint.authoritative,
    });

    const submittedAt = passport.registrySubmittedAt;
    const expiresAt = submittedAt
      ? new Date(submittedAt.getTime() + 90 * 86_400_000).toISOString()
      : null;

    return {
      dppId: passport.dppId,
      productName: localise(version.payload),
      status: passport.status,
      scope: passport.scope,
      version: version.version,
      registryId: passport.registryId,
      registryUrl: passport.registryUrl,
      submittedAt: submittedAt?.toISOString() ?? null,
      proofExpiresAt: expiresAt,
      proofHealth: expiresAt ? proofHealth(expiresAt) : null,
      // A filing made before the current published version is a filing that
      // points at a hash the passport no longer has. That is a re-file, not a
      // cosmetic staleness warning.
      staleFiling: Boolean(submittedAt && passport.updatedAt.getTime() > submittedAt.getTime()),
      blockingIssues: readiness.issues.length,
      firstIssue: readiness.issues[0]?.label ?? null,
      readyToFile: readiness.ok,
    };
  });

  return {
    endpoint,
    verificationLevel,
    rows,
    counts: {
      filed: rows.filter((row) => row.registryId).length,
      expiring: rows.filter((row) => row.proofHealth === 'expiring').length,
      expired: rows.filter((row) => row.proofHealth === 'expired').length,
      ready: rows.filter((row) => row.readyToFile && !row.registryId).length,
      blocked: rows.filter((row) => !row.readyToFile).length,
    },
  };
}
