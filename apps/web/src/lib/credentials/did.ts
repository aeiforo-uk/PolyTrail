/**
 * `did:web` identifiers for the platform and its tenants.
 *
 * `did:web` rather than `did:key` or a ledger method, because the trust anchor
 * a textile regulator or retailer will actually accept is a domain name they
 * can look up in a company register — not a self-certifying key with no
 * institutional meaning, and not an entry on a chain they have no reason to
 * trust. The cost is honest and worth naming: `did:web` inherits the security
 * of DNS and TLS, so whoever controls the domain controls the identity.
 *
 * @see https://w3c-ccg.github.io/did-method-web/
 */

/** Host component of a DID, with the port percent-encoded as the method requires. */
function didHost(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { host } = new URL(base);
  return host.replace(':', '%3A');
}

/** The platform's own DID. Resolves at `/.well-known/did.json`. */
export function platformDid(): string {
  return `did:web:${didHost()}`;
}

/**
 * A tenant's DID. Resolves at `/.well-known/tenant/<tenantId>/did.json`.
 *
 * Path segments after the host map to URL path segments, so this is a plain
 * `did:web` identifier and not a Polytrail-specific convention a verifier has
 * to be taught.
 */
export function tenantDid(tenantId: string): string {
  return `did:web:${didHost()}:.well-known:tenant:${tenantId}`;
}

/** The HTTPS URL a `did:web` identifier resolves to, per the method spec. */
export function didDocumentUrl(did: string): string {
  const withoutMethod = did.replace(/^did:web:/, '');
  const [host, ...path] = withoutMethod.split(':');
  const origin = `https://${decodeURIComponent(host ?? '')}`;
  return path.length === 0
    ? `${origin}/.well-known/did.json`
    : `${origin}/${path.map(decodeURIComponent).join('/')}/did.json`;
}

export interface VerificationMethodInput {
  keyId: string;
  publicJwk: Record<string, unknown>;
  /** Rotated-out keys stay published so old credentials remain verifiable. */
  active: boolean;
}

/**
 * Build a DID document.
 *
 * Every key the tenant has ever held is published as a verification method,
 * because a credential signed last year is still a true statement about last
 * year and must stay checkable. Only the active key appears in
 * `assertionMethod`, which is the list a verifier consults to decide whether
 * an issuer *should* still be signing with a given key.
 */
export function buildDidDocument(options: {
  did: string;
  keys: readonly VerificationMethodInput[];
  alsoKnownAs?: readonly string[];
  service?: readonly { id: string; type: string; serviceEndpoint: string }[];
}): Record<string, unknown> {
  const verificationMethod = options.keys.map((key) => ({
    id: key.keyId,
    type: 'JsonWebKey',
    controller: options.did,
    publicKeyJwk: key.publicJwk,
  }));

  const assertion = options.keys.filter((key) => key.active).map((key) => key.keyId);

  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/jwk/v1'],
    id: options.did,
    ...(options.alsoKnownAs?.length ? { alsoKnownAs: [...options.alsoKnownAs] } : {}),
    verificationMethod,
    assertionMethod: assertion,
    authentication: assertion,
    ...(options.service?.length ? { service: options.service.map((s) => ({ ...s })) } : {}),
  };
}
