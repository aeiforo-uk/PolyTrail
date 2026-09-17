import 'server-only';
import { cache } from 'react';
import { getPassportDetail } from '../../../queries';
import { validateForPublication } from '@/lib/passport/schema';

/**
 * The layout and the section page both need the passport, and React's request
 * cache is what stops that being two round trips per render.
 */
export const loadPassport = cache(async (tenantId: string, dppId: string) =>
  getPassportDetail(tenantId, dppId),
);

/**
 * What publication would currently refuse, keyed by payload path.
 *
 * Recomputed from the payload rather than remembered from a failed publish,
 * because it is a pure function of the content — so the editor can show the
 * blocking issues on the fields that cause them before anyone presses publish.
 */
export function publicationIssues(payload: unknown): Record<string, string[]> {
  const result = validateForPublication(payload);
  if (result.success) return {};

  const issues: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (issues[issue.path.join('.') || '_'] ??= []).push(issue.message);
  }
  return issues;
}
