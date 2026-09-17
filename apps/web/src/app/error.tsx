'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Global error boundary.
 *
 * Shows the digest rather than the message: Next.js replaces server error
 * messages with a digest in production precisely so internals do not reach the
 * browser, and the digest is what correlates the screen to the server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display text-4xl">We could not load this page</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        The error has been logged. Try again, and if it keeps happening quote the reference below.
      </p>
      {error.digest ? <p className="mono text-xs text-ink-subtle">{error.digest}</p> : null}
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
