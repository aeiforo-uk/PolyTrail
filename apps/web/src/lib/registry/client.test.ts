import { beforeEach, describe, expect, it } from 'vitest';
import { mockRegistryClient, resetMockRegistry } from './client';
import { buildRegistryRecord, idempotencyKeyFor } from './record';
import { PROOF_VALIDITY_DAYS, proofHealth, daysUntil } from './types';

const OPTIONS = { resolverBaseUrl: 'https://id.example-brand.com' };

function recordFor(version = 1) {
  return buildRegistryRecord(
    { dppId: 'ABCD1234EFGH5678', scope: 'model', gtin: '08712345678906' },
    {
      version,
      dataHash: `0x${String(version).repeat(64).slice(0, 64)}`,
      payload: { identity: { category: 'knitwear', hsCode: '61102000' } },
    },
    { legalName: 'Example Brand Ltd', country: 'PT', lei: '5493001KJTIIGC8Y1R12' },
    OPTIONS,
  );
}

describe('rehearsal registry', () => {
  beforeEach(resetMockRegistry);

  it('accepts a filing and issues a 90-day proof', async () => {
    const record = recordFor();
    const receipt = await mockRegistryClient.submit(record, {
      idempotencyKey: idempotencyKeyFor(record),
    });

    expect(receipt.state).toBe('registered');
    expect(receipt.proof.registryId).toMatch(/^EU-DPP-/);
    expect(receipt.proof.versionHash).toBe(record.versionHash);
    // Allow a day of slack so the assertion does not depend on wall-clock ticks.
    expect(daysUntil(receipt.proof.expiresAt)).toBeGreaterThanOrEqual(PROOF_VALIDITY_DAYS - 1);
  });

  it('never files twice for the same idempotency key', async () => {
    // The property the whole retry design exists for: a timeout that in fact
    // succeeded must resolve to the original registration, not a second one.
    const record = recordFor();
    const key = idempotencyKeyFor(record);

    const first = await mockRegistryClient.submit(record, { idempotencyKey: key });
    const replay = await mockRegistryClient.submit(record, { idempotencyKey: key });

    expect(replay.proof.registryId).toBe(first.proof.registryId);
    expect(replay.proof.issuedAt).toBe(first.proof.issuedAt);
    expect(replay.proof.expiresAt).toBe(first.proof.expiresAt);
  });

  it('supersedes the previous registration when a new version is filed', async () => {
    const v1 = recordFor(1);
    const first = await mockRegistryClient.submit(v1, { idempotencyKey: idempotencyKeyFor(v1) });

    const v2 = recordFor(2);
    const second = await mockRegistryClient.submit(v2, { idempotencyKey: idempotencyKeyFor(v2) });

    expect(second.proof.registryId).not.toBe(first.proof.registryId);
    expect((await mockRegistryClient.status(first.proof.registryId)).state).toBe('superseded');
    expect((await mockRegistryClient.status(second.proof.registryId)).state).toBe('registered');
  });

  it('reports an identifier it has never seen as unknown rather than inventing one', async () => {
    const status = await mockRegistryClient.status('EU-DPP-0000-0000-0000-0000');
    expect(status.state).toBe('unknown');
    expect(status.proof).toBeNull();
  });

  it('refuses to withdraw something it never registered', async () => {
    await expect(
      mockRegistryClient.withdraw('EU-DPP-0000-0000-0000-0000', 'test'),
    ).rejects.toThrow(/No registration/);
  });

  it('withdraws a registration it holds', async () => {
    const record = recordFor();
    const receipt = await mockRegistryClient.submit(record, {
      idempotencyKey: idempotencyKeyFor(record),
    });
    await mockRegistryClient.withdraw(receipt.proof.registryId, 'Discontinued before launch.');
    expect((await mockRegistryClient.status(receipt.proof.registryId)).state).toBe('withdrawn');
  });

  it('never claims to be authoritative', async () => {
    expect(mockRegistryClient.endpoint.authoritative).toBe(false);
    expect(mockRegistryClient.endpoint.mode).toBe('mock');
  });
});

describe('proof expiry', () => {
  const issued = new Date('2026-09-01T00:00:00Z');
  const expires = new Date(issued.getTime() + PROOF_VALIDITY_DAYS * 86_400_000).toISOString();

  it('is valid well before the ninety days are up', () => {
    expect(proofHealth(expires, new Date('2026-09-10T00:00:00Z'))).toBe('valid');
  });

  it('starts warning a fortnight out', () => {
    expect(proofHealth(expires, new Date('2026-11-25T00:00:00Z'))).toBe('expiring');
  });

  it('reports expiry rather than staying quiet', () => {
    expect(proofHealth(expires, new Date('2026-12-05T00:00:00Z'))).toBe('expired');
  });
});
