import { CircleCheck, CircleSlash, CircleX, Clock, Hourglass } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { transferStatusMeta, type TransferStatus } from '@/lib/transfers/types';

/**
 * Colour, icon and word — never colour alone. A transfer's state is the thing
 * a disputing party reads first, and it has to survive a greyscale printout.
 */
const ICONS = {
  initiated: Hourglass,
  accepted: CircleCheck,
  rejected: CircleX,
  cancelled: CircleSlash,
  expired: Clock,
} as const;

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const meta = transferStatusMeta(status);
  const Icon = ICONS[status] ?? Hourglass;
  return (
    <Badge tone={meta.tone}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}
