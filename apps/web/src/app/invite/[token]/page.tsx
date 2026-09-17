import Link from 'next/link';
import { CircleAlert, Check, Minus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/roles';
import { resolveInvitationToken } from '@/lib/team/invitations';
import { actionsForRole } from '@/lib/team/permissions';
import { AcceptForm } from './accept-form';
import { Logo } from '@/components/brand/logo';

export const metadata = { title: 'Accept invitation' };

/**
 * Accepting an invitation.
 *
 * Deliberately outside `/console`: that layout redirects anyone without a
 * session to sign in, and an invitee has no account yet. This is the one
 * authenticated-adjacent page that must be reachable by a stranger holding a
 * token, so it lives at the top level and does its own token check.
 *
 * It is also, for most of the people who will ever use this product, the first
 * page of it they see — so it is built like a front door rather than like a
 * form in a corner. The right-hand panel says what the role they have been
 * handed actually lets them do, read out of the same state machine that
 * enforces it, because "Compliance officer" means nothing to someone who has
 * never used the product.
 */
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await resolveInvitationToken(token);

  if (!invitation || invitation.problem) {
    return (
      <Shell>
        <h1 className="display text-3xl leading-tight">This link cannot be used</h1>
        <p className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed text-ink-muted">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
          {!invitation
            ? 'We do not recognise this invitation. Check you copied the whole link — they are long, and mail clients break them across lines.'
            : invitation.problem === 'expired'
              ? 'This invitation has expired. Links last seven days; ask whoever invited you to send a new one, which takes them one click.'
              : invitation.problem === 'revoked'
                ? 'This invitation was withdrawn by the workspace that sent it.'
                : 'This invitation has already been used. If that was you, sign in instead.'}
        </p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </Shell>
    );
  }

  const grants = actionsForRole(invitation.role);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <Logo size="md" subtitle="Product passports" />

          <p className="eyebrow mt-8">You have been invited</p>
          <h1 className="display mt-1.5 text-4xl leading-tight">Join {invitation.workspaceName}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            as a <span className="font-medium text-ink">{ROLE_LABELS[invitation.role]}</span>.{' '}
            {ROLE_DESCRIPTIONS[invitation.role]}
          </p>

          {invitation.message ? (
            <blockquote className="mt-5 border-l-2 border-line-strong pl-3.5 text-sm leading-relaxed text-ink-muted italic">
              {invitation.message}
            </blockquote>
          ) : null}

          <div className="mt-7">
            <AcceptForm token={token} email={invitation.email} />
          </div>
        </div>
      </div>

      <aside className="grain hidden flex-col justify-center border-l border-line bg-surface-sunken px-10 py-14 lg:flex">
        <div className="max-w-sm">
          <h2 className="text-sm font-semibold text-ink">
            What a {ROLE_LABELS[invitation.role].toLowerCase()} can do
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Read from the passport lifecycle itself, so this is exactly what the system will let you
            do — not a summary somebody wrote once.
          </p>

          {grants.length > 0 ? (
            <ul className="mt-5 flex flex-col">
              {grants.map((action) => (
                <li
                  key={action}
                  className="flex items-start gap-2.5 border-t border-line py-2.5 last:border-b"
                >
                  <Check className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
                  <span className="text-sm text-ink">{action}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 flex items-start gap-2.5 border-y border-line py-3 text-sm text-ink-muted">
              <Minus className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
              This role does not move passports through their lifecycle. It reads, and answers what
              it is asked.
            </p>
          )}

          <p className="mt-6 flex items-start gap-2 text-2xs leading-relaxed text-ink-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Everything you do in the workspace is recorded against your name, and stays recorded
            even if your account is later removed — the evidence trail is not editable.
          </p>
        </div>
      </aside>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <Logo size="md" subtitle="Product passports" />
        </div>
        {children}
      </div>
    </main>
  );
}
