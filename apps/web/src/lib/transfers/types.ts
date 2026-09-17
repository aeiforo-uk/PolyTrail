import type { AccessTier } from '@/lib/tier/types';
import type { LifecycleEventType } from '@/lib/lifecycle/vocab';

/**
 * The vocabulary of an ownership transfer, in one place.
 *
 * This module is deliberately pure and free of `server-only`: the acceptance
 * page, the console list and the server actions all have to agree about what a
 * reason means and what a status permits, and the cheapest way to guarantee
 * that is to give them one definition rather than three that drift.
 */

export const TRANSFER_REASONS = [
  'resale',
  'gift',
  'warranty_claim',
  'repair_exchange',
  'take_back',
  'recycling',
  'brand_acquisition',
  'licensing',
  'other',
] as const;

export type TransferReason = (typeof TRANSFER_REASONS)[number];

export const TRANSFER_STATUSES = [
  'initiated',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export interface TransferReasonMeta {
  label: string;
  /** One line, written for the recipient: what they are being handed. */
  summary: string;
  /** What the new owner may read once they accept. Shown before they decide. */
  grants: string;
  /**
   * The tier the new owner reads the passport at. A recycler taking a garment
   * back for fibre recovery needs separation detail that a private buyer has
   * no claim to, so the reason — not the role — decides the projection.
   */
  tier: AccessTier;
  /**
   * The post-market event written when the transfer completes. `null` where the
   * transfer is commercial rather than physical: a licensing deal does not move
   * a garment, so inventing an event for it would pollute the item's history.
   */
  event: LifecycleEventType | null;
  /**
   * True when the recipient becomes the brand of record and manages the
   * passport in the console rather than reading a projection of it.
   */
  becomesBrandOfRecord: boolean;
}

export const TRANSFER_REASON_META: Record<TransferReason, TransferReasonMeta> = {
  resale: {
    label: 'Resale',
    summary: 'The item has been sold on to a new owner.',
    grants: 'Reads the passport as a verified owner: care, repair and provenance.',
    tier: 'consumer',
    event: 'resold',
    becomesBrandOfRecord: false,
  },
  gift: {
    label: 'Gift',
    summary: 'The item is being handed over without a sale.',
    grants: 'Reads the passport as a verified owner: care, repair and provenance.',
    tier: 'consumer',
    event: 'donated',
    becomesBrandOfRecord: false,
  },
  warranty_claim: {
    label: 'Warranty claim',
    summary: 'The item is going back to the brand or retailer under warranty.',
    grants: 'Reads trade detail: durability testing, construction and spare parts.',
    tier: 'retailer',
    event: 'returned',
    becomesBrandOfRecord: false,
  },
  repair_exchange: {
    label: 'Repair exchange',
    summary: 'The item is passing to a repair partner.',
    grants: 'Reads repair detail: construction, spare-part references and disassembly steps.',
    tier: 'repairer',
    event: 'returned',
    becomesBrandOfRecord: false,
  },
  take_back: {
    label: 'Take-back',
    summary: 'The item is being returned to the brand under a take-back scheme.',
    grants: 'Reads trade detail: condition history, construction and resale authorisation.',
    tier: 'retailer',
    event: 'returned',
    becomesBrandOfRecord: false,
  },
  recycling: {
    label: 'Recycling',
    summary: 'The item is going to a sorter or fibre-recovery operator.',
    grants: 'Reads end-of-life detail: fibre separation, recycling disruptors and disassembly time.',
    tier: 'recycler',
    event: 'collected',
    becomesBrandOfRecord: false,
  },
  brand_acquisition: {
    label: 'Brand acquisition',
    summary: 'The brand — and everything it has published — is changing hands.',
    grants: 'Becomes the brand of record. Full control of the passport in the console.',
    tier: 'retailer',
    event: null,
    becomesBrandOfRecord: true,
  },
  licensing: {
    label: 'Licensing',
    summary: 'Another operator is taking over responsibility for placing this item on the market.',
    grants: 'Becomes the brand of record. Full control of the passport in the console.',
    tier: 'retailer',
    event: null,
    becomesBrandOfRecord: true,
  },
  other: {
    label: 'Other',
    summary: 'The item is changing hands for a reason outside the usual list.',
    grants: 'Reads the passport as a verified owner: care, repair and provenance.',
    tier: 'consumer',
    event: null,
    becomesBrandOfRecord: false,
  },
};

/** Ordered for a picker: what brands actually do, most common first. */
export const TRANSFER_REASON_ORDER: readonly TransferReason[] = [
  'resale',
  'take_back',
  'recycling',
  'repair_exchange',
  'warranty_claim',
  'gift',
  'brand_acquisition',
  'licensing',
  'other',
];

export interface TransferStatusMeta {
  label: string;
  /** Colour token pair used by the badge. Always paired with an icon and a word. */
  tone: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical';
  description: string;
}

export const TRANSFER_STATUS_META: Record<TransferStatus, TransferStatusMeta> = {
  initiated: {
    label: 'Awaiting the recipient',
    tone: 'caution',
    description: 'Sent. Ownership has not moved yet.',
  },
  accepted: {
    label: 'Accepted',
    tone: 'positive',
    description: 'Both sides signed. Ownership has moved.',
  },
  rejected: {
    label: 'Rejected',
    tone: 'critical',
    description: 'The recipient declined. Ownership did not move.',
  },
  cancelled: {
    label: 'Cancelled',
    tone: 'neutral',
    description: 'Withdrawn by the sender before the recipient decided.',
  },
  expired: {
    label: 'Expired',
    tone: 'neutral',
    description: 'The acceptance link ran out. Send a new one if it is still wanted.',
  },
};

export function isTransferReason(value: unknown): value is TransferReason {
  return typeof value === 'string' && (TRANSFER_REASONS as readonly string[]).includes(value);
}

export function isTransferStatus(value: unknown): value is TransferStatus {
  return typeof value === 'string' && (TRANSFER_STATUSES as readonly string[]).includes(value);
}

/** The meta for a reason, tolerating an unknown value from the database. */
export function transferReasonMeta(reason: string): TransferReasonMeta {
  return isTransferReason(reason) ? TRANSFER_REASON_META[reason] : TRANSFER_REASON_META.other;
}

export function transferStatusMeta(status: string): TransferStatusMeta {
  return isTransferStatus(status) ? TRANSFER_STATUS_META[status] : TRANSFER_STATUS_META.initiated;
}

/** A transfer as the console renders it. No token, no token hash, ever. */
export interface TransferSummary {
  id: string;
  dppId: string;
  productName: string | null;
  reason: TransferReason;
  status: TransferStatus;
  note: string | null;
  fromTenantId: string;
  fromTenantName: string;
  toTenantId: string | null;
  toTenantName: string | null;
  toEmail: string | null;
  initiatedAt: string;
  initiatedByName: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  completedByName: string | null;
  rejectionReason: string | null;
  /** True when this workspace sent it, false when it received it. */
  outgoing: boolean;
}

export interface TransferDetail extends TransferSummary {
  transferCredential: Record<string, unknown> | null;
  acceptanceCredential: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}
