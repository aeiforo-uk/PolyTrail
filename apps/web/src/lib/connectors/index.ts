/**
 * Connectors — the client-safe surface.
 *
 * `./service`, `./store`, `./rest` and `./crypto` are server-only and are
 * imported directly where they are used. Everything a client component needs
 * to render a connector — its kind, its labels, its non-secret settings — is
 * here, and a credential never is.
 */
export { CONNECTOR_KIND_INFO, CONNECTOR_KIND_LIST } from './kinds';
export { STUB_DEFINITIONS } from './stubs';
export {
  CONNECTOR_KINDS,
  DEFAULT_REST_SETTINGS,
  NotImplementedConnectorError,
} from './types';
export type {
  Connector,
  ConnectorKind,
  ConnectorKindInfo,
  ConnectorRecord,
  ConnectorSummary,
  PaginationSettings,
  PullOptions,
  PullResult,
  RestSettings,
  TestResult,
} from './types';
export { flattenRecord, select, selectOne, selectRecords } from './selector';
