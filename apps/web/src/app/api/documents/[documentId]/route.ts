import type { NextRequest } from 'next/server';
import { withAuth, type AuthedContext } from '@/lib/api/handler';
import { notFound } from '@/lib/api/errors';
import { getDocumentWithBytes, isUuid } from '@/lib/documents/storage';

/**
 * Serve a stored evidence document to a signed-in member of the workspace
 * that owns it.
 *
 * An unknown, deleted, malformed or foreign-tenant id is the same 404 — a
 * distinguishable "exists but not yours" would confirm the id to whoever is
 * probing. The ETag is the content hash, which is also the storage key, so a
 * 304 here is a cryptographic statement rather than a cache heuristic.
 */
export const GET = withAuth<{ documentId: string }>(
  { roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'] },
  async (req: NextRequest, ctx: AuthedContext<{ documentId: string }>) => {
    const { documentId } = await ctx.params;
    if (!isUuid(documentId)) throw notFound('No such document.');

    const document = await getDocumentWithBytes(ctx.tenantId, documentId);
    if (!document) throw notFound('No such document.');

    if (req.headers.get('if-none-match') === `"${document.contentHash}"`) {
      return new Response(null, { status: 304, headers: { ETag: `"${document.contentHash}"` } });
    }

    // The store only accepts PDF, images, CSV and plain text, none of which
    // execute in the browser, so inline display is safe and kinder to a
    // reviewer than a forced download.
    return new Response(new Uint8Array(document.bytes), {
      status: 200,
      headers: {
        'Content-Type': document.contentType,
        'Content-Length': String(document.sizeBytes),
        'Content-Disposition': `inline; filename="${document.filename}"`,
        'X-Content-Type-Options': 'nosniff',
        ETag: `"${document.contentHash}"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    });
  },
);
