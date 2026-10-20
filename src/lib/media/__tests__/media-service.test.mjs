// Integration: media service against a real SQLite file in local-sqlite mode.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drais-media-svc-'));
process.env.DRAIS_ALLOW_LOCAL = 'true';
process.env.DRAIS_RUNTIME_DB_MODE = 'local-sqlite';
process.env.DRAIS_SQLITE_PATH = path.join(tmp, 'local.sqlite');
process.env.DRAIS_MEDIA_ROOT = path.join(tmp, 'media');

const SCHOOL = 8002, OTHER = 9001;
let svc, store, refs;
const folder = path.join(tmp, 'school-photos');

before(async () => {
  // Create the database on purpose (as an install does); getSqliteDb() only opens existing files.
  const { openSqliteDb, closeSqliteDb } = await import('../../repo/sqlite/connection.ts');
  closeSqliteDb(openSqliteDb(process.env.DRAIS_SQLITE_PATH));
  const { getSqliteDb } = await import('../../repo/sqlite/singleton.ts');
  const db = getSqliteDb();
  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO schools (id, name, logo_url) VALUES (?, 'Test School', 'https://res.cloudinary.com/demo/image/upload/logo.png')`).run(SCHOOL);
  db.prepare(`INSERT INTO schools (id, name) VALUES (?, 'Other School')`).run(OTHER);
  const person = db.prepare(`INSERT INTO people (id, school_id, first_name, last_name, photo_url) VALUES (?, ?, ?, ?, ?)`);
  const student = db.prepare(`INSERT INTO students (id, school_id, person_id, admission_no) VALUES (?, ?, ?, ?)`);
  person.run(1, SCHOOL, 'Amina', 'N', 'https://res.cloudinary.com/demo/image/upload/p1.jpg'); student.run(11, SCHOOL, 1, 'ADM/001');
  person.run(2, SCHOOL, 'Amina', 'N', null);                                                   student.run(12, SCHOOL, 2, 'ADM/002');
  person.run(3, SCHOOL, 'Sam', 'K', null);                                                     student.run(13, SCHOOL, 3, null);
  person.run(4, OTHER, 'Not', 'Ours', 'https://res.cloudinary.com/demo/image/upload/p4.jpg');  student.run(14, OTHER, 4, 'OTHER-001');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'ADM-001.jpg'), Buffer.from('photo-of-amina-1'));
  fs.writeFileSync(path.join(folder, 'ADM-002.png'), Buffer.from('photo-of-amina-2'));
  fs.writeFileSync(path.join(folder, 'Sam K.jpg'), Buffer.from('named-by-display-name'));
  svc = await import('../service.ts');
  store = await import('../store.ts');
  refs = await import('../refs.ts');
});

test('local database defaults to local-first; explicit choice wins', async () => {
  assert.equal(svc.effectivePolicy(SCHOOL), 'local-first');
  await store.setSchoolConfig(SCHOOL, { policy: 'local-only' });
  assert.equal(svc.effectivePolicy(SCHOOL), 'local-only');
  await store.setSchoolConfig(SCHOOL, { policy: null });
});

test('inventory lists only this school, with honest statuses', async () => {
  const { rows } = await svc.inventory(SCHOOL);
  assert.deepEqual(rows.map(r => r.entityId).sort(), [1, 2, 3, SCHOOL].sort((a, b) => a - b));
  const p1 = rows.find(r => r.entityId === 1);
  assert.equal(p1.status, 'remote_only');
  assert.equal(rows.find(r => r.entityId === 2).status, 'none');
});

test('cloud refs redirect under local-first, but never under local-only', async () => {
  const ref = 'https://res.cloudinary.com/demo/image/upload/p1.jpg';
  assert.deepEqual(svc.resolveRef(SCHOOL, ref), { kind: 'redirect', url: ref });
  await store.setSchoolConfig(SCHOOL, { policy: 'local-only' });
  assert.equal(svc.resolveRef(SCHOOL, ref).kind, 'missing');
  await store.setSchoolConfig(SCHOOL, { policy: null });
});

test('offline upload is stored locally and served only to its own school', async () => {
  const ref = await svc.storeUploadLocally(SCHOOL, 'person', 3, Buffer.from('uploaded-offline'), 'me.jpg', 'students');
  assert.equal(refs.classifyRef(ref), 'managed');
  const r = svc.resolveRef(SCHOOL, ref);
  assert.equal(r.kind, 'file');
  assert.equal(fs.readFileSync(r.absPath, 'utf8'), 'uploaded-offline');
  assert.ok(r.absPath.startsWith(path.join(tmp, 'media')), 'stored under the media root, not public/');
  assert.deepEqual(svc.resolveRef(OTHER, ref), { kind: 'missing', reason: 'not_this_school' });
});

test('school photo folder: exact identifiers only, names never', async () => {
  await store.setSchoolConfig(SCHOOL, { photoFolder: folder, folderKey: 'admission_no' });
  const scan = await svc.scanPhotoFolder(SCHOOL);
  assert.equal(scan.ok, true);
  assert.deepEqual(scan.matched.map(m => [m.personId, m.file]).sort(), [[1, 'ADM-001.jpg'], [2, 'ADM-002.png']]);
  assert.ok(scan.unresolved.some(u => u.file === 'Sam K.jpg' && u.reason === 'no_matching_person'));
  // People from another school are never candidates.
  assert.ok(!scan.matched.some(m => m.personId === 4));
});

test('applying folder matches: existing ref is kept, empty ref gets a local media:// ref, other school refused', async () => {
  const r = await svc.applyFolderAssignments(SCHOOL, [{ personId: 1, file: 'ADM-001.jpg' }, { personId: 2, file: 'ADM-002.png' }, { personId: 4, file: 'ADM-001.jpg' }, { personId: 1, file: '../outside.jpg' }]);
  assert.equal(r.applied, 2);
  assert.deepEqual(r.skipped.map(s => s.reason).sort(), ['file_not_found', 'not_in_this_school']);
  const cloudRef = 'https://res.cloudinary.com/demo/image/upload/p1.jpg';
  const p1 = svc.resolveRef(SCHOOL, cloudRef);
  assert.equal(p1.kind, 'file', 'the cloud reference now resolves to the folder file locally');
  assert.equal(fs.readFileSync(p1.absPath, 'utf8'), 'photo-of-amina-1');
  const { getSqliteDb } = await import('../../repo/sqlite/singleton.ts');
  const db = getSqliteDb();
  assert.equal(db.prepare('SELECT photo_url FROM people WHERE id = 1').get().photo_url, cloudRef, 'existing reference untouched');
  const newRef = db.prepare('SELECT photo_url FROM people WHERE id = 2').get().photo_url;
  assert.equal(newRef, `media://${SCHOOL}/folder/person_2`);
  assert.equal(fs.readFileSync(svc.resolveRef(SCHOOL, newRef).absPath, 'utf8'), 'photo-of-amina-2');
  const { rows } = await svc.inventory(SCHOOL);
  assert.equal(rows.find(x => x.entityId === 1).status, 'folder');
});

test('online database rows are never rewritten', async () => {
  const data = await import('../data.ts');
  process.env.DRAIS_RUNTIME_DB_MODE = 'online';
  await assert.rejects(() => data.setPersonPhotoRef(SCHOOL, 3, 'media://x/y'), /refusing/);
  process.env.DRAIS_RUNTIME_DB_MODE = 'local-sqlite';
});
