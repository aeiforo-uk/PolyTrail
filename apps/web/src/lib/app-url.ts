/**
 * Where this deployment lives.
 *
 * Seven modules previously wrote `process.env.NEXT_PUBLIC_APP_URL ?? 'http://
 * localhost:3000'` by hand, and all seven carried the same defect: `??` falls
 * back on `null` and `undefined` but **not on an empty string**. A platform
 * that defines the variable and leaves it blank — which is what an unfilled
 * field in a hosting dashboard produces — therefore sailed straight past every
 * fallback with `''`.
 *
 * In the root layout that surfaced loudly, as `new URL('')` throwing
 * `ERR_INVALID_URL` and failing the production build while collecting
 * `/_not-found`. Everywhere else it failed silently and worse: an invitation,
 * an ownership transfer and a supplier magic link are all built by
 * concatenating a path onto this base, so a blank base yields `/invite/<token>`
 * — a relative path, posted into an email, where it resolves against nothing
 * and the recipient can never accept.
 *
 * So the rule is one function, and it treats blank as absent.
 */

/** Trim, drop trailing slashes, and reject anything that is not a real URL. */
function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    // Round-tripping through URL rejects the near-misses a hand-typed
    // dashboard field produces — a bare word, a path, a stray quote.
    new URL(candidate);
  } catch {
    return null;
  }
  return candidate.replace(/\/+$/, '');
}

/**
 * The canonical origin, without a trailing slash.
 *
 * Order matters. An explicitly configured value always wins, because it is the
 * only one that can name a custom domain. Failing that, Vercel's own
 * production domain is preferred over the per-deployment URL: a passport link
 * printed on a garment label has to keep resolving after the next deploy, and
 * `VERCEL_URL` changes every time. The per-deployment URL is still better than
 * nothing on a preview build, and localhost is the development default.
 */
export function appUrl(): string {
  return (
    clean(process.env.NEXT_PUBLIC_APP_URL) ??
    clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    clean(process.env.VERCEL_URL) ??
    'http://localhost:3000'
  );
}

/**
 * Only the explicitly configured origin, or null.
 *
 * For callers that have a better default than localhost — an OpenAPI document
 * should describe the server that actually served it, not a guess.
 */
export function configuredAppUrl(): string | null {
  return clean(process.env.NEXT_PUBLIC_APP_URL);
}

/** `appUrl()` with a path appended. The path's leading slash is optional. */
export function appUrlFor(path: string): string {
  return `${appUrl()}/${path.replace(/^\/+/, '')}`;
}
