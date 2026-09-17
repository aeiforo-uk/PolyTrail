import {
  Ban,
  CheckCircle2,
  Clock,
  Eye,
  FileEdit,
  Inbox,
  PenLine,
  Send,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Request status as colour, icon and word together.
 *
 * Never colour alone: a compliance export gets printed in black and white more
 * often than anyone expects, and roughly one reviewer in twelve cannot tell
 * the caution amber from the positive green.
 */
const STATUSES: Record<
  string,
  { tone: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical'; label: string; icon: LucideIcon }
> = {
  draft: { tone: 'neutral', label: 'Draft', icon: FileEdit },
  sent: { tone: 'accent', label: 'Sent', icon: Send },
  in_progress: { tone: 'caution', label: 'Being answered', icon: PenLine },
  submitted: { tone: 'accent', label: 'Submitted', icon: Inbox },
  under_review: { tone: 'caution', label: 'Under review', icon: Eye },
  approved: { tone: 'positive', label: 'Approved', icon: CheckCircle2 },
  rejected: { tone: 'critical', label: 'Sent back', icon: XCircle },
  expired: { tone: 'neutral', label: 'Expired', icon: Clock },
  cancelled: { tone: 'neutral', label: 'Cancelled', icon: Ban },
};

export function RequestStatusBadge({ status }: { status: string }) {
  const config = STATUSES[status] ?? { tone: 'neutral' as const, label: status, icon: FileEdit };
  const Icon = config.icon;
  return (
    <Badge tone={config.tone}>
      <Icon aria-hidden />
      {config.label}
    </Badge>
  );
}

export function requestStatusLabel(status: string): string {
  return STATUSES[status]?.label ?? status;
}
