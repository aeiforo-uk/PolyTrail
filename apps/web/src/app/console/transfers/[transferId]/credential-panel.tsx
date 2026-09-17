'use client';

import * as React from 'react';
import { ChevronDown, FileSignature, ShieldCheck, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Both signed statements, readable.
 *
 * The credential is shown in full rather than summarised, because the reason it
 * is stored verbatim is so somebody can read it in a dispute — and a viewer
 * that pretty-prints a summary is a viewer that has already interpreted the
 * evidence for them.
 */
export function CredentialPanel({
  title,
  description,
  document,
  hash,
}: {
  title: string;
  description: string;
  document: Record<string, unknown> | null;
  hash: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const signed = Boolean(document && document.proof);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <FileSignature className="size-4 text-ink-subtle" aria-hidden />
            {title}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
          {hash ? <p className="mono mt-2 text-2xs break-all text-ink-subtle">{hash}</p> : null}
        </div>

        {document ? (
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-2xs font-medium',
                signed ? 'text-positive' : 'text-caution',
              )}
            >
              {signed ? (
                <ShieldCheck className="size-3.5" aria-hidden />
              ) : (
                <ShieldOff className="size-3.5" aria-hidden />
              )}
              {signed ? 'Signed' : 'Unsigned'}
            </span>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              {open ? 'Hide' : 'Read'} the document
              <ChevronDown
                className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                aria-hidden
              />
            </button>
          </div>
        ) : (
          <span className="shrink-0 text-2xs text-ink-subtle">Not issued yet</span>
        )}
      </div>

      {open && document ? (
        <pre className="mono max-h-96 overflow-auto border-t border-line bg-surface-sunken px-5 py-4 text-2xs leading-relaxed text-ink-muted">
          {JSON.stringify(document, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
