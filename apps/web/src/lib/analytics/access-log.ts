import 'server-only';
import { after } from 'next/server';
import { db } from '@/lib/db/client';
import { accessLogs } from '@/lib/db/schema';
import type { AccessTier } from '@/lib/tier/types';

/**
 * Record a read of a public passport.
 *
 * Brands need scan analytics — and today that data belongs to the DPP vendor,
 * not to the brand, in every product examined. So it is stored here, in the
 * brand's own tenant data, and exportable.
 *
 * Deliberately stores nothing that identifies a person: no IP, no user agent
 * string, no cookie. A coarse country and device class is enough to answer
 * "how often is this scanned and roughly where", and storing more would turn
 * the analytics table into a GDPR liability attached to a public URL that
 * anyone can hit.
 */

export type Channel = 'qr' | 'nfc' | 'link' | 'api' | 'search';

export interface AccessLogInput {
  passportId: string;
  tier: AccessTier;
  channel: Channel;
  countryCode?: string | null;
  deviceClass?: string | null;
  locale?: string | null;
  referrerHost?: string | null;
}

export function logAccess(input: AccessLogInput): void {
  // `after` defers to once the response has been sent, so analytics never
  // delays a passport that someone is standing in a shop waiting for.
  after(async () => {
    try {
      await db.insert(accessLogs).values({
        passportId: input.passportId,
        tier: input.tier,
        channel: input.channel,
        countryCode: input.countryCode?.slice(0, 2).toUpperCase() ?? null,
        deviceClass: input.deviceClass ?? null,
        locale: input.locale ?? null,
        referrerHost: input.referrerHost ?? null,
      });
    } catch (error) {
      console.error('[access-log] insert failed', error);
    }
  });
}

/** Read the request context an access log needs, without retaining anything personal. */
export function readAccessContext(headers: Headers): Omit<AccessLogInput, 'passportId' | 'tier'> {
  const userAgent = headers.get('user-agent') ?? '';
  const referrer = headers.get('referer');

  let referrerHost: string | null = null;
  if (referrer) {
    try {
      referrerHost = new URL(referrer).host;
    } catch {
      referrerHost = null;
    }
  }

  return {
    channel: channelFrom(headers, referrerHost),
    // Populated by the CDN or load balancer. Absent in development.
    countryCode:
      headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry') ?? null,
    deviceClass: deviceClassFrom(userAgent),
    locale: headers.get('accept-language')?.split(',')[0]?.slice(0, 10) ?? null,
    referrerHost,
  };
}

function channelFrom(headers: Headers, referrerHost: string | null): Channel {
  const accept = headers.get('accept') ?? '';
  if (accept.includes('application/json') || accept.includes('application/ld+json')) return 'api';
  // A scan arrives with no referrer; a click from the brand's own site has one.
  if (!referrerHost) return 'qr';
  if (/google|bing|duckduckgo|ecosia/i.test(referrerHost)) return 'search';
  return 'link';
}

function deviceClassFrom(userAgent: string): string {
  if (!userAgent) return 'unknown';
  if (/bot|crawler|spider|curl|wget|headless/i.test(userAgent)) return 'bot';
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}
