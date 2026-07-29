// Broadcast recipient parsing — staff_room/admin notification targets used
// to silently resolve to zero recipients (docs/audits/
// ATTENDANCE_FOUNDER_INDEPENDENCE_AUDIT.md, "SMS staff events dead"). This
// is the pure parsing piece of that fix; the DB reads themselves aren't
// unit-tested (no DB in CI), consistent with this codebase's pattern.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhoneList } from '@/lib/notifications/fanout.ts';

describe('parsePhoneList', () => {
  it('splits comma-separated numbers and trims whitespace', () => {
    assert.deepEqual(parsePhoneList('0700111222, 0700333444 ,0700555666'), ['0700111222', '0700333444', '0700555666']);
  });

  it('also accepts semicolons and newlines as separators', () => {
    assert.deepEqual(parsePhoneList('0700111222;0700333444\n0700555666'), ['0700111222', '0700333444', '0700555666']);
  });

  it('drops blanks and de-duplicates', () => {
    assert.deepEqual(parsePhoneList('0700111222,, 0700111222 ,  '), ['0700111222']);
  });

  it('null/undefined/empty input yields an empty list', () => {
    assert.deepEqual(parsePhoneList(null), []);
    assert.deepEqual(parsePhoneList(undefined), []);
    assert.deepEqual(parsePhoneList(''), []);
  });

  it('a single number with no separators round-trips', () => {
    assert.deepEqual(parsePhoneList('0700111222'), ['0700111222']);
  });
});
