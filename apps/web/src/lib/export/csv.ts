/**
 * CSV writing.
 *
 * RFC 4180 quoting, a UTF-8 byte-order mark, and CRLF line endings — the
 * combination Excel needs to open a file with accented characters and not
 * mangle them. This matters more than it should: the person who opens a
 * compliance export is using Excel, and a file that renders "Türkiye" as
 * "TÃ¼rkiye" reads as a broken product.
 */

export interface CsvColumn<T> {
  key: string;
  header: string;
  value: (row: T) => unknown;
}

const BOM = '﻿';

export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const lines = [columns.map((column) => escape(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escape(format(column.value(row)))).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => format(item)).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Quote per RFC 4180, and neutralise formula injection.
 *
 * A cell beginning `=`, `+`, `-`, `@` or a control character is executed as a
 * formula when the file is opened, which turns any user-supplied product name
 * into code running on the compliance officer's machine. Prefixing an
 * apostrophe is the only mitigation spreadsheets actually honour; it is visible
 * in the cell, which is the correct trade against a remote command execution.
 */
function escape(value: string): string {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const cell = dangerous ? `'${value}` : value;
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

/** `Content-Disposition` for a download, with the filename quoted safely. */
export function attachment(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return `attachment; filename="${safe}"`;
}
