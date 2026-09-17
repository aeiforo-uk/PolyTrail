'use server';

import { getSession } from '@/lib/auth/session';
import { verifyAuditChain } from '@/lib/audit';
import { recordAuditSafe } from '@/lib/audit/record';
import { readForExport, readFullChain, type AuditFilters } from './queries';

const AUDIT_READERS = ['BRAND_ADMIN', 'COMPLIANCE_OFFICER', 'PLATFORM_ADMIN'];

async function requireAuditReader() {
  const session = await getSession();
  if (!session?.tenantId || !AUDIT_READERS.includes(session.role)) return null;
  return session;
}

export interface VerificationState {
  status: 'idle' | 'valid' | 'broken' | 'error';
  checked?: number;
  brokenAt?: number | null;
  reason?: string;
  /** When the check ran, so a screenshot of this panel means something. */
  at?: string;
}

/**
 * Re-derive every hash in the tenant's chain and report whether it holds.
 *
 * This is the only feature in the audit log that a spreadsheet could not
 * replace. It answers one narrow question — has any recorded event been
 * altered, deleted or reordered since it was written — and it answers it from
 * the data itself rather than from our assurance.
 */
export async function verifyChain(
  _prev: VerificationState,
  _formData: FormData,
): Promise<VerificationState> {
  const session = await requireAuditReader();
  if (!session?.tenantId) {
    return { status: 'error', reason: 'You do not have access to this workspace’s audit log.' };
  }

  try {
    const rows = await readFullChain(session.tenantId);
    const result = verifyAuditChain(rows);
    const at = new Date().toISOString();

    // Best-effort: a verification that fails to log is still a verification,
    // and failing the check because the log write failed would be perverse.
    await recordAuditSafe({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: 'export.generated',
      subjectType: 'audit_chain',
      subjectId: session.tenantId,
      metadata: { kind: 'verification', valid: result.valid, checked: result.checked },
    });

    return result.valid
      ? { status: 'valid', checked: result.checked, at }
      : {
          status: 'broken',
          checked: result.checked,
          brokenAt: result.brokenAt,
          reason: result.reason,
          at,
        };
  } catch (error) {
    console.error('[audit] verification failed', error);
    return { status: 'error', reason: 'The chain could not be read. Try again.' };
  }
}

export interface ExportState {
  error?: string;
  filename?: string;
  csv?: string;
}

/** Metadata may carry operational detail; never let a secret ride out in an export. */
const SENSITIVE_KEY = /token|secret|password|private/i;

function safeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return '';
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    cleaned[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : value;
  }
  return JSON.stringify(cleaned);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const COLUMNS = [
  'sequence',
  'recorded_at',
  'actor',
  'actor_id',
  'action',
  'subject_type',
  'subject_id',
  'ip',
  'user_agent',
  'previous_hash',
  'entry_hash',
  'metadata',
] as const;

/**
 * Export the filtered chain as CSV.
 *
 * Both hashes are in the export, in chain order, because an auditor who takes
 * the file away should be able to re-run `verifyAuditChain` against it without
 * coming back to us for anything.
 */
export async function exportAuditCsv(
  _prev: ExportState,
  formData: FormData,
): Promise<ExportState> {
  const session = await requireAuditReader();
  if (!session?.tenantId) {
    return { error: 'You do not have access to this workspace’s audit log.' };
  }

  const filters: AuditFilters = {
    action: String(formData.get('action') ?? '') || undefined,
    from: String(formData.get('from') ?? '') || undefined,
    to: String(formData.get('to') ?? '') || undefined,
  };

  try {
    const rows = await readForExport(session.tenantId, filters);

    const lines = [COLUMNS.join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.sequence,
          row.recordedAt,
          row.actorLabel,
          row.actorId,
          row.action,
          row.subjectType,
          row.subjectId,
          row.ip,
          row.userAgent,
          row.previousHash,
          row.entryHash,
          safeMetadata(row.metadata),
        ]
          .map(csvCell)
          .join(','),
      );
    }

    await recordAuditSafe({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: 'export.generated',
      subjectType: 'audit_chain',
      subjectId: session.tenantId,
      metadata: { kind: 'csv', rows: rows.length, filters },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `audit-log-${stamp}.csv`, csv: lines.join('\n') };
  } catch (error) {
    console.error('[audit] export failed', error);
    return { error: 'The export could not be produced. Try again.' };
  }
}
