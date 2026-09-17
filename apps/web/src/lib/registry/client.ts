import { createHash } from 'node:crypto';
import {
  PROOF_VALIDITY_DAYS,
  RegistryError,
  type RegistryClient,
  type RegistryEndpointDescription,
  type RegistryMode,
  type RegistryProof,
  type RegistryRecord,
  type RegistryState,
  type SubmitOptions,
} from './types';

/**
 * Two implementations of one contract.
 *
 * The mock is not a stub. It assigns identifiers, issues a 90-day proof,
 * honours idempotency keys, supersedes an earlier version and refuses to
 * withdraw something it never registered — because a mock that always says yes
 * teaches a team nothing about the day the real endpoint says no.
 *
 * Mock is the default, and the console states which one is active on every
 * screen where it matters. A product that cannot tell you whether it just
 * filed with the European Commission or with a Map in memory has no business
 * being near a compliance workflow.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4;

function proofFor(record: RegistryRecord, registryId: string, issuedAt: Date): RegistryProof {
  const expires = new Date(issuedAt.getTime() + PROOF_VALIDITY_DAYS * 86_400_000);
  return {
    registryId,
    registryUrl: `${resolverBase()}${encodeURIComponent(registryId)}`,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expires.toISOString(),
    versionHash: record.versionHash,
  };
}

function resolverBase(): string {
  const base = process.env.EU_REGISTRY_RESOLVER_BASE ?? 'https://dpp.ec.europa.eu/r/';
  return base.endsWith('/') ? base : `${base}/`;
}

// ───────────────────────────────────────────────────────────────────────────
// Mock
// ───────────────────────────────────────────────────────────────────────────

interface MockEntry {
  record: RegistryRecord;
  proof: RegistryProof;
  state: RegistryState;
}

declare global {
  // Cached on `globalThis` so a Next.js hot reload does not lose the filings a
  // developer just made and leave the console pointing at identifiers the
  // registry has "never seen".
  var __polytrailRegistryMock: Map<string, MockEntry> | undefined;
  var __polytrailRegistryMockKeys: Map<string, string> | undefined;
}

const entries: Map<string, MockEntry> = (globalThis.__polytrailRegistryMock ??= new Map());
const byIdempotencyKey: Map<string, string> = (globalThis.__polytrailRegistryMockKeys ??= new Map());

const MOCK_ENDPOINT: RegistryEndpointDescription = {
  mode: 'mock',
  target: 'In-memory rehearsal registry (no filing leaves this machine)',
  authoritative: false,
};

/**
 * Deterministic identifier.
 *
 * Derived from the idempotency key rather than random, so that the same filing
 * retried after a timeout resolves to the same registration even across a
 * process restart. This is the property that makes a double-file impossible
 * rather than merely unlikely.
 */
function mockIdFor(key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 16).toUpperCase();
  return `EU-DPP-${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}`;
}

export const mockRegistryClient: RegistryClient = {
  endpoint: MOCK_ENDPOINT,

  async submit(record, options) {
    const existingId = byIdempotencyKey.get(options.idempotencyKey);
    if (existingId) {
      const existing = entries.get(existingId);
      // Replaying the same key returns the original registration untouched —
      // including its original expiry, so a retry cannot silently extend a proof.
      if (existing) return { proof: existing.proof, state: existing.state, endpoint: MOCK_ENDPOINT };
    }

    // A new version of a passport already on file supersedes the old entry
    // rather than sitting alongside it, which is what the real Registry does
    // and what makes "which registration is current" answerable.
    for (const [id, entry] of entries) {
      if (entry.record.dppId === record.dppId && entry.state === 'registered') {
        entries.set(id, { ...entry, state: 'superseded' });
      }
    }

    const registryId = mockIdFor(options.idempotencyKey);
    const proof = proofFor(record, registryId, new Date());
    entries.set(registryId, { record, proof, state: 'registered' });
    byIdempotencyKey.set(options.idempotencyKey, registryId);

    return { proof, state: 'registered', endpoint: MOCK_ENDPOINT };
  },

  async status(registryId) {
    const entry = entries.get(registryId);
    if (!entry) {
      return {
        registryId,
        state: 'unknown',
        proof: null,
        checkedAt: new Date().toISOString(),
        endpoint: MOCK_ENDPOINT,
      };
    }
    const expired = new Date(entry.proof.expiresAt).getTime() < Date.now();
    return {
      registryId,
      state: entry.state === 'registered' && expired ? 'expired' : entry.state,
      proof: entry.proof,
      checkedAt: new Date().toISOString(),
      endpoint: MOCK_ENDPOINT,
    };
  },

  async withdraw(registryId) {
    const entry = entries.get(registryId);
    if (!entry) {
      throw new RegistryError('NOT_FOUND', `No registration ${registryId} exists to withdraw.`);
    }
    const withdrawnAt = new Date().toISOString();
    entries.set(registryId, { ...entry, state: 'withdrawn' });
    return { registryId, withdrawnAt, endpoint: MOCK_ENDPOINT };
  },
};

