/**
 * "Request changes" attached to specific fields.
 *
 * `passport_status_history.reason` is free text, and the author's editor reads
 * it as free text, so the field list has to survive as something a person can
 * read without this module and a machine can read with it. Hence a plain
 * bulleted list with the dot-path in brackets: legible in an email, in a CSV
 * export and in the audit metadata, and still parseable back into checkboxes.
 */

export interface RequestedField {
  path: string;
  label: string;
}

export interface ChangeRequest {
  comment: string;
  fields: RequestedField[];
}

const HEADING = 'Changes requested on the following fields:';
const FIELD_LINE = /^[•*-]\s+(.+?)\s+\[([^\]]+)\]\s*$/;

export function formatChangeRequest(request: ChangeRequest): string {
  const lines: string[] = [];
  if (request.fields.length > 0) {
    lines.push(HEADING);
    for (const field of request.fields) {
      lines.push(`• ${field.label} [${field.path}]`);
    }
    lines.push('');
  }
  lines.push(request.comment.trim());
  return lines.join('\n');
}

export function parseChangeRequest(reason: string | null | undefined): ChangeRequest {
  if (!reason) return { comment: '', fields: [] };

  const fields: RequestedField[] = [];
  const commentLines: string[] = [];

  for (const line of reason.split('\n')) {
    if (line.trim() === HEADING) continue;
    const match = FIELD_LINE.exec(line.trim());
    if (match) {
      fields.push({ label: match[1]!, path: match[2]! });
      continue;
    }
    commentLines.push(line);
  }

  return { comment: commentLines.join('\n').trim(), fields };
}
