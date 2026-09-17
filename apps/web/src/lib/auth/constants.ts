/**
 * Values shared between the edge runtime and the server.
 *
 * Kept apart from `session.ts` because that module is `server-only` and pulls
 * in `next/headers` and `jose`, neither of which middleware can import. A
 * constant does not need either.
 */
export const SESSION_COOKIE_NAME = 'polytrail_session';

/** Eight hours — a working day, then re-authenticate. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
