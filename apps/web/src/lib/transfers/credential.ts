import 'server-only';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MECHANISM, getIntegrityProvider } from '@/lib/credentials';
import { signingMaterial } from '@/lib/credentials/keys';
import { passportUrl } from '@/lib/passport/identifier';
import { TRANSFER_REASON_META, type TransferReason } from './types';

/**
 * The two halves of a transfer, each signed by the party that made the claim.
 *
 * The sender says "I am handing this over, for this reason, on this date". The
 * receiver says "I took it, and I accept what it obliges me to". Both are
 * stored verbatim on the transfer row, which is the whole point: a dispute six
 * months later is settled by reading two signed statements, not by asking two
 * companies what they remember agreeing to.
 *
 * Neither credential carries passport content. It carries the passport's
 * identifier and the hash of the version in force at the time, so a holder can
 * prove the item and the state it was in without the credential becoming a
 * second, stale copy of the record.
 */

export const TRANSFER_CREDENTIAL_TYPE = 'PassportOwnershipTransferCredential';
export const ACCEPTANCE_CREDENTIAL_TYPE = 'PassportOwnershipAcceptanceCredential';

/** Inline terms rather than a hosted context, so the credential outlives this domain. */
const CONTEXT = [
  'https://www.w3.org/ns/credentials/v2',
  {
    PassportOwnershipTransferCredential: 'https://schema.org/Action',
    PassportOwnershipAcceptanceCredential: 'https://schema.org/AcceptAction',
    dppId: 'https://schema.org/identifier',
    passportVersion: 'https://schema.org/version',
    reason: 'https://schema.org/description',
  },
] as const;

export interface TransferClaimInput {
  transferId: string;
  dppId: string;
  passportVersion: number | null;
  passportDataHash: string | null;
  reason: TransferReason;
  note: string | null;
  fromName: string;
  fromTenantId: string;
  /** Null while the recipient is identified only by email. */
  toTenantId: string | null;
  toEmail: string | null;
  at: Date;
  expiresAt: Date | null;
}

export function buildTransferCredential(input: TransferClaimInput): Record<string, unknown> {
  const meta = TRANSFER_REASON_META[input.reason];
  return {
    '@context': CONTEXT,
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', TRANSFER_CREDENTIAL_TYPE],
    issuer: { id: `urn:polytrail:tenant:${input.fromTenantId}`, name: input.fromName },
    validFrom: input.at.toISOString(),
    ...(input.expiresAt ? { validUntil: input.expiresAt.toISOString() } : {}),
    credentialSubject: {
      id: passportUrl(input.dppId),
      type: 'PassportOwnershipTransfer',
      transferId: input.transferId,
      dppId: input.dppId,
      ...(input.passportVersion != null ? { passportVersion: input.passportVersion } : {}),
      ...(input.passportDataHash
        ? {
            integrity: {
              algorithm: 'SHA-256',
              canonicalization: 'RFC 8785 (JCS)',
              hash: input.passportDataHash,
            },
          }
        : {}),
      reason: input.reason,
      reasonLabel: meta.label,
      // The access the recipient gains is part of the offer, so it is signed
      // rather than left to whatever the UI happened to say on the day.
      grantsTier: meta.tier,
      becomesBrandOfRecord: meta.becomesBrandOfRecord,
      from: { tenantId: input.fromTenantId, name: input.fromName },
      to: {
        ...(input.toTenantId ? { tenantId: input.toTenantId } : {}),
        ...(input.toEmail ? { email: input.toEmail } : {}),
      },
      ...(input.note ? { note: input.note } : {}),
      initiatedAt: input.at.toISOString(),
    },
  };
}

export interface AcceptanceClaimInput {
  transferId: string;
  dppId: string;
  reason: TransferReason;
  acceptedAt: Date;
  acceptorTenantId: string;
  acceptorName: string;
  acceptorEmail: string;
  /** Hash of the sender's stored credential, so the pair is provably a pair. */
  transferCredentialHash: string | null;
}

export function buildAcceptanceCredential(input: AcceptanceClaimInput): Record<string, unknown> {
  const meta = TRANSFER_REASON_META[input.reason];
  return {
    '@context': CONTEXT,
    id: `urn:uuid:${randomUUID()}`,
    type: ['VerifiableCredential', ACCEPTANCE_CREDENTIAL_TYPE],
    issuer: {
      id: `urn:polytrail:tenant:${input.acceptorTenantId}`,
      name: input.acceptorName,
    },
    validFrom: input.acceptedAt.toISOString(),
    credentialSubject: {
      id: passportUrl(input.dppId),
      type: 'PassportOwnershipAcceptance',
      transferId: input.transferId,
      dppId: input.dppId,
      reason: input.reason,
      acceptedTier: meta.tier,
      acceptedAt: input.acceptedAt.toISOString(),
      acceptedBy: {
        tenantId: input.acceptorTenantId,
        name: input.acceptorName,
        email: input.acceptorEmail,
      },
      ...(input.transferCredentialHash
        ? { transferCredentialHash: input.transferCredentialHash }
        : {}),
      // Spelled out because the recipient is agreeing to it, and a claim nobody
      // can read is not a claim anybody consented to.
      undertaking: meta.grants,
    },
  };
}

export interface SealedCredential {
  document: Record<string, unknown>;
  documentHash: string;
}

/**
 * Sign a credential with the tenant's own key.
 *
 * Falls back to storing the unsigned claim when the workspace holds its key in
 * an external KMS we cannot reach. That is a deliberate downgrade, flagged in
 * the stored document: refusing the transfer outright would strand a real
 * handover over a key-custody detail, and a recorded-but-unsigned statement is
 * still better evidence than nothing at all.
 */
export async function sealCredential(
  tenantId: string,
  credential: Record<string, unknown>,
): Promise<SealedCredential> {
  try {
    const material = await signingMaterial(tenantId);
    const provider = getIntegrityProvider(DEFAULT_MECHANISM);
    const envelope = await provider.sign(credential, material);
    return { document: envelope.document, documentHash: envelope.documentHash };
  } catch (error) {
    console.error('[transfers] could not sign transfer credential', { tenantId, error });
    const { canonicalHash } = await import('@/lib/crypto/canonical');
    const document = { ...credential, proof: null, unsignedReason: 'signing_key_unavailable' };
    return { document, documentHash: canonicalHash(document) };
  }
}
