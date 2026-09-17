export {
  IDENTIFIER_SCHEMES,
  IDENTIFIER_SCHEME_LABELS,
  OPERATOR_SCHEMES,
  OPERATOR_SCHEME_LABELS,
  UPI_MAX_LENGTH,
  PROOF_VALIDITY_DAYS,
  PROOF_WARNING_DAYS,
  RegistryError,
  daysUntil,
  proofHealth,
} from './types';

export type {
  IdentifierScheme,
  OperatorScheme,
  Granularity,
  IdentifierLinks,
  RegistryRecord,
  RegistryProof,
  RegistryState,
  RegistryReceipt,
  RegistryStatusResult,
  RegistryWithdrawalResult,
  RegistryClient,
  RegistryEndpointDescription,
  RegistryMode,
  RegistryErrorCode,
  ProofHealth,
  SubmitOptions,
} from './types';

export {
  buildRegistryRecord,
  buildIdentifierLinks,
  selectOperatorIdentifier,
  selectUpi,
  serviceProviderReference,
  idempotencyKeyFor,
} from './record';

export type {
  RegistryPassportInput,
  RegistryVersionInput,
  RegistryTenantInput,
  BuildRegistryRecordOptions,
} from './record';

export { checkRegistryReadiness } from './preflight';
export type { RegistryReadiness, ReadinessIssue, ReadinessInput } from './preflight';

export {
  getRegistryClient,
  describeRegistryEndpoint,
  mockRegistryClient,
  httpRegistryClient,
  resetMockRegistry,
} from './client';
