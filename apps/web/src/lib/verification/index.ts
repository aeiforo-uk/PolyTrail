export {
  VERIFICATION_LEVELS,
  LEVEL_DEFINITIONS,
  LEVEL_ORDER,
  METHOD_FOR_LEVEL,
  DNS_CHALLENGE_PREFIX,
  EMAIL_TOKEN_TTL_HOURS,
  DOMAIN_CHALLENGE_TTL_DAYS,
  rankOf,
  atLeast,
} from './types';

export type {
  VerificationLevel,
  VerificationMethod,
  LevelDefinition,
  LadderRung,
  LadderStatus,
} from './types';

export {
  normalizeDomain,
  isValidDomain,
  generateDomainChallenge,
  challengeRecordName,
  checkDomainChallenge,
} from './domain';

export type { DomainCheckResult, DomainCheckOutcome, TxtResolver } from './domain';
