import {
  CompactSign,
  compactVerify,
  decodeProtectedHeader,
  importJWK,
  type JWK,
} from 'jose';
import { canonicalHash } from '@/lib/crypto/canonical';
import {
  registerIntegrityProvider,
  type IntegrityEnvelope,
  type IntegrityProvider,
  type PublicKeyResolver,
  type SigningKeyMaterial,
  type VerificationCheck,
  type VerificationVerdict,
} from '../integrity';

/**
 * W3C Verifiable Credentials 2.0, secured with JOSE.
 *
 * VC 2.0 defines two securing mechanisms: Data Integrity proofs, which embed a
 * `proof` object in the credential, and VC-JOSE-COSE, which wraps the whole
 * credential in a JWS. This implements the second, for one practical reason:
 * a JWS over the credential can be verified by any party with a standard JOSE
 * library and the issuer's public JWK, today, with no cryptosuite registry, no
 * RDF canonicalisation and no library that only exists in one language.
 *
 * The signed artefact is an `EnvelopedVerifiableCredential` — the credential
 * JSON is the JWS payload, and the JWS is carried in a `data:` URI as the
 * envelope's `id`, which is exactly what the specification prescribes rather
 * than a convenient approximation of it.
 *
 * @see https://www.w3.org/TR/vc-jose-cose/
 */

const VC_CONTEXT = 'https://www.w3.org/ns/credentials/v2';
const MEDIA_TYPE = 'application/vc+jwt';
const DATA_URI_PREFIX = `data:${MEDIA_TYPE},`;

class W3CVcJoseProvider implements IntegrityProvider {
  readonly mechanism = 'w3c-vc-2.0' as const;
  readonly label = 'W3C Verifiable Credentials 2.0 (VC-JOSE-COSE, ES256)';
  readonly specification = 'https://www.w3.org/TR/vc-jose-cose/';
  readonly implemented = true;

  detects(envelope: Record<string, unknown>): boolean {
    const type = envelope.type;
    const types = Array.isArray(type) ? type : [type];
    return types.includes('EnvelopedVerifiableCredential');
  }

  async sign(
    credential: Record<string, unknown>,
    key: SigningKeyMaterial,
  ): Promise<IntegrityEnvelope> {
    const privateKey = await importJWK(key.privateJwk, key.algorithm);

    const jws = await new CompactSign(new TextEncoder().encode(JSON.stringify(credential)))
      .setProtectedHeader({
        alg: key.algorithm,
        // `kid` is the full verification method URL, so a verifier can resolve
        // the key from the DID document without guessing which key was used.
        kid: key.keyId,
        typ: MEDIA_TYPE,
        cty: 'vc',
      })
      .sign(privateKey);

    const document = {
      '@context': VC_CONTEXT,
      id: DATA_URI_PREFIX + jws,
      type: 'EnvelopedVerifiableCredential',
    };

    return {
      mechanism: this.mechanism,
      mediaType: MEDIA_TYPE,
      document,
      documentHash: canonicalHash(document),
    };
  }

