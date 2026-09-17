import { statusTone } from '@/components/viz/status-colour';
import { Badge } from './badge';

/**
 * Status is always colour *plus* a word. Colour alone fails for colour-blind
 * readers and is unusable in a printed compliance export, and a passport's
 * state is exactly the thing an auditor needs to read unambiguously.
 *
 * The colour is carried by a dot rather than by a tinted fill. When the badge
 * was a pale lozenge, a table of nine passports was nine coloured blocks and
 * the eye had nowhere to rest; a dot puts the same signal in four pixels, at
 * full saturation rather than washed out to a 95% tint, and leaves the chip
 * the same shape as every other small container on the page. The word never
 * goes away, so nothing here depends on seeing the hue.
 */
const TONES = {
  draft: { tone: 'neutral', label: 'Draft' },
  in_review: { tone: 'caution', label: 'In review' },
  changes_requested: { tone: 'caution', label: 'Changes requested' },
  // Informational, not accent: the accent is madder, so an approved passport
  // wore the same red as a recall and read as bad news at a glance.
  approved: { tone: 'info', label: 'Approved' },
  published: { tone: 'positive', label: 'Published' },
  suspended: { tone: 'caution', label: 'Suspended' },
  recalled: { tone: 'critical', label: 'Recalled' },
  withdrawn: { tone: 'neutral', label: 'Withdrawn' },
  archived: { tone: 'neutral', label: 'Archived' },
} as const;

export function StatusBadge({ status }: { status: string }) {
  const config = TONES[status as keyof typeof TONES] ?? { tone: 'neutral' as const, label: status };
  return (
    <Badge tone={config.tone}>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: statusTone(status) }}
      />
      {config.label}
    </Badge>
  );
}
