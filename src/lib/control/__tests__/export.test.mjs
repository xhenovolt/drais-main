// Control export — pure CSV builder.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toCSV } from '@/lib/control/export';

describe('toCSV', () => {
  it('builds header + rows from inferred columns', () => {
    const csv = toCSV([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    assert.equal(csv, 'a,b\r\n1,x\r\n2,y');
  });

  it('uses explicit columns with labels + value fns', () => {
    const csv = toCSV([{ online: 3, total: 10 }], [
      { key: 'status', label: 'Status', value: (r) => `${r.online}/${r.total}` },
    ]);
    assert.equal(csv, 'Status\r\n3/10');
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = toCSV([{ name: 'Doe, John', note: 'says "hi"', multi: 'a\nb' }]);
    assert.match(csv, /"Doe, John"/);
    assert.match(csv, /"says ""hi"""/);
    assert.match(csv, /"a\nb"/);
  });

  it('header-only when there are no rows', () => {
    assert.equal(toCSV([], [{ key: 'x', label: 'X' }]), 'X');
    assert.equal(toCSV([]), '');
  });

  it('null / undefined become empty', () => {
    assert.equal(toCSV([{ a: null, b: undefined, c: 0 }]), 'a,b,c\r\n,,0');
  });
});
