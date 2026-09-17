import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { isProtected } from '@/lib/auth/personas';

/**
 * Edge middleware.
 *
 * Deliberately thin. It does three cheap things — redirect unauthenticated
 * console traffic, stamp a request id, and set the headers that must be on
 * every response — and defers every decision that needs the database to the
 * route itself.
 *
 * In particular it does NOT verify the session token. Verifying here would
 * need the signing secret at the edge and would still have to be re-checked in
 * the route, so the cookie's presence is treated as a hint for redirecting and
 * nothing more. Authorisation happens in `withAuth` and in the console layout,
 * where the session is actually decoded.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Presence of the cookie only decides whether to bounce to sign-in. Which
  // persona a role may enter is decided in each layout, where the session is
  // actually decoded and can be trusted.
  if (isProtected(pathname) && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const requestId = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);

  // A public passport must never be cached with a viewer's tier applied to it.
  // The page is dynamic anyway; this is belt and braces against an intermediary
  // caching an authority-tier response and serving it to the next reader.
  if (pathname.startsWith('/p/')) {
    response.headers.set('Vary', 'Accept, Accept-Language, Cookie');
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
