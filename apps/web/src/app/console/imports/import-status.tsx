import { Badge } from '@/components/ui/badge';

/**
 * An import job's state, as a word and a colour.
 *
 * The enum values read like database columns — `mapping`, `ready` — and the
 * operator has not read the schema. "Needs mapping" says what to do next,
 * which is the only thing a status on a list is for.
 */
const TONES = {
  uploaded: { tone: 'neutral', label: 'Uploaded' },
  mapping: { tone: 'caution', label: 'Needs mapping' },
  validating: { tone: 'caution', label: 'Checking' },
  ready: { tone: 'accent', label: 'Ready to import' },
  importing: { tone: 'accent', label: 'Importing' },
  completed: { tone: 'positive', label: 'Completed' },
  failed: { tone: 'critical', label: 'Failed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
} as const;

export function ImportStatus({ status }: { status: string }) {
  const config = TONES[status as keyof typeof TONES] ?? {
    tone: 'neutral' as const,
    label: status,
  };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}
