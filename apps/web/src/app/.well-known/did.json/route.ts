import { NextResponse } from 'next/server';
import { buildDidDocument, platformDid } from '@/lib/credentials/did';
import { listIntegrityProviders } from '@/lib/credentials';

/**
 * The platform's DID document.
 *
 * Polytrail itself does not sign passport credentials — each workspace signs
 * its own, with its own key, at its own DID. This document exists to make that
 * structure discoverable rather than something an integrator has to be told:
 * it names the service endpoint where a tenant DID resolves, and it states
 * which integrity mechanisms this deployment can actually verify.
 *
 * It deliberately publishes no verification method of its own. A platform key
 * that could sign on any customer's behalf is a key worth stealing, and its
 * existence would undermine the claim that a credential's issuer is the brand.
 *
 * @see https://w3c-ccg.github.io/did-method-web/
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const did = platformDid();
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

  const document = {
    ...buildDidDocument({
      did,
      keys: [],
      service: [
        {
          id: `${did}#tenants`,
          type: 'LinkedDomains',
          serviceEndpoint: `${base}/.well-known/tenant/{tenantId}/did.json`,
        },
        {
          id: `${did}#api`,
          type: 'LinkedDomains',
          serviceEndpoint: `${base}/api/v1/openapi.json`,
        },
      ],
    }),
    /**
     * Not part of the DID Core data model, and namespaced so a conformant
     * resolver ignores it. Present because "which of the four EN 18246
     * mechanisms does this deployment verify?" is the first question an
     * integrator asks and there is nowhere else to answer it.
     */
    'https://polytrail.eu/ns/integrityMechanisms': listIntegrityProviders().map((provider) => ({
      mechanism: provider.mechanism,
      label: provider.label,
      specification: provider.specification,
      implemented: provider.implemented,
    })),
  };

  return NextResponse.json(document, {
    headers: {
      'Content-Type': 'application/did+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
