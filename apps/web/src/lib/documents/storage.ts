import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documentBlobs, documents } from '@/lib/db/schema';
import { badRequest } from '@/lib/api/errors';

/**
 * Real file storage for evidence documents.
 *
 * Until this module existed, "documents" across the product were metadata
 * only — a filename typed into a form, a size of zero, an empty hash. That is
 * the gap `docs/STATUS.md` names as the largest in the product, because a
 * compliance story with no bytes behind it is a story: an auditor asking "show
 * me the certificate" was the one question the product could not answer.
 *
 * Two decisions worth stating:
 *
 * 1. **Bytes live in Postgres**, content-addressed by SHA-256. The app deploys
 *    to hosts with no persistent filesystem, and evidence belongs under the
 *    same backup, the same point-in-time recovery and the same access controls
 *    as the record that cites it. At the sizes this product accepts (8 MB cap,
 *    certificates and lab reports, not video) bytea is comfortably inside
 *    Postgres's working range, and a move to object storage later is a change
 *    to this file alone — `storage_key` already names its backend.
 *
 * 2. **The hash is the storage key** (`pg:0x…`). A stored hash that is also
 *    the lookup key cannot drift from the bytes it describes, which is the
 *    property the audit trail actually needs.
 */

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * Types a compliance workflow legitimately receives. Anything executable or
 * ambiguous is refused outright — this store feeds links that reviewers and
 * authorities will click.
 */
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

export interface StoredDocument {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentHash: string;
}

export async function storeDocument(options: {
  tenantId: string;
  file: File;
  kind: string;
  visibility?: 'public' | 'consumer' | 'retailer' | 'repairer' | 'recycler' | 'authority';
  passportId?: string;
  dataRequestId?: string;
  uploadedBy?: string;
}): Promise<StoredDocument> {
  const { file } = options;

  if (file.size === 0) throw badRequest('The file is empty.');
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw badRequest(
      `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
    );
  }

  // The browser's claimed type, normalised without its parameters.
  const contentType = (file.type || '').split(';')[0]!.trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES[contentType]) {
    throw badRequest(
      `Files of type "${contentType || 'unknown'}" are not accepted. Use PDF, PNG, JPEG, WebP, CSV or plain text.`,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = '0x' + createHash('sha256').update(bytes).digest('hex');
  const filename = sanitiseFilename(file.name, ALLOWED_CONTENT_TYPES[contentType]!);

  return db.transaction(async (tx) => {
    // Content-addressed: the same certificate uploaded twice, by anyone,
    // stores its bytes once.
    await tx
      .insert(documentBlobs)
      .values({ contentHash, bytes, sizeBytes: bytes.length })
      .onConflictDoNothing();

    const [row] = await tx
      .insert(documents)
      .values({
        tenantId: options.tenantId,
        passportId: options.passportId ?? null,
        dataRequestId: options.dataRequestId ?? null,
        filename,
        contentType,
        sizeBytes: bytes.length,
        contentHash,
        storageKey: `pg:${contentHash}`,
        kind: options.kind,
        visibility: options.visibility ?? 'authority',
        uploadedBy: options.uploadedBy ?? null,
      })
      .returning({ id: documents.id });

    if (!row) throw badRequest('The document could not be stored.');
    return { id: row.id, filename, contentType, sizeBytes: bytes.length, contentHash };
  });
}

export interface DocumentWithBytes {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentHash: string;
  kind: string;
  bytes: Buffer;
}

/**
 * Fetch one document with its bytes. Tenant-scoped: a document id from another
 * workspace does not exist here, it is not merely forbidden.
 */
export async function getDocumentWithBytes(
  tenantId: string,
  documentId: string,
): Promise<DocumentWithBytes | null> {
  const [row] = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      contentType: documents.contentType,
      sizeBytes: documents.sizeBytes,
      contentHash: documents.contentHash,
      kind: documents.kind,
      bytes: documentBlobs.bytes,
    })
    .from(documents)
    .innerJoin(documentBlobs, eq(documentBlobs.contentHash, documents.contentHash))
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  // node-postgres returns bytea as Buffer already; the cast states it.
  return { ...row, bytes: Buffer.from(row.bytes) };
}

/**
 * A filename that is safe to echo into a Content-Disposition header and a
 * reviewer's screen: basename only, control characters out, sensible length,
 * and an extension that matches what the bytes were accepted as.
 */
function sanitiseFilename(raw: string, extension: string): string {
  const base = (raw || 'document')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f"\\]/g, '')
    .trim()
    .slice(0, 200);
  const named = base || 'document';
  return named.toLowerCase().endsWith(`.${extension}`) ? named : `${named}.${extension}`;
}

/** Guard for UUID-shaped route params, so bad input 404s instead of erroring. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Referenced by tests and future sweeps: total bytes a tenant has stored. */
export async function tenantStorageBytes(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${documents.sizeBytes}), 0)::bigint` })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt)));
  return Number(row?.total ?? 0);
}
