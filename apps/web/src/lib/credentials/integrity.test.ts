import { describe, expect, it } from 'vitest';
import { calculateJwkThumbprint, exportJWK, generateKeyPair, type JWK } from 'jose';
import { w3cVcJoseProvider } from './providers/w3c-vc-jose';
import { eidasEaaProvider } from './providers/declared';
import { listIntegrityProviders, providerFor, type SigningKeyMaterial } from './integrity';

async function testKey(): Promise<SigningKeyMaterial> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  const thumbprint = await calculateJwkThumbprint(publicJwk, 'sha256');
  return {
    issuerDid: 'did:web:example.com',
    keyId: `did:web:example.com#${thumbprint}`,
    algorithm: 'ES256',
    privateJwk,
    publicJwk,
  };
}

function resolverFor(key: SigningKeyMaterial) {
  return async (keyId: string) =>
    keyId === key.keyId ? { publicJwk: key.publicJwk as JWK, algorithm: key.algorithm } : null;
}

const CREDENTIAL = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  id: 'urn:uuid:11111111-2222-3333-4444-555555555555',
  type: ['VerifiableCredential', 'DigitalProductPassportCredential'],
  issuer: { id: 'did:web:example.com', name: 'Test Brand' },
  validFrom: '2026-01-01T00:00:00.000Z',
  credentialSubject: { id: 'https://example.com/p/ABCD', dppId: 'ABCD' },
};

describe('W3C VC 2.0 over JOSE', () => {
  it('signs an enveloped credential and verifies it back', async () => {
    const key = await testKey();
    const envelope = await w3cVcJoseProvider.sign(CREDENTIAL, key);

    expect(envelope.document.type).toBe('EnvelopedVerifiableCredential');
    expect(String(envelope.document.id)).toMatch(/^data:application\/vc\+jwt,/);

    const verdict = await w3cVcJoseProvider.verify(envelope.document, resolverFor(key));
    expect(verdict.valid).toBe(true);
    expect(verdict.issuer).toBe('did:web:example.com');
    expect(verdict.subject).toBe('https://example.com/p/ABCD');
  });

  it('refuses a credential whose payload was edited after signing', async () => {
    const key = await testKey();
    const envelope = await w3cVcJoseProvider.sign(CREDENTIAL, key);

    const jws = String(envelope.document.id).split(',')[1]!;
    const [header, payload, signature] = jws.split('.');
    const tampered = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    tampered.credentialSubject.dppId = 'EVIL';

    const forged = [
      header,
      Buffer.from(JSON.stringify(tampered)).toString('base64url'),
      signature,
    ].join('.');

    const verdict = await w3cVcJoseProvider.verify(
      { ...envelope.document, id: `data:application/vc+jwt,${forged}` },
      resolverFor(key),
    );

    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/altered/);
  });

  it('refuses a credential signed by a different key', async () => {
    const signer = await testKey();
    const other = await testKey();
    const envelope = await w3cVcJoseProvider.sign(CREDENTIAL, signer);

    // Resolver hands back the wrong public key for the right kid.
    const verdict = await w3cVcJoseProvider.verify(envelope.document, async () => ({
      publicJwk: other.publicJwk as JWK,
      algorithm: 'ES256',
    }));

    expect(verdict.valid).toBe(false);
  });

  it('reports an expired credential as expired, not merely invalid', async () => {
    const key = await testKey();
    const envelope = await w3cVcJoseProvider.sign(
      { ...CREDENTIAL, validUntil: '2020-01-01T00:00:00.000Z' },
      key,
    );

    const verdict = await w3cVcJoseProvider.verify(envelope.document, resolverFor(key));
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/expired on 2020-01-01/);
  });

  it('says so when the signing key cannot be resolved', async () => {
    const key = await testKey();
    const envelope = await w3cVcJoseProvider.sign(CREDENTIAL, key);

    const verdict = await w3cVcJoseProvider.verify(envelope.document, async () => null);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/not one this platform can resolve/);
  });
});

describe('integrity mechanism registry', () => {
  it('registers all four EN 18246 mechanisms, with one implemented', () => {
    const providers = listIntegrityProviders();
    expect(providers).toHaveLength(4);
    expect(providers.filter((provider) => provider.implemented)).toHaveLength(1);
  });

  it('routes an envelope to the provider that recognises it', async () => {
    const key = await testKey();
    const envelope = await w3cVcJoseProvider.sign(CREDENTIAL, key);
    expect(providerFor(envelope.document)?.mechanism).toBe('w3c-vc-2.0');
    expect(providerFor({ jades: {} })?.mechanism).toBe('eidas-eaa');
    expect(providerFor({ nothing: true })).toBeNull();
  });

  // An unbuilt mechanism must fail loudly and say what it is, rather than
  // being silently absent as if the standard permitted only one option.
  it('declares an unimplemented mechanism rather than hiding it', async () => {
    const verdict = await eidasEaaProvider.verify();
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/recognises but cannot verify/);
    await expect(eidasEaaProvider.sign()).rejects.toThrow(/cannot sign/);
  });
});
