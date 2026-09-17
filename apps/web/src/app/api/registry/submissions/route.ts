import { z } from 'zod';
import { json, withAuth } from '@/lib/api/handler';
import { ApiError, conflict, tooManyRequests, unprocessable } from '@/lib/api/errors';
import { clientKey, rateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';
import { RegistryError } from '@/lib/registry/types';
import { prepareSubmission, submitPassport } from '@/lib/registry/service';

/**
 * Registry filing over HTTP.
 *
 * The same service the console calls, so the pre-flight, the idempotency key
 * and the role check cannot differ between a person clicking a button and a
 * PLM system posting nightly. Errors come back as RFC 9457 problem details with
 * the blocking fields enumerated, because the caller is somebody's integration
 * code and "submission failed" is not something it can act on.
 */

const submission = z.object({
  dppId: z.string().min(1),
  /** When true, the record is built and checked but nothing is filed. */
  dryRun: z.boolean().optional(),
});

export const POST = withAuth(
  { roles: ['BRAND_ADMIN', 'COMPLIANCE_OFFICER'] },
  async (request, { session, tenantId }) => {
    // Filing is slow, external and irreversible in the eyes of a registry, so
    // it is throttled harder than a read would be.
    const limit = rateLimit(clientKey(request, 'registry-submit'), 30, 60_000);
    if (!limit.ok) {
      return tooManyRequests(
        `Too many filings in one minute. Try again in ${limit.retryAfterSeconds} seconds.`,
      ).toResponse(request.nextUrl.pathname);
    }

    const body = submission.parse(await request.json());

    if (body.dryRun) {
      const prepared = await prepareSubmission(tenantId, body.dppId);
      return json(
        {
          dryRun: true,
          ready: prepared.readiness.ok,
          endpoint: prepared.endpoint,
          record: prepared.record,
          issues: prepared.readiness.issues,
          advisories: prepared.readiness.advisories,
        },
        { headers: rateLimitHeaders(limit) },
      );
    }

    try {
      const outcome = await submitPassport(session, body.dppId);
      return json(outcome, { status: 201, headers: rateLimitHeaders(limit) });
    } catch (error) {
      throw toApiError(error, request.nextUrl.pathname);
    }
  },
);

function toApiError(error: unknown, _instance: string): unknown {
  if (!(error instanceof RegistryError)) return error;

  switch (error.code) {
    case 'NOT_READY':
      return unprocessable(error.message, fieldErrors(error.detail));
    case 'REJECTED':
      return new ApiError(422, 'Registry rejected the filing', { detail: error.message });
    case 'UNAVAILABLE':
      return new ApiError(503, 'Registry unavailable', { detail: error.message });
    case 'NOT_FOUND':
      return new ApiError(404, 'Not found', { detail: error.message });
    case 'NOT_CONFIGURED':
      return new ApiError(500, 'Registry not configured', { detail: error.message });
    default:
      return conflict(error.message);
  }
}

/** Turn the pre-flight issues into the field-keyed shape a form can render. */
function fieldErrors(detail: unknown): Record<string, string[]> | undefined {
  if (!Array.isArray(detail)) return undefined;
  const errors: Record<string, string[]> = {};
  for (const issue of detail) {
    const field = (issue as { field?: unknown }).field;
    const message = (issue as { detail?: unknown }).detail;
    if (typeof field === 'string' && typeof message === 'string') {
      (errors[field] ??= []).push(message);
    }
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}
