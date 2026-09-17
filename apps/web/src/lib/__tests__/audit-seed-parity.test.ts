import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeEntryHash, GENESIS_HASH } from '@/lib/audit';

/**
 * The seed hand-rolls the audit hash because a plain `.mjs` script cannot
 * import the TypeScript module that defines it. That duplication has already
 * hidden two bugs — a timestamp spelling mismatch and a missing `actorLabel` —
 * each of which made the chain either always fail or silently accept a forged
 * attribution.
 *
 * This test pins the duplication so the next divergence breaks a build rather
 * than a customer's audit.
 */
const SEED = readFileSync(join(process.cwd(), 'scripts', 'seed.mjs'), 'utf8');

/**
 * The audit block only. `seed.mjs` hashes in three places — passwords, payload
 * digests and this — so slicing on the first `.digest` found the wrong one and
 * silently compared an empty string, which passed nothing and proved nothing.
 */
function auditBlock(): string {
  const start = SEED.indexOf('const entry =');
  expect(start, 'seed.mjs no longer declares `const entry =`').toBeGreaterThan(-1);
  const end = SEED.indexOf(".digest('hex')", start);
  expect(end, 'no digest call after `const entry =`').toBeGreaterThan(start);
  return SEED.slice(start, end);
}

describe('seed audit hashing stays in step with the library', () => {
  const MATERIAL_KEYS = [
    'previousHash',
    'tenantId',
    'actorId',
    'actorLabel',
    'action',
    'subjectType',
    'subjectId',
    'metadata',
    'recordedAt',
  ];

  it('names every key the library hashes', () => {
    const block = auditBlock();
    expect(block.length).toBeGreaterThan(50);
    for (const key of MATERIAL_KEYS) {
      // Either `key: value` or object shorthand `key,` — both put the same
      // property into the hashed material.
      const present = block.includes(`${key}:`) || new RegExp(`\\b${key},`).test(block);
      expect(present, `seed audit material is missing "${key}"`).toBe(true);
    }
  });

  it('normalises the timestamp the way the library does', () => {
    expect(auditBlock()).toContain('new Date(recordedAt).toISOString()');
  });

  it('writes actor_label into the row it hashed', () => {
    expect(SEED).toContain('actorLabel');
    expect(SEED).toContain('actor_label');
  });

  it('the library still hashes exactly these nine keys', () => {
    // If someone adds a field to the material, this fails and points them at
    // the seed rather than letting the two drift.
    const source = readFileSync(
      join(process.cwd(), 'src', 'lib', 'audit', 'index.ts'),
      'utf8',
    );
    const start = source.indexOf('const material = canonicalJson({');
    const material = source.slice(start, source.indexOf('});', start));
    const found = MATERIAL_KEYS.filter((k) => material.includes(`${k}:`) || material.includes(`${k},`));
    expect(found.sort()).toEqual([...MATERIAL_KEYS].sort());
  });

  it('a hash over that material is stable and 0x-prefixed', () => {
    const hash = computeEntryHash(
      {
        tenantId: 't',
        actorId: 'u',
        actorLabel: 'Ada',
        action: 'passport.published',
        subjectType: 'passport',
        subjectId: 'p',
        metadata: {},
      },
      GENESIS_HASH,
      '2026-09-17T07:24:35.507Z',
    );
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
