import { json, withAuth } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { RegistryError } from '@/lib/registry/types';
import { checkSubmissionStatus, withdrawSubmission } from '@/lib/registry/service';

/**
 * Status and withdrawal for one passport's registration.
 *
 * Status is a read that reaches the Registry, so it is available to anyone who
 * can see the passport; withdrawal is a declaration and is not.
 */

export const GET = withAuth<{ dppId: string }>(
  { roles: ['BRAND_ADMIN', 'COMPLIANCE_OFFICER', 'PRODUCT_MANAGER'] },
  async (request, { session, params }) => {
    const { dppId } = await params;
    try {
      return json(await checkSubmissionStatus(session, dppId));
    } catch (error) {
      throw translate(error);
    }
  },
);

export const DELETE = withAuth<{ dppId: string }>(
  { roles: ['BRAND_ADMIN', 'COMPLIANCE_OFFICER'] },
  async (request, { session, params }) => {
    const { dppId } = await params;
    const reason = request.nextUrl.searchParams.get('reason') ?? '';
    try {
      await withdrawSubmission(session, dppId, reason);
      return json({ dppId, withdrawn: true });
    } catch (error) {
      throw translate(error);
    }
  },
);

function translate(error: unknown): unknown {
  if (!(error instanceof RegistryError)) return error;
  if (error.code === 'NOT_FOUND') return new ApiError(404, 'Not found', { detail: error.message });
  if (error.code === 'UNAVAILABLE') {
    return new ApiError(503, 'Registry unavailable', { detail: error.message });
  }
  return new ApiError(409, 'Conflict', { detail: error.message });
}
