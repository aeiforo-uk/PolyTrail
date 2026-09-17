import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for TOTP secrets.
 *
 * A TOTP secret is a bearer credential: anyone holding it can produce valid
 * codes forever. Storing it in plaintext means a read-only SQL injection or a
 * leaked backup hands an attacker the second factor along with the first, which
 * makes the second factor decorative.
 *
 * AES-256-GCM rather than CBC because the tag detects tampering. A secret that
 * has been altered must fail loudly rather than decrypt to noise and lock the
 * user out with an error about their authenticator being wrong.
 */

const VERSION = 'v1';
const IV_BYTES = 12; // 96 bits — the length GCM is specified for.

/**
 * Derive the key from `MFA_ENCRYPTION_KEY`.
 *
 * A plain SHA-256 of the env value, not a password KDF: this is a machine
 * secret with full entropy, not a human password, so stretching it would cost
 * latency on every sign-in and buy nothing. The length floor is what stops
 * somebody setting it to "changeme".
 */
function key(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must be set to at least 32 characters before two-factor authentication can be used. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return createHash('sha256').update(raw).digest();
}

/** True when the deployment is configured to hold MFA secrets at all. */
export function mfaEncryptionConfigured(): boolean {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  return typeof raw === 'string' && raw.length >= 32;
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split('.');
  // The version prefix exists so that rotating to a different cipher later is a
  // migration rather than a flag day.
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('The stored two-factor secret is not in a format this build understands.');
  }

  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[1]!, 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[2]!, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3]!, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
