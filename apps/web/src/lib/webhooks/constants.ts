/**
 * Header names and the replay window.
 *
 * Kept apart from `signature.ts` because that module pulls in `node:crypto`,
 * and the console needs to print these header names in a client component. A
 * constant that both the signer and the documentation read is the only way the
 * two stay the same.
 */
export const SIGNATURE_HEADER = 'Polytrail-Signature';
export const EVENT_HEADER = 'Polytrail-Event';
export const DELIVERY_HEADER = 'Polytrail-Delivery';

/** How far a receiver should let a delivery's timestamp drift, in seconds. */
export const DEFAULT_TOLERANCE_SECONDS = 300;
