import type { AccessTier } from '@/lib/tier/types';

/**
 * What can happen to a garment after it leaves the brand.
 *
 * The list mirrors `lifecycleEventEnum` in the schema, in the order a garment
 * would actually pass through it. That order is not decoration: the partner
 * portal and the public timeline both render events chronologically, and a
 * sorter reading "collected → sorted → recycled" understands the item's fate
 * without being told what the vocabulary means.
 */
export const LIFECYCLE_EVENTS = [
  'manufactured',
  'placed_on_market',
  'sold',
  'registered_by_owner',
  'repaired',
  'refurbished',
  'altered',
  'resold',
  'rented',
  'returned',
  'donated',
  'collected',
  'sorted',
  'recycled',
  'incinerated',
  'landfilled',
  'lost',
] as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENTS)[number];

/** Who is entitled to write a given event. */
export type EventAuthor = 'brand' | 'repairer' | 'recycler' | 'owner';

export interface LifecycleEventMeta {
  label: string;
  /** What recording this asserts. Written for whoever is about to record it. */
  description: string;
  authors: readonly EventAuthor[];
  /** Default minimum tier needed to see the event on the public passport. */
  visibility: AccessTier;
  /**
   * True when the event ends the item's life. Nothing may be appended after
   * one of these: a garment that has been shredded into fibre cannot then be
   * repaired, and a passport that accepts such a claim is worthless as
   * evidence.
   */
  terminal: boolean;
}

export const LIFECYCLE_EVENT_META: Record<LifecycleEventType, LifecycleEventMeta> = {
  manufactured: {
    label: 'Manufactured',
    description: 'The item was made.',
    authors: ['brand'],
    visibility: 'public',
    terminal: false,
  },
  placed_on_market: {
    label: 'Placed on market',
    description: 'The item was first made available in the Union.',
    authors: ['brand'],
    visibility: 'public',
    terminal: false,
  },
  sold: {
    label: 'Sold',
    description: 'The item was sold to its first owner.',
    authors: ['brand'],
    visibility: 'public',
    terminal: false,
  },
  registered_by_owner: {
    label: 'Registered by owner',
    description: 'Someone claimed ownership of this item.',
    authors: ['owner', 'brand'],
    visibility: 'consumer',
    terminal: false,
  },
  repaired: {
    label: 'Repaired',
    description: 'A fault was fixed and the item went back into use.',
    authors: ['repairer', 'brand'],
    visibility: 'public',
    terminal: false,
  },
  refurbished: {
    label: 'Refurbished',
    description: 'The item was restored to a saleable condition.',
    authors: ['repairer', 'brand'],
    visibility: 'public',
    terminal: false,
  },
  altered: {
    label: 'Altered',
    description: 'The item was changed — taken in, shortened, re-dyed.',
    authors: ['repairer', 'owner', 'brand'],
    visibility: 'public',
    terminal: false,
  },
  resold: {
    label: 'Resold',
    description: 'The item changed owner on the second-hand market.',
    authors: ['owner', 'brand'],
    visibility: 'public',
    terminal: false,
  },
  rented: {
    label: 'Rented',
    description: 'The item went out on hire.',
    authors: ['brand', 'owner'],
    visibility: 'public',
    terminal: false,
  },
  returned: {
    label: 'Returned',
    description: 'The item came back to the brand or retailer.',
    authors: ['brand', 'owner'],
    visibility: 'retailer',
    terminal: false,
  },
  donated: {
    label: 'Donated',
    description: 'The item was given away rather than sold.',
    authors: ['owner', 'brand'],
    visibility: 'public',
    terminal: false,
  },
  collected: {
    label: 'Collected',
    description: 'A waste operator took the item into their stream.',
    authors: ['recycler', 'brand', 'owner'],
    visibility: 'public',
    terminal: false,
  },
  sorted: {
    label: 'Sorted',
    description: 'The item was graded and routed — reuse, recycling or disposal.',
    authors: ['recycler'],
    visibility: 'recycler',
    terminal: false,
  },
  recycled: {
    label: 'Recycled',
    description: 'The item was broken down and its fibres recovered. This closes the passport.',
    authors: ['recycler'],
    visibility: 'public',
    terminal: true,
  },
  incinerated: {
    label: 'Incinerated',
    description: 'The item was burnt. This closes the passport.',
    authors: ['recycler'],
    visibility: 'public',
    terminal: true,
  },
  landfilled: {
    label: 'Landfilled',
    description: 'The item went to landfill. This closes the passport.',
    authors: ['recycler'],
    visibility: 'public',
    terminal: true,
  },
  lost: {
    label: 'Lost',
    description: 'The item is gone and its fate is unknown. This closes the passport.',
    authors: ['owner', 'brand'],
    visibility: 'consumer',
    terminal: true,
  },
};

export function isLifecycleEvent(value: unknown): value is LifecycleEventType {
  return typeof value === 'string' && (LIFECYCLE_EVENTS as readonly string[]).includes(value);
}

export function lifecycleEventMeta(type: string): LifecycleEventMeta {
  return isLifecycleEvent(type)
    ? LIFECYCLE_EVENT_META[type]
    : {
        label: type,
        description: '',
        authors: ['brand'],
        visibility: 'authority',
        terminal: false,
      };
}

/** Events a given kind of author may record, in vocabulary order. */
export function eventsFor(author: EventAuthor): LifecycleEventType[] {
  return LIFECYCLE_EVENTS.filter((type) => LIFECYCLE_EVENT_META[type].authors.includes(author));
}

/** Events that end the item's life, for the "is this passport closed?" check. */
export const TERMINAL_EVENTS: readonly LifecycleEventType[] = LIFECYCLE_EVENTS.filter(
  (type) => LIFECYCLE_EVENT_META[type].terminal,
);
