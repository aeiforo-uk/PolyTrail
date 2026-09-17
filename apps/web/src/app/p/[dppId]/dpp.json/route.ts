import { NextResponse, type NextRequest } from 'next/server';
import { resolvePublicPassport } from '@/lib/passport/public';
import { passportUrl } from '@/lib/passport/identifier';
import type { AccessTier } from '@/lib/tier/types';

/**
 * The machine-readable passport.
 *
 * Served at the same address as the human page with `/dpp.json` appended, so a
 * client that has the passport URL can always find the data without a
 * discovery step. `?format=jsonld` returns the same content with a JSON-LD
 * context attached.
 *
 * Two deliberate choices:
 *
 *   • The payload carries `withheld` — a list of the fields that exist but are
 *     not released at this tier. Competing passports serve `certifications:
 *     null` and leave the reader unable to tell "none" from "not for you".
 *   • `integrity.hash` is the hash of the full canonical payload version, which
 *     is the value the EU DPP Registry records. A verifier can therefore check
 *     the registry entry against the passport without trusting this server.
 */

export const dynamic = 'force-dynamic';

const CONTEXT = 'https://polytrail.eu/context/dpp/v1.jsonld';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ dppId: string }> },
) {
  const { dppId } = await ctx.params;

  // Tier is negotiated from credentials in a later pass; unauthenticated
  // callers get the public projection, which is the correct default.
  const tier: AccessTier = 'public';
  const passport = await resolvePublicPassport(dppId, tier);

  if (!passport) {
    return NextResponse.json(
      {
        type: 'https://polytrail.eu/problems/404',
        title: 'No passport for this identifier',
        status: 404,
        detail: `No published passport is registered at ${dppId}.`,
      },
      { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
    );
  }

  const url = passportUrl(passport.dppId);
  const jsonLd = new URL(req.url).searchParams.get('format') === 'jsonld';

  const body = {
    ...(jsonLd ? { '@context': CONTEXT, '@type': 'DigitalProductPassport', '@id': url } : {}),
    passportId: passport.dppId,
    passportUrl: url,
    schemaVersion: passport.payload.schemaVersion ?? '1.0',
    status: passport.status,
    version: passport.version,
    issuedAt: passport.publishedAt,
    updatedAt: passport.updatedAt,
    accessTier: passport.tier,

    issuer: {
      name: passport.brand.name,
      country: passport.brand.country,
      did: passport.brand.did,
      website: passport.brand.website,
    },

    integrity: {
      algorithm: 'SHA-256',
      // Taken over the RFC 8785 canonical form of the version payload, so an
      // independent verifier gets the same digest from the same data.
      canonicalization: 'RFC 8785 (JCS)',
      hash: passport.dataHash,
    },

    ...(passport.recall ? { recall: passport.recall } : {}),

    data: passport.payload,

    events: passport.events,

    /**
     * Fields present on the passport but not released at this tier. Names the
     * audience rather than the value, so a reader knows the data exists and
     * who may ask for it.
     */
    withheld: passport.withheld.map((field) => ({
      path: field.path,
      label: field.label,
      releasedTo: field.audiences.filter((a) => a !== 'public'),
    })),

    conformance: {
      // Stated as claims, precisely because no certification scheme exists for
      // these standards — citation in the OJ gives a presumption of conformity,
      // not a certificate. Overstating this is a market-wide habit worth not
      // copying.
      claims: [
        'EN 18216:2026 — data exchange protocols',
        'EN 18219:2026 — unique identifiers',
        'EN 18220:2026 — data carriers',
        'EN 18221:2026 — storage, archiving and persistence',
        'EN 18222:2026 — lifecycle APIs',
        'EN 18223:2026 — system interoperability',
        'EN 18239:2026 — access rights and business confidentiality',
        'EN 18246:2026 — data authentication and integrity',
      ],
      note: 'Self-declared. No conformity assessment scheme exists for these standards; citation in the Official Journal confers a presumption of conformity, not certification.',
    },
  };

  return NextResponse.json(body, {
    headers: {
      'Content-Type': jsonLd ? 'application/ld+json' : 'application/json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      Link: `<${url}>; rel="canonical"`,
    },
  });
}