/** Test seam: forget every rehearsal filing. */
export function resetMockRegistry(): void {
  entries.clear();
  byIdempotencyKey.clear();
}

// ───────────────────────────────────────────────────────────────────────────
// HTTP
// ───────────────────────────────────────────────────────────────────────────

interface HttpRegistryConfig {
  baseUrl: string;
  apiKey?: string;
  authoritative: boolean;
}

/**
 * Retry with exponential backoff and full jitter.
 *
 * Only idempotent-safe failures are retried: a timeout, a connection error, or
 * a 5xx/429 from the far end. A 4xx means the Registry read the record and
 * disliked it, and sending it again unchanged is just noise. Because the
 * idempotency key is derived from the record, a retry after a timeout that in
 * fact succeeded resolves to the original registration rather than a second one.
 */
async function withRetry<T>(operation: string, run: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof RegistryError ? error.code === 'UNAVAILABLE' : isTransport(error);
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const ceiling = Math.min(8_000, 500 * 2 ** (attempt - 1));
      await sleep(Math.random() * ceiling);
    }
  }

  if (lastError instanceof RegistryError) throw lastError;
  throw new RegistryError(
    'UNAVAILABLE',
    `The Registry did not answer ${operation} after ${MAX_ATTEMPTS} attempts.`,
    lastError,
  );
}

