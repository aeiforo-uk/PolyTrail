import { NextResponse, type NextRequest } from 'next/server';
import { buildOpenApiDocument } from '@/lib/export/openapi';
import { clientKey, rateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';
import { tooManyRequests } from '@/lib/api/errors';
import { configuredAppUrl } from '@/lib/app-url';

/**
 * The machine-readable API description.
 *
 * Unauthenticated, because a developer evaluating whether to integrate should
 * be able to read the contract before they have an account — and because an
 * OpenAPI document that needs a key is not discoverable by any of the tooling
 * that consumes one. It describes the shape of the API, which is public
 * information; it exposes no workspace data.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limit = rateLimit(clientKey(req, 'openapi'), 60, 60_000);
  if (!limit.ok) {
    return tooManyRequests('Slow down and try again shortly.').toResponse(req.nextUrl.pathname);
  }

  // The request's own origin is the better default here than localhost: an
  // OpenAPI document should describe the server that served it.
  const base = configuredAppUrl() ?? req.nextUrl.origin;
  const document = buildOpenApiDocument(base);

  return NextResponse.json(document, {
    headers: {
      'Content-Type': 'application/openapi+json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      ...rateLimitHeaders(limit),
    },
  });
}
