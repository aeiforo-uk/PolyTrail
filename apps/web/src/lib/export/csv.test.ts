import { describe, expect, it } from 'vitest';
import { attachment, toCsv, type CsvColumn } from './csv';

interface Row {
  name: string;
  count: number;
  when: Date | null;
}

const COLUMNS: readonly CsvColumn<Row>[] = [
  { key: 'name', header: 'Name', value: (r) => r.name },
  { key: 'count', header: 'Count', value: (r) => r.count },
  { key: 'when', header: 'When', value: (r) => r.when },
];

function body(csv: string): string[] {
  return csv.replace(/^﻿/, '').trimEnd().split('\r\n');
}

describe('CSV export', () => {
  it('writes a BOM and CRLF endings so Excel opens it correctly', () => {
    const csv = toCsv(COLUMNS, [{ name: 'Merino crew', count: 2, when: null }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
  });

  it('quotes cells containing commas, quotes and newlines', () => {
    const csv = toCsv(COLUMNS, [{ name: 'Shirt, "navy"\nlong', count: 1, when: null }]);
    expect(body(csv)[1]).toContain('"Shirt, ""navy""');
  });

  // A product name is user input. Without this, opening the export runs it.
  it('neutralises spreadsheet formula injection', () => {
    const csv = toCsv(COLUMNS, [{ name: '=cmd|"/c calc"!A1', count: 0, when: null }]);
    expect(body(csv)[1]).toMatch(/^"?'=cmd/);
  });

  it('formats dates as ISO 8601 and empty values as empty cells', () => {
    const csv = toCsv(COLUMNS, [{ name: 'A', count: 0, when: new Date('2026-04-01T09:00:00Z') }]);
    expect(body(csv)[1]).toBe('A,0,2026-04-01T09:00:00.000Z');
  });

  it('strips anything unsafe from a download filename', () => {
    expect(attachment('../../etc/passwd.csv')).toBe('attachment; filename=".._.._etc_passwd.csv"');
  });
});