function isTransport(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TypeError');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function httpRegistryClient(config: HttpRegistryConfig): RegistryClient {
  const base = config.baseUrl.replace(/\/+$/, '');
  const endpoint: RegistryEndpointDescription = {
    mode: 'http',
    target: base,
    authoritative: config.authoritative,
  };

  async function call(
    path: string,
    init: RequestInit & { timeoutMs?: number },
  ): Promise<unknown> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (response.status === 404) {
      throw new RegistryError('NOT_FOUND', 'The Registry has no record at that identifier.');
    }
    if (response.status === 429 || response.status >= 500) {
      throw new RegistryError(
        'UNAVAILABLE',
        `The Registry answered ${response.status}. This is retryable.`,
      );
    }
    if (!response.ok) {
      // The Registry's own words, verbatim and truncated. A rejection is read
      // by a human, and paraphrasing it costs them the detail they need.
      const body = await response.text().catch(() => '');
      throw new RegistryError(
        'REJECTED',
        `The Registry rejected the filing (${response.status}). ${body.slice(0, 500)}`.trim(),
      );
    }
    return response.json();
  }

  return {
    endpoint,

    async submit(record, options: SubmitOptions) {
      const body = await withRetry('a submission', () =>
        call('/registrations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // The header the far end uses to recognise a replay. Sent on every
            // attempt, including the first, so attempt 1 and attempt 4 are the
            // same request as far as the Registry is concerned.
            'Idempotency-Key': options.idempotencyKey,
          },
          body: JSON.stringify(record),
          timeoutMs: options.timeoutMs,
        }),
      );
      const proof = readProof(body, record.versionHash);
      return { proof, state: readState(body) ?? 'registered', endpoint };
    },

    async status(registryId) {
      const body = await withRetry('a status check', () =>
        call(`/registrations/${encodeURIComponent(registryId)}`, { method: 'GET' }),
      );
      return {
        registryId,
        state: readState(body) ?? 'unknown',
        proof: readOptionalProof(body),
        checkedAt: new Date().toISOString(),
        endpoint,
      };
    },

    async withdraw(registryId, reason) {
      await withRetry('a withdrawal', () =>
        call(`/registrations/${encodeURIComponent(registryId)}/withdrawal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        }),
      );
      return { registryId, withdrawnAt: new Date().toISOString(), endpoint };
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readState(body: unknown): RegistryState | null {
  const state = asRecord(body).state;
  const allowed: RegistryState[] = ['registered', 'superseded', 'withdrawn', 'expired', 'unknown'];
  return typeof state === 'string' && (allowed as string[]).includes(state)
    ? (state as RegistryState)
    : null;
}

function readOptionalProof(body: unknown): RegistryProof | null {
  const source = asRecord(body);
  if (typeof source.registrationId !== 'string' && typeof source.registryId !== 'string') return null;
  try {
    return readProof(body, typeof source.versionHash === 'string' ? source.versionHash : '');
  } catch {
    return null;
  }
}

/**
 * Read the proof, and fill in the 90-day expiry ourselves when the far end
 * omits it. Defaulting to "valid forever" on a missing field would turn a
 * Registry quirk into a silent compliance gap.
 */
function readProof(body: unknown, expectedVersionHash: string): RegistryProof {
  const source = asRecord(body);
  const registryId =
    typeof source.registrationId === 'string'
      ? source.registrationId
      : typeof source.registryId === 'string'
        ? source.registryId
        : null;

  if (!registryId) {
    throw new RegistryError('REJECTED', 'The Registry accepted the filing but returned no identifier.');
  }

  const issuedAt =
    typeof source.issuedAt === 'string' ? source.issuedAt : new Date().toISOString();
  const expiresAt =
    typeof source.expiresAt === 'string'
      ? source.expiresAt
      : new Date(new Date(issuedAt).getTime() + PROOF_VALIDITY_DAYS * 86_400_000).toISOString();

  return {
    registryId,
    registryUrl:
      typeof source.registrationUrl === 'string'
        ? source.registrationUrl
        : `${resolverBase()}${encodeURIComponent(registryId)}`,
    issuedAt,
    expiresAt,
    versionHash:
      typeof source.versionHash === 'string' ? source.versionHash : expectedVersionHash,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Selection
// ───────────────────────────────────────────────────────────────────────────

/**
 * Which client is active.
 *
 * Mock unless `EU_REGISTRY_MODE=http` *and* a base URL is configured. Falling
 * back to the mock on a half-configured http mode would be the worst of both:
 * a console that says "live" over a registry that is not.
 */
export function getRegistryClient(): RegistryClient {
  const mode = (process.env.EU_REGISTRY_MODE ?? 'mock') as RegistryMode;
  if (mode !== 'http') return mockRegistryClient;

  const baseUrl = process.env.EU_REGISTRY_URL;
  if (!baseUrl) {
    throw new RegistryError(
      'NOT_CONFIGURED',
      'EU_REGISTRY_MODE is http but EU_REGISTRY_URL is not set. Set the base URL, or switch back to mock.',
    );
  }

  return httpRegistryClient({
    baseUrl,
    apiKey: process.env.EU_REGISTRY_API_KEY,
    // Only a deployment that says so out loud files registrations of record.
    // Defaulting this to true would let a staging endpoint masquerade as the
    // Commission's.
    authoritative: process.env.EU_REGISTRY_AUTHORITATIVE === 'true',
  });
}

/** Describe the active endpoint without constructing a client that may throw. */
export function describeRegistryEndpoint(): RegistryEndpointDescription {
  try {
    return getRegistryClient().endpoint;
  } catch {
    return {
      mode: 'http',
      target: 'Misconfigured — EU_REGISTRY_MODE is http but EU_REGISTRY_URL is unset',
      authoritative: false,
    };
  }
}
