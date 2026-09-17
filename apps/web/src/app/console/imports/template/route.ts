import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { attachment } from '@/lib/export/csv';
import { templateCsv } from '@/lib/import/export';

/**
 * A starter file.
 *
 * Its headers are the labels the column guesser recognises exactly, so a brand
 * that fills this in maps every column on the first attempt and never sees the
 * picker. That is the point of a template: not to document the format, but to
 * remove a step.
 *
 * It carries the fields a passport cannot be published without, plus the few
 * every PIM already holds. A template with three hundred columns is a template
 * nobody fills in.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return new NextResponse('Sign in to continue.', { status: 401 });

  return new NextResponse(templateCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': attachment('polytrail-import-template.csv'),
      'Cache-Control': 'no-store',
    },
  });
}
