'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { CircleAlert, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportAuditCsv, type ExportState } from './actions';

/**
 * CSV export.
 *
 * The server action does the work — auth, the tenant predicate, redaction and
 * the `export.generated` entry — and hands back the text. The browser turns
 * that into a file, because a server action cannot stream a download and
 * routing this through a GET would put the filters in a URL that anyone could
 * replay.
 */
export function ExportButton({
  action,
  from,
  to,
}: {
  action?: string;
  from?: string;
  to?: string;
}) {
  const [state, formAction, pending] = useActionState<ExportState, FormData>(exportAuditCsv, {});
  const delivered = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!state.csv || !state.filename) return;
    // Guard against re-downloading the same payload when React re-renders.
    const stamp = state.filename + state.csv.length;
    if (delivered.current === stamp) return;
    delivered.current = stamp;

    const url = URL.createObjectURL(new Blob([state.csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = state.filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [state.csv, state.filename]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="action" value={action ?? ''} />
      <input type="hidden" name="from" value={from ?? ''} />
      <input type="hidden" name="to" value={to ?? ''} />
      {state.error ? (
        <span className="flex items-center gap-1.5 text-xs text-critical" role="alert">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {state.error}
        </span>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        <Download aria-hidden />
        Export CSV
      </Button>
    </form>
  );
}
