// Phase 6 tests: docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md's stated
// completion criterion for this phase, verified directly — restore from a
// verified .drs into a fresh local file, never touching a live target
// until every check has passed, and the old file is preserved (never
// deleted) rather than silently overwritten.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeDrsFile } from '@/lib/container/write-drs';
import { restoreFromDrs, RestoreVerificationError } from '@/lib/container/restore';
import { DrsDecryptError } from '@/lib/container/read-drs';
import { openSqliteDb, closeSqliteDb, createSqliteRepos, seedStudent } from '@/lib/repo/sqlite';

const tmpPaths = [];
function tmpPath(name, ext = '.sqlite') {
  const p = path.join(os.tmpdir(), `drais-restore-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  tmpPaths.push(p);
  return p;
}
after(() => {
  for (const p of tmpPaths) {
    for (const suffix of ['', '-wal', '-shm', '.tmp', '.restoring', '.pre-restore']) {
      try { fs.unlinkSync(p + suffix); } catch { /* best effort; some won't exist */ }
    }
    try { fs.unlinkSync(p); } catch { /* already covered above for most cases */ }
  }
});

const PASSPHRASE = 'restore-test-passphrase';

/** Build a real SQLite file on disk with one school + N students, return
 *  its raw bytes. Mirrors how a real .drs payload actually gets produced
 *  (Phase 4's provisioning writes a real file; this test does the same
 *  thing at a smaller scale, not a synthetic buffer). */
async function buildSqlitePayload(schoolId, studentCount) {
  // seedSchool (not repos.schools.create()) is what real provisioning
  // uses — it preserves the source's exact id, which this test needs
  // since the .drs header's schoolId must match the row that's actually
  // in the payload.
  const { seedSchool } = await import('@/lib/repo/sqlite');
  const dbPath = tmpPath(`source-${schoolId}`);
  const db = openSqliteDb(dbPath);
  const nowIso = new Date().toISOString();
  seedSchool(db, {
    id: schoolId, name: `School ${schoolId}`, legalName: null, shortCode: null, email: null, phone: null,
    currency: 'UGX', address: null, logoUrl: null, status: 'active', createdAt: nowIso, updatedAt: nowIso, deletedAt: null,
  });
  for (let i = 1; i <= studentCount; i++) {
    seedStudent(db, {
      id: schoolId * 1000 + i, schoolId, personId: i, admissionNo: `S${schoolId}-${i}`,
      villageId: null, admissionDate: null, status: 'active', notes: null,
      createdAt: nowIso, updatedAt: nowIso, deletedAt: null,
    });
  }
  closeSqliteDb(db);
  const bytes = fs.readFileSync(dbPath);
  fs.unlinkSync(dbPath);
  return bytes;
}

async function wrapInDrs(payload, schoolId) {
  const drsPath = tmpPath(`backup-${schoolId}`, '.drs');
  await writeDrsFile({
    payload, passphrase: PASSPHRASE, outPath: drsPath,
    meta: { schoolId, drAisAppVersionMin: '2.2.0' },
  });
  return drsPath;
}

describe('.drs restore (Phase 6)', () => {
  it('restores into a fresh path with no existing target: preRestoreBackupPath is null', async () => {
    const payload = await buildSqlitePayload(101, 5);
    const drsPath = await wrapInDrs(payload, 101);
    const targetPath = tmpPath('target-fresh');

    const result = await restoreFromDrs({ drsPath, passphrase: PASSPHRASE, targetSqlitePath: targetPath });
    assert.equal(result.schoolId, 101);
    assert.equal(result.studentCount, 5);
    assert.equal(result.preRestoreBackupPath, null);
    assert.ok(fs.existsSync(targetPath));

    // Prove the restored file is actually usable, not just present.
    const db = openSqliteDb(targetPath);
    const repos = createSqliteRepos(db);
    const students = await repos.students.listBySchool(101, { limit: 100 });
    assert.equal(students.length, 5);
    closeSqliteDb(db);
  });

  it('restoring over an existing target preserves the old file, never deletes it', async () => {
    const targetPath = tmpPath('target-existing');
    fs.writeFileSync(targetPath, Buffer.from('pretend this is the old (possibly corrupted) live database'));

    const payload = await buildSqlitePayload(202, 3);
    const drsPath = await wrapInDrs(payload, 202);

    const result = await restoreFromDrs({ drsPath, passphrase: PASSPHRASE, targetSqlitePath: targetPath });
    assert.ok(result.preRestoreBackupPath, 'must record where the old file went');
    assert.ok(fs.existsSync(result.preRestoreBackupPath), 'the old file must actually still exist on disk');
    assert.equal(
      fs.readFileSync(result.preRestoreBackupPath, 'utf8'),
      'pretend this is the old (possibly corrupted) live database',
      'the preserved file must be the OLD content, byte-for-byte',
    );
    tmpPaths.push(result.preRestoreBackupPath);

    // And the target itself now has the NEW, restored content.
    const db = openSqliteDb(targetPath);
    const school = await createSqliteRepos(db).schools.findById(202);
    assert.equal(school?.id, 202);
    closeSqliteDb(db);
  });

  it('a tenant-isolation leak in the backup is rejected, and a pre-existing target is left completely untouched', async () => {
    // Build a payload with TWO schools' students in it — exactly the
    // leak scenario Phase 4's verifyProvisionedSchool exists to catch,
    // now proven at the restore boundary too, self-contained (no live
    // source involved at all, unlike Phase 4's version of this check).
    const dbPath = tmpPath('leaked-source');
    const db = openSqliteDb(dbPath);
    const nowIso = new Date().toISOString();
    const { seedSchool } = await import('@/lib/repo/sqlite');
    seedSchool(db, { id: 301, name: 'School 301', legalName: null, shortCode: null, email: null, phone: null, currency: 'UGX', address: null, logoUrl: null, status: 'active', createdAt: nowIso, updatedAt: nowIso, deletedAt: null });
    seedStudent(db, { id: 1, schoolId: 301, personId: 1, admissionNo: 'A', villageId: null, admissionDate: null, status: 'active', notes: null, createdAt: nowIso, updatedAt: nowIso, deletedAt: null });
    // The leak: a full second school's row AND a student for it, sitting
    // in a file whose .drs header will claim to be school 301 only —
    // the realistic leak shape (a future buggy adapter copying both
    // rows, not just one), same lesson as Phase 4's own leak test: the
    // FK constraint (students.school_id -> schools.id) refuses a student
    // row with no matching schools row, so testing the verifier's own
    // "more than one school in this file" check requires both rows to
    // actually be present, not just the student.
    seedSchool(db, { id: 999, name: 'Leaked School 999', legalName: null, shortCode: null, email: null, phone: null, currency: 'UGX', address: null, logoUrl: null, status: 'active', createdAt: nowIso, updatedAt: nowIso, deletedAt: null });
    seedStudent(db, { id: 2, schoolId: 999, personId: 1, admissionNo: 'LEAK', villageId: null, admissionDate: null, status: 'active', notes: null, createdAt: nowIso, updatedAt: nowIso, deletedAt: null });
    closeSqliteDb(db);
    const leakedPayload = fs.readFileSync(dbPath);
    fs.unlinkSync(dbPath);

    const drsPath = await wrapInDrs(leakedPayload, 301);

    const targetPath = tmpPath('target-protected');
    const originalContent = 'the live database must survive this attempt untouched';
    fs.writeFileSync(targetPath, originalContent);

    await assert.rejects(
      () => restoreFromDrs({ drsPath, passphrase: PASSPHRASE, targetSqlitePath: targetPath }),
      (err) => err instanceof RestoreVerificationError,
    );

    // THE critical safety property: a failed restore must not have
    // touched the live target at all.
    assert.equal(fs.readFileSync(targetPath, 'utf8'), originalContent);
    // And no orphaned staging file left behind either.
    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath);
    const leftovers = fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.restoring-`));
    assert.deepEqual(leftovers, []);
  });

  it('a corrupted (non-SQLite) payload is rejected cleanly, target untouched', async () => {
    const garbage = Buffer.from('this is not a sqlite file, just random bytes pretending to be one');
    const drsPath = await wrapInDrs(garbage, 401);
    const targetPath = tmpPath('target-corrupt-payload');
    fs.writeFileSync(targetPath, 'original, must survive');

    await assert.rejects(
      () => restoreFromDrs({ drsPath, passphrase: PASSPHRASE, targetSqlitePath: targetPath }),
      (err) => err instanceof RestoreVerificationError,
    );
    assert.equal(fs.readFileSync(targetPath, 'utf8'), 'original, must survive');
  });

  it('wrong passphrase fails at the .drs layer, before this module touches the filesystem at all', async () => {
    const payload = await buildSqlitePayload(501, 1);
    const drsPath = await wrapInDrs(payload, 501);
    const targetPath = tmpPath('target-wrong-pw');

    await assert.rejects(
      () => restoreFromDrs({ drsPath, passphrase: 'definitely-not-it', targetSqlitePath: targetPath }),
      (err) => err instanceof DrsDecryptError,
    );
    assert.ok(!fs.existsSync(targetPath), 'nothing should have been written at all');
  });
});
