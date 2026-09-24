import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  resolveTokens, sanitizeSpec, starterSpec, specTokens, isTwoSided, specFromLegacyConfig, blankSpec,
} from '@/lib/idcards/spec.ts';
import { layoutPages, computeGrid } from '@/lib/idcards/layout.ts';
import {
  inspectWorkbook, suggestMapping, extractRows, looksLikeWorkbook, formatDisplayDate, slimWorkbook,
} from '@/lib/idcards/excel.ts';

const A4 = { widthMm: 210, heightMm: 297, marginMm: 10, gapMm: 4 };
const CARD = { widthMm: 85.6, heightMm: 54 };

function workbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('spec', () => {
  it('resolves tokens and never leaks braces for unknown tokens', () => {
    assert.equal(resolveTokens('Reg {admission_no} / {nope}', { admission_no: 'A1' }), 'Reg A1 / ');
    assert.equal(resolveTokens('{col:Boarding House}', { 'col:Boarding House': 'Blue' }), 'Blue');
  });

  it('starter spec: one-sided has no back; two-sided has both', () => {
    assert.equal(isTwoSided(starterSpec(false)), false);
    const two = starterSpec(true);
    assert.equal(isTwoSided(two), true);
    assert.ok(specTokens(two).includes('valid_until'));
  });

  it('sanitizeSpec drops unsafe input: non-https images, script-y colours, unknown kinds, oversize values', () => {
    const s = sanitizeSpec({
      size: { widthMm: 9999, heightMm: -5 },
      front: {
        backgroundColor: 'red;background:url(x)',
        backgroundImage: { url: 'javascript:alert(1)', fit: 'stretch' },
        elements: [
          { kind: 'script', x: 1 },
          { kind: 'image', source: 'static', src: 'http://insecure/x.png', x: 0, y: 0, w: 5, h: 5 },
          { kind: 'text', text: 'x'.repeat(5000), color: 'expression(1)', fontSizePt: 999, x: 0, y: 0, w: 10, h: 10 },
        ],
      },
    });
    assert.equal(s.size.widthMm, 210);
    assert.equal(s.size.heightMm, 30);
    assert.equal(s.front.backgroundImage, undefined);
    assert.equal(s.front.backgroundColor, '#ffffff');
    assert.equal(s.front.elements.length, 2);
    assert.equal(s.front.elements[0].src, undefined);
    assert.equal(s.front.elements[1].text.length, 300);
    assert.equal(s.front.elements[1].fontSizePt, 60);
    assert.equal(s.front.elements[1].color, '#000000');
    assert.equal(s.back, undefined);
  });

  it('legacy config converts to a valid single-sided v2 spec (existing templates keep working; adapter is opt-in)', () => {
    const s = sanitizeSpec(specFromLegacyConfig({ bgColor: '#123456', accentColor: '#abcdef', textColor: '#fff' }));
    assert.equal(isTwoSided(s), false);
    assert.equal(s.front.backgroundColor, '#123456');
    assert.ok(s.front.elements.some((e) => e.kind === 'image' && e.source === 'photo'));
  });
});

