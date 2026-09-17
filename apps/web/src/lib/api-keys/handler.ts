import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { ApiError, serverError, tooManyRequests } from '@/lib/api/errors';
import { clientKey, rateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';
import { authenticateApiKey, requireScopes, type ApiPrincipal } from './authenticate';
import type { ApiScope } from './scopes';

/**
 * The wrapper every `/api/v1` route goes through.
 *
 * It exists so that four things are true of every response without a route
 * author having to remember any of them: the caller is authenticated, the key
 * holds the declared scopes, `RateLimit-*` headers are present (including on
 * errors — a client backing off needs them most when it is being refused), and
 * failures are RFC 9457 problem documents rather than whatever the exception
 * happened to be.
 */

export interface ApiV1Context<P = Record<string, string>> {
  params: Promise<P>;
  principal: ApiPrincipal;
}

type Handler<P> = (req: NextRequest, ctx: ApiV1Context<P>) => Promise<Response> | Response;

export interface ApiV1Options {
  scopes: readonly ApiScope[];
  /** Requests per minute for this operation. Writes are cheaper to abuse. */
  limit?: number;
  /**
   * `Cache-Control` for a successful response. Defaults to `private, no-store`
   * because passport data is tenant-scoped and a shared cache must never hold
   * it; read operations that are safe to cache in the *client* say so.
   */
  cacheControl?: string;
}

/**
 * Unauthenticated ceiling, applied per IP before the key is even looked up, so
 * that guessing keys costs an attacker round trips rather than database reads.
 */
const ANONYMOUS_LIMIT = 120;
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 300;

export function withApiKey<P = Record<string, string>>(
  options: ApiV1Options,
  handler: Handler<P>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    const gate = rateLimit(clientKey(req, 'api-v1-anon'), ANONYMOUS_LIMIT, WINDOW_MS);
    if (!gate.ok) {
      return finalize(
        tooManyRequests('Too many requests from this address.').toResponse(req.nextUrl.pathname),
        gate,
        options,
      );
    }

    let budget = gate;
    try {
      const principal = await authenticateApiKey(req);
      requireScopes(principal, options.scopes);

      // Per-key budget, so one noisy integration cannot exhaust another
      // tenant's allowance from the same office IP.
      budget = rateLimit(`api-v1-key:${principal.keyId}`, options.limit ?? DEFAULT_LIMIT, WINDOW_MS);
      if (!budget.ok) {
        throw tooManyRequests(
          `This key is limited to ${budget.limit} requests a minute. Retry in ${budget.retryAfterSeconds}s.`,
        );
      }

      // Next's generated types promise a context object, but a route with no
      // dynamic segment has nothing to put in it. The fallback keeps a handler
      // that never reads params from depending on that promise holding.
      const params = ctx?.params ?? Promise.resolve({} as P);
      const response = await handler(req, { params, principal });
      return finalize(response, budget, options);
    } catch (error) {
      return finalize(toProblem(error, req.nextUrl.pathname), budget, options);
    }
  };
}

/**
 * JSON body for a v1 route. Kept separate from `json()` in `lib/api/handler`
 * because that one hard-codes `private, no-store`, which is right for the
 * console and wrong for an integration polling a published passport.
 */
export function apiJson<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

function finalize(response: Response, budget: ReturnType<typeof rateLimit>, options: ApiV1Options) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(rateLimitHeaders(budget))) {
    headers.set(name, value);
  }
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', response.ok ? (options.cacheControl ?? 'private, no-store') : 'no-store');
  }
  // Integrations run from browsers more often than vendors admit. Reads are
  // already scoped to the key's tenant, and a key in browser JavaScript is the
  // caller's problem, not a hole we open by answering the preflight.
  headers.set('Vary', 'Authorization, Accept');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function toProblem(error: unknown, instance: string): Response {
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

  console.error('[api/v1] unhandled error', { instance, error });
  return serverError().toResponse(instance);
}
