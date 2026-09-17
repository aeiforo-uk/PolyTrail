import Link from 'next/link';
import { headers } from 'next/headers';
import {
  ArrowRight,
  CircleAlert,
  Clock,
  FileSignature,
  KeyRound,
  PackageCheck,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSession } from '@/lib/auth/session';
import { clientKey, rateLimit } from '@/lib/security/rate-limit';
import { formatDppId } from '@/lib/passport/identifier';
import { resolvePublicPassport } from '@/lib/passport/public';
import { resolveTransferToken } from '@/lib/transfers/service';
import { TRANSFER_REASON_META, transferStatusMeta } from '@/lib/transfers/types';
import { DecideForm } from './decide-form';

export const metadata = { title: 'A passport is being transferred to you' };
export const dynamic = 'force-dynamic';

/**
 * The recipient's page.
 *
 * Whoever opens this has no account, no context and no reason to trust the
 * link, so the page answers their three questions in the order they ask them —
 * who is handing me something, what is it, and what happens if I say yes —
 * before it asks for anything at all. Reading needs no account; accepting does,
 * because ownership has to belong to somebody.
 */
export default async function TransferAcceptancePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const incoming = await headers();
  const request = new Request('https://polytrail.invalid/', {
    headers: new Headers(Array.from(incoming.entries())),
  });
  const throttle = rateLimit(clientKey(request, 'transfer-view'), 60, 60_000);
  if (!throttle.ok) {
    return (
      <Shell title="Slow down">
        <Problem>
          Too many requests from your connection. Wait {throttle.retryAfterSeconds} seconds and
          reload.
        </Problem>
      </Shell>
    );
  }

  const { token } = await params;
  const offer = await resolveTransferToken(token);

  if (!offer) {
    return (
      <Shell title="This link cannot be used">
        <Problem>
          We do not recognise it. Check you copied the whole link, including everything after the
          last slash.
        </Problem>
      </Shell>
    );
  }

  if (offer.status === 'expired') {
    return (
      <Shell title="This link has expired">
        <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
          <Clock className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden />
          {offer.fromName} offered you {offer.productName ?? 'an item'} on{' '}
          {formatDate(offer.initiatedAt)}, and the link stopped working on{' '}
          {offer.expiresAt ? formatDate(offer.expiresAt) : 'its expiry date'}. Nothing has moved.
          Ask them to send a fresh one.
        </p>
      </Shell>
    );
  }

  if (offer.status !== 'initiated') {
    const meta = transferStatusMeta(offer.status);
    return (
      <Shell title={`This transfer is ${meta.label.toLowerCase()}`}>
        <Problem>{meta.description}</Problem>
      </Shell>
    );
  }

  const [session, passport] = await Promise.all([
    getSession(),
    resolvePublicPassport(offer.dppId, 'public'),
  ]);
  const reason = TRANSFER_REASON_META[offer.reason];
  const identity = passport?.payload.identity;

  return (
    <Shell
      eyebrow={`${reason.label} · offered ${formatDate(offer.initiatedAt)}`}
      title={`${offer.fromName} is handing you ${offer.productName ?? 'an item'}`}
    >
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        A digital product passport is the record of how something was made and what has happened to
        it since — its materials, its repairs, where it has been. {offer.fromName} wants to pass
        this one to you along with the item itself.
      </p>

      {/* The three questions, answered before anything is asked of the reader. */}
      <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <div className="bg-surface px-4 py-3.5">
          <dt className="eyebrow">From</dt>
          <dd className="mt-1 text-sm font-medium text-ink">{offer.fromName}</dd>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <dt className="eyebrow">What</dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {offer.productName ?? 'Untitled item'}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3.5">
          <dt className="eyebrow">Why</dt>
          <dd className="mt-1 text-sm font-medium text-ink">{reason.label}</dd>
        </div>
      </dl>

      <section
        aria-labelledby="item-heading"
        className="mt-4 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="item-heading" className="flex items-center gap-2 text-sm font-medium text-ink">
          <PackageCheck className="size-4 text-ink-subtle" aria-hidden />
          {offer.productName ?? 'Untitled item'}
        </h2>
        <p className="mono mt-1 text-2xs text-ink-subtle">{formatDppId(offer.dppId)}</p>

        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {identity?.brandName ? <Row label="Brand">{identity.brandName}</Row> : null}
          {identity?.category ? <Row label="Category">{identity.category}</Row> : null}
          {identity?.colourName ? <Row label="Colour">{identity.colourName}</Row> : null}
          {identity?.size ? <Row label="Size">{identity.size}</Row> : null}
        </dl>

        <Link
          href={`/p/${offer.dppId}`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          Read the whole passport before you decide
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </section>

      <section
        aria-labelledby="terms-heading"
        className="mt-4 rounded-lg border border-line bg-surface-sunken/50 p-5"
      >
        <h2 id="terms-heading" className="text-sm font-semibold text-ink">
          What accepting means
        </h2>
        <p className="mt-1.5 max-w-prose text-sm text-ink-muted">{reason.summary}</p>

        <ul className="mt-4 flex flex-col gap-3">
          <Means icon={KeyRound} title="The record becomes yours">
            {reason.becomesBrandOfRecord
              ? 'You become the operator of record for this passport and manage it yourself.'
              : 'Ownership of the passport moves to you, and the brand keeps answering for what it says.'}
          </Means>
          <Means icon={ShieldCheck} title="You get to read more of it">
            {reason.grants}
          </Means>
          <Means icon={FileSignature} title="Both sides sign">
            Your acceptance is signed and stored alongside {offer.fromName}&rsquo;s offer, exactly
            as issued. Neither can be edited afterwards, which is what makes the handover provable
            later.
          </Means>
        </ul>

        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">
          It does not move any money, and it is not a delivery note — it hands you the record that
          travels with the item. If the item has not reached you, say no for now and ask them to
          send the offer again when it has.
        </p>

        {offer.note ? (
          <blockquote className="mt-4 border-l-2 border-line-strong pl-3 text-sm text-ink-muted italic">
            &ldquo;{offer.note}&rdquo; — {offer.fromName}
          </blockquote>
        ) : null}
      </section>

      <div className="mt-8">
        <DecideForm
          token={token}
          reason={offer.reason}
          toEmail={offer.toEmail}
          expiresAt={offer.expiresAt}
          signedInAs={session?.tenantId ? { name: session.name, email: session.email } : null}
        />
      </div>
    </Shell>
  );
}

function Shell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="eyebrow">Polytrail{eyebrow ? ` · ${eyebrow}` : ''}</p>
      <h1 className="display mt-3 text-3xl">{title}</h1>
      <div className="mt-5">{children}</div>
      <p className="mt-12 border-t border-line pt-5 text-xs text-ink-subtle">
        Not expecting this? Ignore it. Nothing moves until somebody accepts, and the link stops
        working on its own.
      </p>
    </main>
  );
}

function Means({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface">
        <Icon className="size-3 text-ink-subtle" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{children}</span>
      </span>
    </li>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
        {children}
      </p>
      <Button asChild variant="secondary" className="mt-5">
        <Link href="/login">Go to sign in</Link>
      </Button>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
