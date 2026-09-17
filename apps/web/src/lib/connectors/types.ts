/**
 * Connectors.
 *
 * The file importer and the API importer have to end at the same place, so a
 * connector's job is narrow: produce rows in exactly the shape `parseCsv`
 * produces them — a header list and one flat string-keyed record per product —
 * and then get out of the way. Mapping, validation and writing are the same
 * code for both paths, which is the only way the two can be trusted to behave
 * identically.
 *
 * A connector therefore has two verbs and no opinions:
 *   • `test()` proves the credentials work and shows the operator what came
 *     back, verbatim. A green tick that means nothing is worse than a red one.
 *   • `pull()` fetches records and flattens them.
 */

export const CONNECTOR_KINDS = ['rest', 'shopify', 'sap', 'plm'] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export interface ConnectorKindInfo {
  kind: ConnectorKind;
  label: string;
  description: string;
  /** False for a declared-but-unbuilt source. The interface says so plainly. */
  implemented: boolean;
  /** What is missing, for the kinds that are not built. */
  status: string;
}

/** Non-secret configuration. Safe to render, safe to log. */
export interface RestSettings {
  baseUrl: string;
  method: 'GET' | 'POST';
  /** Header the credential is sent in. */
  authHeader: string;
  /** Template for the header value; `{{secret}}` is replaced at request time. */
  authTemplate: string;
  /**
   * Where the records are in the response body — `$.products[*]`, `data.items`
   * or empty for a bare top-level array.
   */
  recordSelector: string;
  /** Column name → path inside one record. Empty means "flatten everything". */
  fieldMap: Record<string, string>;
  /** Extra query parameters, e.g. a fixed `status=active`. */
  query: Record<string, string>;
  pagination: PaginationSettings;
  /** Hard ceiling on records fetched in one pull. */
  maxRecords: number;
}

export type PaginationSettings =
  | { style: 'none' }
  | { style: 'page'; pageParam: string; sizeParam: string; pageSize: number; startAt: number }
  | { style: 'cursor'; cursorParam: string; cursorPath: string; sizeParam: string; pageSize: number };

export interface ConnectorRecord {
  id: string;
  tenantId: string;
  kind: ConnectorKind;
  name: string;
  settings: Record<string, unknown>;
  /**
   * AES-256-GCM envelope. It is decrypted on the server at request time and
   * never travels to the browser in any form, redacted or otherwise — a
   * credential the client has seen is a credential that has leaked.
   */
  secret: string | null;
  createdAt: string;
  createdBy: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

/** What the console is allowed to see. Note the absence of `secret`. */
export interface ConnectorSummary {
  id: string;
  kind: ConnectorKind;
  name: string;
  settings: Record<string, unknown>;
  hasSecret: boolean;
  createdAt: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

export interface TestResult {
  ok: boolean;
  /** HTTP status, when the source answered at all. */
  status?: number;
  message: string;
  /** The response, truncated. Shown to the operator exactly as it arrived. */
  sample?: string;
  /** How many records the selector found in that response. */
  recordsFound?: number;
  /** Fields seen on the first record, so the operator can check the selector. */
  fields?: string[];
  durationMs: number;
}

export interface PullOptions {
  /** Stop after this many records regardless of what the settings say. */
  limit?: number;
}

export interface PullResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  pages: number;
  /** True when the source had more and `maxRecords` stopped the pull. */
  truncated: boolean;
}

export interface Connector {
  readonly kind: ConnectorKind;
  readonly name: string;
  test(): Promise<TestResult>;
  pull(options?: PullOptions): Promise<PullResult>;
}

/** Thrown by a declared-but-unbuilt connector. Carries no false promises. */
export class NotImplementedConnectorError extends Error {
  readonly kind: ConnectorKind;

  constructor(kind: ConnectorKind, detail: string) {
    super(detail);
    this.name = 'NotImplementedConnectorError';
    this.kind = kind;
  }
}

export const DEFAULT_REST_SETTINGS: RestSettings = {
  baseUrl: '',
  method: 'GET',
  authHeader: 'Authorization',
  authTemplate: 'Bearer {{secret}}',
  recordSelector: '',
  fieldMap: {},
  query: {},
  pagination: { style: 'none' },
  maxRecords: 2000,
};
