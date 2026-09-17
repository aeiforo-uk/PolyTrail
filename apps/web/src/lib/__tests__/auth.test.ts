import { describe, expect, it } from 'vitest';
import { hashPassword, randomToken, verifyPassword } from '@/lib/auth/password';
import { INTERNAL_ROLES, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, isRole } from '@/lib/auth/roles';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('tangled loom spindle cotton');
    expect(await verifyPassword('tangled loom spindle cotton', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  }, 30_000);

  it('salts, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  }, 30_000);

  it('normalises unicode so a composed and decomposed password match', async () => {
    // "é" can be one code point or two. Without NFKC a user who types it one
    // way on their phone cannot sign in from their laptop.
    const hash = await hashPassword('café');
    expect(await verifyPassword('café', hash)).toBe(true);
  }, 30_000);

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });
});

describe('tokens', () => {
  it('produces url-safe tokens of adequate length', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('roles', () => {
  it('labels and describes every role', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });

  it('treats external counterparties as not internal', () => {
    for (const role of ['SUPPLIER', 'CERTIFIER', 'REPAIRER', 'RECYCLER', 'AUTHORITY'] as const) {
      expect(INTERNAL_ROLES).not.toContain(role);
    }
  });

  it('recognises valid role strings only', () => {
    expect(isRole('BRAND_ADMIN')).toBe(true);
    expect(isRole('SUPERUSER')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe('personas', () => {
  it('gives every role a home inside a surface it is allowed to enter', async () => {
    const { PERSONAS, canEnter, homeFor } = await import('@/lib/auth/personas');
    for (const role of ROLES) {
      expect(canEnter(role, homeFor(role))).toBe(true);
      expect(PERSONAS[role].summary).toBeTruthy();
    }
  });

  it('keeps external roles out of the brand console', async () => {
    const { canEnter } = await import('@/lib/auth/personas');
    for (const role of ['REPAIRER', 'RECYCLER', 'AUTHORITY', 'SUPPLIER', 'CERTIFIER'] as const) {
      expect(canEnter(role, '/console')).toBe(false);
      expect(canEnter(role, '/console/passports')).toBe(false);
    }
  });

  it('keeps brand roles out of the authority surface', async () => {
    const { canEnter } = await import('@/lib/auth/personas');
    for (const role of ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER'] as const) {
      expect(canEnter(role, '/authority')).toBe(false);
    }
  });

  it('matches on a path boundary, not a bare prefix', async () => {
    const { canEnter } = await import('@/lib/auth/personas');
    // `/console-admin` must not be authorised by an allowance for `/console`.
    expect(canEnter('BRAND_ADMIN', '/console-admin')).toBe(false);
    expect(canEnter('BRAND_ADMIN', '/console/passports/abc')).toBe(true);
  });

  it('treats every persona surface as protected', async () => {
    const { isProtected } = await import('@/lib/auth/personas');
    for (const path of ['/console', '/partner', '/authority', '/supplier', '/certifier']) {
      expect(isProtected(path)).toBe(true);
    }
    for (const path of ['/', '/login', '/p/ABC', '/01/0871234567890', '/invite/x', '/t/x', '/s/x']) {
      expect(isProtected(path)).toBe(false);
    }
  });
});
