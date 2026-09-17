import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from '@/lib/crypto/canonical';
import { drainDueDeliveries } from '@/lib/webhooks/deliver';
import { clientKey, rateLimit } from '@/lib/security/rate-limit';

/**
 * The retry drain.
 *
 * A webhook that failed has to be retried by something that is still running
 * when the retry falls due, and on a serverless platform nothing is. So the
 * retry policy lives in the delivery table and this endpoint is what walks it —
 * invoked on a schedule (Vercel cron, a Kubernetes CronJob, `curl` from
 * anywhere) every few minutes.
 *
 * Without a schedule pointing at this route, a failed delivery is attempted
 * once and never again. That is worth saying plainly, because a retry policy
 * that only works when someone remembers to wire up the cron is a retry policy
 * that does not work.
 *
 *   Vercel — vercel.json:
 *     { "crons": [{ "path": "/api/webhooks/retry", "schedule": "*\/5 * * * *" }] }
 *
 * Authenticated by a shared secret rather than an API key, because the caller
 * is infrastructure with no workspace and no user to attribute anything to.
 */

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return handle(req);
}

/**
 * GET as well as POST: Vercel's scheduler issues GET, and refusing it would
 * mean the documented deployment path silently never runs. The operation is
 * not idempotent in the strict sense, but running it twice only means a due
 * delivery is attempted once — the second pass finds nothing due.
 */
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const expected = process.env.WEBHOOK_CRON_SECRET;
  if (!expected) {
    return problem(
      503,
      'Retry drain not configured',
      'WEBHOOK_CRON_SECRET is not set, so this endpoint refuses to run. Set it and point a scheduler at this path.',
    );
  }

  const presented = bearer(req);
  if (!presented || !timingSafeEqual(presented, expected)) {
    // Throttled per IP: this endpoint is a single fixed secret, which is
    // exactly the shape worth guessing at speed.
    rateLimit(clientKey(req, 'webhook-retry'), 10, 60_000);
    return problem(401, 'Unauthorized', 'The scheduler secret is missing or wrong.');
  }

  const result = await drainDueDeliveries();
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

function bearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return req.headers.get('x-cron-secret')?.trim() || null;
}

function problem(status: number, title: string, detail: string) {
  return NextResponse.json(
    { type: `https://polytrail.eu/problems/${status}`, title, status, detail },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