  async verify(
    envelope: Record<string, unknown>,
    resolve: PublicKeyResolver,
  ): Promise<VerificationVerdict> {
    const checks: VerificationCheck[] = [];
    const fail = (reason: string): VerificationVerdict => ({
      valid: false,
      mechanism: this.mechanism,
      reason,
      issuer: null,
      subject: null,
      checks,
    });

    if (!this.detects(envelope)) {
      checks.push({ name: 'envelope', passed: false });
      return fail(
        'This is not an enveloped verifiable credential. Expected `type` to include `EnvelopedVerifiableCredential`.',
      );
    }

    const id = typeof envelope.id === 'string' ? envelope.id : '';
    if (!id.startsWith(DATA_URI_PREFIX)) {
      checks.push({ name: 'envelope', passed: false });
      return fail(
        `The envelope's \`id\` should be a \`${DATA_URI_PREFIX}…\` data URI carrying the JWS. It is not.`,
      );
    }
    checks.push({ name: 'envelope', passed: true, detail: 'EnvelopedVerifiableCredential' });

    const jws = id.slice(DATA_URI_PREFIX.length);

    let keyId: string | undefined;
    let algorithm: string | undefined;
    try {
      const header = decodeProtectedHeader(jws);
      keyId = header.kid;
      algorithm = header.alg;
    } catch {
      checks.push({ name: 'header', passed: false });
      return fail('The JWS header could not be read. The credential is malformed.');
    }

    if (!keyId) {
      checks.push({ name: 'header', passed: false });
      return fail('The JWS carries no `kid`, so the signing key cannot be identified.');
    }
    checks.push({ name: 'header', passed: true, detail: `${algorithm} · ${keyId}` });

    const resolved = await resolve(keyId);
    if (!resolved) {
      checks.push({ name: 'key-resolution', passed: false });
      return fail(
        `The signing key \`${keyId}\` is not one this platform can resolve. If the credential was issued elsewhere, verify it against that issuer's DID document.`,
      );
    }
    checks.push({ name: 'key-resolution', passed: true, detail: keyId });

    let credential: Record<string, unknown>;
    try {
      const publicKey = await importJWK(resolved.publicJwk as JWK, resolved.algorithm);
      const { payload } = await compactVerify(jws, publicKey, {
        algorithms: [resolved.algorithm],
      });
      credential = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    } catch {
      checks.push({ name: 'signature', passed: false });
      return fail(
        'The signature does not verify against the issuer key. The credential has been altered since it was signed, or it was signed by a different key.',
      );
    }
    checks.push({ name: 'signature', passed: true, detail: resolved.algorithm });

    const issuer = readIssuer(credential);
    const subject = readSubject(credential);

    const now = Date.now();
    const validFrom = readDate(credential.validFrom);
    const validUntil = readDate(credential.validUntil);

    if (validFrom && validFrom.getTime() > now) {
      checks.push({ name: 'validity-window', passed: false });
      return {
        valid: false,
        mechanism: this.mechanism,
        reason: `The credential is not valid until ${validFrom.toISOString()}.`,
        issuer,
        subject,
        checks,
      };
    }
    if (validUntil && validUntil.getTime() <= now) {
      checks.push({ name: 'validity-window', passed: false });
      return {
        valid: false,
        mechanism: this.mechanism,
        reason: `The credential expired on ${validUntil.toISOString()}.`,
        issuer,
        subject,
        checks,
      };
    }
    checks.push({
      name: 'validity-window',
      passed: true,
      detail: validUntil ? `until ${validUntil.toISOString()}` : 'no expiry',
    });

    return { valid: true, mechanism: this.mechanism, reason: null, issuer, subject, checks };
  }

  /**
   * Unwrap an enveloped credential without verifying it.
   *
   * Only for display — reading the subject of a credential you are about to
   * show someone. Never use the result to make a trust decision.
   */
  decodeUnverified(envelope: Record<string, unknown>): Record<string, unknown> | null {
    const id = typeof envelope.id === 'string' ? envelope.id : '';
    if (!id.startsWith(DATA_URI_PREFIX)) return null;
    const parts = id.slice(DATA_URI_PREFIX.length).split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    try {
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }
}

function readIssuer(credential: Record<string, unknown>): string | null {
  const issuer = credential.issuer;
  if (typeof issuer === 'string') return issuer;
  if (issuer && typeof issuer === 'object' && 'id' in issuer) {
    const id = (issuer as { id: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function readSubject(credential: Record<string, unknown>): string | null {
  const subject = credential.credentialSubject;
  if (subject && typeof subject === 'object' && 'id' in subject) {
    const id = (subject as { id: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const w3cVcJoseProvider = new W3CVcJoseProvider();
registerIntegrityProvider(w3cVcJoseProvider);

export { VC_CONTEXT, MEDIA_TYPE as VC_MEDIA_TYPE };
