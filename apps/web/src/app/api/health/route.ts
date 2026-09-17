import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness in one endpoint.
 *
 * Returns 200 only when the database actually answers a query — a health check
 * that reports healthy because the process is running is how a deployment
 * passes its own checks while serving 500s to everyone else.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  try {
    await db.execute(sql`select 1`);
    checks.database = { ok: true, ms: Date.now() - started };
  } catch (error) {
    checks.database = { ok: false, error: (error as Error).message };
  }

  const ok = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      checks,
      uptimeSeconds: Math.round(process.uptime()),
    },
    {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
