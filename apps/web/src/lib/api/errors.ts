import { NextResponse } from 'next/server';

/**
 * Problem Details for HTTP APIs (RFC 9457).
 *
 * Using the standard envelope rather than an ad-hoc `{error: string}` matters
 * here because the passport API is consumed by other people's integration code
 * — retailers, PLM vendors, a future EU registry — and they should not have to
 * learn a bespoke error shape.
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  /** Field-level issues, keyed by dot-path, for form rendering. */
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  /**
   * The short, stable summary of the problem type — "Forbidden", not the
   * sentence explaining this particular refusal. RFC 9457 §3.1.1 is explicit
   * that `title` should not change from occurrence to occurrence; the varying
   * part belongs in `detail`, and clients group and translate on `type` and
   * `title`.
   */
  readonly title: string;
  readonly detail?: string;
  readonly errors?: Record<string, string[]>;

  constructor(
    status: number,
    title: string,
    options: { detail?: string; type?: string; errors?: Record<string, string[]> } = {},
  ) {
    super(options.detail ?? title);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = options.detail;
    this.type = options.type ?? `https://polytrail.eu/problems/${slug(title)}`;
    this.errors = options.errors;
  }

  toResponse(instance?: string): NextResponse<Problem> {
    const problem: Problem = {
      type: this.type,
      title: this.title,
      status: this.status,
    };
    if (this.detail) problem.detail = this.detail;
    if (instance) problem.instance = instance;
    if (this.errors) problem.errors = this.errors;
    return NextResponse.json(problem, {
      status: this.status,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const badRequest = (detail: string, errors?: Record<string, string[]>) =>
  new ApiError(400, 'Bad request', { detail, errors });

export const unauthorized = (detail = 'Sign in to continue.') =>
  new ApiError(401, 'Unauthorized', { detail });

export const forbidden = (detail = 'You do not have access to this resource.') =>
  new ApiError(403, 'Forbidden', { detail });

export const notFound = (detail = 'The resource does not exist.') =>
  new ApiError(404, 'Not found', { detail });

export const conflict = (detail: string) => new ApiError(409, 'Conflict', { detail });

export const unprocessable = (detail: string, errors?: Record<string, string[]>) =>
  new ApiError(422, 'Unprocessable content', { detail, errors });

export const tooManyRequests = (detail = 'Slow down and try again shortly.') =>
  new ApiError(429, 'Too many requests', { detail });

export const serverError = (detail = 'Something went wrong on our side.') =>
  new ApiError(500, 'Internal server error', { detail });
