import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { passportVersions, passports, tenants } from '@/lib/db/schema';
import { conflict, forbidden, notFound } from '@/lib/api/errors';
import { normalizeDppId } from '@/lib/passport/identifier';
import type { Session } from '@/lib/auth/session';
import { currentVerificationLevel } from '@/lib/verification/service';
import { recordExtendedAudit } from '@/lib/verification/audit';
import { requireStepUp } from '@/lib/mfa/service';
import { describeRegistryEndpoint, getRegistryClient } from './client';
import { buildRegistryRecord, idempotencyKeyFor } from './record';
import { checkRegistryReadiness, type RegistryReadiness } from './preflight';
import {
  RegistryError,
  type RegistryEndpointDescription,
  type RegistryRecord,
  type RegistryStatusResult,
} from './types';

/**
 * Filing a passport with the EU DPP Registry.
 *
 * The order matters and is the whole point of the module: build the envelope,
 * refuse it if it is incomplete, derive an idempotency key from its content,
 * then submit. Anything that can be refused is refused before a request leaves
 * the building, so a rejection costs the brand a form field rather than a
 * support ticket with the Commission.
 */

export interface PreparedSubmission {
  record: RegistryRecord;
  readiness: RegistryReadiness;
  endpoint: RegistryEndpointDescription;
  idempotencyKey: string;
  passport: {
    id: string;
    dppId: string;
    status: string;
    registryId: string | null;
    registryUrl: string | null;
    registrySubmittedAt: string | null;
  };
}

/**
 * Build and check a submission without sending it.
 *
 * Used by the console to show a brand exactly what would be filed before they
 * file it, and by `submitPassport` so that the preview and the filing cannot
 * drift apart.
 */
export async function prepareSubmission(
  tenantId: string,
  rawDppId: string,
): Promise<PreparedSubmission> {
  const dppId = normalizeDppId(rawDppId);

  const [row] = await db
    .select({ passport: passports, tenant: tenants })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .where(
      and(
        eq(passports.dppId, dppId),
        // Tenant-scoped: a passport id from another workspace must resolve to
        // nothing, not to a permission error that confirms it exists.
        eq(passports.tenantId, tenantId),
        isNull(passports.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw notFound('That passport does not exist in this workspace.');

  const { passport, tenant } = row;
  const versionNumber = passport.publishedVersion ?? passport.currentVersion;

  const [version] = await db
    .select()
    .from(passportVersions)
    .where(
      and(
        eq(passportVersions.passportId, passport.id),
        eq(passportVersions.version, versionNumber),
      ),
    )
    .limit(1);

  if (!version) {
    throw conflict('This passport has no saved version yet, so there is nothing to register.');
  }

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

  const endpoint = describeRegistryEndpoint();
  const readiness = checkRegistryReadiness({
    record,
    passportStatus: passport.status,
    verificationLevel: await currentVerificationLevel(tenantId),
    authoritative: endpoint.authoritative,
  });

  return {
    record,
    readiness,
    endpoint,
    idempotencyKey: idempotencyKeyFor(record),
    passport: {
      id: passport.id,
      dppId: passport.dppId,
      status: passport.status,
      registryId: passport.registryId,
      registryUrl: passport.registryUrl,
      registrySubmittedAt: passport.registrySubmittedAt?.toISOString() ?? null,
    },
  };
}

export interface SubmissionOutcome {
  registryId: string;
  registryUrl: string;
  issuedAt: string;
  expiresAt: string;
  endpoint: RegistryEndpointDescription;
  resubmission: boolean;
}

export async function submitPassport(
  session: Session,
  rawDppId: string,
): Promise<SubmissionOutcome> {
  const tenantId = requireTenant(session);
  requireFilingRole(session);

  const prepared = await prepareSubmission(tenantId, rawDppId);

  if (!prepared.readiness.ok) {
    // Refusals are audited too. "Why did nobody file this?" is a question a
    // compliance officer will eventually be asked, and the answer should be in
    // the same chain as the filings themselves.
    await recordExtendedAudit({
      tenantId,
      actorId: session.userId,
      actorLabel: session.name || session.email,
      action: 'registry.submission_refused',
      subjectType: 'passport',
      subjectId: prepared.passport.dppId,
      metadata: { issues: prepared.readiness.issues.map((issue) => issue.field) },
    });

    const first = prepared.readiness.issues[0];
    throw new RegistryError(
      'NOT_READY',
      `${prepared.readiness.issues.length} thing${prepared.readiness.issues.length === 1 ? '' : 's'} must be fixed before this can be filed. ${first?.label}: ${first?.detail}`,
      prepared.readiness.issues,
    );
  }

  const client = getRegistryClient();
  const receipt = await client.submit(prepared.record, {
    idempotencyKey: prepared.idempotencyKey,
  });

  const submittedAt = new Date(receipt.proof.issuedAt);
  await db
    .update(passports)
    .set({
      registryId: receipt.proof.registryId,
      registryUrl: receipt.proof.registryUrl,
      registrySubmittedAt: submittedAt,
    })
    .where(and(eq(passports.id, prepared.passport.id), eq(passports.tenantId, tenantId)));

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'registry.submitted',
    subjectType: 'passport',
    subjectId: prepared.passport.dppId,
    metadata: {
      registryId: receipt.proof.registryId,
      versionHash: prepared.record.versionHash,
      version: prepared.record.version,
      endpointMode: receipt.endpoint.mode,
      authoritative: receipt.endpoint.authoritative,
      expiresAt: receipt.proof.expiresAt,
    },
  });

  return {
    registryId: receipt.proof.registryId,
    registryUrl: receipt.proof.registryUrl,
    issuedAt: receipt.proof.issuedAt,
    expiresAt: receipt.proof.expiresAt,
    endpoint: receipt.endpoint,
    resubmission: prepared.passport.registryId != null,
  };
}

export async function checkSubmissionStatus(
  session: Session,
  rawDppId: string,
): Promise<RegistryStatusResult> {
  const tenantId = requireTenant(session);
  const dppId = normalizeDppId(rawDppId);

  const [row] = await db
    .select({ registryId: passports.registryId })
    .from(passports)
    .where(and(eq(passports.dppId, dppId), eq(passports.tenantId, tenantId)))
    .limit(1);

  if (!row) throw notFound('That passport does not exist in this workspace.');
  if (!row.registryId) throw conflict('This passport has not been filed, so it has no status.');

  const status = await getRegistryClient().status(row.registryId);

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'registry.status_checked',
    subjectType: 'passport',
    subjectId: dppId,
    metadata: { registryId: row.registryId, state: status.state },
  });

  return status;
}

