export {
  base32Encode,
  base32Decode,
  hotp,
  totp,
  verifyTotp,
  counterFor,
  generateTotpSecret,
  buildOtpAuthUri,
} from './totp';

export type { TotpAlgorithm, TotpOptions, VerifyOptions, TotpVerification, OtpAuthParams } from './totp';

export {
  generateRecoveryCodes,
  consumeRecoveryCode,
  hashRecoveryCode,
  formatRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery';

export type { StoredRecoveryCode, GeneratedRecoveryCodes, RecoveryAttempt } from './recovery';

export { encryptSecret, decryptSecret, mfaEncryptionConfigured } from './crypto';
export { createEnvelope, parseEnvelope, readSecret, withRecovery } from './envelope';
export type { MfaEnvelope } from './envelope';
