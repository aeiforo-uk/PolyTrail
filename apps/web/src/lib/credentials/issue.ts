import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { credentials, passportVersions, passports, tenants } from '@/lib/db/schema';
import { notFound, unprocessable } from '@/lib/api/errors';
import { passportUrl } from '@/lib/passport/identifier';
import type { PassportPayload } from '@/lib/passport/schema';
import { projectForTier } from '@/lib/tier/project';
import { recordAuditSafe } from '@/lib/audit/record';
import { dispatchWebhook } from '@/lib/webhooks/dispatch';
import { DEFAULT_MECHANISM, getIntegrityProvider, type IntegrityMechanism } from './integrity';
import { signingMaterial } from './keys';
import './providers/w3c-vc-jose';
import './providers/declared';

/**
 * Issue a verifiable credential over a passport version.
 *
 * What gets signed is deliberately not the whole passport. It is the version's
 * canonical hash plus the public-tier projection — so the credential is small
 * enough to move around, proves the passport's integrity against a digest
 * anyone can recompute, and carries no field that the access-tier rules would
 * withhold from the person holding it. Signing the restricted data and then
 * relying on the recipient not to read it is not access control.
 */

export const DPP_CREDENTIAL_SCHEME = 'POLYTRAIL_DPP';
export const DPP_CREDENTIAL_TYPE = 'DigitalProductPassportCredential';

export interface IssueOptions {
  /** Defaults to the published version, falling back to the current one. */
  version?: number;
  /** Days until expiry. Omit for a credential with no expiry. */
  validForDays?: number;
  mechanism?: IntegrityMechanism;
  actor?: { userId: string | null; label: string };
}

export interface IssuedCredential {
  id: string;
  document: Record<string, unknown>;
  documentHash: string;
  mechanism: IntegrityMechanism;
  issuerDid: string;
  subject: string;
  version: number;
  validFrom: Date;
  validUntil: Date | null;
}

