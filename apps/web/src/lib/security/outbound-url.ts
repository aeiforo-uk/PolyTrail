import { badRequest } from '@/lib/api/errors';

/**
 * Screening for URLs this server will fetch on a customer's instruction.
 *
 * Webhook endpoints and connector base URLs are both "a URL a tenant typed
 * that we then request from inside our own network", which is the textbook
 * server-side request forgery primitive. The interesting target is almost never
 * a website — it is `169.254.169.254`, where every cloud provider serves
 * instance credentials to anything that asks.
 *
 * This lived in two copies, one per caller. A security control with two
 * implementations has one that is out of date, so it lives here now.
 *
 * Known limit: this checks the host as written. A hostname that resolves to a
 * private address (DNS rebinding) still passes. Closing that needs resolution
 * at request time with the socket pinned to the resolved address, which the
 * platform's fetch does not expose — so it is a documented gap rather than a
 * pretended defence.
 */

export interface OutboundUrlOptions {
  /** Shown when the scheme is rejected, so the message fits the caller. */
  httpsMessage?: string;
  /** Permit http:// and private hosts. Only ever true outside production. */
  allowInsecure?: boolean;
}

export function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal')) {
    return true;
  }
  if (lower === '[::1]' || lower === '::1') return true;
  // Unique-local and link-local IPv6.
  if (lower.startsWith('[fc') || lower.startsWith('[fd') || lower.startsWith('[fe80')) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Carrier-grade NAT.
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Link-local, which is where cloud metadata services live.
  if (a === 169 && b === 254) return true;
  return false;
}

/** Validate and normalise a URL this server will call. Throws `ApiError` on refusal. */
export function assertOutboundUrl(raw: string, options: OutboundUrlOptions = {}): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest('That is not a valid URL.');
  }

  const allowInsecure = options.allowInsecure ?? process.env.NODE_ENV !== 'production';

  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:')) {
    throw badRequest(
      options.httpsMessage ??
        'This must be an HTTPS address. Plain HTTP is readable by anything between us and you.',
    );
  }

  if (url.username || url.password) {
    throw badRequest(
      'Do not put credentials in the URL. They end up in logs and referrer headers; use the credential field instead.',
    );
  }

  if (!allowInsecure && isPrivateHost(url.hostname)) {
    throw badRequest('That host is not reachable from the public internet.');
  }

  return url.toString();
}
