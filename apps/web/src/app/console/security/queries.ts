import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { verifications } from '@/lib/db/schema';
import { getLadderStatus } from '@/lib/verification/service';
import type { LadderStatus } from '@/lib/verification/types';

/** Open document submissions waiting on a human decision. */
export interface PendingReview {
  id: string;
  submittedAt: string;
  documents: Array<{
    kind: string;
    fileName: string;
    reference?: string;
    /** Set when real bytes are on file; older submissions were metadata only. */
    documentId?: string;
    sizeBytes?: number;
    contentHash?: string;
  }>;
  notes: string | null;
}

/** The most recent open domain challenge, so a half-finished one is not lost. */
export interface OpenDomainChallenge {
  verificationId: string;
  domain: string;
  recordName: string;
  recordValue: string;
  expiresAt: string;
}

export interface SecurityOverview {
  ladder: LadderStatus;
  pendingReviews: PendingReview[];
  openDomainChallenge: OpenDomainChallenge | null;
}

export async function getSecurityOverview(tenantId: string): Promise<SecurityOverview> {
  const [ladder, rows] = await Promise.all([
    getLadderStatus(tenantId),
    db
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.tenantId, tenantId),
          eq(verifications.subjectType, 'tenant'),
          eq(verifications.subjectId, tenantId),
          isNull(verifications.verifiedAt),
          isNull(verifications.revokedAt),
        ),
      )
      .orderBy(desc(verifications.createdAt))
      .limit(50),
  ]);

  const pendingReviews: PendingReview[] = rows
    .filter((row) => row.level === 'document_verified')
    .map((row) => {
      const evidence = row.evidence ?? {};
      const documents = Array.isArray(evidence.documents)
        ? (evidence.documents as Array<Record<string, unknown>>).map((document) => ({
            kind: String(document.kind ?? 'Document'),
            fileName: String(document.fileName ?? ''),
            reference:
              typeof document.reference === 'string' && document.reference
                ? document.reference
                : undefined,
            documentId:
              typeof document.documentId === 'string' && document.documentId
                ? document.documentId
                : undefined,
            sizeBytes: typeof document.sizeBytes === 'number' ? document.sizeBytes : undefined,
            contentHash:
              typeof document.contentHash === 'string' && document.contentHash
                ? document.contentHash
                : undefined,
          }))
        : [];
      return {
        id: row.id,
        submittedAt: row.createdAt.toISOString(),
        documents,
        notes: row.notes,
      };
    });

  const domainRow = rows.find(
    (row) =>
      row.level === 'domain_verified' &&
      row.challenge != null &&
      (!row.expiresAt || row.expiresAt.getTime() > Date.now()),
  );

  const domain =
    domainRow && typeof domainRow.evidence?.domain === 'string' ? domainRow.evidence.domain : null;

  return {
    ladder,
    pendingReviews,
    openDomainChallenge:
      domainRow && domain
        ? {
            verificationId: domainRow.id,
            domain,
            recordName: `_polytrail.${domain}`,
            recordValue: domainRow.challenge!,
            expiresAt: domainRow.expiresAt?.toISOString() ?? '',
          }
        : null,
  };
}
