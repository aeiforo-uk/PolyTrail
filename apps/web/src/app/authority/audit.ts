import 'server-only';
import { headers } from 'next/headers';
import type { Session } from '@/lib/auth/session';
import { recordExtendedAudit, recordExtendedAuditSafe } from '@/lib/verification/audit';

/**
 * Every authority read is an event in the brand's own audit chain.
 *
 * This is the part that is easy to leave out and expensive to add later. A
 * regulator reading a brand's sourcing data is a fact about that brand's
 * regulatory exposure, and it belongs in the same tamper-evident chain as the
 * brand's own actions — not in a log only the platform can see. It is also
 * what lets a brand answer "has anyone looked at this?" without asking us.
 *
 * The entry is written against the *subject's* tenant, not the authority's,
 * which is the whole point: an authority has no chain of its own to hide in.
 */

export interface AuthorityReadContext {
  session: Session;
  /** The brand whose chain the entry lands in. */
  tenantId: string;
  dppId: string;
}

async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return {
    ip: forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip'),
    userAgent: headerList.get('user-agent'),
  };
}

function actorLabel(session: Session): string {
  // The person and the authority they act for. "Someone from an authority"
  // is not an answer a brand can do anything with.
  return session.name ? `${session.name} (${session.email})` : session.email;
}

/**
 * A page view. Best-effort: losing the record of a read is bad, but refusing
 * to show a regulator a passport because the log was busy is worse, and the
 * read is repeated on every load anyway.
 */
export async function recordAuthorityRead(context: AuthorityReadContext): Promise<void> {
  const request = await requestContext();
  await recordExtendedAuditSafe({
    tenantId: context.tenantId,
    actorId: context.session.userId,
    actorLabel: actorLabel(context.session),
    action: 'authority.passport_read',
    subjectType: 'passport',
    subjectId: context.dppId,
    metadata: { role: context.session.role, tier: 'authority' },
    ...request,
  });
}

/**
 * An export. This one throws on failure: taking a copy of the whole record away
 * is exactly the event a brand must be able to see, so an unrecorded export
 * should not happen at all.
 */
export async function recordAuthorityExport(context: AuthorityReadContext): Promise<void> {
  const request = await requestContext();
  await recordExtendedAudit({
    tenantId: context.tenantId,
    actorId: context.session.userId,
    actorLabel: actorLabel(context.session),
    action: 'authority.record_exported',
    subjectType: 'passport',
    subjectId: context.dppId,
    metadata: { role: context.session.role, format: 'json' },
    ...request,
  });
}

/** A search that matched a brand's passports, recorded once per brand matched. */
export async function recordAuthoritySearch(
  session: Session,
  tenantIds: readonly string[],
  query: string,
): Promise<void> {
  const request = await requestContext();
  await Promise.all(
    [...new Set(tenantIds)].map((tenantId) =>
      recordExtendedAuditSafe({
        tenantId,
        actorId: session.userId,
        actorLabel: actorLabel(session),
        action: 'authority.search_performed',
        subjectType: 'tenant',
        subjectId: tenantId,
        // The query is kept because a brand is entitled to know what was being
        // looked for, not merely that something was.
        metadata: { query: query.slice(0, 200), role: session.role },
        ...request,
      }),
    ),
  );
}
