import type { AnswerValue } from './fields';
import type { MergeChange, MergeConflict } from './merge';

/** A file the supplier named but could not upload. See the note on `documents`. */
export interface SubmissionDocument {
  /** Registry path the document answers. */
  field: string;
  filename: string;
  note?: string;
}

export type ReviewDecision = 'accepted' | 'rejected';

export interface SubmissionReview {
  /** Per-field verdicts. A field absent here was neither accepted nor rejected. */
  decisions: Record<string, ReviewDecision>;
  /** Fields where the reviewer chose the supplier's value over the passport's. */
  overwrite: string[];
  notes?: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface SubmissionMergeRecord {
  at: string;
  passportId: string;
  dppId: string;
  version: number;
  changes: MergeChange[];
  conflicts: MergeConflict[];
}

/**
 * The shape of `data_requests.submission`.
 *
 * Everything the supplier and the reviewer produce lives in this one JSONB
 * column: the answers, the autosaved draft, the per-field review decisions and
 * a record of what the merge actually did. Keeping it in one document means a
 * submission can be read back exactly as it was answered, which is what a
 * brand needs when a supplier later disputes a figure. `values` is keyed by
 * registry path (`supplyChain.steps.*.gln`), not by a form field name, so the
 * merge has nothing to translate.
 *
 * A type alias rather than an interface on purpose: TypeScript gives an
 * implicit index signature to the former but not the latter, and this has to
 * be assignable to the column's `Record<string, unknown>` without a cast at
 * every write site.
 */
export type RequestSubmission = {
  values: Record<string, AnswerValue>;
  /** Last autosave, ISO 8601. Present on a draft the supplier has not sent. */
  savedAt?: string;
  submittedAt?: string;
  respondent?: { name?: string; email?: string; role?: string };
  /** Metadata only — the portal cannot store bytes yet. */
  documents?: SubmissionDocument[];
  review?: SubmissionReview;
  merges?: SubmissionMergeRecord[];
};

export const EMPTY_SUBMISSION: RequestSubmission = { values: {} };

/**
 * Read the column defensively. It is `jsonb` with no database-level shape, and
 * rows written by an older version of this module have to keep opening.
 */
export function readSubmission(raw: unknown): RequestSubmission {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { values: {} };
  const record = raw as Record<string, unknown>;
  const values =
    record.values && typeof record.values === 'object' && !Array.isArray(record.values)
      ? (record.values as Record<string, AnswerValue>)
      : {};

  return {
    values,
    ...(typeof record.savedAt === 'string' ? { savedAt: record.savedAt } : {}),
    ...(typeof record.submittedAt === 'string' ? { submittedAt: record.submittedAt } : {}),
    ...(record.respondent ? { respondent: record.respondent as RequestSubmission['respondent'] } : {}),
    ...(Array.isArray(record.documents)
      ? { documents: record.documents as SubmissionDocument[] }
      : {}),
    ...(record.review ? { review: normaliseReview(record.review) } : {}),
    ...(Array.isArray(record.merges) ? { merges: record.merges as SubmissionMergeRecord[] } : {}),
  };
}

function normaliseReview(raw: unknown): SubmissionReview {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    decisions: (record.decisions as Record<string, ReviewDecision>) ?? {},
    overwrite: Array.isArray(record.overwrite) ? (record.overwrite as string[]) : [],
    ...(typeof record.notes === 'string' ? { notes: record.notes } : {}),
    ...(typeof record.decidedAt === 'string' ? { decidedAt: record.decidedAt } : {}),
    ...(typeof record.decidedBy === 'string' ? { decidedBy: record.decidedBy } : {}),
  };
}

/** How many of the requested fields carry an answer. Drives the progress copy. */
export function answeredCount(
  submission: RequestSubmission,
  requestedFields: readonly string[],
): number {
  return requestedFields.filter((path) => {
    const value = submission.values[path];
    if (value === null || value === undefined || value === '') return false;
    return !(Array.isArray(value) && value.length === 0);
  }).length;
}
