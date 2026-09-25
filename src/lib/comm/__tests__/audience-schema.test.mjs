// Regression: "Audience resolution failed: Unknown column 'c.phone' in 'where clause'".
// `contacts` has no phone / full_name columns — a guardian's phone and name live on `people`
// (contacts.person_id). Every guardian query must read them from there, and stay school-scoped.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('guardian audience queries', () => {
  for (const f of ['audience-resolver.ts', 'recipients.ts']) {
    const src = read(f);

    it(`${f}: never reads phone/full_name from the contacts alias`, () => {
      assert.doesNotMatch(src, /\bc\.phone\b/);
      assert.doesNotMatch(src, /\bc\.full_name\b/);
    });

    it(`${f}: every contacts join goes through people.person_id`, () => {
      const joins = src.match(/JOIN contacts\s+c\b/g) ?? [];
      const viaPeople = src.match(/JOIN people\s+cp\s+ON cp\.id = c\.person_id/g) ?? [];
      assert.ok(joins.length > 0);
      assert.equal(viaPeople.length, joins.length);
    });

    it(`${f}: guardian queries stay school-scoped`, () => {
      const blocks = src.match(/FROM student_contacts sc[\s\S]*?`/g) ?? [];
      assert.ok(blocks.length > 0);
      for (const b of blocks) assert.match(b, /s\.school_id = \?/);
    });
  }

  it('audience-resolver covers all_parents, class_parents and learner_parents', () => {
    const src = read('audience-resolver.ts');
    assert.equal((src.match(/CONTACT_NAME/g) ?? []).length >= 4, true);
  });
});