export async function issuePassportCredential(
  tenantId: string,
  passportId: string,
  options: IssueOptions = {},
): Promise<IssuedCredential> {
  const [row] = await db
    .select({ passport: passports, tenant: tenants })
    .from(passports)
    .innerJoin(tenants, eq(tenants.id, passports.tenantId))
    .where(
      and(eq(passports.id, passportId), eq(passports.tenantId, tenantId), isNull(passports.deletedAt)),
    )
    .limit(1);

  if (!row) throw notFound('That passport does not exist in this workspace.');

  const { passport, tenant } = row;
  const version = options.version ?? passport.publishedVersion ?? passport.currentVersion;

  const [versionRow] = await db
    .select()
    .from(passportVersions)
    .where(and(eq(passportVersions.passportId, passport.id), eq(passportVersions.version, version)))
    .limit(1);

  if (!versionRow) {
    throw unprocessable(`Version ${version} of this passport does not exist.`);
  }

  const material = await signingMaterial(tenantId);
  const mechanism = options.mechanism ?? DEFAULT_MECHANISM;
  const provider = getIntegrityProvider(mechanism);

  const subject = passportUrl(passport.dppId);
  const validFrom = new Date();
  const validUntil = options.validForDays
    ? new Date(validFrom.getTime() + options.validForDays * 86_400_000)
    : null;

  const { data: publicClaims } = projectForTier(
    versionRow.payload as unknown as PassportPayload,
    'public',
  );

  const credential: Record<string, unknown> = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      // Inline term definitions rather than a hosted context file, so the
      // credential stays verifiable if this domain ever stops serving one.
      {
        DigitalProductPassportCredential: 'https://schema.org/Product',
        dppId: 'https://schema.org/identifier',
        passportVersion: 'https://schema.org/version',
        integrity: 'https://schema.org/identifier',
        productName: 'https://schema.org/name',
        brandName: 'https://schema.org/brand',
      },
    ],
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', DPP_CREDENTIAL_TYPE],
    issuer: {
      id: material.issuerDid,
      name: tenant.tradeName ?? tenant.legalName,
    },
    validFrom: validFrom.toISOString(),
    ...(validUntil ? { validUntil: validUntil.toISOString() } : {}),
    credentialSubject: {
      id: subject,
      type: 'DigitalProductPassport',
      dppId: passport.dppId,
      passportVersion: version,
      status: passport.status,
      integrity: {
        algorithm: 'SHA-256',
        canonicalization: 'RFC 8785 (JCS)',
        // The digest of the full version payload, including the fields this
        // credential does not carry. That is the point: a holder with the
        // restricted data can prove it belongs to this passport, and a holder
        // without it can still prove the public part has not been edited.
        hash: versionRow.dataHash,
      },
      claims: publicClaims,
    },
  };

  const envelope = await provider.sign(credential, material);

  const [stored] = await db
    .insert(credentials)
    .values({
      tenantId,
      passportId: passport.id,
      scheme: DPP_CREDENTIAL_SCHEME,
      credentialType: DPP_CREDENTIAL_TYPE,
      scopeDescription: `Passport ${passport.dppId} version ${version}`,
      issuerName: tenant.tradeName ?? tenant.legalName,
      issuerDid: material.issuerDid,
      subjectDid: subject,
      document: envelope.document,
      documentHash: envelope.documentHash,
      status: 'active',
      validFrom,
      validUntil,
      lastVerifiedAt: validFrom,
    })
    .returning({ id: credentials.id });

  // The version row carries the hash of its credential so that "is this
  // version attested?" is answerable without joining through the credential
  // table and guessing which row is the current one.
  await db
    .update(passportVersions)
    .set({ credentialHash: envelope.documentHash })
    .where(eq(passportVersions.id, versionRow.id));

  await recordAuditSafe({
    tenantId,
    actorId: options.actor?.userId ?? null,
    actorLabel: options.actor?.label ?? 'System',
    action: 'credential.issued',
    subjectType: 'credential',
    subjectId: stored!.id,
    metadata: {
      dppId: passport.dppId,
      version,
      mechanism,
      issuerDid: material.issuerDid,
      documentHash: envelope.documentHash,
    },
  });

  await dispatchWebhook(tenantId, 'credential.issued', {
    credentialId: stored!.id,
    dppId: passport.dppId,
    version,
    mechanism,
    issuerDid: material.issuerDid,
    documentHash: envelope.documentHash,
    validUntil: validUntil?.toISOString() ?? null,
  });

  return {
    id: stored!.id,
    document: envelope.document,
    documentHash: envelope.documentHash,
    mechanism,
    issuerDid: material.issuerDid,
    subject,
    version,
    validFrom,
    validUntil,
  };
}

export interface CredentialSummary {
  id: string;
  scheme: string;
  credentialType: string;
  issuerName: string;
  issuerDid: string | null;
  subjectDid: string | null;
  status: string;
  documentHash: string;
  validFrom: Date | null;
  validUntil: Date | null;
  revokedAt: Date | null;
  document: Record<string, unknown>;
  createdAt: Date;
}

export async function listPassportCredentials(
  tenantId: string,
  passportId: string,
): Promise<CredentialSummary[]> {
  return db
    .select({
      id: credentials.id,
      scheme: credentials.scheme,
      credentialType: credentials.credentialType,
      issuerName: credentials.issuerName,
      issuerDid: credentials.issuerDid,
      subjectDid: credentials.subjectDid,
      status: credentials.status,
      documentHash: credentials.documentHash,
      validFrom: credentials.validFrom,
      validUntil: credentials.validUntil,
      revokedAt: credentials.revokedAt,
      document: credentials.document,
      createdAt: credentials.createdAt,
    })
    .from(credentials)
    .where(and(eq(credentials.tenantId, tenantId), eq(credentials.passportId, passportId)))
    .orderBy(desc(credentials.createdAt));
}
