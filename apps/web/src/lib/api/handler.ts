import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { getSession, type Session } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/roles';
import { ApiError, forbidden, serverError, unauthorized } from './errors';

export interface RouteContext<P = Record<string, string>> {
  params: Promise<P>;
}

export interface AuthedContext<P = Record<string, string>> extends RouteContext<P> {
  session: Session;
  /**
   * The tenant this request operates on. Guaranteed non-null for every role
   * except PLATFORM_ADMIN, whose handlers must resolve a tenant explicitly.
   */
  tenantId: string;
}

type Handler<P> = (req: NextRequest, ctx: AuthedContext<P>) => Promise<Response> | Response;

/**
 * Wrap a route handler with authentication, role checking and error
 * translation.
 *
 * The predecessor product did role checks inline in 238 separate route files,
 * which meant a missed check was invisible until someone went looking. Here a
 * route either declares its roles or does not compile past review, and the
 * tenant is bound once so a handler cannot accidentally read across tenants.
 */
export function withAuth<P = Record<string, string>>(
  options: { roles: readonly Role[] },
  handler: Handler<P>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) throw unauthorized();

      if (!options.roles.includes(session.role)) {
        throw forbidden(
          `This action requires one of: ${options.roles.join(', ')}. You are signed in as ${session.role}.`,
        );
      }

      if (!session.tenantId && session.role !== 'PLATFORM_ADMIN') {
        throw forbidden('Your account is not attached to a workspace.');
      }

      return await handler(req, {
        ...ctx,
        session,
        tenantId: session.tenantId ?? '',
      });
    } catch (error) {
      return toErrorResponse(error, req.nextUrl.pathname);
    }
  };
}

/** Same translation for public routes that need no session. */
export function withPublic<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response> | Response,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return toErrorResponse(error, req.nextUrl.pathname);
    }
  };
}

function toErrorResponse(error: unknown, instance: string): Response {
  if (error instanceof ApiError) return error.toResponse(instance);

  if (error instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_';
      (errors[key] ??= []).push(issue.message);
    }
    return new ApiError(422, 'Unprocessable content', {
      detail: 'The request body did not match the expected shape.',
      errors,
    }).toResponse(instance);
  }

  // Never leak an internal message to the client; log it for the operator.
  console.error('[api] unhandled error', { instance, error });
  return serverError().toResponse(instance);
}

/** JSON response with sensible caching defaults for authenticated data. */
export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'private, no-store',
      ...init?.headers,
    },
  });
}
