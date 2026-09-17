import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildIdentifierLinks,
  buildRegistryRecord,
  idempotencyKeyFor,
  selectOperatorIdentifier,
  type RegistryPassportInput,
  type RegistryTenantInput,
  type RegistryVersionInput,
} from './record';
import { checkRegistryReadiness } from './preflight';
import { UPI_MAX_LENGTH } from './types';

const OPTIONS = { resolverBaseUrl: 'https://id.example-brand.com' };

const passport: RegistryPassportInput = {
  dppId: 'ABCD1234EFGH5678',
  scope: 'model',
  gtin: '08712345678906',
  batchNumber: null,
  serialNumber: null,
};

const version: RegistryVersionInput = {
  version: 3,
  dataHash: `0x${'a'.repeat(64)}`,
  payload: {
    identity: {
      productName: { en: 'Merino crew' },
      category: 'knitwear',
      hsCode: '61102000',
      countryOfOrigin: 'PT',
    },
  },
};

const tenant: RegistryTenantInput = {
  legalName: 'Example Brand Ltd',
  country: 'pt',
  lei: '5493001KJTIIGC8Y1R12',
  eoriNumber: 'PT123456789',
  gln: '5012345678900',
  did: 'did:web:example-brand.com',
};

describe('operator identifier selection', () => {
  it('prefers the LEI', () => {
    expect(selectOperatorIdentifier(tenant)).toEqual({
      identifier: '5493001KJTIIGC8Y1R12',
      scheme: 'gleif_lei',
    });
  });

  it('falls back to EORI when there is no LEI', () => {
    expect(selectOperatorIdentifier({ ...tenant, lei: null })).toEqual({
      identifier: 'PT123456789',
      scheme: 'eori',
    });
  });

  it('falls back to GLN, then DID', () => {
    expect(selectOperatorIdentifier({ ...tenant, lei: null, eoriNumber: null })?.scheme).toBe(
      'gs1_gln',
    );
    expect(
      selectOperatorIdentifier({ ...tenant, lei: null, eoriNumber: null, gln: null })?.scheme,
    ).toBe('w3c_did');
  });

  it('returns null when the workspace has no identifier at all', () => {
    expect(
      selectOperatorIdentifier({ legalName: 'Nameless', country: 'FR' }),
    ).toBeNull();
  });
});

describe('identifier links', () => {
  it('builds a GS1 Digital Link at each granularity the data supports', () => {
    const links = buildIdentifierLinks(
      { ...passport, batchNumber: 'LOT-88', serialNumber: 'SN-7' },
      OPTIONS,
    );
    expect(links.model).toBe('https://id.example-brand.com/01/08712345678906');
    expect(links.batch).toContain('/10/LOT-88');
    expect(links.item).toContain('/21/SN-7');
  });

  it('falls back to the passport URL when there is no GTIN', () => {
    const links = buildIdentifierLinks({ ...passport, gtin: null }, OPTIONS);
    expect(links.model).toBe('https://id.example-brand.com/p/ABCD1234EFGH5678');
    expect(links.batch).toBeUndefined();
  });

  it('falls back when the GTIN fails its check digit rather than minting a bad link', () => {
    const links = buildIdentifierLinks({ ...passport, gtin: '08712345678905' }, OPTIONS);
    expect(links.model).toContain('/p/');
  });
});

describe('buildRegistryRecord', () => {
  it('produces a UPI that is a URL within the Registry limit', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    expect(() => new URL(record.upi)).not.toThrow();
    expect(record.upi.length).toBeLessThanOrEqual(UPI_MAX_LENGTH);
    expect(record.upiScheme).toBe('gs1_digital_link');
  });

  it('declares IEC 61406 when the identifier is a plain passport URL', () => {
    const record = buildRegistryRecord({ ...passport, gtin: null }, version, tenant, OPTIONS);
    expect(record.upiScheme).toBe('iec_61406');
  });

  it('registers an item-level passport at its serial', () => {
    const record = buildRegistryRecord(
      { ...passport, scope: 'item', serialNumber: 'SN-7' },
      version,
      tenant,
      OPTIONS,
    );
    expect(record.granularity).toBe('item');
    expect(record.upi).toContain('/21/SN-7');
  });

  it('carries the commodity code, category and operator country', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    expect(record.commodityCode).toBe('61102000');
    expect(record.productCategory).toBe('knitwear');
    expect(record.operator.country).toBe('PT');
  });

  it('derives a service-provider reference from the resolver host', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    expect(record.serviceProviderReference).toBe('dpp-service:id.example-brand.com');
  });

  it('offers a backup address for the same content', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    expect(record.backupUrl).toBe('https://id.example-brand.com/p/ABCD1234EFGH5678/dpp.json');
  });

  it('is stable for identical input', () => {
    const a = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const b = buildRegistryRecord(passport, version, tenant, OPTIONS);
    expect(a.versionHash).toBe(b.versionHash);
  });

  it('moves the version hash when the payload changes', () => {
    const a = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const b = buildRegistryRecord(
      passport,
      { ...version, dataHash: `0x${'b'.repeat(64)}` },
      tenant,
      OPTIONS,
    );
    expect(a.versionHash).not.toBe(b.versionHash);
  });

  it('moves the version hash when only the operator changes', () => {
    // The Registry attests to the whole descriptor, not just the garment data.
    const a = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const b = buildRegistryRecord(
      passport,
      version,
      { ...tenant, lei: null },
      OPTIONS,
    );
    expect(a.versionHash).not.toBe(b.versionHash);
  });
});

