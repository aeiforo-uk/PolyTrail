import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, computeEntryHash, verifyAuditChain, type ChainRow } from '@/lib/audit';

function chain(count: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let previousHash = GENESIS_HASH;
  for (let i = 0; i < count; i++) {
    const recordedAt = new Date(Date.UTC(2026, 0, i + 1)).toISOString();
    const input = {
      tenantId: 'tenant-1',
      actorId: 'user-1',
      actorLabel: 'Ada',
      action: 'passport.published' as const,
      subjectType: 'passport',
      subjectId: `passport-${i}`,
      metadata: {},
    };
    const entryHash = computeEntryHash(input, previousHash, recordedAt);
    rows.push({ ...input, previousHash, entryHash, recordedAt, metadata: {} });
    previousHash = entryHash;
  }
  return rows;
}

describe('verifyAuditChain', () => {
  it('accepts an intact chain', () => {
    expect(verifyAuditChain(chain(5))).toMatchObject({ valid: true, checked: 5, brokenAt: null });
  });

  it('accepts an empty chain', () => {
    expect(verifyAuditChain([])).toMatchObject({ valid: true, checked: 0 });
  });

  it('detects a record edited after the fact', () => {
    const rows = chain(5);
    rows[2] = { ...rows[2]!, subjectId: 'tampered' };
    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toContain('modified after it was written');
  });

  it('detects a deleted record', () => {
    const rows = chain(5);
    rows.splice(2, 1);
    const result = verifyAuditChain(rows);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('removed or reordered');
  });

  it('detects reordering', () => {
    const rows = chain(5);
    [rows[1], rows[3]] = [rows[3]!, rows[1]!];
    expect(verifyAuditChain(rows).valid).toBe(false);
  });

  it('detects a forged first entry', () => {
    const rows = chain(3);
    rows[0] = { ...rows[0]!, previousHash: '0x' + 'f'.repeat(64) };
    expect(verifyAuditChain(rows).valid).toBe(false);
  });

  it('is sensitive to metadata, not just the headline fields', () => {
    const rows = chain(3);
    rows[1] = { ...rows[1]!, metadata: { smuggled: true } };
    expect(verifyAuditChain(rows).valid).toBe(false);
  });
});

describe('timestamp spelling', () => {
  const base = {
    tenantId: 'tenant-1',
    actorId: 'user-1',
    actorLabel: 'Ada',
    action: 'passport.published' as const,
    subjectType: 'passport',
    subjectId: 'p1',
    metadata: {},
  };

  it('hashes the instant, not the string the driver happened to return', () => {
    // The write path produced an ISO string and Postgres returned
    // `2026-09-17 07:24:35.507+00` for the same instant. Hashing the spelling
    // meant every chain reported itself broken at entry 1.
    const iso = computeEntryHash(base, GENESIS_HASH, '2026-09-17T07:24:35.507Z');
    const postgres = computeEntryHash(base, GENESIS_HASH, '2026-09-17 07:24:35.507+00');
    expect(postgres).toBe(iso);
  });

  it('still separates genuinely different instants', () => {
    const a = computeEntryHash(base, GENESIS_HASH, '2026-09-17T07:24:35.507Z');
    const b = computeEntryHash(base, GENESIS_HASH, '2026-09-17T07:24:35.508Z');
    expect(a).not.toBe(b);
  });

  it('refuses a timestamp it cannot parse rather than hashing nonsense', () => {
    expect(() => computeEntryHash(base, GENESIS_HASH, 'not a date')).toThrow(/not a date/);
  });

  it('detects a renamed actor', () => {
    // Renaming the actor on a stored row used to pass verification, because
    // only `actorId` was hashed. An auditor would have read the wrong name off
    // a log the product called untampered.
    const recordedAt = '2026-09-17T07:24:35.507Z';
    const entryHash = computeEntryHash(base, GENESIS_HASH, recordedAt);
    const tampered = {
      ...base,
      actorLabel: 'Someone Else',
      previousHash: GENESIS_HASH,
      entryHash,
      recordedAt,
      metadata: {},
    };
    expect(verifyAuditChain([tampered]).valid).toBe(false);
  });

  it('verifies a chain whose rows came back in Postgres spelling', () => {
    const recordedAt = '2026-09-17T07:24:35.507Z';
    const entryHash = computeEntryHash(base, GENESIS_HASH, recordedAt);
    const row = {
      ...base,
      previousHash: GENESIS_HASH,
      entryHash,
      recordedAt: '2026-09-17 07:24:35.507+00',
      metadata: {},
    };
    expect(verifyAuditChain([row])).toMatchObject({ valid: true });
  });
});
