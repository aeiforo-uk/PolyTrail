import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CircleAlert, EyeOff, Lock, ScanLine } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { formatDppId } from '@/lib/passport/identifier';
import { LookupForm } from '../lookup-form';
import { loadItemForPartner } from '../queries';
import { RecordForm } from './record-form';
import { RecyclerView } from './recycler-view';
import { RepairerView } from './repairer-view';

export const metadata = { title: 'Item' };

/**
 * One item, as this partner may see it.
 *
 * The projection is done on the server against the field registry, so a
 * repairer's page never contains recycler-only data and a recycler's never
 * contains a repairer's commercial detail. Hiding fields in the browser would
 * put the whole payload on the wire and call it access control.
 *
 * One column, large type, and the decision at the top: the persona view leads
 * with the one fact that settles what happens to the item next, and the single
 * action sits at the bottom where a thumb can reach it.
 */
export default async function PartnerItemPage({
  params,
}: {
  params: Promise<{ dppId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { dppId } = await params;
  const outcome = await loadItemForPartner(session, dppId);

  if (outcome.kind === 'unknown') {
    return (
      <Problem
        title="We do not have that item"
        body="Check the identifier against the label. The characters I, L, O and U are never used in a Polytrail code — on a printed label they are almost always 1, 1, 0 and V."
      />
    );
  }

  if (outcome.kind === 'not_authorised') {
    return (
      <Problem
        title="You are not authorised on this item"
        body={`${outcome.brandName} has not given your workspace access to it. Ask them to add you — until they do, the public passport carries what anyone can read.`}
        publicLink={dppId}
      />
    );
  }

  const { item } = outcome;

  return (
    <div>
      <Link
        href="/partner"
        className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-base text-ink-muted transition-colors duration-[140ms] hover:text-ink motion-reduce:transition-none"
      >
        <ArrowLeft className="size-4.5" aria-hidden />
        Another item
      </Link>

      <header className="mt-3">
        <p className="eyebrow">{item.brandName}</p>
        <h1 className="display mt-1.5 text-4xl leading-tight sm:text-5xl">{item.productName}</h1>
        <p className="mono mt-3 text-base text-ink-muted">{formatDppId(item.dppId)}</p>
      </header>

      {item.closedBy ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-critical-border bg-critical-soft px-5 py-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-critical" aria-hidden />
          <div>
            <p className="text-base font-medium text-critical">This passport is closed</p>
            <p className="mt-1 max-w-prose text-base leading-relaxed text-ink-muted">
              A “{item.closedLabel}” event ended the item’s life. Nothing further can be recorded
              against it — the record below is final, and is kept as evidence.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        {item.persona === 'repairer' ? (
          <RepairerView payload={item.payload} />
        ) : (
          <RecyclerView payload={item.payload} />
        )}
      </div>

      {item.events.length > 0 ? (
        <section className="mt-8 border-t border-line pt-7">
          <h2 className="text-base font-semibold text-ink">What has happened to it</h2>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-muted">
            Oldest first. Every entry names whoever wrote it and none of them can be edited.
          </p>
          <ol className="mt-5 border-l border-line pl-6">
            {item.events.map((event) => (
              <li key={event.id} className="relative pb-6 last:pb-0">
                <span
                  aria-hidden
                  className={
                    event.terminal
                      ? 'absolute top-2 -left-[1.7rem] size-2.5 rounded-full bg-critical ring-4 ring-canvas'
                      : 'absolute top-2 -left-[1.7rem] size-2.5 rounded-full bg-line-strong ring-4 ring-canvas'
                  }
                />
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span
                    className={
                      event.terminal
                        ? 'text-base font-medium text-critical'
                        : 'text-base font-medium text-ink'
                    }
                  >
                    {event.label}
                  </span>
                  <span className="text-sm tabular-nums text-ink-subtle">
                    {new Date(event.occurredAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </p>
                {event.summary ? (
                  <p className="mt-1 max-w-prose text-base leading-relaxed text-ink-muted">
                    {event.summary}
                  </p>
                ) : null}
                {event.partnerName || event.actorName ? (
                  <p className="mt-1 text-sm text-ink-subtle">
                    {event.partnerName ?? event.actorName}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {item.closedBy ? null : (
        <div className="mt-10">
          <RecordForm dppId={item.dppId} persona={item.persona} />
        </div>
      )}

      {item.withheldCount > 0 ? (
        <p className="mt-8 flex items-start gap-2.5 border-t border-line pt-5 text-sm leading-relaxed text-ink-subtle">
          <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="tabular-nums">{item.withheldCount}</span> further{' '}
            {item.withheldCount === 1 ? 'field is' : 'fields are'} held on this passport that your
            tier does not open — they were never sent to this page, not hidden in it.
            Market-surveillance authorities read everything.
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A dead end that offers the way out.
 *
 * The person is standing there holding the garment, so the field goes back on
 * the screen immediately rather than behind a link — the most likely next
 * action is that they retype it.
 */
function Problem({
  title,
  body,
  publicLink,
}: {
  title: string;
  body: string;
  publicLink?: string;
}) {
  return (
    <div>
      <h1 className="display text-3xl leading-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 flex max-w-prose items-start gap-2.5 text-base leading-relaxed text-ink-muted">
        <CircleAlert className="mt-1 size-5 shrink-0 text-caution" aria-hidden />
        {body}
      </p>

      {publicLink ? (
        <Link
          href={`/p/${publicLink}`}
          className="mt-5 inline-flex min-h-12 items-center rounded-md border border-line-strong bg-surface px-5 text-base text-ink shadow-xs transition-colors duration-[140ms] hover:bg-surface-sunken motion-reduce:transition-none"
        >
          Read the public passport
        </Link>
      ) : null}

      <div className="mt-10 rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <p className="mb-4 flex items-center gap-2 text-base font-medium text-ink">
          <ScanLine className="size-4.5 text-ink-subtle" aria-hidden />
          Try again
        </p>
        <LookupForm autoFocus={false} />
      </div>
    </div>
  );
}