describe('idempotency key', () => {
  it('is identical for a retry of the same filing', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    expect(idempotencyKeyFor(record)).toBe(idempotencyKeyFor(record));
  });

  it('differs once a new version is published', () => {
    const a = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const b = buildRegistryRecord(
      passport,
      { ...version, version: 4, dataHash: `0x${'c'.repeat(64)}` },
      tenant,
      OPTIONS,
    );
    expect(idempotencyKeyFor(a)).not.toBe(idempotencyKeyFor(b));
  });
});

describe('pre-submission check', () => {
  const base = {
    passportStatus: 'published',
    verificationLevel: 'document_verified' as const,
    authoritative: false,
  };

  beforeEach(() => {
    delete process.env.REGISTRY_SERVICE_PROVIDER_REF;
  });

  it('passes a complete record against the rehearsal endpoint', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const readiness = checkRegistryReadiness({ ...base, record });
    expect(readiness.ok).toBe(true);
    expect(readiness.issues).toHaveLength(0);
  });

  it('names the missing commodity code and the instrument that asks for it', () => {
    const record = buildRegistryRecord(passport, { ...version, payload: {} }, tenant, OPTIONS);
    const readiness = checkRegistryReadiness({ ...base, record });
    expect(readiness.ok).toBe(false);
    const issue = readiness.issues.find((candidate) => candidate.field === 'commodityCode');
    expect(issue?.instrument).toContain('Combined Nomenclature');
    expect(issue?.detail).toContain('61102000');
  });

  it('refuses a record with no operator identifier, citing Registry Art. 4', () => {
    const record = buildRegistryRecord(
      passport,
      version,
      { legalName: 'Nameless', country: 'FR' },
      OPTIONS,
    );
    const issue = checkRegistryReadiness({ ...base, record }).issues.find(
      (candidate) => candidate.field === 'operator.identifier',
    );
    expect(issue?.instrument).toContain('Art. 4');
  });

  it('refuses an unpublished passport', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const readiness = checkRegistryReadiness({ ...base, record, passportStatus: 'draft' });
    expect(readiness.ok).toBe(false);
    expect(readiness.issues[0]?.field).toBe('status');
  });

  it('refuses a UPI that is not a URL', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const readiness = checkRegistryReadiness({
      ...base,
      record: { ...record, upi: 'c3a1f6e4-0000-4000-8000-000000000000' },
    });
    expect(readiness.issues.some((issue) => issue.detail.includes('not an absolute'))).toBe(true);
  });

  it('refuses a UPI over 2000 characters', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const readiness = checkRegistryReadiness({
      ...base,
      record: { ...record, upi: `https://example.com/${'x'.repeat(UPI_MAX_LENGTH)}` },
    });
    expect(readiness.issues.some((issue) => issue.label.includes('too long'))).toBe(true);
  });

  it('treats the eIDAS gate as advice against a rehearsal and a blocker against the real thing', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);

    const rehearsal = checkRegistryReadiness({ ...base, record });
    expect(rehearsal.ok).toBe(true);
    expect(
      rehearsal.advisories.some((issue) => issue.field === 'operator.verification'),
    ).toBe(true);

    const real = checkRegistryReadiness({ ...base, record, authoritative: true });
    expect(real.ok).toBe(false);
    expect(real.issues.some((issue) => issue.instrument.includes('eIDAS'))).toBe(true);
  });

  it('lets a sealed operator file for real', () => {
    const record = buildRegistryRecord(passport, version, tenant, OPTIONS);
    const readiness = checkRegistryReadiness({
      ...base,
      record,
      verificationLevel: 'qualified_seal',
      authoritative: true,
    });
    expect(readiness.ok).toBe(true);
  });
});
