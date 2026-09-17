import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { calculateJwkThumbprint, exportJWK, generateKeyPair, type JWK } from 'jose';
import { db } from '@/lib/db/client';
import { signingKeys } from '@/lib/db/schema';
import { notFound } from '@/lib/api/errors';
import type { SigningKeyMaterial } from './integrity';
import { tenantDid } from './did';

/**
 * Per-tenant signing keys.
 *
 * Each workspace signs its own credentials. A platform that signs everything
 * with one key is asserting, cryptographically, that every claim on every
 * passport it hosts came from the same legal person — which is false, and
 * becomes actionable the moment a brand's claim is disputed. The DID in a
 * credential should name the brand.
 *
 * Private keys are stored wrapped, never in the clear, and never leave this
 * module. `custody = 'external'` is the escape hatch for a customer who insists
 * their key lives in their own HSM; those rows carry no wrapped key at all and
 * signing for them is not implemented here.
 */

const ALGORITHM = 'ES256';
const WRAP_VERSION = 'v1';
const GCM_IV_BYTES = 12;

/**
 * Derive the key-encryption key from an environment secret.
 *
 * HKDF rather than using the secret directly, so the secret can be any
 * sufficiently random string rather than exactly 32 bytes, and so the same
 * secret could later derive separate keys for separate purposes without
 * reusing key material across them.
 */
function keyEncryptionKey(): Buffer {
  const secret = process.env.CREDENTIAL_KEY_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'CREDENTIAL_KEY_SECRET must be set to at least 32 characters before credentials can be signed. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'polytrail:signing-key-wrap', 32),
  );
}

/**
 * Wrap a private JWK with AES-256-GCM.
 *
 * The tenant ID is authenticated additional data, not just a column value, so a
 * wrapped key copied from one tenant's row into another's fails to decrypt
 * rather than quietly signing that tenant's credentials.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 */
export function wrapPrivateJwk(jwk: JWK, tenantId: string): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(tenantId, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(jwk), 'utf8'),
    cipher.final(),
  ]);
  return [
    WRAP_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function unwrapPrivateJwk(envelope: string, tenantId: string): JWK {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== WRAP_VERSION) {
    throw new Error('The stored signing key is not in a format this build understands.');
  }
  const [, ivB64, tagB64, ciphertextB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyEncryptionKey(),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAAD(Buffer.from(tenantId, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as JWK;
}

export interface SigningKeyRecord {
  id: string;
  tenantId: string;
  did: string;
  keyId: string;
  algorithm: string;
  publicJwk: Record<string, unknown>;
  /** AES-256-GCM envelope. Null when custody is delegated to an external KMS. */
  encryptedPrivateJwk: string | null;
  custody: string;
  active: boolean;
  rotatedAt: Date | null;
  createdAt: Date;
}

/**
 * The tenant's active signing key, generating one on first use.
 *
 * Generated lazily rather than at workspace creation because most workspaces
 * never issue a credential, and an unused private key is a liability with no
 * corresponding benefit.
 */
export async function ensureTenantSigningKey(tenantId: string): Promise<SigningKeyRecord> {
  const existing = await activeSigningKey(tenantId);
  if (existing) return existing;
  return generateTenantSigningKey(tenantId);
}

export async function activeSigningKey(tenantId: string): Promise<SigningKeyRecord | null> {
  const [row] = await db
    .select()
    .from(signingKeys)
    .where(and(eq(signingKeys.tenantId, tenantId), eq(signingKeys.active, true)))
    .orderBy(desc(signingKeys.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listSigningKeys(tenantId: string): Promise<SigningKeyRecord[]> {
  return db
    .select()
    .from(signingKeys)
    .where(eq(signingKeys.tenantId, tenantId))
    .orderBy(desc(signingKeys.createdAt));
}

async function generateTenantSigningKey(tenantId: string): Promise<SigningKeyRecord> {
  const did = tenantDid(tenantId);
  const { publicKey, privateKey } = await generateKeyPair(ALGORITHM, { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);

  // RFC 7638 thumbprint as the key fragment: stable, derived from the key
  // itself, so the same key always has the same identifier and a verifier can
  // check that the `kid` actually belongs to the key it resolved.
  const thumbprint = await calculateJwkThumbprint(publicJwk, 'sha256');
  const keyId = `${did}#${thumbprint}`;

  const [row] = await db
    .insert(signingKeys)
    .values({
      tenantId,
      did,
      keyId,
      algorithm: ALGORITHM,
      publicJwk: { ...publicJwk, kid: thumbprint, alg: ALGORITHM, use: 'sig' },
      encryptedPrivateJwk: wrapPrivateJwk({ ...privateJwk, kid: thumbprint, alg: ALGORITHM }, tenantId),
      custody: 'platform',
      active: true,
    })
    .returning();

  return row!;
}

/**
 * Rotate.
 *
 * The old key is deactivated but kept, because credentials it signed remain
 * valid and remain verifiable only while its public half is still published in
 * the DID document. Rotation that deletes the old key silently invalidates
 * every credential ever issued — which is why `did.json` serves every
 * non-revoked key as a verification method and names only the newest in
 * `assertionMethod`.
 */
export async function rotateTenantSigningKey(tenantId: string): Promise<SigningKeyRecord> {
  await db
    .update(signingKeys)
    .set({ active: false, rotatedAt: new Date() })
    .where(and(eq(signingKeys.tenantId, tenantId), eq(signingKeys.active, true)));
  return generateTenantSigningKey(tenantId);
}

/** Unwrap a key for signing. The only place a private JWK becomes readable. */
export async function signingMaterial(tenantId: string): Promise<SigningKeyMaterial> {
  const record = await ensureTenantSigningKey(tenantId);
  if (record.custody !== 'platform' || !record.encryptedPrivateJwk) {
    throw notFound(
      'This workspace holds its signing key in an external KMS. Signing through Polytrail is not available for it.',
    );
  }
  return {
    issuerDid: record.did,
    keyId: record.keyId,
    algorithm: record.algorithm,
    privateJwk: unwrapPrivateJwk(record.encryptedPrivateJwk, tenantId),
    publicJwk: record.publicJwk as unknown as JWK,
  };
}

/**
 * Resolve a verification method to a public key, for the verifier.
 *
 * Looks only in this platform's own key table. Deliberately no outbound fetch:
 * a verify endpoint that resolves arbitrary `did:web` identifiers is a
 * server-side request forgery primitive wearing a standards badge. A holder
 * verifying a third party's credential should resolve that issuer's DID
 * document themselves.
 */
export async function resolvePlatformKey(
  keyId: string,
): Promise<{ publicJwk: JWK; algorithm: string } | null> {
  const [row] = await db
    .select({ publicJwk: signingKeys.publicJwk, algorithm: signingKeys.algorithm })
    .from(signingKeys)
    .where(eq(signingKeys.keyId, keyId))
    .limit(1);
  if (!row) return null;
  return { publicJwk: row.publicJwk as unknown as JWK, algorithm: row.algorithm };
}

export { ALGORITHM as SIGNING_ALGORITHM };
