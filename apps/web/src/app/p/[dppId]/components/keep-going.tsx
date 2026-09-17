import Link from 'next/link';
import { ArrowUpRight, Recycle, Shirt, Wrench } from 'lucide-react';
import type { PassportPayload } from '@/lib/passport/schema';
import { localize } from './care';

/**
 * Repair, resell, rewear.
 *
 * Deliberately placed before end-of-life, because that is the order of the
 * waste hierarchy and the order of usefulness. Every card here either links to
 * something real or does not render — a dead "Coming soon" tile on a passport
 * is worse than an absent one, since the passport's whole claim is that its
 * contents are true.
 */
export function KeepGoingSection({
  payload,
  locale,
}: {
  payload: Partial<PassportPayload>;
  locale: string;
}) {
  const circularity = payload.circularity;
  const repair = payload.care?.repair;

  const cards: Array<{
    icon: typeof Wrench;
    title: string;
    body: string;
    href?: string;
    cta?: string;
  }> = [];

  if (repair?.guideUrl || repair?.sparePartsAvailable) {
    cards.push({
      icon: Wrench,
      title: 'Repair it',
      body: repair.sparePartsAvailable
        ? 'Spare parts and repair guidance are available for this garment.'
        : 'Repair guidance is available for this garment.',
      href: repair.guideUrl,
      cta: repair.guideUrl ? 'Repair guide' : undefined,
    });
  }

  if (circularity?.resale?.brandAuthorised) {
    cards.push({
      icon: Shirt,
      title: 'Resell it',
      body: circularity.resale.authenticationSupported
        ? 'This passport can pre-fill a resale listing with the size, composition and provenance already recorded here — and prove the garment is genuine.'
        : 'The brand supports reselling this garment.',
      /*
       * Only when the brand has supplied a real destination. This fell back
       * to `/p/${dppId}/resell`, a route that has never existed — so every
       * brand that ticked "resale authorised" without pasting a URL shipped a
       * "Prepare a listing" button that 404s, in the one file whose own rule
       * is that a card either links to something real or does not render.
       * Without a URL the card still earns its place: it tells the reader the
       * brand permits resale, which is the fact they need before listing it
       * anywhere else.
       */
      href: circularity.resale.url,
      cta: circularity.resale.url ? 'Prepare a listing' : undefined,
    });
  }

  if (circularity?.takeBack?.available) {
    cards.push({
      icon: Recycle,
      title: 'Send it back',
      body:
        localize(circularity.takeBack.instructions, locale) ??
        'The brand will take this garment back at the end of its life.',
      href: circularity.takeBack.url,
      cta: circularity.takeBack.incentive ?? 'Take-back scheme',
    });
  }

  if (cards.length === 0) return null;

  // The heading and the surrounding rule belong to the <Section> wrapper in
  // page.tsx; rendering them again here produced a duplicated title.
  return (
    <div>
      <p className="mb-6 max-w-prose text-sm leading-relaxed text-ink-muted">
        The most useful thing that can happen to a garment is another wearing.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  body,
  href,
  cta,
}: {
  icon: typeof Wrench;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  const inner = (
    <>
      <Icon className="size-4.5 text-accent" aria-hidden />
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">{body}</p>
      {href && cta ? (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
          {cta}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      ) : null}
    </>
  );

  const className =
    'flex flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-hover';

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
