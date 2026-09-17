import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenants } from '@/lib/db/schema';
import { buildDidDocument, tenantDid } from '@/lib/credentials/did';
import { listSigningKeys } from '@/lib/credentials/keys';

/**
 * A workspace's DID document — the public half of the key its credentials are
 * signed with.
 *
 * Public and unauthenticated, necessarily: a verifiable credential is worthless
 * if the key that verifies it is behind a login. Nothing here is secret. The
 * response carries only public JWKs, the brand's registered name and its
 * website, all of which are already on the passports the credentials attest to.
 *
 * Every key the workspace has ever held is published, including rotated-out
 * ones, so a credential signed last season still verifies. Only the current key
 * appears in `assertionMethod`.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await ctx.params;

  // Validated before the query so a malformed path cannot become a cast error
  // inside the driver, and so probing the URL space returns a plain 404.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    return notFound();
  }

  const [tenant] = await db
    .select({
      id: tenants.id,
      legalName: tenants.legalName,
      tradeName: tenants.tradeName,
      website: tenants.website,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant || tenant.status === 'closed') return notFound();

  const keys = await listSigningKeys(tenantId);
  if (keys.length === 0) return notFound();

  const did = tenantDid(tenantId);

  const document = {
    ...buildDidDocument({
      did,
      keys: keys.map((key) => ({
        keyId: key.keyId,
        publicJwk: key.publicJwk,
        active: key.active,
      })),
      ...(tenant.website ? { alsoKnownAs: [tenant.website] } : {}),
    }),
    'https://schema.org/name': tenant.tradeName ?? tenant.legalName,
  };

  return NextResponse.json(document, {
    headers: {
      'Content-Type': 'application/did+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * `notFound` rather than a DID resolution error document: a workspace that has
 * never issued a credential has no DID, and saying so is the honest answer.
 */
function notFound() {
  return NextResponse.json(
    {
      type: 'https://polytrail.eu/problems/not-found',
      title: 'No DID document',
      status: 404,
      detail: 'No workspace at this identifier has published a signing key.',
    },
    { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
