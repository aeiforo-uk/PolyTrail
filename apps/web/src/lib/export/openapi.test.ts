import { describe, expect, it } from 'vitest';
import { API_SCOPES } from '@/lib/api-keys/scopes';
import { OPERATIONS, buildOpenApiDocument, operationGuard } from './openapi';

const document = buildOpenApiDocument('https://polytrail.example') as {
  openapi: string;
  paths: Record<string, Record<string, { security: Array<Record<string, string[]>> }>>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
  servers: Array<{ url: string }>;
};

describe('OpenAPI document', () => {
  it('builds without throwing, including the embedded passport payload schema', () => {
    expect(document.openapi).toBe('3.1.1');
    expect(document.components.schemas.PassportPayload).toBeTypeOf('object');
    expect(document.servers[0]?.url).toBe('https://polytrail.example/api/v1');
  });

  // The whole reason the registry exists: the document and the routes read the
  // same values, so an operation cannot be documented with a scope it does not
  // enforce.
  it('documents exactly the operations the routes are guarded by', () => {
    for (const [operationId, operation] of Object.entries(OPERATIONS)) {
      const item = document.paths[operation.path];
      expect(item, `${operation.path} missing from the document`).toBeDefined();

      const rendered = item![operation.method];
      expect(rendered, `${operationId} missing from ${operation.path}`).toBeDefined();
      expect(rendered!.security[0]?.apiKey).toEqual([...operation.scopes]);
      expect(operationGuard(operationId as keyof typeof OPERATIONS).scopes).toEqual(
        operation.scopes,
      );
    }
  });

  it('only declares scopes that exist', () => {
    for (const operation of Object.values(OPERATIONS)) {
      for (const scope of operation.scopes) {
        expect(API_SCOPES).toContain(scope);
      }
    }
  });

  it('resolves every internal schema reference', () => {
    const names = new Set(Object.keys(document.components.schemas));
    const refs = [...JSON.stringify(document).matchAll(/#\/components\/schemas\/(\w+)/g)].map(
      (match) => match[1]!,
    );
    const missing = refs.filter((name) => !names.has(name));
    expect([...new Set(missing)]).toEqual([]);
  });

  it('describes the rate limit headers on every response', () => {
    const json = JSON.stringify(document);
    expect(json).toContain('RateLimit-Limit');
    expect(json).toContain('RateLimit-Remaining');
    expect(json).toContain('RateLimit-Reset');
  });
});
