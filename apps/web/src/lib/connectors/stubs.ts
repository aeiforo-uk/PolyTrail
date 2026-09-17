import {
  NotImplementedConnectorError,
  type Connector,
  type ConnectorKind,
  type PullResult,
  type TestResult,
} from './types';

/**
 * Sources that are declared but not built.
 *
 * They exist as real objects implementing the real interface so that the
 * console can list them, the router can route to them and the shape of the
 * work is visible — and so that nobody has to guess what a Shopify connector
 * would look like when it is written.
 *
 * What they do not do is pretend. Each one fails with the specific reason it is
 * not available and what would have to happen first. A fake integration that
 * returns plausible rows is worse than no integration: the brand finds out at
 * the point their catalogue is wrong.
 */

interface StubDefinition {
  label: string;
  description: string;
  /** What is actually missing. Shown to the operator, not just logged. */
  status: string;
}

export const STUB_DEFINITIONS: Record<Exclude<ConnectorKind, 'rest'>, StubDefinition> = {
  shopify: {
    label: 'Shopify',
    description: 'Products, variants and metafields from a Shopify storefront.',
    status:
      'Not implemented. It needs a Shopify app registration, the Admin GraphQL product query and an OAuth flow for the shop. Until then, point the REST connector at the Shopify Admin API with a private app token — the record selector is data.products.edges[*].node.',
  },
  sap: {
    label: 'SAP',
    description: 'Material master and bill of materials from SAP S/4HANA.',
    status:
      'Not implemented. It needs an OData v4 client, the API_PRODUCT_SRV and API_BILL_OF_MATERIAL_SRV services, and per-customer field mapping — SAP material masters are extended differently at every site. The REST connector reads OData today if you give it the $format=json endpoint.',
  },
  plm: {
    label: 'PLM',
    description: 'Styles, colourways and materials from a product lifecycle system.',
    status:
      'Not implemented as a named integration, because "PLM" is not one system — Centric, PTC FlexPLM, Bamboo Rose and Backbone each have their own model. Use the REST connector against whichever one you run, and tell us the shape so it can be turned into a preset.',
  },
};

export class StubConnector implements Connector {
  readonly kind: ConnectorKind;
  readonly name: string;

  private readonly definition: StubDefinition;

  constructor(kind: Exclude<ConnectorKind, 'rest'>, name: string) {
    this.kind = kind;
    this.name = name;
    this.definition = STUB_DEFINITIONS[kind];
  }

  async test(): Promise<TestResult> {
    return {
      ok: false,
      message: this.definition.status,
      durationMs: 0,
    };
  }

  async pull(): Promise<PullResult> {
    throw new NotImplementedConnectorError(this.kind, this.definition.status);
  }
}
