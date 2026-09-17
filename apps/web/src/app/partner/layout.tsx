import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { rejectSession, verifySession } from '@/lib/auth/verify-session';
import { getSession } from '@/lib/auth/session';
import { signOut } from '@/lib/auth/sign-in';
import { personaFor } from './queries';
import { Logo } from '@/components/brand/logo';

export const metadata = { title: 'Polytrail for partners' };

/**
 * The partner surface.
 *
 * Deliberately not the console with things taken away. A repairer at a bench
 * and a sorter on a line each have one item in front of them and one thing to
 * record; navigation, catalogues and dashboards are somebody else's job. So
 * the shell is a single band across the top and a single column beneath it,
 * sized for someone reading at arm's length with their hands full — every
 * control in this header clears 44px, because the alternative is a mis-tap made
 * with a glove on.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const check = await verifySession(session);
  if (!check.ok) redirect(rejectSession(check.reason!));

  const persona = personaFor(session.role);
  if (!persona || !session.tenantId) redirect('/console');

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Light, like every other surface. The dark chrome in this product is
          the console's navigation rail and nothing else — a second dark bar on
          an unrelated surface reads as a different application. */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 sm:px-6">
          <Link
            href="/partner"
            className="-ml-2 flex min-h-12 items-center gap-2.5 rounded-md px-2 transition-opacity duration-[140ms] hover:opacity-80 motion-reduce:transition-none"
          >
            <Logo subtitle={persona === 'repairer' ? 'Repair' : 'Recovery'} />
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-ink-muted sm:inline">{session.name}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="-mr-2 flex min-h-12 items-center gap-1.5 rounded-md px-3 text-xs text-ink-muted transition-colors duration-[--duration-fast] hover:text-ink"
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:px-6 sm:py-12">{children}</main>

      <footer className="border-t border-line px-5 py-6 sm:px-6">
        <p className="mx-auto max-w-3xl text-2xs leading-relaxed text-ink-subtle">
          What you record here is written to the item’s passport under your workspace’s name and
          cannot be edited or deleted afterwards. A correction is recorded as a further event.
        </p>
      </footer>
    </div>
  );
}
