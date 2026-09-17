import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { passportVersions } from '@/lib/db/schema';
import { withApiKey, apiJson } from '@/lib/api-keys';
import { operationGuard } from '@/lib/export/openapi';
import { findPassport } from '../../../shared';

export const dynamic = 'force-dynamic';

type Params = { dppId: string };

/**
 * The version history.
 *
 * Payloads are not included. A passport with thirty versions is thirty full
 * documents, which is a response nobody wants by accident; read the passport
 * itself for the current content. What this returns is the chain of hashes,
 * which is the part a verifier needs and the part that cannot be reconstructed
 * from anywhere else.
 */
export const GET = withApiKey<Params>(
  operationGuard('listPassportVersions'),
  async (_req, ctx) => {
    const { dppId } = await ctx.params;
    const passport = await findPassport(ctx.principal.tenantId, dppId);

    const rows = await db
      .select({
        version: passportVersions.version,
        dataHash: passportVersions.dataHash,
        credentialHash: passportVersions.credentialHash,
        changeReason: passportVersions.changeReason,
        createdAt: passportVersions.createdAt,
      })
      .from(passportVersions)
      .where(eq(passportVersions.passportId, passport.id))
      .orderBy(desc(passportVersions.version));

    return apiJson({
      dppId: passport.dppId,
      currentVersion: passport.version,
      publishedVersion: passport.publishedVersion,
      data: rows.map((row) => ({
        version: row.version,
        dataHash: row.dataHash,
        credentialHash: row.credentialHash,
        changeReason: row.changeReason,
        createdAt: row.createdAt.toISOString(),
        published: row.version === passport.publishedVersion,
      })),
      integrity: {
        algorithm: 'SHA-256',
        canonicalization: 'RFC 8785 (JCS)',
        note: 'Each dataHash is taken over the canonical form of that version’s payload. Recompute it from the payload to confirm the version has not been altered.',
      },
    });
  },
);
