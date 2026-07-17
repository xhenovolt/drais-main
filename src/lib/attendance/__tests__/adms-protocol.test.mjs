import test from 'node:test';
import assert from 'node:assert/strict';
import { admsUploadAck, parseZKBody } from '../adms-protocol.ts';

test('parses every positional ATTLOG line into a distinct record', () => {
  const raw = [
    '63\t2026-07-17 16:23:47\t4\t1\t0\t0',
    '6\t2026-07-17 16:33:57\t4\t1\t0\t1',
    '54\t2026-07-17 17:55:12\t4\t1\t0\t2',
  ].join('\r\n') + '\r\n';

  const parsed = parseZKBody(raw, 'ATTLOG');

  assert.equal(parsed.records.length, 3);
  assert.deepEqual(parsed.records.map(r => r.USERID), ['63', '6', '54']);
  assert.equal(parsed.lines.length, 3);
  assert.equal(parsed.records[1].CHECKTIME, '2026-07-17 16:33:57');
});

test('parses every key/value USER record without reusing the first object', () => {
  const raw = [
    'USER PIN=101\tName=ALPHA USER\tPri=0',
    'USER PIN=102\tName=BETA USER\tPri=0',
    'USER PIN=103\tName=GAMMA USER\tPri=0',
  ].join('\n');

  const parsed = parseZKBody(raw, 'OPERLOG');

  assert.equal(parsed.records.length, 3);
  assert.deepEqual(parsed.records.map(r => [r['USER PIN'], r.NAME]), [
    ['101', 'ALPHA USER'],
    ['102', 'BETA USER'],
    ['103', 'GAMMA USER'],
  ]);
});

test('formats counted ADMS upload acknowledgements', () => {
  assert.equal(admsUploadAck(0), 'OK: 0');
  assert.equal(admsUploadAck(128), 'OK: 128');
  assert.equal(admsUploadAck(2.9), 'OK: 2');
});
