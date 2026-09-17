/**
 * CSV reading.
 *
 * Written by hand rather than pulled from npm because the input is a file a
 * merchandiser exported from Excel twenty seconds ago, and the failure modes
 * are entirely predictable: a byte-order mark Excel writes and nobody asks
 * for, CRLF endings, a product description containing a comma, and a care
 * instruction containing a newline inside its quotes. A parser that handles
 * those four things correctly is about a hundred lines; a dependency that
 * handles them is a supply-chain risk on a compliance product.
 *
 * Writing CSV is `src/lib/export/csv.ts` and stays there — this module only
 * reads.
 */

/** Delimiters worth sniffing. Semicolon is the default in much of the EU. */
const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const;

export interface CsvParseOptions {
  /** Force a delimiter instead of sniffing one from the header line. */
  delimiter?: string;
  /** Reject files larger than this many data rows. */
  maxRows?: number;
}

export interface CsvRow {
  /** 1-based line number in the source file, for error messages that mean something. */
  line: number;
  cells: Record<string, string>;
}

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
  /**
   * Rows whose cell count did not match the header count. Reported rather
   * than dropped: a ragged row is usually a quoting mistake the operator can
   * see and fix, and silently discarding it loses a product.
   */
  ragged: Array<{ line: number; expected: number; found: number }>;
  truncated: boolean;
}

/**
 * Split a CSV document into a matrix of raw cells.
 *
 * One pass, one character at a time. The alternative — splitting on newlines
 * then on commas — is wrong for any field containing either, which in this
 * domain means every free-text field.
 */
export function parseCsvMatrix(input: string, delimiter: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let sawAnyCharacter = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote (RFC 4180).
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      sawAnyCharacter = true;
      continue;
    }

    if (char === '"' && cell === '') {
      quoted = true;
      sawAnyCharacter = true;
      continue;
    }

    if (char === delimiter) {
      row.push(cell);
      cell = '';
      sawAnyCharacter = true;
      continue;
    }

    if (char === '\r' || char === '\n') {
      // Consume CRLF as a single terminator so Windows files do not gain a
      // blank row between every real one.
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      sawAnyCharacter = false;
      continue;
    }

    cell += char;
    sawAnyCharacter = true;
  }

  // A file ending in a newline has already flushed its last row; anything
  // still in the buffer is a final row without a terminator.
  if (sawAnyCharacter || cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Guess the delimiter from the header line.
 *
 * Counts occurrences outside quotes and takes the winner. A file with no
 * delimiter at all is a single-column file, which is legitimate, so the comma
 * is the fallback rather than an error.
 */
export function sniffDelimiter(input: string): string {
  const text = stripBom(input);
  const firstLine = firstUnquotedLine(text);
  let best = ',';
  let bestCount = 0;
  for (const candidate of CANDIDATE_DELIMITERS) {
    const count = countUnquoted(firstLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, options: CsvParseOptions = {}): ParsedCsv {
  const delimiter = options.delimiter ?? sniffDelimiter(input);
  const matrix = parseCsvMatrix(input, delimiter);

  const headerCells = matrix.shift() ?? [];
  const headers = normaliseHeaders(headerCells);

  const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
  const rows: CsvRow[] = [];
  const ragged: ParsedCsv['ragged'] = [];
  let truncated = false;

  for (let i = 0; i < matrix.length; i++) {
    const cells = matrix[i]!;
    const line = i + 2; // header is line 1

    // Excel habitually leaves a trailing row of empty cells. It is not a
    // product, and flagging it as one would put a phantom error on the screen.
    if (cells.every((value) => value.trim() === '')) continue;

    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }

    if (cells.length !== headers.length) {
      ragged.push({ line, expected: headers.length, found: cells.length });
    }

    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]!] = (cells[c] ?? '').trim();
    }
    rows.push({ line, cells: record });
  }

  return { headers, rows, delimiter, ragged, truncated };
}

/**
 * Make headers usable as object keys without losing which column is which.
 *
 * Blank and duplicated headers are both common in exports, and both would
 * otherwise collapse two columns into one — which loses data silently, the
 * one failure this module exists to avoid.
 */
function normaliseHeaders(cells: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return cells.map((raw, index) => {
    const base = stripBom(raw).trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function firstUnquotedLine(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) return text.slice(0, i);
  }
  return text;
}

function countUnquoted(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === delimiter) count++;
  }
  return count;
}
