import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { LoginForm, type DemoAccount } from './login-form';
import { Logo } from '@/components/brand/logo';
import { LoginShowcase } from './showcase';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Demo accounts, development only.
 *
 * A sign-in page that quietly ships test accounts to production is one of the
 * most common ways a pilot turns into an incident, so the list is assembled on
 * the server and simply does not exist in the bundle anywhere else.
 */
const DEMO: DemoAccount[] = [
  { email: 'admin@aeiforo.co.uk', role: 'Brand admin', note: 'sees everything in one workspace' },
  { email: 'product@aeiforo.co.uk', role: 'Product manager', note: 'writes passports' },
  { email: 'compliance@aeiforo.co.uk', role: 'Compliance officer', note: 'approves them' },
  { email: 'admin@polytrail.eu', role: 'Platform admin', note: 'operates Polytrail itself' },
];

const DEMO_PASSWORD = 'Polytrail!2026';

const REJECTION: Record<string, string> = {
  user_gone: 'That account no longer exists. Sign in again.',
  user_inactive: 'That account has been suspended. Ask an administrator to reactivate it.',
  workspace_gone: 'That workspace no longer exists. Sign in again.',
  workspace_closed: 'That workspace has been closed.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const rejection = reason ? REJECTION[reason] : undefined;

  if (await getSession()) redirect('/console');

  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <main className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="login-in login-d1 w-full max-w-sm">
          <Logo size="md" subtitle="Product passports" />

          {/* Sans, not the serif. The serif belongs to the public passport;
              the sign-in screen is the product, and it should look like it. */}
          <h1 className="title-1 mt-9 text-[2rem] leading-tight tracking-[-0.024em]">Sign in</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            For brands, suppliers, repairers, recyclers and market-surveillance authorities.
          </p>

          {rejection ? (
            <p
              role="status"
              className="mt-6 rounded-md border border-caution-border bg-caution-soft px-3 py-2.5 text-sm text-caution"
            >
              {rejection}
            </p>
          ) : null}

          <div className="mt-8">
            {/*
              Both the account list and the password are gated. Passing the
              password unconditionally would serialise it into the production
              RSC payload even with the panel hidden — a hidden component still
              receives its props over the wire.
            */}
            <LoginForm
              demo={isDev ? DEMO : undefined}
              demoPassword={isDev ? DEMO_PASSWORD : undefined}
            />
          </div>

          <p className="mt-8 flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Sign-ins are recorded. Anything irreversible asks for a second factor whether or not you
            were asked for one here.
          </p>
        </div>
      </div>

      <LoginShowcase />

    </main>
  );
}
