import { z } from 'zod';
import { passportPayloadSchema } from '@/lib/passport/schema';
import { CATEGORIES } from '@/lib/passport/vocab';
import { API_SCOPES, SCOPE_DESCRIPTIONS, type ApiScope } from '@/lib/api-keys/scopes';
import { ACCESS_TIERS } from '@/lib/tier/types';

/**
 * The API contract, and the OpenAPI document generated from it.
 *
 * Every vendor in this category publishes API "documentation" as prose on a
 * marketing site. Prose drifts: the endpoint is renamed, the scope changes, the
 * page does not. So this file holds the contract itself — request schemas the
 * routes actually parse with, and an operation registry the routes actually
 * take their scopes, rate limits and cache policy from — and the OpenAPI
 * document is rendered from those same values. A route cannot diverge from the
 * spec without the divergence being a compile error or a deleted import.
 *
 * Emitted as OpenAPI 3.1, which is a superset of JSON Schema 2020-12, so the
 * passport payload schema can be embedded verbatim rather than transliterated.
 */

// ───────────────────────────────────────────────────────────────────────────
// Request schemas — the routes parse with these
// ───────────────────────────────────────────────────────────────────────────

export const listPassportsQuerySchema = z.object({
  status: z
    .enum([
      'draft',
      'in_review',
      'changes_requested',
      'approved',
      'published',
      'suspended',
      'recalled',
      'withdrawn',
      'archived',
    ])
    .optional(),
  /** ISO 8601 instant. Returns passports modified strictly after it. */
  updatedSince: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

export const createPassportBodySchema = z.object({
  productName: z.string().min(1).max(255),
  category: z.enum(Object.keys(CATEGORIES) as [string, ...string[]]),
  styleNumber: z.string().max(128).optional(),
  sku: z.string().max(128).optional(),
  gtin: z.string().regex(/^\d{8,14}$/, 'A GTIN is 8 to 14 digits.').optional(),
  colourName: z.string().max(128).optional(),
  size: z.string().max(32).optional(),
  scope: z.enum(['model', 'batch', 'item']).default('model'),
});

/**
 * PATCH merges at the top level of the payload only.
 *
 * A deep merge cannot express "remove the third fibre" without inventing a
 * patch language, and a full replace makes every client re-send the whole
 * passport to change one field. Section-level replacement is the compromise
 * that is predictable enough to document in one sentence: send
 * `{"payload": {"care": {…}}}` and the care section is replaced, everything
 * else is untouched.
 */
export const updatePassportBodySchema = z
  .object({
    payload: z.record(z.string(), z.unknown()).optional(),
    changeReason: z.string().max(1000).optional(),
    status: z
      .enum([
        'draft',
        'in_review',
        'changes_requested',
        'approved',
        'published',
        'suspended',
        'recalled',
        'withdrawn',
        'archived',
      ])
      .optional(),
    statusReason: z.string().max(1000).optional(),
    recall: z
      .object({
        severity: z.enum(['low', 'medium', 'high']),
        instructions: z.string().min(1).max(2000),
      })
      .optional(),
  })
  .refine((body) => body.payload !== undefined || body.status !== undefined, {
    message: 'Send `payload`, `status`, or both. An empty patch does nothing.',
  });

export const issueCredentialBodySchema = z.object({
  /** Defaults to the published version, or the current one if never published. */
  version: z.number().int().positive().optional(),
  /** Days until the credential expires. Omit for a credential with no expiry. */
  validForDays: z.number().int().min(1).max(3650).optional(),
});

export const verifyCredentialBodySchema = z.object({
  document: z.record(z.string(), z.unknown()),
});

export const exportQuerySchema = z.object({
  status: z.string().max(32).optional(),
  updatedSince: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(10_000).default(5_000),
});

// ───────────────────────────────────────────────────────────────────────────
// Operation registry — the routes take their guards from this
// ───────────────────────────────────────────────────────────────────────────

export interface ApiOperation {
  method: 'get' | 'post' | 'patch';
  /** OpenAPI path template, relative to the `/api/v1` server. */
  path: string;
  summary: string;
  description: string;
  scopes: readonly ApiScope[];
  /** Requests per minute. Omitted means the wrapper default. */
  limit?: number;
  cacheControl?: string;
  parameters?: readonly OpenApiParameter[];
  requestBody?: { readonly schema: Record<string, unknown>; readonly description?: string };
  responses: Readonly<
    Record<string, { readonly description: string; readonly schema?: Record<string, unknown>; readonly mediaType?: string }>
  >;
}

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  description: string;
  schema: Record<string, unknown>;
}

const DPP_ID_PARAM: OpenApiParameter = {
  name: 'dppId',
  in: 'path',
  required: true,
  description:
    'The public passport identifier — 16 Crockford base32 characters. Hyphens and lower case are accepted and normalised.',
  schema: { type: 'string', pattern: '^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z-]{16,19}$' },
};

/**
 * Client-revalidated rather than cached outright. Passport data is
 * tenant-scoped, so it must never sit in a shared cache, but a client that
 * holds an ETag should be able to ask cheaply whether anything moved.
 */
const READ_CACHE = 'private, no-cache';
const WRITE_LIMIT = 60;

export const OPERATIONS = {
  listPassports: {
    method: 'get',
    path: '/passports',
    summary: 'List passports',
    description:
      'Passports in the key’s workspace, newest change first. Paginates by opaque cursor: follow `page.nextCursor` until it is null. Offsets are not offered, because a list that changes while you page through it silently skips rows.',
    scopes: ['passports:read'],
    cacheControl: READ_CACHE,
    parameters: [
      {
        name: 'status',
        in: 'query',
        description: 'Return only passports in this lifecycle state.',
        schema: { type: 'string', enum: statusEnumValues() },
      },
      {
        name: 'updatedSince',
        in: 'query',
        description:
          'RFC 3339 instant. Returns passports changed strictly after it — the field to poll on for an incremental sync.',
        schema: { type: 'string', format: 'date-time' },
      },
      {
        name: 'limit',
        in: 'query',
        description: 'Page size, 1–200. Defaults to 50.',
        schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
      {
        name: 'cursor',
        in: 'query',
        description: 'The `page.nextCursor` from the previous response.',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'A page of passports.', schema: ref('PassportPage') },
      '401': { description: 'Missing, malformed, revoked or expired key.', schema: ref('Problem'), mediaType: 'application/problem+json' },
      '403': { description: 'The key lacks `passports:read`.', schema: ref('Problem'), mediaType: 'application/problem+json' },
      '429': { description: 'Rate limited. See `RateLimit-Reset`.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  createPassport: {
    method: 'post',
    path: '/passports',
    summary: 'Create a passport',
    description:
      'Creates a product and a draft passport at version 1. The passport is not resolvable publicly until it is published.',
    scopes: ['passports:write'],
    limit: WRITE_LIMIT,
    requestBody: { schema: ref('CreatePassportRequest') },
    responses: {
      '201': { description: 'The created passport.', schema: ref('Passport') },
      '409': { description: 'The workspace passport quota is exhausted.', schema: ref('Problem'), mediaType: 'application/problem+json' },
      '422': { description: 'The body did not validate.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  getPassport: {
    method: 'get',
    path: '/passports/{dppId}',
    summary: 'Read a passport',
    description:
      'The full current payload, untiered — the key’s workspace owns this passport, so nothing is withheld. For the tier-filtered public projection, read the passport’s public JSON instead.',
    scopes: ['passports:read'],
    cacheControl: READ_CACHE,
    parameters: [DPP_ID_PARAM],
    responses: {
      '200': { description: 'The passport and its current payload.', schema: ref('PassportDetail') },
      '404': { description: 'No such passport in this workspace.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  updatePassport: {
    method: 'patch',
    path: '/passports/{dppId}',
    summary: 'Update a passport',
    description:
      'Writes a new version, changes the lifecycle state, or both. Payload sections are replaced wholesale; sections you omit are carried forward. A save whose canonical hash matches the current version is discarded rather than written.',
    scopes: ['passports:write'],
    limit: WRITE_LIMIT,
    parameters: [DPP_ID_PARAM],
    requestBody: { schema: ref('UpdatePassportRequest') },
    responses: {
      '200': { description: 'The updated passport.', schema: ref('PassportDetail') },
      '403': {
        description:
          'The state change is not permitted for this key’s role, or `status` was sent without the `passports:publish` scope.',
        schema: ref('Problem'),
        mediaType: 'application/problem+json',
      },
      '409': { description: 'The passport is not editable in its current state.', schema: ref('Problem'), mediaType: 'application/problem+json' },
      '422': { description: 'The payload failed validation, or failed the stricter publication check.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  listPassportVersions: {
    method: 'get',
    path: '/passports/{dppId}/versions',
    summary: 'List passport versions',
    description:
      'Every version ever written, newest first, each with the SHA-256 of its RFC 8785 canonical form. Versions are immutable; this is the record a regulator reconstructs a change history from.',
    scopes: ['passports:read'],
    cacheControl: READ_CACHE,
    parameters: [DPP_ID_PARAM],
    responses: {
      '200': { description: 'The version history.', schema: ref('VersionList') },
      '404': { description: 'No such passport in this workspace.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  listCredentials: {
    method: 'get',
    path: '/passports/{dppId}/credentials',
    summary: 'List credentials for a passport',
    description:
      'The signed credentials attached to this passport — both those Polytrail issued over the passport itself and third-party scheme certificates recorded against it.',
    scopes: ['credentials:read'],
    cacheControl: READ_CACHE,
    parameters: [DPP_ID_PARAM],
    responses: {
      '200': { description: 'The credentials.', schema: ref('CredentialList') },
      '404': { description: 'No such passport in this workspace.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  issueCredential: {
    method: 'post',
    path: '/passports/{dppId}/credentials',
    summary: 'Issue a passport credential',
    description:
      'Signs a W3C Verifiable Credential 2.0 over the passport’s canonical hash and its public-tier claims, using the workspace’s active signing key. Returns the enveloped credential.',
    scopes: ['credentials:issue'],
    limit: 30,
    parameters: [DPP_ID_PARAM],
    requestBody: { schema: ref('IssueCredentialRequest') },
    responses: {
      '201': { description: 'The issued credential.', schema: ref('Credential') },
      '422': { description: 'The requested version does not exist.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  verifyCredential: {
    method: 'post',
    path: '/credentials/verify',
    summary: 'Verify a credential',
    description:
      'Checks the signature, the validity window and the revocation state of a credential issued by this platform, and returns a structured verdict with a plain-language reason when it fails.',
    scopes: ['credentials:read'],
    limit: 120,
    requestBody: { schema: ref('VerifyCredentialRequest') },
    responses: {
      '200': {
        description:
          'The verdict. Note the 200: a credential that fails verification is a successful verification request with a negative answer.',
        schema: ref('VerificationVerdict'),
      },
    },
  },

  getEvidencePack: {
    method: 'get',
    path: '/passports/{dppId}/evidence-pack',
    summary: 'Download a regulator evidence pack',
    description:
      'One JSON bundle containing the passport, every version with its hash, the full status history, the attached credentials, and a manifest carrying a canonical hash over the whole bundle. This is the artefact to hand a market-surveillance authority.',
    scopes: ['exports:read'],
    limit: 30,
    parameters: [DPP_ID_PARAM],
    responses: {
      '200': { description: 'The evidence pack.', schema: ref('EvidencePack') },
      '404': { description: 'No such passport in this workspace.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  getPassportJsonLd: {
    method: 'get',
    path: '/passports/{dppId}/jsonld',
    summary: 'Read a passport as JSON-LD',
    description:
      'The public-tier projection as linked data. Terms are mapped to published IRIs from schema.org, the GS1 Web Vocabulary and Dublin Core; fields with no published IRI are listed separately under `_unmapped` rather than given an invented namespace.',
    scopes: ['passports:read'],
    cacheControl: READ_CACHE,
    parameters: [DPP_ID_PARAM],
    responses: {
      '200': { description: 'The JSON-LD projection.', mediaType: 'application/ld+json', schema: { type: 'object' } },
      '404': { description: 'No such passport, or it has never been published.', schema: ref('Problem'), mediaType: 'application/problem+json' },
    },
  },

  exportPassportsCsv: {
    method: 'get',
    path: '/exports/passports.csv',
    summary: 'Export passports as CSV',
    description: 'One row per passport, with identifiers, lifecycle state, completeness and current hash.',
    scopes: ['exports:read'],
    limit: 30,
    parameters: [
      { name: 'status', in: 'query', description: 'Filter by lifecycle state.', schema: { type: 'string', enum: statusEnumValues() } },
      { name: 'updatedSince', in: 'query', description: 'RFC 3339 instant.', schema: { type: 'string', format: 'date-time' } },
    ],
    responses: {
      '200': { description: 'CSV, UTF-8 with a BOM so Excel reads accented characters correctly.', mediaType: 'text/csv', schema: { type: 'string' } },
    },
  },

  exportAuditCsv: {
    method: 'get',
    path: '/exports/audit.csv',
    summary: 'Export the audit log as CSV',
    description:
      'The workspace audit chain, oldest first, including each entry’s previous and entry hash so the chain can be re-verified outside Polytrail.',
    scopes: ['exports:read'],
    limit: 30,
    parameters: [
      { name: 'limit', in: 'query', description: 'Maximum entries, 1–10000. Defaults to 5000.', schema: { type: 'integer', minimum: 1, maximum: 10000, default: 5000 } },
    ],
    responses: {
      '200': { description: 'CSV.', mediaType: 'text/csv', schema: { type: 'string' } },
    },
  },
} as const satisfies Record<string, ApiOperation>;

export type OperationId = keyof typeof OPERATIONS;

/**
 * The guard configuration for one operation, in the shape `withApiKey` takes.
 * Routes call this instead of restating their scopes, which is what keeps the
 * published contract and the enforced contract the same thing.
 */
export function operationGuard(id: OperationId): {
  scopes: readonly ApiScope[];
  limit?: number;
  cacheControl?: string;
} {
  const operation = OPERATIONS[id] as ApiOperation;
  return {
    scopes: operation.scopes,
    ...(operation.limit === undefined ? {} : { limit: operation.limit }),
    ...(operation.cacheControl === undefined ? {} : { cacheControl: operation.cacheControl }),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Document generation
// ───────────────────────────────────────────────────────────────────────────

function ref(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` };
}

function statusEnumValues(): string[] {
  return [
    'draft',
    'in_review',
    'changes_requested',
    'approved',
    'published',
    'suspended',
    'recalled',
    'withdrawn',
    'archived',
  ];
}

/** JSON Schema 2020-12 from a zod schema, which OpenAPI 3.1 embeds directly. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>;
}

export function buildOpenApiDocument(baseUrl: string): Record<string, unknown> {
  const server = `${baseUrl.replace(/\/+$/, '')}/api/v1`;

  const paths: Record<string, Record<string, unknown>> = {};
  for (const [operationId, operation] of Object.entries(OPERATIONS) as Array<
    [string, ApiOperation]
  >) {
    const item = (paths[operation.path] ??= {});
    item[operation.method] = {
      operationId,
      summary: operation.summary,
      description: operation.description,
      tags: [tagFor(operation.path)],
      security: [{ apiKey: [...operation.scopes] }],
      ...(operation.parameters ? { parameters: operation.parameters } : {}),
      ...(operation.requestBody
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: operation.requestBody.schema } },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(operation.responses).map(([status, response]) => [
          status,
          {
            description: response.description,
            ...(response.schema
              ? {
                  content: {
                    [response.mediaType ?? 'application/json']: { schema: response.schema },
                  },
                }
              : {}),
            headers: rateLimitHeaderSpec(),
          },
        ]),
      ),
    };
  }

  return {
    openapi: '3.1.1',
    info: {
      title: 'Polytrail Passport API',
      version: '1.0.0',
      summary: 'Read and write textile Digital Product Passports.',
      description: API_DESCRIPTION,
      contact: { name: 'Polytrail', url: 'https://polytrail.eu' },
      license: { name: 'Proprietary', identifier: 'LicenseRef-Polytrail' },
    },
    servers: [{ url: server, description: 'This deployment' }],
    tags: [
      { name: 'Passports', description: 'Create, read and update product passports.' },
      { name: 'Credentials', description: 'Issue and verify signed passport credentials.' },
      { name: 'Exports', description: 'CSV and regulator evidence artefacts.' },
    ],
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'pt_live_<32 characters>',
          description: [
            'Send the key as `Authorization: Bearer pt_live_…`, or as `X-API-Key` where an Authorization header is not available.',
            '',
            'Scopes:',
            ...API_SCOPES.map((scope) => `- \`${scope}\` — ${SCOPE_DESCRIPTIONS[scope]}`),
          ].join('\n'),
        },
      },
      schemas: {
        Problem: {
          type: 'object',
          description: 'RFC 9457 problem details. Served as `application/problem+json`.',
          properties: {
            type: { type: 'string', format: 'uri' },
            title: { type: 'string' },
            status: { type: 'integer' },
            detail: { type: 'string' },
            instance: { type: 'string' },
            errors: {
              type: 'object',
              description: 'Field-level issues keyed by dot-path into the request body.',
              additionalProperties: { type: 'array', items: { type: 'string' } },
            },
          },
          required: ['type', 'title', 'status'],
        },
        PassportPayload: jsonSchema(passportPayloadSchema),
        CreatePassportRequest: jsonSchema(createPassportBodySchema),
        UpdatePassportRequest: jsonSchema(updatePassportBodySchema),
        IssueCredentialRequest: jsonSchema(issueCredentialBodySchema),
        VerifyCredentialRequest: jsonSchema(verifyCredentialBodySchema),
        Passport: {
          type: 'object',
          properties: {
            dppId: { type: 'string', description: 'Public identifier, printed into the data carrier.' },
            passportUrl: { type: 'string', format: 'uri' },
            productName: { type: 'string' },
            status: { type: 'string', enum: statusEnumValues() },
            scope: { type: 'string', enum: ['model', 'batch', 'item'] },
            gtin: { type: ['string', 'null'] },
            sku: { type: ['string', 'null'] },
            colourName: { type: ['string', 'null'] },
            size: { type: ['string', 'null'] },
            version: { type: 'integer', description: 'The latest version written.' },
            publishedVersion: { type: ['integer', 'null'], description: 'The version served publicly.' },
            completeness: { type: 'integer', minimum: 0, maximum: 100 },
            dataHash: { type: ['string', 'null'], description: 'SHA-256 over the RFC 8785 canonical form of the current version.' },
            publishedAt: { type: ['string', 'null'], format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['dppId', 'passportUrl', 'status', 'version', 'completeness', 'updatedAt'],
        },
        PassportDetail: {
          allOf: [
            ref('Passport'),
            {
              type: 'object',
              properties: { payload: ref('PassportPayload') },
              required: ['payload'],
            },
          ],
        },
        PassportPage: {
          type: 'object',
          properties: {
            data: { type: 'array', items: ref('Passport') },
            page: {
              type: 'object',
              properties: {
                limit: { type: 'integer' },
                nextCursor: { type: ['string', 'null'], description: 'Null on the last page.' },
              },
              required: ['limit', 'nextCursor'],
            },
          },
          required: ['data', 'page'],
        },
        VersionList: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  version: { type: 'integer' },
                  dataHash: { type: 'string' },
                  credentialHash: { type: ['string', 'null'] },
                  changeReason: { type: ['string', 'null'] },
                  createdAt: { type: 'string', format: 'date-time' },
                  published: { type: 'boolean', description: 'True for the version currently served publicly.' },
                },
                required: ['version', 'dataHash', 'createdAt', 'published'],
              },
            },
          },
          required: ['data'],
        },
        Credential: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            scheme: { type: 'string' },
            credentialType: { type: 'string' },
            issuerName: { type: 'string' },
            issuerDid: { type: ['string', 'null'] },
            subjectDid: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['active', 'expired', 'revoked', 'superseded'] },
            documentHash: { type: 'string' },
            validFrom: { type: ['string', 'null'], format: 'date-time' },
            validUntil: { type: ['string', 'null'], format: 'date-time' },
            document: { type: 'object', description: 'The signed envelope exactly as issued.' },
          },
          required: ['id', 'scheme', 'credentialType', 'status', 'documentHash', 'document'],
        },
        CredentialList: {
          type: 'object',
          properties: { data: { type: 'array', items: ref('Credential') } },
          required: ['data'],
        },
        VerificationVerdict: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            mechanism: { type: 'string', description: 'The EN 18246 integrity mechanism the envelope declares.' },
            reason: { type: ['string', 'null'], description: 'Plain-language explanation when `valid` is false.' },
            issuer: { type: ['string', 'null'] },
            subject: { type: ['string', 'null'] },
            checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  passed: { type: 'boolean' },
                  detail: { type: ['string', 'null'] },
                },
                required: ['name', 'passed'],
              },
            },
          },
          required: ['valid', 'mechanism', 'checks'],
        },
        EvidencePack: {
          type: 'object',
          properties: {
            manifest: {
              type: 'object',
              description: 'Identifies the bundle and carries a canonical hash over everything else in it.',
              properties: {
                formatVersion: { type: 'string' },
                generatedAt: { type: 'string', format: 'date-time' },
                bundleHash: { type: 'string' },
                hashAlgorithm: { type: 'string' },
                canonicalization: { type: 'string' },
                contents: { type: 'object', additionalProperties: { type: 'integer' } },
              },
              required: ['formatVersion', 'generatedAt', 'bundleHash'],
            },
            passport: ref('Passport'),
            versions: { type: 'array', items: { type: 'object' } },
            statusHistory: { type: 'array', items: { type: 'object' } },
            lifecycleEvents: { type: 'array', items: { type: 'object' } },
            credentials: { type: 'array', items: ref('Credential') },
            accessTiers: { type: 'array', items: { type: 'string', enum: [...ACCESS_TIERS] } },
          },
          required: ['manifest', 'passport', 'versions', 'statusHistory', 'credentials'],
        },
      },
    },
  };
}

function tagFor(path: string): string {
  if (path.startsWith('/credentials') || path.includes('/credentials')) return 'Credentials';
  if (path.startsWith('/exports') || path.includes('evidence-pack')) return 'Exports';
  return 'Passports';
}

/**
 * Declared on every response, including errors, because a client that is being
 * throttled is exactly the client that needs to read these.
 */
function rateLimitHeaderSpec() {
  return {
    'RateLimit-Limit': { description: 'Requests permitted in the current window.', schema: { type: 'integer' } },
    'RateLimit-Remaining': { description: 'Requests left in the current window.', schema: { type: 'integer' } },
    'RateLimit-Reset': { description: 'Seconds until the window resets.', schema: { type: 'integer' } },
  };
}

const API_DESCRIPTION = `
Read and write textile Digital Product Passports.

**Authentication.** Every request needs an API key: \`Authorization: Bearer pt_live_…\`.
Keys are workspace-scoped and carry explicit scopes. A key acts on behalf of the
person who created it, so every write it performs is attributable in the audit
chain to a named human who still holds a role in the workspace.

**Errors** are RFC 9457 problem documents, served as \`application/problem+json\`,
with field-level issues under \`errors\` keyed by dot-path into the request body.

**Rate limits.** \`RateLimit-Limit\`, \`RateLimit-Remaining\` and \`RateLimit-Reset\`
are on every response. A 429 also carries \`Retry-After\`.

**Integrity.** Passport versions are immutable and each carries a SHA-256 over
its RFC 8785 (JCS) canonical form. That digest is what a credential signs and
what an external registry would record, so a third party can check a passport
against a registry entry without trusting this server.

**Standards.** EN 18219:2026 permits five identifier schemes and EN 18246:2026
permits four integrity mechanisms. Polytrail implements W3C Verifiable
Credentials 2.0 today and exposes the others through the same interface rather
than assuming the market settles on one. Conformance statements in responses are
self-declared: no conformity assessment scheme exists for these standards.
`.trim();