describe('print layout', () => {
  it('A4 (10 mm margins, 4 mm gap) fits 2 x 4 ID-1 cards; grid is centred', () => {
    const g = computeGrid(CARD, A4, false);
    assert.equal(g.cols, 2);
    assert.equal(g.rows, 4); // 5 rows would need 286 mm of the 277 mm available
    assert.equal(computeGrid(CARD, { ...A4, marginMm: 5 }, false).rows, 5);
    assert.ok(Math.abs(g.offsetXMm * 2 + 2 * 85.6 + 4 - 210) < 0.01);
  });

  it('single-sided design ignores duplex/fold modes', () => {
    const { pages, effectiveMode } = layoutPages({ count: 3, card: CARD, sheet: A4, mode: 'duplex_long', hasBack: false });
    assert.equal(effectiveMode, 'front_only');
    assert.equal(pages.length, 1);
    assert.ok(pages[0].cells.every((c) => c.face === 'front'));
  });

  it('duplex long-edge: every back sits at the mirrored column behind its own front', () => {
    const { pages, grid } = layoutPages({ count: 7, card: CARD, sheet: A4, mode: 'duplex_long', hasBack: true });
    assert.equal(pages.length, 2);
    const [front, back] = pages;
    assert.equal(front.kind, 'front'); assert.equal(back.kind, 'back');
    for (const f of front.cells) {
      const b = back.cells.find((c) => c.index === f.index);
      assert.ok(b, `back for record ${f.index}`);
      assert.equal(b.yMm, f.yMm);
      // mirrored across the sheet's vertical centre line
      assert.ok(Math.abs((f.xMm + CARD.widthMm / 2) + (b.xMm + CARD.widthMm / 2) - 210) < 0.01);
    }
    assert.equal(grid.perPage, 8);
  });

  it('duplex short-edge mirrors rows instead of columns', () => {
    const { pages } = layoutPages({ count: 4, card: CARD, sheet: A4, mode: 'duplex_short', hasBack: true });
    const [front, back] = pages;
    for (const f of front.cells) {
      const b = back.cells.find((c) => c.index === f.index);
      assert.equal(b.xMm, f.xMm);
      assert.ok(Math.abs((f.yMm + 27) + (b.yMm + 27) - 297) < 0.01);
    }
  });

  it('fold_pair puts BACK on the left and FRONT on the right of one unit', () => {
    const { pages } = layoutPages({ count: 3, card: CARD, sheet: A4, mode: 'fold_pair', hasBack: true });
    assert.equal(pages.length, 1);
    const one = pages[0].cells.filter((c) => c.index === 0);
    const back = one.find((c) => c.face === 'back');
    const front = one.find((c) => c.face === 'front');
    assert.ok(Math.abs(front.xMm - back.xMm - CARD.widthMm) < 0.01);
    assert.equal(front.yMm, back.yMm);
    assert.equal(pages[0].cells.length, 6);
  });

  it('paginates beyond one sheet and pairs each learner exactly once per face', () => {
    const { pages } = layoutPages({ count: 23, card: CARD, sheet: A4, mode: 'duplex_long', hasBack: true });
    assert.equal(pages.length, 6);
    const fronts = pages.filter((p) => p.kind === 'front').flatMap((p) => p.cells.map((c) => c.index));
    const backs = pages.filter((p) => p.kind === 'back').flatMap((p) => p.cells.map((c) => c.index));
    assert.deepEqual(fronts.sort((a, b) => a - b), Array.from({ length: 23 }, (_, i) => i));
    assert.deepEqual(backs.sort((a, b) => a - b), fronts);
  });

  it('throws a clear error when the card cannot fit', () => {
    assert.throws(() => layoutPages({ count: 1, card: { widthMm: 200, heightMm: 54 }, sheet: A4, mode: 'front_only', hasBack: false }), /does not fit/);
    assert.throws(() => layoutPages({ count: 1, card: CARD, sheet: { ...A4, widthMm: 150 }, mode: 'fold_pair', hasBack: true }), /does not fit/);
  });
});

