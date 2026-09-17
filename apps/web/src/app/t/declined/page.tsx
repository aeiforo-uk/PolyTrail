import { CircleCheck } from 'lucide-react';

export const metadata = { title: 'Transfer declined' };

/**
 * Where declining lands.
 *
 * A static segment, so it takes precedence over `/t/[token]` and a declined
 * transfer never bounces back through the token lookup it has just consumed.
 */
export default function DeclinedPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-6 py-16">
      <p className="eyebrow">Polytrail</p>
      <h1 className="display mt-3 text-3xl">You declined the transfer</h1>
      <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
        Nothing moved. The sender has been told, along with the reason you gave, and the link no
        longer works. If this was a mistake, ask them to send a new offer.
      </p>
    </main>
  );
}
