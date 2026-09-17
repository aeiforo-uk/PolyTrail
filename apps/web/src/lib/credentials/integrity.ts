import type { JWK } from 'jose';

/**
 * Pluggable data integrity.
 *
 * EN 18246:2026 permits four mechanisms for authenticating passport data, not
 * one. The claim repeated across this market — that "the Commission chose
 * verifiable credentials, DIDs and GS1" — is simply not what the standards
 * say, and a platform built on that assumption has to be rewritten the first
 * time a customer's regulator, or a customer's customer, asks for a different
 * one. An eIDAS electronic attestation of attributes signed by a qualified
 * trust service provider is not a W3C credential and never will be.
 *
 * So integrity is an interface with four declared mechanisms and one
 * implementation. The three unimplemented ones are present as providers that
 * refuse, rather than absent, because that is the difference between "we chose
 * not to build this yet" and "our architecture cannot express this".
 */

export const INTEGRITY_MECHANISMS = ['w3c-vc-2.0', 'eidas-eaa', 'iso-22376-vds', 'iso-iec-20248'] as const;

export type IntegrityMechanism = (typeof INTEGRITY_MECHANISMS)[number];

export const MECHANISM_LABELS: Record<IntegrityMechanism, string> = {
  'w3c-vc-2.0': 'W3C Verifiable Credentials 2.0',
  'eidas-eaa': 'eIDAS 2 electronic attestation of attributes',
  'iso-22376-vds': 'ISO 22376 visible digital seal',
  'iso-iec-20248': 'ISO/IEC 20248 digital signature data structure',
};

export const MECHANISM_SPECIFICATIONS: Record<IntegrityMechanism, string> = {
  'w3c-vc-2.0': 'https://www.w3.org/TR/vc-data-model-2.0/',
  'eidas-eaa': 'Regulation (EU) 2024/1183; ETSI TS 119 182-1 (JAdES)',
  'iso-22376-vds': 'ISO 22376:2023',
  'iso-iec-20248': 'ISO/IEC 20248:2022',
};

/** Signing material handed to a provider. Never logged, never serialised. */
export interface SigningKeyMaterial {
  issuerDid: string;
  /** Fully-qualified verification method, e.g. `did:web:host#<thumbprint>`. */
  keyId: string;
  algorithm: string;
  privateJwk: JWK;
  publicJwk: JWK;
}

/** How a provider hands a signed artefact back. */
export interface IntegrityEnvelope {
  mechanism: IntegrityMechanism;
  /** Media type the envelope should be served and stored as. */
  mediaType: string;
  /** The artefact exactly as it must be transmitted to a verifier. */
  document: Record<string, unknown>;
  /** SHA-256 over the canonical form of `document`. */
  documentHash: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

/**
 * A verdict, not a boolean.
 *
 * "Invalid" with no reason is the failure mode that makes verification tools
 * useless in practice: the person holding the credential cannot tell a expired
 * certificate from a tampered one from a key they have not trusted yet.
 */
export interface VerificationVerdict {
  valid: boolean;
  mechanism: IntegrityMechanism;
  /** Plain-language explanation. `null` when the credential verified. */
  reason: string | null;
  issuer: string | null;
  subject: string | null;
  checks: VerificationCheck[];
}

/**
 * Resolves a verification method to a public key. Injected rather than
 * imported so a provider stays free of database and network concerns, and so
 * verification can be tested against a fixed key set.
 */
export type PublicKeyResolver = (
  keyId: string,
) => Promise<{ publicJwk: JWK; algorithm: string } | null>;

export interface IntegrityProvider {
  readonly mechanism: IntegrityMechanism;
  readonly label: string;
  readonly specification: string;
  /** False for a declared-but-unbuilt mechanism. The API reports this honestly. */
  readonly implemented: boolean;
  /** Does this envelope look like one this provider issued? */
  detects(envelope: Record<string, unknown>): boolean;
  sign(payload: Record<string, unknown>, key: SigningKeyMaterial): Promise<IntegrityEnvelope>;
  verify(envelope: Record<string, unknown>, resolve: PublicKeyResolver): Promise<VerificationVerdict>;
}

const registry = new Map<IntegrityMechanism, IntegrityProvider>();

export function registerIntegrityProvider(provider: IntegrityProvider): void {
  registry.set(provider.mechanism, provider);
}

export function getIntegrityProvider(mechanism: IntegrityMechanism): IntegrityProvider {
  const provider = registry.get(mechanism);
  if (!provider) throw new Error(`No integrity provider registered for ${mechanism}.`);
  return provider;
}

export function listIntegrityProviders(): IntegrityProvider[] {
  return INTEGRITY_MECHANISMS.map((mechanism) => registry.get(mechanism)).filter(
    (provider): provider is IntegrityProvider => Boolean(provider),
  );
}

/** The mechanism actually in use for newly issued passport credentials. */
export const DEFAULT_MECHANISM: IntegrityMechanism = 'w3c-vc-2.0';

/** Identify which provider can verify an envelope, by inspecting its shape. */
export function providerFor(envelope: Record<string, unknown>): IntegrityProvider | null {
  for (const provider of listIntegrityProviders()) {
    if (provider.detects(envelope)) return provider;
  }
  return null;
}

/** Shorthand for a provider that cannot do the thing it was asked to do. */
export function unsupported(
  mechanism: IntegrityMechanism,
  operation: 'sign' | 'verify',
): never {
  throw new Error(
    `${MECHANISM_LABELS[mechanism]} is a declared integrity mechanism under EN 18246 but Polytrail cannot ${operation} with it yet. See ${MECHANISM_SPECIFICATIONS[mechanism]}.`,
  );
}
