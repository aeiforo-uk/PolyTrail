import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db/client';
import { passports } from '@/lib/db/schema';
import { parseDigitalLinkPath, AI } from '@/lib/gs1/digital-link';
import { passportUrl } from '@/lib/passport/identifier';

/**
 * GS1 Digital Link resolver.
 *
 * Every textile DPP vendor claims "GS1 Digital Link support". Probing the live
 * ones shows what that means in practice: a GS1-shaped URL string on a bespoke
 * endpoint, no content negotiation, no linkset, and — worst — HTTP 200 with a
 * generic shell for products that do not exist, which silently breaks every
 * machine client, customs check and authority tool that trusts status codes.
 *
 * This route is the conformant version:
 *   • `Accept: application/linkset+json` returns a linkset, not HTML.
 *   • An unknown GTIN returns 404, not a soft 200.
 *   • AI(01) alone, AI(01)+(10) batch and AI(01)+(21) serial all resolve, with
 *     graceful fall-back from item to batch to model rather than a 404 when a
 *     serial is unknown but the model is not.
 *
 * @see https://ref.gs1.org/standards/digital-link/uri-syntax/
 * @see EN 18219:2026 — unique identifiers
 */

export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ path: string[] }>;
}

export async function GET(req: NextRequest, ctx: Context) {
  const { path } = await ctx.params;
  const parsed = parseDigitalLinkPath([AI.GTIN, ...path].join('/'));

  if (!parsed) {
    return problem(400, 'Not a GS1 Digital Link', {
      detail:
        'The path is not a valid GS1 Digital Link. Expected /01/{gtin} optionally followed by /10/{batch} or /21/{serial}.',
    });
  }

  // Resolve most specific first. A scanner that reads a serial should get that
  // item's passport; if only the model is registered, it should still land
  // somewhere useful rather than on an error.
  const candidates: Array<Record<string, string | null>> = [];
  if (parsed.serialNumber) candidates.push({ serialNumber: parsed.serialNumber });
  if (parsed.batchNumber) candidates.push({ batchNumber: parsed.batchNumber });
  candidates.push({ serialNumber: null, batchNumber: null });

  let match: { dppId: string; status: string } | undefined;
  let matchedGranularity: 'item' | 'batch' | 'model' = 'model';

  for (const candidate of candidates) {
    const conditions = [eq(passports.gtin, parsed.gtin), isNull(passports.deletedAt)];
    if (candidate.serialNumber !== undefined && candidate.serialNumber !== null) {
      conditions.push(eq(passports.serialNumber, candidate.serialNumber));
    }
    if (candidate.batchNumber !== undefined && candidate.batchNumber !== null) {
      conditions.push(eq(passports.batchNumber, candidate.batchNumber));
    }

    const [row] = await db
      .select({ dppId: passports.dppId, status: passports.status })
      .from(passports)
      .where(and(...conditions))
      .limit(1);

    if (row) {
      match = row;
      matchedGranularity = candidate.serialNumber
        ? 'item'
        : candidate.batchNumber
          ? 'batch'
          : 'model';
      break;
    }
  }

  const publishedStatuses = ['published', 'suspended', 'recalled', 'withdrawn'];
  if (!match || !publishedStatuses.includes(match.status)) {
    // A real 404. The most common conformance failure in this category is
    // answering 200 here, which makes "does this product exist?" unanswerable
    // by machine.
    return problem(404, 'No passport for this identifier', {
      detail: `No published passport is registered for GTIN ${parsed.gtin}.`,
    });
  }

  const target = passportUrl(match.dppId);
  const accept = req.headers.get('accept') ?? '';

  // Content negotiation. A machine asking for the linkset gets the linkset; a
  // browser gets redirected to the human page.
  if (accept.includes('application/linkset+json')) {
    return NextResponse.json(linksetFor(target, parsed.gtin), {
      headers: {
        'Content-Type': 'application/linkset+json',
        'Cache-Control': 'public, max-age=300',
        Link: linkHeader(target),
      },
    });
  }

  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return NextResponse.redirect(`${target}/dpp.json`, {
      status: 307,
      headers: { Link: linkHeader(target) },
    });
  }

  const url = new URL(req.url);
  const linkType = url.searchParams.get('linkType');
  const anchor =
    linkType === 'gs1:traceability'
      ? '#journey'
      : linkType === 'gs1:instructions'
        ? '#care'
        : linkType === 'gs1:sustainabilityInfo'
          ? '#composition'
          : '';

  return NextResponse.redirect(`${target}${anchor}`, {
    status: 307,
    headers: {
      Link: linkHeader(target),
      'X-DPP-Granularity': matchedGranularity,
    },
  });
}

/** RFC 9264 linkset describing every representation of this product. */
function linksetFor(target: string, gtin: string) {
  return {
    linkset: [
      {
        anchor: `https://id.gs1.org/01/${gtin}`,
        'https://gs1.org/voc/defaultLink': [
          { href: target, title: 'Product passport', type: 'text/html' },
        ],
        'https://gs1.org/voc/pip': [
          { href: target, title: 'Product information page', type: 'text/html' },
        ],
        'https://gs1.org/voc/sustainabilityInfo': [
          { href: `${target}#composition`, title: 'Materials and footprint', type: 'text/html' },
        ],
        'https://gs1.org/voc/traceability': [
          { href: `${target}#journey`, title: 'Supply chain', type: 'text/html' },
        ],
        'https://gs1.org/voc/instructions': [
          { href: `${target}#care`, title: 'Care and repair', type: 'text/html' },
        ],
        'https://gs1.org/voc/recallStatus': [
          { href: `${target}#provenance`, title: 'Recall status', type: 'text/html' },
        ],
        alternate: [
          {
            href: `${target}/dpp.json`,
            title: 'Machine-readable passport',
            type: 'application/json',
          },
        ],
      },
    ],
  };
}

function linkHeader(target: string): string {
  return [
    `<${target}>; rel="https://gs1.org/voc/defaultLink"`,
    `<${target}/dpp.json>; rel="alternate"; type="application/json"`,
  ].join(', ');
}

function problem(status: number, title: string, options: { detail: string }) {
  return NextResponse.json(
    { type: `https://polytrail.eu/problems/${status}`, title, status, detail: options.detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