describe('excel parsing', () => {
  const buf = workbook({
    Cover: [['Nakifuma list', '', ''], ['printed', '2026', '']],
    Learners: [
      ['SCHOOL LIST', '', '', '', ''],
      ['Names', 'Reg No', 'Class', 'DOB', 'Photo', 'Boarding House'],
      ['Alice A', 'R1', 'S1', '2010-03-04', 'https://x.test/a.jpg', 'Blue'],
      ['', 'R2', 'S1', '05/06/2011', '', 'Red'],
      ['Carl C', 'R1', 'S2', 'not-a-date', 'http://insecure/c.jpg', ''],
      ['', '', '', '', '', ''],
      ['Dora D', 'R4', 'S2', '', '', 'Blue'],
    ],
  });

  it('detects file type by magic bytes, not name', () => {
    assert.equal(looksLikeWorkbook(buf), 'xlsx');
    assert.equal(looksLikeWorkbook(Buffer.from('<html></html>')), null);
  });

  it('lists worksheets and guesses the header row past a title row', () => {
    const { sheets } = inspectWorkbook(buf);
    assert.deepEqual(sheets.map((s) => s.name), ['Cover', 'Learners']);
    const l = sheets[1];
    assert.equal(l.headerRow, 2);
    assert.deepEqual(l.headers.slice(0, 3), ['Names', 'Reg No', 'Class']);
    assert.equal(l.rowCount, 4);
  });

  it('suggests mappings from header synonyms', () => {
    const m = suggestMapping(['Names', 'Reg No', 'Class', 'DOB', 'Photo', 'Boarding House']);
    assert.equal(m.full_name, 'Names');
    assert.equal(m.admission_no, 'Reg No');
    assert.equal(m.class, 'Class');
    assert.equal(m.dob, 'DOB');
    assert.equal(m.photo_url, 'Photo');
  });

  it('extracts records with validation; nothing is silently skipped', () => {
    const map = { full_name: 'Names', admission_no: 'Reg No', class: 'Class', dob: 'DOB', photo_url: 'Photo' };
    const r = extractRows(buf, { sheetName: 'Learners', headerRow: 2, mapping: map, schoolName: 'Test School' });
    assert.equal(r.rows.length, 4);          // blank row excluded and counted, not lost
    assert.equal(r.blankRowsSkipped, 1);
    assert.equal(r.rows[0].record.full_name, 'Alice A');
    assert.equal(r.rows[0].record.dob, '04 Mar 2010');
    assert.equal(r.rows[0].record['col:Boarding House'], 'Blue');
    assert.equal(r.rows[0].record.school, 'Test School');
    assert.equal(r.rows[0].status, 'ok');

    const missing = r.rows[1];
    assert.equal(missing.status, 'error');
    assert.ok(r.issues.some((i) => i.row === 4 && i.field === 'full_name' && i.severity === 'error'));
    assert.equal(missing.record.dob, '05 Jun 2011');

    const carl = r.rows[2];
    assert.equal(carl.status, 'warning');
    assert.equal(carl.record.photo_url, '');
    assert.ok(r.issues.some((i) => i.row === 5 && i.field === 'dob'));
    assert.ok(r.issues.some((i) => i.row === 5 && i.field === 'photo_url'));
    assert.ok(r.issues.some((i) => i.row === 5 && i.field === 'admission_no' && /Duplicate of row 3/.test(i.message)));
  });

  it('real-world header set: "Middle Name" is not mistaken for the full name; full name composes first+middle+last', () => {
    const headers = ['REG NO', 'First Name', 'Middle Name', 'Last Name', 'Class', 'Gender', 'Section', 'Phone'];
    const m = suggestMapping(headers);
    assert.equal(m.full_name, undefined);
    assert.equal(m.first_name, 'First Name');
    assert.equal(m.middle_name, 'Middle Name');
    assert.equal(m.last_name, 'Last Name');
    assert.equal(m.admission_no, 'REG NO');
    const b = workbook({ S: [headers, ['R1', 'Ann', 'Mary', 'Lee', 'S1', 'F', 'Day', '0700']] });
    const r = extractRows(b, { sheetName: 'S', headerRow: 1, mapping: m });
    assert.equal(r.rows[0].record.full_name, 'Ann Mary Lee');
    assert.equal(r.rows[0].status, 'ok');
    assert.equal(r.rows[0].record['col:Section'], 'Day');
  });

  it('composes full name from first + last when only those are mapped', () => {
    const b = workbook({ S: [['First', 'Last'], ['Ann', 'Lee']] });
    const r = extractRows(b, { sheetName: 'S', headerRow: 1, mapping: { first_name: 'First', last_name: 'Last' } });
    assert.equal(r.rows[0].record.full_name, 'Ann Lee');
    assert.equal(r.rows[0].status, 'ok');
  });

  it('rejects an unknown worksheet', () => {
    assert.throws(() => extractRows(buf, { sheetName: 'Nope', headerRow: 1, mapping: {} }), /not found/);
  });

  it('date formatting', () => {
    assert.equal(formatDisplayDate('2010-03-04'), '04 Mar 2010');
    assert.equal(formatDisplayDate('4/3/10'), '04 Mar 2010');
    assert.equal(formatDisplayDate('32/13/2010'), null);
  });
});

describe('slimWorkbook (client-side reduction for oversize files)', () => {
  it('extraction from the compact copy equals extraction from the original, dates included', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['REG', 'Name', 'DOB', 'Class'],
      ['R1', 'Ann Lee', new Date(Date.UTC(2010, 2, 4)), 'S1'],
      ['R2', 'Bob Ray', '2011-06-05', 'S2'],
    ], { cellDates: true });
    ws['C2'].z = 'dd/mm/yyyy';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['note'], ['x']]), 'Other');
    const original = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }));
    const slim = Buffer.from(slimWorkbook(original));

    assert.deepEqual(inspectWorkbook(slim).sheets.map((s) => s.name), ['Data', 'Other']);
    const map = { full_name: 'Name', admission_no: 'REG', dob: 'DOB', class: 'Class' };
    const a = extractRows(original, { sheetName: 'Data', headerRow: 1, mapping: map });
    const b = extractRows(slim, { sheetName: 'Data', headerRow: 1, mapping: map });
    assert.deepEqual(b.rows.map((r) => r.record), a.rows.map((r) => r.record));
    assert.equal(b.rows[0].record.dob, '04 Mar 2010');
  });

  it('caps very tall sheets so the copy stays small', () => {
    const aoa = [['Name']]; for (let i = 0; i < 6000; i++) aoa.push([`Learner ${i}`]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S');
    const slim = Buffer.from(slimWorkbook(Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))));
    const r = extractRows(slim, { sheetName: 'S', headerRow: 1, mapping: { full_name: 'Name' } });
    assert.equal(r.rows.length, 2000);
    assert.equal(r.truncated, true);
  });
});

describe('blankSpec', () => {
  it('defaults to ID-1', () => {
    const s = blankSpec();
    assert.equal(s.size.widthMm, 85.6);
    assert.equal(s.size.heightMm, 54);
  });
});
