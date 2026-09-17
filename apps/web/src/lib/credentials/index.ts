/**
 * Importing this module registers every integrity provider. Anything that
 * resolves a provider by mechanism or by envelope shape should import from
 * here rather than reaching into `./providers`, so no call site can end up
 * with a half-populated registry.
 */
import './providers/w3c-vc-jose';
import './providers/declared';

export {
  INTEGRITY_MECHANISMS,
  MECHANISM_LABELS,
  MECHANISM_SPECIFICATIONS,
  DEFAULT_MECHANISM,
  getIntegrityProvider,
  listIntegrityProviders,
  providerFor,
} from './integrity';
export type {
  IntegrityMechanism,
  IntegrityProvider,
  IntegrityEnvelope,
  SigningKeyMaterial,
  PublicKeyResolver,
  VerificationCheck,
  VerificationVerdict,
} from './integrity';

export { w3cVcJoseProvider, VC_MEDIA_TYPE } from './providers/w3c-vc-jose';
export { eidasEaaProvider, iso22376Provider, iso20248Provider } from './providers/declared';

export { platformDid, tenantDid, didDocumentUrl, buildDidDocument } from './did';
export {
  ensureTenantSigningKey,
  activeSigningKey,
  listSigningKeys,
  rotateTenantSigningKey,
  signingMaterial,
  resolvePlatformKey,
  wrapPrivateJwk,
  unwrapPrivateJwk,
  SIGNING_ALGORITHM,
} from './keys';
export type { SigningKeyRecord } from './keys';

export {
  issuePassportCredential,
  listPassportCredentials,
  DPP_CREDENTIAL_SCHEME,
  DPP_CREDENTIAL_TYPE,
} from './issue';
export type { IssuedCredential, IssueOptions, CredentialSummary } from './issue';

export { verifyCredential, revokeCredential } from './verify';
