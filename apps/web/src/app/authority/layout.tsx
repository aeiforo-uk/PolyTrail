import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rejectSession, verifySession } from '@/lib/auth/verify-session';
import { getSession } from '@/lib/auth/session';
import { canEnter, homeFor } from '@/lib/auth/personas';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { signOut } from '@/lib/auth/sign-in';
import { Logo } from '@/components/brand/logo';

/**
 * The market-surveillance surface.
 *
 * A separate application rather than the brand console with extra permissions.
 * An inspector arrives holding a garment and needs one thing — the complete
 * record behind that label — and giving them a product-management console with
 * most of it greyed out would be both worse to use and a standing invitation to
 * a permissions mistake.
 *
 * Read-everything, write-nothing. There is no mutation anywhere under this
 * route, which is a property worth keeping deliberately.
 */
export default async function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login?next=/authority');

  // A signed cookie proves we issued it, not that its subject still exists.
  const check = await verifySession(session);
  if (!check.ok) redirect(rejectSession(check.reason!));

  // The middleware only checks that a cookie exists. The persona check happens
  // here, where the session has actually been decoded and can be trusted.
  if (!canEnter(session.role, '/authority')) redirect(homeFor(session.role));

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/authority" className="rounded-md">
            <Logo subtitle="Market surveillance" />
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-ink-muted sm:inline">
              {session.name || session.email} · {ROLE_LABELS[session.role]}
            </span>
            <form action={signOut}>
              <button type="submit" className="text-ink-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

      <footer className="border-t border-line px-6 py-6">
        <p className="mx-auto max-w-6xl text-2xs text-ink-subtle">
          Every passport opened here is written into that brand’s audit chain, with your name, the
          time and what you searched for. A regulator reading a brand’s data is an event the brand
          is entitled to see.
        </p>
      </footer>
    </div>
  );
}
