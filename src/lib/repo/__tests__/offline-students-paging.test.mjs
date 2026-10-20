// The offline learner list must reach EVERY learner. It used to stop at the first 500,
// so a larger school's newest admissions disappeared from the list and from search.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb } from '../sqlite/connection.ts';
import { createSqliteRepos } from '../sqlite/index.ts';
import { listOfflineStudents } from '../offline-students/index.ts';

describe('listOfflineStudents paging', () => {
  it('lists and searches past 1,000 learners; limit still applies', async () => {
    const db = openSqliteDb(':memory:');
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO schools (id, name) VALUES (1, 'S')").run();
    const p = db.prepare('INSERT INTO people (id, school_id, first_name, last_name) VALUES (?, 1, ?, ?)');
    const s = db.prepare('INSERT INTO students (id, school_id, person_id) VALUES (?, 1, ?)');
    db.transaction(() => { for (let i = 1; i <= 1203; i++) { p.run(i, i === 1203 ? 'Newest' : `L${i}`, 'X'); s.run(i, i); } })();
    const repos = createSqliteRepos(db);
    assert.equal((await listOfflineStudents(repos, 1)).length, 1203);
    assert.deepEqual((await listOfflineStudents(repos, 1, { search: 'newest' })).map((v) => v.firstName), ['Newest']);
    assert.equal((await listOfflineStudents(repos, 1, { limit: 20 })).length, 20);
    closeSqliteDb(db);
  });
});
