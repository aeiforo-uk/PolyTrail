import { toCsv, type CsvColumn } from '@/lib/export/csv';
import type { PassportPayload } from '@/lib/passport/schema';
import { inlineVocabulary, labelFor, vocabularyForOptions } from './vocabulary';
import { getAtPath } from './paths';
import { describePath } from './schema-walk';
import { IMPORT_TARGETS, TEMPLATE_PATHS, targetFor, type ImportTarget } from './targets';
import { ROW_KEY } from './validate';
import type { RowResult } from './run';

/**
 * Writing the file back out.
 *
 * The round trip is the point: a brand exports its catalogue, fixes two hundred
 * fibre percentages in Excel where fixing two hundred of anything is actually
 * pleasant, and imports the same file. That only works if the headers this
 * writes are the headers `inferMapping` recognises, which is why both sides
 * speak in `ImportTarget` labels rather than in hand-written strings.
 *
 * Enum values are written as their human label rather than their key. A label
 * matches back at full confidence, and `apparel.tops.tshirt` in a spreadsheet
 * cell is not something anybody should have to edit.
 *
 * Quoting, the byte-order mark and formula-injection guarding are
 * `src/lib/export/csv.ts`'s job and stay there.
 */

export interface ExportRow {
  payload: PassportPayload;
}

/** The subset of targets a catalogue export carries, in registry order. */
export function exportTargets(paths?: readonly string[]): ImportTarget[] {
  if (!paths) return [...IMPORT_TARGETS];
  return paths
    .map((path) => targetFor(path))
    .filter((target): target is ImportTarget => target !== undefined);
}

export function passportsToCsv(
  rows: readonly ExportRow[],
  paths: readonly string[] = TEMPLATE_PATHS,
): string {
  const targets = exportTargets(paths);
  const columns: CsvColumn<ExportRow>[] = targets.map((target) => ({
    key: target.path,
    header: target.label,
    value: (row) => formatForCsv(target.path, getAtPath(row.payload, target.path)),
  }));
  return toCsv(columns, rows);
}

/** An empty file with the starter columns, for a brand with nothing to export. */
export function templateCsv(paths: readonly string[] = TEMPLATE_PATHS): string {
  return passportsToCsv([], paths);
}

export interface FailureRow {
  line: number;
  cells: Record<string, string>;
  errors: Record<string, string[]>;
}

/**
 * Only the rows that did not go, with their problems spelled out beside them.
 *
 * The errors are written into the file rather than left on a screen because
 * the person who fixes them is usually not the person who ran the import, and
 * what gets forwarded to them is the attachment.
 */
export function failuresToCsv(headers: readonly string[], rows: readonly FailureRow[]): string {
  const columns: CsvColumn<FailureRow>[] = [
    { key: '_line', header: 'Source line', value: (row) => row.line },
    ...headers.map((header) => ({
      key: header,
      header,
      value: (row: FailureRow) => row.cells[header] ?? '',
    })),
    {
      key: '_errors',
      header: 'Import errors',
      value: (row) =>
        Object.entries(row.errors)
          .map(([column, messages]) =>
            column === ROW_KEY ? messages.join(' ') : `${column}: ${messages.join(' ')}`,
          )
          .join(' | '),
    },
  ];
  return toCsv(columns, rows);
}

/** Pick the failing rows out of a finished job. */
export function collectFailures(
  rows: ReadonlyArray<Record<string, string>>,
  results: ReadonlyArray<RowResult | null | undefined>,
): FailureRow[] {
  const failures: FailureRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    const result = results[index];
    if (result?.ok) continue;
    failures.push({
      line: index + 2,
      cells: rows[index] ?? {},
      errors: result?.errors ?? { [ROW_KEY]: ['Not imported.'] },
    });
  }
  return failures;
}

/**
 * Render a stored value as the text a spreadsheet should show — and as text
 * `coerceCell` will read back to the same value.
 */
export function formatForCsv(path: string, value: unknown): string {
  if (value === undefined || value === null) return '';

  const leaf = describePath(path);

  if (Array.isArray(value)) {
    // Semicolons, because the file's own delimiter is usually a comma.
    return value.map((item) => formatScalar(item, leaf?.element?.options)).join('; ');
  }

  return formatScalar(value, leaf?.kind === 'enum' ? leaf.options : undefined);
}

function formatScalar(value: unknown, enumOptions?: readonly string[]): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);

  if (typeof value === 'object') {
    // A localised string exports in English; the other languages stay in the
    // passport rather than being flattened into a cell nobody can edit safely.
    const localized = (value as { en?: unknown }).en;
    return typeof localized === 'string' ? localized : '';
  }

  const text = String(value);
  if (enumOptions?.includes(text)) {
    const vocabulary = vocabularyForOptions(enumOptions) ?? inlineVocabulary(enumOptions);
    return labelFor(vocabulary, text);
  }
  return text;
}
