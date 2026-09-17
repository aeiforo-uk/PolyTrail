import 'server-only';
import { badRequest, forbidden, notFound } from '@/lib/api/errors';
import type { Session } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { importJobs } from '@/lib/db/schema';
import { inferMapping, toMapping } from '@/lib/import/infer';
import { decryptSecret } from './crypto';
import { RestConnector } from './rest';
import { StubConnector } from './stubs';
import { getConnector, recordTestOutcome } from './store';
import {
  NotImplementedConnectorError,
  type Connector,
  type ConnectorRecord,
  type PullResult,
  type RestSettings,
  type TestResult,
} from './types';

/**
 * Running a connector.
 *
 * A pull ends in an `import_jobs` row in `mapping` status — the same row an
 * uploaded file produces. From that point the API path and the file path are
 * the same screens, the same validation and the same audit trail, which is the
 * property that makes a second connector cheap to add and a first one worth
 * trusting.
 */

export function connectorFor(record: ConnectorRecord): Connector {
  if (record.kind === 'rest') {
    const secret = record.secret ? decryptSecret(record.secret) : null;
    return new RestConnector(record.name, record.settings as Partial<RestSettings>, secret);
  }
  return new StubConnector(record.kind, record.name);
}

export async function testConnector(session: Session, id: string): Promise<TestResult> {
  const tenantId = requireTenant(session);
  const record = await getConnector(tenantId, id);
  if (!record) throw notFound('That connector does not exist.');

  const result = await connectorFor(record).test();
  await recordTestOutcome(tenantId, id, result.ok);
  return result;
}

export interface PullOutcome {
  jobId: string;
  rows: number;
  headers: string[];
  pages: number;
  truncated: boolean;
}

/**
 * Pull records and park them as an import job.
 *
 * Nothing is written to a passport here. The operator still maps the columns
 * and still sees the review step, because a pull from an API is no more
 * trustworthy than a spreadsheet — it is just less typing.
 */
export async function pullIntoJob(
  session: Session,
  id: string,
  options: { limit?: number } = {},
): Promise<PullOutcome> {
  const tenantId = requireTenant(session);
  const record = await getConnector(tenantId, id);
  if (!record) throw notFound('That connector does not exist.');

  let pull: PullResult;
  try {
    pull = await connectorFor(record).pull({ limit: options.limit });
  } catch (error) {
    if (error instanceof NotImplementedConnectorError) throw badRequest(error.message);
    throw error;
  }

  if (pull.rows.length === 0) {
    throw badRequest('The connector answered, but it returned no records to import.');
  }

  const mapping = toMapping(inferMapping(pull.headers));

  const [job] = await db
    .insert(importJobs)
    .values({
      tenantId,
      filename: `${record.name} — ${new Date().toISOString().slice(0, 10)}`,
      source: 'api',
      status: 'mapping',
      mapping,
      rows: pull.rows,
      totalRows: pull.rows.length,
      createdBy: session.userId,
    })
    .returning({ id: importJobs.id });

  return {
    jobId: job!.id,
    rows: pull.rows.length,
    headers: pull.headers,
    pages: pull.pages,
    truncated: pull.truncated,
  };
}

function requireTenant(session: Session): string {
  if (!session.tenantId) throw forbidden('Your account is not attached to a workspace.');
  return session.tenantId;
}
