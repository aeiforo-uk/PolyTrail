import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { canEnter, homeFor } from '@/lib/auth/personas';
import { rejectSession, verifySession } from '@/lib/auth/verify-session';
import { listNotifications, markAllRead } from '@/lib/notifications';
import { ConsoleShell } from './shell';

/**
 * Every console route is behind this layout, so authentication is structural
 * rather than something each page has to remember. Route handlers get the same
 * guarantee from `withAuth` in `src/lib/api/handler.ts`.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  // A signed cookie proves we issued it, not that its subject still exists.
  // Without this, a session that outlives its workspace turns every query into
  // a 404 and the product looks broken rather than signed out.
  const check = await verifySession(session);
  if (!check.ok) redirect(rejectSession(check.reason!));

  // A repairer or an authority signing in and typing /console gets sent to
  // their own surface rather than a half-broken brand console.
  if (!canEnter(session.role, '/console')) redirect(homeFor(session.role));

  const notifications = await listNotifications(session.userId);

  async function markAll() {
    'use server';
    const current = await getSession();
    if (current) await markAllRead(current.userId);
  }

  return (
    <ConsoleShell session={session} notifications={notifications} onMarkAllRead={markAll}>
      {children}
    </ConsoleShell>
  );
}
