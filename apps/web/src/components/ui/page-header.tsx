import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-4 border-b border-line px-8 pt-9 pb-7',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="title-1 text-ink" style={{ textWrap: 'balance' }}>
          {title}
        </h1>
        {description ? (
          <p className="body-2 mt-2 max-w-prose text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
