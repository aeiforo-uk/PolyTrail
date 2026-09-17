'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Download,
  FileSpreadsheet,
  UploadCloud,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IDLE_UPLOAD_STATE, type UploadState } from '../state';

/** What the server action will accept. Stated before the upload, not after. */
const MAX_KB = 900;

/**
 * The file chooser.
 *
 * The whole panel is the drop target and the whole panel is the click target,
 * because a drop zone with a small button in the middle of it teaches people
 * that only the button works. The file input stays in the DOM and keeps focus
 * behaviour — it is visually hidden, not `display: none` — so the zone is
 * reachable by keyboard and announced as a file control.
 *
 * The chosen file's name and size stay on screen after it is picked. A file
 * input that reverts to "No file chosen" after a failed submit is how people
 * upload the wrong file twice.
 */
export function UploadForm({
  action,
}: {
  action: (state: UploadState, formData: FormData) => Promise<UploadState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_UPLOAD_STATE);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = React.useState<{ name: string; size: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [rejected, setRejected] = React.useState<string | null>(null);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      setChosen(null);
      return;
    }
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) {
      setRejected(
        `“${file.name}” is not a CSV. Export it from your spreadsheet as “Comma separated values” and try again.`,
      );
      setChosen(null);
      return;
    }
    if (file.size > MAX_KB * 1024) {
      setRejected(
        `“${file.name}” is ${Math.round(file.size / 1024)} KB and the limit is ${MAX_KB} KB. Split it in two, or pull the data through a connector instead.`,
      );
      setChosen(null);
      return;
    }
    setRejected(null);
    setChosen({ name: file.name, size: file.size });
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = '';
    setChosen(null);
    setRejected(null);
  };

  const problem = rejected ?? (state.status === 'error' ? state.message : null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {problem ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (inputRef.current && event.dataTransfer.files.length > 0) {
            inputRef.current.files = event.dataTransfer.files;
            take(event.dataTransfer.files);
          }
        }}
        className={cn(
          'rounded-lg border-2 border-dashed bg-surface',
          'transition-[background-color,border-color] duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
          'focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft',
          dragging
            ? 'border-accent bg-accent-soft/50'
            : chosen
              ? 'border-line-strong'
              : 'border-line-strong hover:border-line-hover hover:bg-surface-sunken/40',
        )}
      >
        {chosen ? (
          <div className="flex flex-wrap items-center gap-4 px-6 py-6">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-md bg-positive-soft text-positive"
            >
              <FileSpreadsheet className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{chosen.name}</span>
              <span className="mono block text-xs tabular-nums text-ink-subtle">
                {(chosen.size / 1024).toFixed(0)} KB of {MAX_KB} KB
              </span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <X aria-hidden />
              Choose a different file
            </Button>
          </div>
        ) : (
          <label
            htmlFor="file"
            className="flex cursor-pointer flex-col items-center gap-4 px-6 py-14 text-center"
          >
            <span
              aria-hidden
              className={cn(
                'flex size-14 items-center justify-center rounded-full transition-colors duration-[140ms]',
                dragging ? 'bg-accent text-on-accent' : 'bg-surface-sunken text-ink-subtle',
              )}
            >
              <UploadCloud className="size-6" />
            </span>
            <span>
              <span className="block text-base font-medium text-ink">
                {dragging ? 'Let go to read the file' : 'Drop your CSV here'}
              </span>
              <span className="mt-1 block text-sm text-ink-muted">
                or click anywhere in this panel to choose one
              </span>
            </span>
            <span className="text-2xs text-ink-subtle">
              <span className="mono">.csv</span> · up to {MAX_KB} KB · up to 5,000 rows
            </span>
          </label>
        )}

        <input
          ref={inputRef}
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv,text/plain"
          required
          onChange={(event) => take(event.target.files)}
          className="sr-only"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={!chosen}>
          Read the file
          <ArrowRight aria-hidden />
        </Button>
        <Button asChild variant="ghost" size="md">
          <Link href="/console/imports/template">
            <Download aria-hidden />
            Download the template
          </Link>
        </Button>
        <p className="text-sm text-ink-muted">
          Reading the file creates nothing. You will see every column first.
        </p>
      </div>
    </form>
  );
}
