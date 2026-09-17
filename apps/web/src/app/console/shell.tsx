'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Factory,
  FileCheck2,
  KeyRound,
  LandmarkIcon,
  LayoutDashboard,
  LogOut,
  Plug,
  Settings,
  ShieldCheck,
  Terminal,
  Upload,
  Users,
} from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import type { Session } from '@/lib/auth/session';
import { NotificationBell, type NotificationItem } from '@/components/layout/notification-bell';
import { CommandPalette, type Command } from '@/components/layout/command-palette';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { signOut } from '@/lib/auth/sign-in';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand/logo';
import { Avatar } from '@/components/ui/avatar';

/**
 * Navigation is grouped by the job being done rather than by data model, and
 * every item declares which roles may see it. A supplier signing in through the
 * same shell should never be shown a link they cannot open.
 */
const NAV: Array<{
  group: string;
  items: Array<{ href: string; label: string; icon: typeof Boxes; roles: readonly Role[] }>;
}> = [
  {
    group: 'Catalogue',
    items: [
      { href: '/console', label: 'Overview', icon: LayoutDashboard, roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'] },
      { href: '/console/passports', label: 'Passports', icon: Boxes, roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'] },
      { href: '/console/imports', label: 'Bulk import', icon: Upload, roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER'] },
    ],
  },
  {
    group: 'Supply',
    items: [
      { href: '/console/partners', label: 'Suppliers', icon: Factory, roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER'] },
      { href: '/console/requests', label: 'Data requests', icon: ClipboardList, roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER'] },
      { href: '/console/connectors', label: 'Connections', icon: Plug, roles: ['BRAND_ADMIN'] },
    ],
  },
  {
    group: 'Compliance',
    items: [
      { href: '/console/review', label: 'Review queue', icon: FileCheck2, roles: ['COMPLIANCE_OFFICER', 'BRAND_ADMIN'] },
      { href: '/console/registry', label: 'EU registry', icon: LandmarkIcon, roles: ['COMPLIANCE_OFFICER', 'BRAND_ADMIN'] },
      { href: '/console/transfers', label: 'Ownership', icon: ArrowLeftRight, roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER'] },
      { href: '/console/audit', label: 'Audit log', icon: ShieldCheck, roles: ['BRAND_ADMIN', 'COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'] },
    ],
  },
  {
    group: 'Workspace',
    items: [
      { href: '/console/team', label: 'Team', icon: Users, roles: ['BRAND_ADMIN'] },
      { href: '/console/settings', label: 'Settings', icon: Settings, roles: ['BRAND_ADMIN'] },
      { href: '/console/security', label: 'Security', icon: KeyRound, roles: ['BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER'] },
      { href: '/console/developers', label: 'Developers', icon: Terminal, roles: ['BRAND_ADMIN'] },
    ],
  },
];

/**
 * The palette is generated from NAV rather than hand-listed, so adding a screen
 * to the sidebar adds it to ⌘K automatically. A second registry would drift.
 */
function commandsFor(role: Role): Command[] {
  return NAV.flatMap((group) =>
    group.items
      .filter((item) => item.roles.includes(role))
      .map((item) => ({
        id: item.href,
        label: item.label,
        group: group.group,
        href: item.href,
        keywords: `${group.group} ${item.href}`,
      })),
  );
}

export function ConsoleShell({
  session,
  notifications,
  onMarkAllRead,
  children,
}: {
  session: Session;
  notifications: NotificationItem[];
  onMarkAllRead: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh bg-canvas">
      <nav
        aria-label="Main"
        className="rail-panel sticky top-0 hidden h-dvh w-60 shrink-0 flex-col text-rail-ink md:flex"
      >
        <div className="animate-in-fade flex h-14 items-center justify-between gap-2 pr-3 pl-5">
          <Link href="/console" className="-ml-0.5 rounded-md">
            <Logo tone="inherit" />
          </Link>
          <NotificationBell items={notifications} onMarkAllRead={onMarkAllRead} />
        </div>

        <div className="animate-in-fade px-3 pb-3">
          <CommandPalette commands={commandsFor(session.role)} />
        </div>

        <MotionConfig reducedMotion="user">
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {NAV.map((group, groupIndex) => {
              const items = group.items.filter((item) => item.roles.includes(session.role));
              if (items.length === 0) return null;
              return (
                <div
                  key={group.group}
                  className={`animate-in-up stagger-${Math.min(groupIndex + 1, 6)} mb-5`}
                >
                  <p className="eyebrow mb-1.5 px-2 text-rail-ink-subtle">{group.group}</p>
                  <ul className="flex flex-col gap-0.5">
                    {items.map((item) => {
                      const active =
                        item.href === '/console'
                          ? pathname === '/console'
                          : pathname.startsWith(item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'relative flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors',
                              active
                                ? 'font-medium text-rail-ink'
                                : 'text-rail-ink-muted hover:bg-rail-raised/60 hover:text-rail-ink',
                            )}
                          >
                            {active ? (
                              /* One pill for the whole rail: `layoutId` makes it
                                 travel from the old row to the new one, which is
                                 what tells the user "you moved", not "this page
                                 happens to be marked". */
                              <motion.span
                                layoutId="rail-active-pill"
                                transition={{ type: 'spring', stiffness: 520, damping: 42 }}
                                className="absolute inset-0 rounded-sm bg-rail-raised"
                                aria-hidden
                              >
                                <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-madder-400" />
                              </motion.span>
                            ) : null}
                            <item.icon className="rail-item-icon relative size-4 shrink-0" aria-hidden />
                            <span className="relative">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </MotionConfig>

        <div className="animate-in-fade stagger-5 border-t border-rail-line/60 p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <Avatar name={session.name} size="sm" tone="rail" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-rail-ink">{session.name}</span>
              <span className="block truncate text-2xs text-rail-ink-subtle">
                {ROLE_LABELS[session.role]}
              </span>
            </span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="mt-1 flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-rail-ink-muted transition-colors hover:bg-rail-raised/60 hover:text-rail-ink"
            >
              <LogOut className="rail-item-icon size-4 shrink-0" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {/* The light half of the split. Explicit rather than inherited, so the
          content surface is stated next to the rail it contrasts with. */}
      <div className="min-w-0 flex-1 bg-canvas">{children}</div>
    </div>
  );
}

