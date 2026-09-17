import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Connector credentials at rest.
 *
 * A stored API token is the one piece of a customer's infrastructure this
 * product holds that is not its own data. Encrypting it with AES-256-GCM means
 * a database dump is not a credential dump, and the authentication tag means a
 * tampered ciphertext fails closed rather than decrypting to something.
 *
 * The key is derived, never stored. `CONNECTOR_SECRET` is the intended source;
 * where it is absent the key is derived from `AUTH_SECRET` through HKDF with a
 * distinct info string, so the two keys are independent even though the input
 * material is shared. That is domain separation, not key reuse — but a
 * deployment that means it should set `CONNECTOR_SECRET`, because rotating a
 * session secret should not make every stored credential unreadable.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_INFO = 'polytrail:connector-credentials:v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const material = process.env.CONNECTOR_SECRET ?? process.env.AUTH_SECRET;
  if (!material || material.length < 32) {
    throw new Error(
      'CONNECTOR_SECRET must be set to at least 32 characters before connector credentials can be stored. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  // A fixed salt is acceptable here because the input is already high-entropy
  // secret material rather than a password; the info string is what separates
  // this key from the session key.
  cachedKey = Buffer.from(hkdfSync('sha256', material, 'polytrail', KEY_INFO, 32));
  return cachedKey;
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plaintext: string): string {
  if (plaintext === '') throw new Error('Refusing to encrypt an empty credential.');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, b64(iv), b64(tag), b64(ciphertext)].join('.');
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Stored credential is not in a format this version can read.');
  }

  const iv = unb64(parts[1]!);
  const tag = unb64(parts[2]!);
  const ciphertext = unb64(parts[3]!);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Stored credential is malformed.');
  }

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  // `final()` throws when the tag does not verify, which is the whole point:
  // an edited row fails rather than yielding a plausible-looking credential.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Whether a credential can be stored at all, so the UI can say so up front. */
export function credentialStorageAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Reset the derived key. Only for tests that change the environment. */
export function resetKeyCache(): void {
  cachedKey = null;
}

function b64(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function unb64(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
