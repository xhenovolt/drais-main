// node:test suite — workbook intelligence layer (import redesign, Phase A).
// Run with: npx tsx --test src/lib/ingestion/__tests__/workbook-inspect.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { detectHeaderRow } from '../parse/header-detect.ts';
import { inferContextFromSheetName } from '../parse/sheet-name-context.ts';
import { guessSheetPurpose } from '../parse/purpose-guess.ts';
import { inspectWorkbook } from '../parse/workbook-inspect.ts';

function aoaToBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('detectHeaderRow', () => {
  it('finds the header at row 0 in a clean sheet', () => {
    const grid = [
      ['Admission No', 'First Name', 'Last Name', 'Class'],
      ['XHN/001', 'John', 'Kato', 'S1'],
      ['XHN/002', 'Mary', 'Nakato', 'S1'],
    ];
    const r = detectHeaderRow(grid);
    assert.equal(r.headerRowIndex, 0);
    assert.ok(r.confidence > 0.5);
  });

  it('skips a title row and a blank row before the real header', () => {
    const grid = [
      ['ABC Primary School — 2026 Term 1 Roll'],
      [],
      ['Admission No', 'First Name', 'Last Name', 'Class'],
      ['XHN/001', 'John', 'Kato', 'S1'],
      ['XHN/002', 'Mary', 'Nakato', 'S1'],
      ['XHN/003', 'Peter', 'Okello', 'S2'],
    ];
    const r = detectHeaderRow(grid);
    assert.equal(r.headerRowIndex, 2);
    assert.ok(r.skippedRows.includes(0));
    assert.ok(r.skippedRows.includes(1));
  });

  it('does not mistake a numeric-heavy data row for a header', () => {
    const grid = [
      ['Name', 'Score', 'Date'],
      ['John', 78, '2026-01-15'],
      ['Mary', 91, '2026-01-15'],
    ];
    const r = detectHeaderRow(grid);
    assert.equal(r.headerRowIndex, 0);
  });

  it('returns low confidence rather than crashing on a totally blank sheet', () => {
    const grid = [[], [], []];
    const r = detectHeaderRow(grid);
    assert.equal(r.confidence, 0);
  });
});

describe('inferContextFromSheetName', () => {
  it('parses "S.2 Blue" as Senior 2 / stream Blue', () => {
    const c = inferContextFromSheetName('S.2 Blue');
    assert.equal(c.className, 'Senior 2');
    assert.equal(c.streamName, 'Blue');
    assert.ok(c.confidence > 0.5);
  });

  it('parses "P.6 Girls" as Primary 6 / gender female', () => {
    const c = inferContextFromSheetName('P.6 Girls');
    assert.equal(c.className, 'Primary 6');
    assert.equal(c.genderHint, 'female');
  });

  it('parses "Term 2 Fees" as a fees dataset hint with a term hint', () => {
    const c = inferContextFromSheetName('Term 2 Fees');
    assert.equal(c.datasetHint, 'fees');
    assert.equal(c.termHint, 'Term 2');
  });

  it('returns zero confidence for a name with no recognizable pattern', () => {
    const c = inferContextFromSheetName('Sheet1');
    assert.equal(c.confidence, 0);
  });
});

describe('guessSheetPurpose', () => {
  it('recognizes student-shaped headers', () => {
    const g = guessSheetPurpose(['Admission No', 'First Name', 'Last Name', 'Gender', 'Class']);
    assert.equal(g.purpose, 'students');
  });

  it('recognizes fee-shaped headers', () => {
    const g = guessSheetPurpose(['Admission No', 'Tuition', 'Balance', 'Amount Paid', 'Payment Date']);
    assert.equal(g.purpose, 'fees');
  });

  it('recognizes results-shaped headers', () => {
    const g = guessSheetPurpose(['Admission No', 'Subject', 'Score', 'Grade', 'Teacher Initials']);
    assert.equal(g.purpose, 'results');
  });

  it('returns unknown for headers that do not resemble any catalog', () => {
    const g = guessSheetPurpose(['Foo', 'Bar', 'Baz']);
    assert.equal(g.purpose, 'unknown');
  });
});

describe('inspectWorkbook — realistic messy workbooks', () => {
  it('handles a one-sheet student workbook with a title row', () => {
    const buf = aoaToBuffer([
      ['Roster', [
        ['XHENVOLT ACADEMY — 2026 STUDENT ROLL'],
        [],
        ['Admission No', 'First Name', 'Last Name', 'Sex', 'Class'],
        ['XHN/001', 'John', 'Kato', 'M', 'S1'],
        ['XHN/002', 'Mary', 'Nakato', 'F', 'S1'],
      ]],
    ]);
    const inspection = inspectWorkbook(buf);
    assert.equal(inspection.sheetCount, 1);
    const sheet = inspection.sheets[0];
    assert.equal(sheet.header.headerRowIndex, 2);
    assert.equal(sheet.purpose.purpose, 'students');
    assert.equal(sheet.sampleDataRows.length, 2);
  });

  it('handles a sheet-per-class workbook and infers class from sheet name', () => {
    const buf = aoaToBuffer([
      ['S.1 Blue', [
        ['Admission No', 'First Name', 'Last Name'],
        ['XHN/010', 'Amina', 'Nassuna'],
      ]],
      ['S.1 Red', [
        ['Admission No', 'First Name', 'Last Name'],
        ['XHN/020', 'Omar', 'Ssekandi'],
      ]],
    ]);
    const inspection = inspectWorkbook(buf);
    assert.equal(inspection.sheetCount, 2);
    assert.equal(inspection.sheets[0].nameContext.className, 'Senior 1');
    assert.equal(inspection.sheets[0].nameContext.streamName, 'Blue');
    assert.equal(inspection.sheets[1].nameContext.streamName, 'Red');
  });

  it('flags a Read Me sheet as likely non-data without excluding it', () => {
    const buf = aoaToBuffer([
      ['Read Me', [['Please fill in the sheet below carefully.']]],
      ['Students', [
        ['Admission No', 'First Name', 'Last Name'],
        ['XHN/001', 'John', 'Kato'],
      ]],
    ]);
    const inspection = inspectWorkbook(buf);
    assert.ok(inspection.likelyNonDataSheets.includes('Read Me'));
    assert.equal(inspection.sheets.length, 2); // still inspected, never dropped
  });

  it('handles a fees-and-students-mixed workbook (distinguishes sheets by purpose)', () => {
    const buf = aoaToBuffer([
      ['Students', [
        ['Admission No', 'First Name', 'Last Name', 'Class'],
        ['XHN/001', 'John', 'Kato', 'S1'],
      ]],
      ['Term 1 Fees', [
        ['Admission No', 'Name', 'Tuition', 'Balance', 'Amount Paid'],
        ['XHN/001', 'John Kato', 500000, 100000, 400000],
      ]],
    ]);
    const inspection = inspectWorkbook(buf);
    assert.equal(inspection.sheets[0].purpose.purpose, 'students');
    assert.equal(inspection.sheets[1].purpose.purpose, 'fees');
    assert.equal(inspection.sheets[1].nameContext.datasetHint, 'fees');
  });

  it('marks a genuinely empty sheet as empty without throwing', () => {
    const buf = aoaToBuffer([['Blank', []]]);
    const inspection = inspectWorkbook(buf);
    assert.equal(inspection.sheets[0].isEmpty, true);
  });
});
