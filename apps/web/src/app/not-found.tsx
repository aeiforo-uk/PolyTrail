import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 text-center">
      <p className="eyebrow">404</p>
      <h1 className="display text-4xl">This page does not exist</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        If you scanned a label and landed here, the passport may not have been published yet, or the
        identifier may have been mistyped. Identifiers are sixteen characters and never contain the
        letters I, L, O or U.
      </p>
      <div className="flex justify-center">
        <Button asChild variant="secondary">
          <Link href="/">Go to Polytrail</Link>
        </Button>
      </div>
    </main>
  );
}
