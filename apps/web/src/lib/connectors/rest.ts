import 'server-only';
import { badRequest } from '@/lib/api/errors';
import { isPrivateHost } from '@/lib/security/outbound-url';
import {
  DEFAULT_REST_SETTINGS,
  type Connector,
  type PullOptions,
  type PullResult,
  type RestSettings,
  type TestResult,
} from './types';
import { fieldValue, flattenRecord, selectOne, selectRecords } from './selector';

/**
 * The generic REST/JSON connector.
 *
 * One connector built properly rather than five built halfway. Nearly every
 * PIM, PLM and middleware in this market can be made to serve a JSON list over
 * HTTP with a bearer token; a configurable reader of that is worth more to a
 * brand than a named integration that does not exist yet.
 *
 * Two behaviours matter as much as fetching:
 *   • Nothing about the response is hidden. `test()` returns the body it got,
 *     truncated but unedited, because "connection failed" with no detail is
 *     the single most common way an integration screen wastes an afternoon.
 *   • The URL is checked before it is fetched. A tenant who could point a
 *     connector at `169.254.169.254` would read the cloud metadata service out
 *     of their own test panel.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const SAMPLE_BYTES = 2_000;

export class RestConnector implements Connector {
  readonly kind = 'rest' as const;
  readonly name: string;

  private readonly settings: RestSettings;
  private readonly secret: string | null;

  constructor(name: string, settings: Partial<RestSettings>, secret: string | null) {
    this.name = name;
    this.settings = { ...DEFAULT_REST_SETTINGS, ...settings };
    this.secret = secret;
  }

  async test(): Promise<TestResult> {
    const started = Date.now();

    let response: Response;
    let body: string;
    try {
      const url = this.urlFor(0, null, 1);
      response = await this.fetch(url);
      body = await response.text();
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'The request failed.',
        durationMs: Date.now() - started,
      };
    }

    const durationMs = Date.now() - started;
    const sample = body.slice(0, SAMPLE_BYTES);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `The source answered ${response.status} ${response.statusText}.`,
        sample,
        durationMs,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return {
        ok: false,
        status: response.status,
        message: 'The source answered, but not with JSON. Check the URL and any Accept header it needs.',
        sample,
        durationMs,
      };
    }

    const records = selectRecords(parsed, this.settings.recordSelector);
    if (records.length === 0) {
      return {
        ok: false,
        status: response.status,
        message: this.settings.recordSelector
          ? `Connected, but "${this.settings.recordSelector}" found no records in the response.`
          : 'Connected, but the response is not a list of records. Set a record selector.',
        sample,
        durationMs,
      };
    }

    return {
      ok: true,
      status: response.status,
      message: `Connected. Found ${records.length} record${records.length === 1 ? '' : 's'} in the first response.`,
      sample,
      recordsFound: records.length,
      fields: Object.keys(this.columnsFor(records[0]!)),
      durationMs,
    };
  }

  async pull(options: PullOptions = {}): Promise<PullResult> {
    const ceiling = Math.min(options.limit ?? this.settings.maxRecords, this.settings.maxRecords);
    const rows: Array<Record<string, string>> = [];
    const headers: string[] = [];
    const seen = new Set<string>();

    let page = 0;
    let cursor: string | null = null;
    let truncated = false;

    // A source that keeps answering with the same page would otherwise loop
    // forever; the record ceiling and this page ceiling both have to hold.
    const maxPages = 100;

    for (; page < maxPages; page++) {
      const remaining = ceiling - rows.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      const response = await this.fetch(this.urlFor(page, cursor, remaining));
      const body = await response.text();

      if (!response.ok) {
        throw badRequest(
          `The source answered ${response.status} ${response.statusText} on page ${page + 1}. ${body.slice(0, 300)}`,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        throw badRequest('The source answered with something that is not JSON.');
      }

      const records = selectRecords(parsed, this.settings.recordSelector);
      if (records.length === 0) break;

      for (const record of records) {
        if (rows.length >= ceiling) {
          truncated = true;
          break;
        }
        const columns = this.columnsFor(record);
        for (const key of Object.keys(columns)) {
          if (!seen.has(key)) {
            seen.add(key);
            headers.push(key);
          }
        }
        rows.push(columns);
      }

      const pagination = this.settings.pagination;
      if (pagination.style === 'none') break;
      if (pagination.style === 'cursor') {
        const next = selectOne(parsed, pagination.cursorPath);
        if (typeof next !== 'string' || next === '' || next === cursor) break;
        cursor = next;
      } else if (records.length < pagination.pageSize) {
        break;
      }
    }

    // Every row carries every column, so a record missing a field produces a
    // blank cell rather than an absent key the mapping step cannot see.
    for (const row of rows) {
      for (const header of headers) row[header] ??= '';
    }

    return { headers, rows, pages: page + 1, truncated };
  }

  /**
   * Apply the field map, or flatten the record when there is none. A brand
   * that has not mapped anything still gets every field on screen in the
   * mapping step, which is where they will choose.
   */
  private columnsFor(record: Record<string, unknown>): Record<string, string> {
    const entries = Object.entries(this.settings.fieldMap);
    if (entries.length === 0) return flattenRecord(record);

    const out: Record<string, string> = {};
    for (const [column, path] of entries) out[column] = fieldValue(record, path);
    return out;
  }

  private urlFor(page: number, cursor: string | null, remaining: number): URL {
    const url = assertFetchableUrl(this.settings.baseUrl);

    for (const [key, value] of Object.entries(this.settings.query)) {
      if (key.trim() !== '') url.searchParams.set(key, value);
    }

    const pagination = this.settings.pagination;
    if (pagination.style === 'page') {
      url.searchParams.set(pagination.pageParam, String(pagination.startAt + page));
      url.searchParams.set(
        pagination.sizeParam,
        String(Math.min(pagination.pageSize, Math.max(remaining, 1))),
      );
    } else if (pagination.style === 'cursor') {
      url.searchParams.set(
        pagination.sizeParam,
        String(Math.min(pagination.pageSize, Math.max(remaining, 1))),
      );
      if (cursor) url.searchParams.set(pagination.cursorParam, cursor);
    }

    return url;
  }

  private async fetch(url: URL): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (this.secret) {
      const header = this.settings.authHeader.trim() || 'Authorization';
      headers[header] = this.settings.authTemplate.replace('{{secret}}', this.secret);
    }

    return fetch(url, {
      method: this.settings.method,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // A connector reads a catalogue; following a redirect to a host the
      // operator never configured is how a checked URL becomes an unchecked one.
      redirect: 'error',
      cache: 'no-store',
    });
  }
}

/**
 * Refuse a URL before it is fetched.
 *
 * This repeats `assertDeliverableUrl` in `src/lib/webhooks/service.ts`, which
 * is not exported. Both should move to a shared security module — flagged
 * rather than fixed here, because that file is not this module's to change.
 */
export function assertFetchableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest('That is not a valid URL.');
  }

  const allowInsecure = process.env.NODE_ENV !== 'production';
  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:')) {
    throw badRequest('A connector must use HTTPS. A token sent over plain HTTP is readable in transit.');
  }
  if (url.username || url.password) {
    throw badRequest('Do not put credentials in the URL. Use the credential field, which is encrypted.');
  }
  if (!allowInsecure && isPrivateHost(url.hostname.toLowerCase())) {
    throw badRequest('That host is not reachable from the public internet.');
  }

  return url;
}


