import { STUB_DEFINITIONS } from './stubs';
import type { ConnectorKind, ConnectorKindInfo } from './types';

/**
 * What the console offers, and what it admits is not there yet.
 *
 * Client-safe on purpose: the "not implemented" text is part of the interface,
 * not an error message the operator sees only after wasting five minutes
 * configuring something that was never going to work.
 */
export const CONNECTOR_KIND_INFO: Record<ConnectorKind, ConnectorKindInfo> = {
  rest: {
    kind: 'rest',
    label: 'REST / JSON',
    description:
      'Any HTTP source that serves a JSON list — a PIM, a middleware endpoint, an OData service, or a PLM with an API. Give it a URL, a token and where the records sit in the response.',
    implemented: true,
    status: 'Available.',
  },
  shopify: {
    kind: 'shopify',
    label: STUB_DEFINITIONS.shopify.label,
    description: STUB_DEFINITIONS.shopify.description,
    implemented: false,
    status: STUB_DEFINITIONS.shopify.status,
  },
  sap: {
    kind: 'sap',
    label: STUB_DEFINITIONS.sap.label,
    description: STUB_DEFINITIONS.sap.description,
    implemented: false,
    status: STUB_DEFINITIONS.sap.status,
  },
  plm: {
    kind: 'plm',
    label: STUB_DEFINITIONS.plm.label,
    description: STUB_DEFINITIONS.plm.description,
    implemented: false,
    status: STUB_DEFINITIONS.plm.status,
  },
};

export const CONNECTOR_KIND_LIST: readonly ConnectorKindInfo[] = Object.values(CONNECTOR_KIND_INFO);
