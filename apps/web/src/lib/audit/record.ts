import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';
import { GENESIS_HASH, computeEntryHash, type AuditAction, type AuditInput } from './index';

/**
 * Append an entry to a tenant's audit chain.
 *
 * Runs inside a transaction that takes a row lock on the tenant's latest entry,
 * because two concurrent writes that both read sequence N would otherwise both
 * write N+1 and fork the chain. The unique index on (tenant_id, sequence) is the
 * backstop if the lock is ever bypassed.
 *
 * This throws. Audit failures must fail the operation that caused them —
 * a publish that is not recorded did not happen as far as a regulator is
 * concerned. Use `recordAuditSafe` only for events where losing the record is
 * genuinely preferable to failing the request, such as a page view.
 */
export async function recordAudit(input: AuditInput): Promise<{ sequence: number; entryHash: string }> {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ sequence: auditEvents.sequence, entryHash: auditEvents.entryHash })
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, input.tenantId))
      .orderBy(desc(auditEvents.sequence))
      .limit(1)
      .for('update');

    const sequence = (previous?.sequence ?? 0) + 1;
    const previousHash = previous?.entryHash ?? GENESIS_HASH;
    const recordedAt = new Date().toISOString();
    const entryHash = computeEntryHash(input, previousHash, recordedAt);

    await tx.insert(auditEvents).values({
      tenantId: input.tenantId,
      sequence,
      previousHash,
      entryHash,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: input.metadata ?? {},
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      recordedAt,
    });

    return { sequence, entryHash };
  });
}

/** Best-effort variant. Logs and swallows, for events not worth failing over. */
export async function recordAuditSafe(input: AuditInput): Promise<void> {
  try {
    await recordAudit(input);
  } catch (error) {
    console.error('[audit] failed to record', { action: input.action, error });
  }
}

export async function readAuditChain(tenantId: string, limit = 200) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId))
    .orderBy(desc(auditEvents.sequence))
    .limit(limit);
}

export type { AuditAction, AuditInput };
