import type { SectionAction } from '@/components/form/types';
import type { PassportPayload } from '@/lib/passport/schema';
import type { SectionConfig } from '../config';

/** What every section component is handed. Nothing here is section-specific. */
export interface SectionProps {
  section: SectionConfig;
  payload: Partial<PassportPayload>;
  action: SectionAction;
  readOnly: boolean;
  statusLabel: string;
  /** Publication-gate failures for the whole passport, keyed by payload path. */
  gateErrors: Record<string, string[]>;
}