export async function withdrawSubmission(
  session: Session,
  rawDppId: string,
  reason: string,
): Promise<void> {
  const tenantId = requireTenant(session);
  requireFilingRole(session);

  // Withdrawing a registration is the one irreversible thing on this screen, so
  // a user who has a second factor is asked to prove it again. Silent for
  // everyone else — the point is to re-prove a factor that exists.
  await requireStepUp(session, 'Withdrawing a Registry filing');

  if (!reason.trim()) {
    throw conflict('Give a reason for the withdrawal. The Registry records one, and so do we.');
  }

  const dppId = normalizeDppId(rawDppId);
  const [row] = await db
    .select({ id: passports.id, registryId: passports.registryId })
    .from(passports)
    .where(and(eq(passports.dppId, dppId), eq(passports.tenantId, tenantId)))
    .limit(1);

  if (!row) throw notFound('That passport does not exist in this workspace.');
  if (!row.registryId) throw conflict('This passport is not filed, so there is nothing to withdraw.');

  await getRegistryClient().withdraw(row.registryId, reason.slice(0, 500));

  // The columns are cleared, but the audit entry keeps the identifier: a
  // withdrawn registration still happened, and a regulator is entitled to see
  // that it did.
  await db
    .update(passports)
    .set({ registryId: null, registryUrl: null, registrySubmittedAt: null })
    .where(and(eq(passports.id, row.id), eq(passports.tenantId, tenantId)));

  await recordExtendedAudit({
    tenantId,
    actorId: session.userId,
    actorLabel: session.name || session.email,
    action: 'registry.withdrawn',
    subjectType: 'passport',
    subjectId: dppId,
    metadata: { registryId: row.registryId, reason: reason.slice(0, 500) },
  });
}

function requireTenant(session: Session): string {
  if (!session.tenantId) throw forbidden('Your account is not attached to a workspace.');
  return session.tenantId;
}

/**
 * Filing is a declaration to a regulator, so it sits with the people who are
 * accountable for one — not with everyone who can edit a product record.
 */
function requireFilingRole(session: Session): void {
  if (session.role !== 'BRAND_ADMIN' && session.role !== 'COMPLIANCE_OFFICER') {
    throw forbidden(
      'Filing with the Registry is a declaration on behalf of the operator, so it is limited to a brand admin or compliance officer.',
    );
  }
}
