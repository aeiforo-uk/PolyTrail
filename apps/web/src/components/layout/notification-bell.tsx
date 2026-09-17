'use client';

import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import { RelativeTime } from '@/components/ui/relative-time';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  severity: string;
  readAt: Date | null;
  createdAt: Date;
}

export function NotificationBell({
  items,
  onMarkAllRead,
}: {
  items: NotificationItem[];
  onMarkAllRead: () => Promise<void>;
}) {
  const unread = items.filter((n) => !n.readAt).length;
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative flex size-8 items-center justify-center rounded-sm text-rail-ink-muted transition-colors duration-[--duration-fast] hover:bg-rail-raised hover:text-rail-ink"
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 size-2 rounded-full bg-accent ring-2 ring-rail"
            />
          ) : null}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-line bg-surface shadow-md"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await onMarkAllRead();
                    router.refresh();
                  })
                }
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">Nothing to report.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((item) => {
                const content = (
                  <>
                    <span className="flex items-baseline gap-2">
                      {!item.readAt ? (
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1.5 size-1.5 shrink-0 rounded-full',
                            item.severity === 'critical'
                              ? 'bg-critical'
                              : item.severity === 'warning'
                                ? 'bg-caution'
                                : 'bg-accent',
                          )}
                        />
                      ) : (
                        <span aria-hidden className="mt-1.5 size-1.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink">{item.title}</span>
                        {item.body ? (
                          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                            {item.body}
                          </span>
                        ) : null}
                        <RelativeTime
                          value={item.createdAt}
                          className="mt-1 block text-2xs text-ink-subtle"
                        />
                      </span>
                    </span>
                  </>
                );

                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="block px-4 py-3 transition-colors hover:bg-surface-sunken"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}


