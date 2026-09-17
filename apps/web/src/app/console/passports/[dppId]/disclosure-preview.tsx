'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StackedBar } from '@/components/viz/bar-chart';
import { FIELD_REGISTRY } from '@/lib/tier/field-registry';
import { expandWildcards } from '@/lib/tier/project';
import {
  ACCESS_TIERS,
  REGULATED_TIER_LABELS,
  TIER_DESCRIPTIONS,
  TIER_LABELS,
  regulatedTierOf,
  tierAllows,
  type AccessTier,
} from '@/lib/tier/types';
import type { PassportPayload } from '@/lib/passport/schema';
import { cn } from '@/lib/utils';

/**
 * "Who sees what."
 *
 * Every live textile passport tested during research publishes everything it
 * holds to anyone who scans it — one flagship EU pilot serves purchase-order
 * numbers and full factory addresses unauthenticated. Brands are leaking their
 * sourcing base without knowing it, and tiered access with commercial
 * confidentiality is the industry's loudest unmet request.
 *
 * So this is not a settings screen buried three levels down. It is one of the
 * four readings of a passport: pick an audience, see exactly what that audience
 * can read, field by field, before publishing.
 */
export function DisclosurePreview({ payload }: { payload: Partial<PassportPayload> }) {
  const [tier, setTier] = useState<AccessTier>('public');

  const rows = useMemo(() => {
    return FIELD_REGISTRY.flatMap((entry) => {
      // schemaVersion is plumbing, not passport content; showing it as its own
      // group puts a header reading "SCHEMAVERSION" above everything else.
      if (entry.path === 'schemaVersion') return [];
      const paths = expandWildcards(payload, entry.path);
      const present = paths.filter((path) => valueAt(payload, path) !== undefined);
      if (present.length === 0) return [];
      return [
        {
          entry,
          count: present.length,
          sample: valueAt(payload, present[0]!),
          visible: tierAllows(tier, entry.audiences),
        },
      ];
    });
  }, [payload, tier]);

  const visible = rows.filter((row) => row.visible).length;
  const withheld = rows.length - visible;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.entry.path.split('.')[0]!;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <section className="rounded-lg border border-line bg-surface">
      <Tabs value={tier} onValueChange={(next) => setTier(next as AccessTier)}>
        <header className="flex flex-col gap-4 px-5 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">Who sees what</h2>
              <p className="mt-1 max-w-prose text-sm text-ink-muted">
                {TIER_DESCRIPTIONS[tier]}
              </p>
            </div>

            <div className="w-full min-w-56 sm:w-64">
              <p className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-ink">
                  <span className="tabular-nums font-medium">{visible}</span> of{' '}
                  <span className="tabular-nums">{rows.length}</span> readable
                </span>
                <span className="text-ink-subtle tabular-nums">{withheld} withheld</span>
              </p>
              <StackedBar
                className="mt-1.5"
                height={6}
                ariaLabel={`${visible} fields readable, ${withheld} withheld`}
                segments={[
                  {
                    key: 'visible',
                    label: 'Readable',
                    value: visible,
                    colour: 'var(--color-positive)',
                  },
                  {
                    key: 'withheld',
                    label: 'Withheld',
                    value: withheld,
                    colour: 'var(--color-line-strong)',
                  },
                ]}
              />
            </div>
          </div>

          <TabsList className="-mx-5 px-5">
            {ACCESS_TIERS.map((candidate) => (
              <TabsTrigger key={candidate} value={candidate}>
                {TIER_LABELS[candidate]}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        {ACCESS_TIERS.map((candidate) => (
          <TabsContent key={candidate} value={candidate}>
            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">
                Nothing has been filled in yet, so there is nothing to disclose. Fill in a section
                and this becomes the exact list of what each audience will read.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {grouped.map(([group, groupRows]) => {
                  const shown = groupRows.filter((row) => row.visible).length;
                  return (
                    <div key={group} className="px-5 py-3.5">
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <p className="eyebrow">{GROUP_LABELS[group] ?? group}</p>
                        <p
                          className={cn(
                            'text-2xs tabular-nums',
                            shown === 0 ? 'text-ink-subtle' : 'text-ink-muted',
                          )}
                        >
                          {shown}/{groupRows.length} readable
                        </p>
                      </div>

                      <ul className="flex flex-col">
                        {groupRows.map((row) => (
                          <li
                            key={row.entry.path}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-line/50 py-1.5 last:border-0"
                          >
                            {row.visible ? (
                              <Eye
                                className="size-3.5 shrink-0 translate-y-0.5 text-positive"
                                aria-label="Readable"
                              />
                            ) : (
                              <EyeOff
                                className="size-3.5 shrink-0 translate-y-0.5 text-ink-subtle"
                                aria-label="Withheld"
                              />
                            )}

                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <span
                                className={cn(
                                  'truncate text-sm',
                                  row.visible
                                    ? 'text-ink'
                                    : 'text-ink-subtle line-through decoration-1',
                                )}
                              >
                                {row.entry.label}
                              </span>
                              {row.count > 1 ? (
                                <span className="text-2xs text-ink-subtle tabular-nums">
                                  ×{row.count}
                                </span>
                              ) : null}
                              <span
                                className="truncate text-2xs text-ink-subtle"
                                title={row.entry.basis}
                              >
                                {row.entry.basis}
                              </span>
                            </span>

                            <span className="flex shrink-0 items-baseline gap-3">
                              {row.visible ? (
                                <span
                                  className="max-w-44 truncate text-xs text-ink-muted"
                                  title={preview(row.sample)}
                                >
                                  {preview(row.sample)}
                                </span>
                              ) : null}
                              <span className="w-28 text-right text-2xs text-ink-subtle">
                                {REGULATED_TIER_LABELS[regulatedTierOf(row.entry)]}
                                {row.entry.espr ? ' · ESPR' : ''}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

const GROUP_LABELS: Record<string, string> = {
  identity: 'Identity',
  composition: 'Composition',
  substances: 'Substances',
  supplyChain: 'Supply chain',
  environment: 'Environment',
  durability: 'Durability',
  care: 'Care & repair',
  circularity: 'Circularity',
  social: 'Social',
  claims: 'Claims',
  certifications: 'Certifications',
  commercial: 'Commercial',
};

function valueAt(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

function preview(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.en === 'string') return record.en;
    return `${Object.keys(record).length} fields`;
  }
  return String(value);
}
