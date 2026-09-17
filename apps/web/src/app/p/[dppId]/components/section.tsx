import { cn } from '@/lib/utils';

/**
 * A passport section.
 *
 * Built on native `<details>`/`<summary>` rather than a JS disclosure, because
 * the whole page has to work with scripting off — that is what separates a
 * document a regulator can archive from a single-page app that renders nothing
 * to a crawler. The open/closed animation is CSS grid on `grid-template-rows`,
 * which animates without measuring anything.
 */
export function Section({
  title,
  hint,
  defaultOpen = false,
  id,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group border-t border-line [&[open]_.chevron]:rotate-45"
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-baseline justify-between gap-4 py-5',
          'transition-colors hover:text-accent [&::-webkit-details-marker]:hidden',
        )}
      >
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
        <span className="flex items-baseline gap-3">
          {hint ? (
            <span className="text-xs text-ink-subtle tabular-nums">{hint}</span>
          ) : null}
          <span
            className="chevron relative size-3.5 shrink-0 self-center transition-transform duration-200 ease-[cubic-bezier(.32,.72,0,1)]"
            aria-hidden
          >
            <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-ink-subtle" />
            <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-ink-subtle transition-opacity group-open:opacity-0" />
          </span>
        </span>
      </summary>
      <div className="pb-10">{children}</div>
    </details>
  );
}

/** Small uppercase label used above groups inside a section. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('eyebrow mb-3', className)}>{children}</p>;
}

/**
 * A mono identifier chip. Identifiers get monospace everywhere in this product
 * — it is a free, instantly-legible signal that a string is data to be copied
 * rather than prose to be read.
 */
export function IdPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-xl border border-line bg-surface-sunken px-2.5 py-1">
      <span className="text-2xs text-ink-subtle uppercase tracking-[0.07em]">{label}</span>
      <span className="mono text-xs text-ink">{value}</span>
    </span>
  );
}

/** A labelled value row. The workhorse of the whole page. */
export function Row({
  label,
  value,
  note,
  indent = 0,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  indent?: number;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-0"
      style={indent ? { paddingLeft: indent * 16 } : undefined}
    >
      <span className={cn('text-sm', indent ? 'text-ink-muted' : 'text-ink')}>
        {label}
        {note ? <span className="ml-2 text-xs text-ink-subtle">{note}</span> : null}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-ink">{value}</span>
    </div>
  );
}
