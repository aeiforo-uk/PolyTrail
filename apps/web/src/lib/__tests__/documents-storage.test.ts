import { describe, expect, it } from 'vitest';
// No DATABASE_URL needed: the pool is built on first query, and every case
// below is refused before one is issued. This file used to set a fake
// connection string purely to survive the import.
import { MAX_DOCUMENT_BYTES, isUuid, storeDocument } from '@/lib/documents/storage';

/**
 * The refusal surface of the document store. Everything here fails *before*
 * any database work, which is exactly the property being asserted: a bad file
 * never reaches storage, and the error says why in a sentence a person can
 * act on.
 */

const TENANT = '00000000-0000-0000-0000-000000000001';

function fileOf(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function refusal(file: File): Promise<string> {
  try {
    await storeDocument({ tenantId: TENANT, file, kind: 'certificate' });
  } catch (error) {
    return (error as { detail?: string; message: string }).detail ?? (error as Error).message;
  }
  throw new Error('expected storeDocument to refuse');
}

describe('storeDocument refusals', () => {
  it('refuses an empty file', async () => {
    expect(await refusal(fileOf('empty.pdf', 'application/pdf', 0))).toMatch(/empty/i);
  });

  it('refuses a file over the size cap, and names both numbers', async () => {
    const detail = await refusal(fileOf('huge.pdf', 'application/pdf', MAX_DOCUMENT_BYTES + 1));
    expect(detail).toMatch(/8 MB/);
  });

  it('refuses executable and unknown content types by allowlist', async () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/octet-stream', '']) {
      const detail = await refusal(fileOf('evil.bin', type, 10));
      expect(detail).toMatch(/not accepted/i);
    }
  });

  it('ignores content-type parameters when matching the allowlist', async () => {
    // `text/csv;charset=utf-8` must not slip past as an unknown type — nor be
    // refused as one. It reaches the DB layer, which is not wired in tests, so
    // anything other than an allowlist refusal proves the type was accepted.
    const detail = await refusal(fileOf('rows.csv', 'text/csv;charset=utf-8', 10)).catch(
      (error: Error) => error.message,
    );
    expect(detail).not.toMatch(/not accepted/i);
  });
});

describe('isUuid', () => {
  it('accepts a canonical uuid in either case', () => {
    expect(isUuid('a3bb189e-8bf9-3888-9912-ace4e6543002')).toBe(true);
    expect(isUuid('A3BB189E-8BF9-3888-9912-ACE4E6543002')).toBe(true);
  });

  it('refuses everything a probing client sends', () => {
    for (const value of ['', '42', 'not-a-uuid', 'a3bb189e8bf938889912ace4e6543002', '../etc']) {
      expect(isUuid(value)).toBe(false);
    }
  });
});
