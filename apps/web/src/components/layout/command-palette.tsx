'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Command {
  id: string;
  label: string;
  /** Group heading. The first group is whatever is contextual to this page. */
  group: string;
  href?: string;
  hint?: string;
  /** Extra words that should match but need not be shown. */
  keywords?: string;
}

/**
 * ⌘K.
 *
 * Two things make this worth building rather than shipping a link list. First,
 * the top group is contextual: on a passport it opens with the actions for that
 * passport, so the palette is a shortcut to the current record and not just to
 * the sitemap. Second, it is the only navigation that scales — this console has
 * more than forty screens and a sidebar cannot hold them without becoming a
 * menu nobody reads.
 */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const router = useRouter();

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands
      .map((command) => ({ command, score: score(command, needle) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.command);
  }, [commands, query]);

  React.useEffect(() => setActive(0), [query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const command of results) {
      map.set(command.group, [...(map.get(command.group) ?? []), command]);
    }
    return [...map.entries()];
  }, [results]);

  function run(command: Command) {
    setOpen(false);
    setQuery('');
    if (command.href) router.push(command.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[active];
      if (command) run(command);
    }
  }

  let index = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          // Sits in the dark rail, so it takes rail tokens. The dialog it
          // opens is content, not chrome, and stays on the normal surface.
          'flex w-full items-center gap-2 rounded-sm border border-rail-line bg-rail-raised/50 px-2 py-1.5',
          'text-xs text-rail-ink-subtle transition-colors duration-[--duration-fast]',
          'hover:border-rail-line hover:bg-rail-raised hover:text-rail-ink-muted',
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="mono rounded-xs border border-rail-line px-1 text-2xs text-rail-ink-subtle">
          ⌘K
        </kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          {/*
            The backdrop fades; the palette does not animate at all.

            This is invoked with a keystroke, dozens of times a day, by someone
            who already knows what they are going to type. A 150ms zoom-in is
            150ms of waiting before the input is usable, every single time —
            and it is the clearest signal a tool was designed by someone who
            does not use it daily. The dialog was animating; now it is simply
            there on the frame after ⌘K.
          */}
          <Dialog.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-overlay',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0',
              'duration-[--duration-fast]',
            )}
          />
          <Dialog.Content
            onKeyDown={onKeyDown}
            className={cn(
              'fixed top-[18vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2',
              'overflow-hidden rounded-lg border border-line bg-surface shadow-lg',
            )}
          >
            <VisuallyHidden>
              <Dialog.Title>Search and commands</Dialog.Title>
            </VisuallyHidden>

            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to a screen, or type what you want to do"
                aria-label="Search commands"
                className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
              />
            </div>

            <div className="max-h-[52vh] overflow-y-auto py-2">
              {results.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-subtle">
                  Nothing matches “{query}”.
                </p>
              ) : (
                grouped.map(([group, items]) => (
                  <div key={group} className="mb-1">
                    <p className="eyebrow px-4 py-1.5">{group}</p>
                    {items.map((command) => {
                      index += 1;
                      const selected = index === active;
                      return (
                        <button
                          key={command.id}
                          type="button"
                          onMouseEnter={() => setActive(results.indexOf(command))}
                          onClick={() => run(command)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                            selected ? 'bg-surface-sunken text-ink' : 'text-ink-muted',
                          )}
                        >
                          <ArrowRight
                            className={cn(
                              'size-3.5 shrink-0',
                              selected ? 'text-accent' : 'text-ink-subtle',
                            )}
                            aria-hidden
                          />
                          <span className="flex-1 truncate">{command.label}</span>
                          {command.hint ? (
                            <span className="shrink-0 text-xs text-ink-subtle">{command.hint}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-2xs text-ink-subtle">
              <span className="flex items-center gap-1">
                <kbd className="mono rounded-xs border border-line px-1">↑</kbd>
                <kbd className="mono rounded-xs border border-line px-1">↓</kbd>
                move
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="size-3" aria-hidden />
                open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="mono rounded-xs border border-line px-1">esc</kbd>
                close
              </span>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/**
 * Prefix and subsequence matching, weighted so a label match beats a keyword
 * match. Deliberately not fuzzy in the edit-distance sense — typo tolerance
 * makes a palette guess, and guessing wrong on a destructive command is worse
 * than returning nothing.
 */
function score(command: Command, needle: string): number {
  const label = command.label.toLowerCase();
  const keywords = (command.keywords ?? '').toLowerCase();

  if (label.startsWith(needle)) return 100;
  if (label.includes(needle)) return 70;
  if (keywords.includes(needle)) return 40;

  let i = 0;
  for (const ch of label) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return 20;
  }
  return 0;
}
