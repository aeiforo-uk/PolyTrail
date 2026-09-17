import type { PassportStatus } from '@/lib/passport/state';

/**
 * Status never takes a categorical hue.
 *
 * Categorical slots encode identity — "this series is cotton" — and carry no
 * judgement. Status encodes a judgement, and borrowing a categorical hue for it
 * produces exactly the bug this file exists to prevent: a suspended passport
 * rendered in slot 6 green, reading as healthy in a status chart.
 *
 * Six statuses against four reserved status colours, so several share a tone
 * and are told apart by their label. That is the right way round: a reader who
 * cannot distinguish two greys still reads the words, whereas a reader misled
 * by a green has no way to recover.
 */
export const STATUS_TONE: Record<PassportStatus, string> = {
  draft: 'var(--color-ink-subtle)',
  in_review: 'var(--color-caution)',
  changes_requested: 'var(--color-caution)',
  // Not the accent. The accent is madder, and an approved passport rendered in
  // red read as a failure on every chart and chip in the console — the reader
  // has to check the label to discover it is good news, which is exactly the
  // failure this file exists to prevent. Informational blue says "signed off,
  // not yet public", which is what approved means.
  approved: 'var(--color-info)',
  published: 'var(--color-positive)',
  suspended: 'var(--color-caution)',
  recalled: 'var(--color-critical)',
  withdrawn: 'var(--color-ink-subtle)',
  archived: 'var(--color-line-strong)',
};

export function statusTone(status: string): string {
  return STATUS_TONE[status as PassportStatus] ?? 'var(--color-ink-subtle)';
}

/**
 * Order for a distribution chart: the pipeline as it actually flows, so the bar
 * reads left to right as work moving toward publication rather than as an
 * alphabetical accident.
 */
export const STATUS_ORDER: PassportStatus[] = [
  'draft',
  'changes_requested',
  'in_review',
  'approved',
  'published',
  'suspended',
  'recalled',
  'withdrawn',
  'archived',
];
