import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvMatrix, sniffDelimiter } from './csv';

/**
 * Every case here is a file a merchandiser has actually produced. The BOM and
 * the CRLF come from Excel, the embedded newline from a care instruction, the
 * semicolons from a German PLM, and the ragged row from somebody pasting a
 * value containing a quote.
 */
describe('CSV parsing', () => {
  it('reads a plain file into headers and rows', () => {
    const parsed = parseCsv('Style,Colour\nA-1,Navy\nA-2,Ecru\n');
    expect(parsed.headers).toEqual(['Style', 'Colour']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]!.cells).toEqual({ Style: 'A-1', Colour: 'Navy' });
    expect(parsed.rows[1]!.line).toBe(3);
  });

  it('strips the byte-order mark Excel writes', () => {
    const parsed = parseCsv('﻿Style,Colour\r\nA-1,Navy\r\n');
    expect(parsed.headers).toEqual(['Style', 'Colour']);
  });

  it('handles CRLF without inventing blank rows', () => {
    const parsed = parseCsv('a,b\r\n1,2\r\n3,4\r\n');
    expect(parsed.rows.map((row) => row.cells)).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    const parsed = parseCsv('Name,Size\n"Shirt, navy",M\n');
    expect(parsed.rows[0]!.cells).toEqual({ Name: 'Shirt, navy', Size: 'M' });
  });

  it('keeps newlines inside quoted fields', () => {
    const parsed = parseCsv('Care,Size\n"Wash at 30\nDo not tumble dry",M\n');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.cells.Care).toBe('Wash at 30\nDo not tumble dry');
  });

  it('unescapes doubled quotes', () => {
    const parsed = parseCsv('Name\n"He said ""no"""\n');
    expect(parsed.rows[0]!.cells.Name).toBe('He said "no"');
  });

  it('reads a final row with no trailing newline', () => {
    const parsed = parseCsv('a,b\n1,2');
    expect(parsed.rows).toHaveLength(1);
  });

  it('ignores a trailing row of empty cells', () => {
    const parsed = parseCsv('a,b\n1,2\n,\n');
    expect(parsed.rows).toHaveLength(1);
  });

  it('sniffs a semicolon-delimited file', () => {
    expect(sniffDelimiter('Style;Colour;Size\nA;B;C')).toBe(';');
    const parsed = parseCsv('Style;Colour\nA-1;Navy\n');
    expect(parsed.delimiter).toBe(';');
    expect(parsed.rows[0]!.cells.Colour).toBe('Navy');
  });

  it('does not sniff a delimiter that only appears inside quotes', () => {
    expect(sniffDelimiter('"a;b;c;d",e\n1,2')).toBe(',');
  });

  it('sniffs tabs', () => {
    expect(sniffDelimiter('a\tb\tc')).toBe('\t');
  });

  it('names blank headers and disambiguates duplicates', () => {
    const parsed = parseCsv('Colour,,Colour\n1,2,3\n');
    expect(parsed.headers).toEqual(['Colour', 'Column 2', 'Colour (2)']);
    expect(parsed.rows[0]!.cells).toEqual({ Colour: '1', 'Column 2': '2', 'Colour (2)': '3' });
  });

  it('reports a ragged row rather than dropping it', () => {
    const parsed = parseCsv('a,b,c\n1,2\n');
    expect(parsed.ragged).toEqual([{ line: 2, expected: 3, found: 2 }]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.cells.c).toBe('');
  });

  it('trims surrounding whitespace in cells', () => {
    const parsed = parseCsv('a,b\n  1 , 2\n');
    expect(parsed.rows[0]!.cells).toEqual({ a: '1', b: '2' });
  });

  it('stops at maxRows and says so', () => {
    const parsed = parseCsv('a\n1\n2\n3\n', { maxRows: 2 });
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.truncated).toBe(true);
  });

  it('treats a lone carriage return as a line ending', () => {
    const matrix = parseCsvMatrix('a,b\r1,2', ',');
    expect(matrix).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads an empty file as nothing at all', () => {
    const parsed = parseCsv('');
    expect(parsed.headers).toEqual([]);
    expect(parsed.rows).toEqual([]);
  });

  it('keeps a quote that appears mid-cell as a literal', () => {
    const parsed = parseCsv('a\n12" ruler\n');
    expect(parsed.rows[0]!.cells.a).toBe('12" ruler');
  });
});
