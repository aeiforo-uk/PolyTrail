import 'server-only';
import { listApiKeys, type ApiKeySummary } from '@/lib/api-keys/service';
import {
  listDeliveries,
  listWebhookEndpoints,
  type DeliveryLogRow,
  type WebhookEndpointSummary,
} from '@/lib/webhooks/service';
import { activeSigningKey } from '@/lib/credentials/keys';
import { tenantDid } from '@/lib/credentials/did';

/**
 * Reads for the developer settings page.
 *
 * Every one takes `tenantId` and filters on it — the same rule as
 * `console/queries.ts`, and the reason these live here rather than being
 * inlined into the page: a tenant predicate is easier to keep rigid when the
 * queries sit together.
 */

export interface DeveloperOverview {
  keys: ApiKeySummary[];
  endpoints: WebhookEndpointSummary[];
  deliveries: DeliveryLogRow[];
  signing: {
    did: string;
    /** Null until the workspace issues its first credential. */
    keyId: string | null;
    algorithm: string | null;
    createdAt: Date | null;
    didDocumentPath: string;
  };
}

export async function getDeveloperOverview(tenantId: string): Promise<DeveloperOverview> {
  const [keys, endpoints, deliveries, signingKey] = await Promise.all([
    listApiKeys(tenantId),
    listWebhookEndpoints(tenantId),
    listDeliveries(tenantId, 25),
    activeSigningKey(tenantId),
  ]);

  return {
    keys,
    endpoints,
    deliveries,
    signing: {
      did: tenantDid(tenantId),
      keyId: signingKey?.keyId ?? null,
      algorithm: signingKey?.algorithm ?? null,
      createdAt: signingKey?.createdAt ?? null,
      didDocumentPath: `/.well-known/tenant/${tenantId}/did.json`,
    },
  };
}
