'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Lookup.
 *
 * The query goes into the URL rather than into component state so that an
 * inspector can bookmark a search, paste it into a case file, or hand it to a
 * colleague — and so the page behind it stays a server component.
 *
 * Four things go in this one box, because an inspector holding a garment does
 * not know which of them the label still has: the passport identifier, the
 * barcode, the brand's name, or the supplier's own SKU. The form works out
 * which it got and the results say so.
 */
const EXAMPLES: Array<{ label: string; value: string; note: string }> = [
  { label: 'Identifier', value: 'XK4T-9PMB-2QW7-5RHC', note: 'from the care label' },
  { label: 'GTIN', value: '08712345678906', note: 'the swing-ticket barcode' },
  { label: 'Brand', value: 'Meridian', note: 'legal or trading name' },
];

export function SearchForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [pending, start] = useTransition();

  const go = (value: string) => start(() => router.push(`/authority?q=${encodeURIComponent(value)}`));

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          go(query.trim());
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <label htmlFor="authority-query" className="sr-only">
          Find a passport
        </label>
        <div className="relative min-w-72 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            id="authority-query"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Identifier, GTIN, brand or SKU"
            autoComplete="off"
            required
            className="h-11 pl-10 text-base"
          />
        </div>
        <Button type="submit" size="lg" loading={pending} className="h-11">
          Search
        </Button>
      </form>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {EXAMPLES.map((example) => (
          <li key={example.label} className="flex items-baseline gap-1.5 text-2xs">
            <span className="text-ink-subtle">{example.label}</span>
            <button
              type="button"
              onClick={() => {
                setQuery(example.value);
                go(example.value);
              }}
              className="mono text-accent transition-colors duration-[140ms] hover:underline motion-reduce:transition-none"
            >
              {example.value}
            </button>
            <span className="text-ink-subtle">{example.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
