import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

export const dynamic = 'force-dynamic';

const REASONS = new Set([
  'user_gone',
  'user_inactive',
  'workspace_gone',
  'workspace_closed',
]);

/**
 * Where a session goes to be discarded.
 *
 * A layout cannot do this itself: Next.js only permits cookie writes in a
 * Server Action or a Route Handler, so calling `clearSessionCookie()` during
 * render throws and the whole page becomes an error boundary — which is worse
 * than the stale session it was trying to fix.
 *
 * So the layout redirects here, this handler clears the cookie on the response
 * it is already sending, and the reader lands on sign-in with an explanation.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('reason') ?? '';
  const reason = REASONS.has(raw) ? raw : 'user_gone';

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?reason=${reason}`;

  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_COOKIE_NAME);
  // The half-authenticated marker too, so a rejected session cannot leave a
  // pending second factor behind it.
  response.cookies.delete('polytrail_mfa_pending');
  return response;
}
