import { describe, expect, it } from 'vitest';
import { ApiError, badRequest, forbidden, unprocessable } from '@/lib/api/errors';

async function body(error: ApiError) {
  return (await error.toResponse('/api/v1/passports').json()) as Record<string, unknown>;
}

describe('problem documents (RFC 9457)', () => {
  it('keeps the title stable and puts the specific explanation in detail', async () => {
    // The title groups occurrences; the detail describes this one. Collapsing
    // them means a client cannot translate or group errors at all.
    const problem = await body(forbidden('This API key is missing the passports:write scope.'));
    expect(problem.title).toBe('Forbidden');
    expect(problem.detail).toBe('This API key is missing the passports:write scope.');
    expect(problem.status).toBe(403);
  });

  it('omits detail entirely when there is none to give', async () => {
    const problem = await body(new ApiError(418, 'Teapot'));
    expect(problem.title).toBe('Teapot');
    expect('detail' in problem).toBe(false);
  });

  it('carries field-level errors for form rendering', async () => {
    const problem = await body(
      unprocessable('Some values are invalid.', { 'identity.gtin': ['Check digit is wrong.'] }),
    );
    expect(problem.errors).toEqual({ 'identity.gtin': ['Check digit is wrong.'] });
  });

  it('derives a stable type URI from the title, not the detail', async () => {
    const a = await body(badRequest('One explanation.'));
    const b = await body(badRequest('A completely different explanation.'));
    expect(a.type).toBe(b.type);
    expect(a.type).toContain('bad-request');
  });

  it('sets the problem+json content type and the instance', async () => {
    const response = forbidden('nope').toResponse('/api/v1/passports');
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
    expect((await response.json()).instance).toBe('/api/v1/passports');
  });
});
