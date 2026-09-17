import type { NextRequest } from 'next/server';
import { withApiKey, apiJson } from '@/lib/api-keys';
import type { ApiV1Context } from '@/lib/api-keys/handler';
import { operationGuard, verifyCredentialBodySchema } from '@/lib/export/openapi';
import { listIntegrityProviders, verifyCredential } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

/**
 * Verify a credential.
 *
 * Answers 200 with `valid: false` rather than 4xx for a credential that does
 * not verify, because the request succeeded — the caller asked a question and
 * got an answer. Reserving the status code for transport and authorisation
 * problems is what lets a client distinguish "your key is wrong" from "this
 * certificate expired".
 *
 * The response also states which mechanisms this platform can check, so a
 * caller handed an eIDAS attestation learns that it is a recognised mechanism
 * Polytrail does not verify, rather than inferring the credential is bad.
 */
export const POST = withApiKey(
  operationGuard('verifyCredential'),
  async (req: NextRequest, _ctx: ApiV1Context) => {
    const body = verifyCredentialBodySchema.parse(await req.json());
    const verdict = await verifyCredential(body.document);

    return apiJson({
      ...verdict,
      supportedMechanisms: listIntegrityProviders().map((provider) => ({
        mechanism: provider.mechanism,
        label: provider.label,
        implemented: provider.implemented,
        specification: provider.specification,
      })),
    });
  },
);
