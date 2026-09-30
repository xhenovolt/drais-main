// Client-side Excel parsing (src/lib/idcards/excel-client.ts) — the whole
// point of this module over the server-side excel.ts (which uses the `xlsx`
// package and cannot read embedded images at all) is that a photo pasted
// directly into a "Photo" column is extracted as a real image, not left
// blank. Verifies the full round trip with a real workbook built by exceljs
// itself, not a fixture file, so it stays honest about exceljs's real API.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { inspectWorkbookClient, extractRowsClient, suggestMapping } from '../excel-client.ts';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function buildTestWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Name', 'Class', 'Photo']);
  ws.addRow(['Jane Doe', 'S1', '']);                          // embedded image on this row
  ws.addRow(['John Roe', 'S2', 'https://example.com/x.jpg']); // link, no embedded image
  ws.addRow(['Amy Fox', 'S3', 'not-a-link']);                 // neither -> blanked with a warning

  const imageId = wb.addImage({ buffer: Buffer.from(PNG_B64, 'base64'), extension: 'png' });
  ws.addImage(imageId, { tl: { col: 2, row: 1 }, ext: { width: 40, height: 40 } });

  const out = await wb.xlsx.writeBuffer();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

describe('excel-client: embedded photo extraction', () => {
  it('inspectWorkbookClient reports the sheet and flags that it has images', async () => {
    const buf = await buildTestWorkbook();
    const { sheets } = await inspectWorkbookClient(buf);
    assert.equal(sheets.length, 1);
    assert.deepEqual(sheets[0].headers, ['Name', 'Class', 'Photo']);
    assert.equal(sheets[0].rowCount, 3);
    assert.equal(sheets[0].hasImages, true);
  });

  it('suggestMapping finds the Photo column for photo_url', async () => {
    const buf = await buildTestWorkbook();
    const { sheets } = await inspectWorkbookClient(buf);
    const mapping = suggestMapping(sheets[0].headers);
    assert.equal(mapping.photo_url, 'Photo');
    assert.equal(mapping.full_name, 'Name');
  });

  it('a row with an embedded image gets a data: URI, not the empty cell text', async () => {
    const buf = await buildTestWorkbook();
    const { sheets } = await inspectWorkbookClient(buf);
    const mapping = suggestMapping(sheets[0].headers);
    const { rows } = await extractRowsClient(buf, { sheetName: 'Sheet1', headerRow: 1, mapping });
    const jane = rows.find((r) => r.record.full_name === 'Jane Doe');
    assert.ok(jane);
    assert.match(jane.record.photo_url, /^data:image\/png;base64,/);
    assert.equal(jane.status, 'ok');
  });

  it('a row with only an https link (no embedded image) keeps the link', async () => {
    const buf = await buildTestWorkbook();
    const { sheets } = await inspectWorkbookClient(buf);
    const mapping = suggestMapping(sheets[0].headers);
    const { rows } = await extractRowsClient(buf, { sheetName: 'Sheet1', headerRow: 1, mapping });
    const john = rows.find((r) => r.record.full_name === 'John Roe');
    assert.equal(john.record.photo_url, 'https://example.com/x.jpg');
    assert.equal(john.status, 'ok');
  });

  it('a row with neither an image nor a valid link is blanked with a warning', async () => {
    const buf = await buildTestWorkbook();
    const { sheets } = await inspectWorkbookClient(buf);
    const mapping = suggestMapping(sheets[0].headers);
    const { rows, issues } = await extractRowsClient(buf, { sheetName: 'Sheet1', headerRow: 1, mapping });
    const amy = rows.find((r) => r.record.full_name === 'Amy Fox');
    assert.equal(amy.record.photo_url, '');
    assert.equal(amy.status, 'warning');
    assert.ok(issues.some((i) => i.field === 'photo_url' && i.row === amy.row));
  });
});
