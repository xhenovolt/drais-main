import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveInsideRoot, isSafeRelative, validatePhotoFolder, isImageFileName } from '../safe-path.ts';
import { classifyRef, parseManagedRef, managedRef } from '../refs.ts';
import { matchFolder } from '../folder-match.ts';
import { ZipWriter, crc32 } from '../zip.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drais-media-'));
const root = path.join(tmp, 'root');
fs.mkdirSync(path.join(root, 'people'), { recursive: true });
fs.writeFileSync(path.join(root, 'people', 'a.jpg'), 'x');
fs.writeFileSync(path.join(tmp, 'secret.txt'), 'nope');

test('paths: only files inside the root resolve', () => {
  assert.ok(resolveInsideRoot(root, 'people/a.jpg'));
  for (const bad of ['../secret.txt', 'people/../../secret.txt', '/etc/passwd', 'C:\\Windows\\win.ini', '', 'people/a.jpg\0x']) {
    assert.equal(resolveInsideRoot(root, bad), null, bad);
  }
  assert.equal(resolveInsideRoot(root, 'people/missing.jpg'), null);
  assert.equal(resolveInsideRoot(root, 'people'), null, 'directories are not files');
  assert.equal(isSafeRelative('a/b.jpg'), true);
  assert.equal(isSafeRelative('a/../../b.jpg'), false);
});

test('paths: a symlink that escapes the root is refused', (t) => {
  const link = path.join(root, 'people', 'escape.jpg');
  try { fs.symlinkSync(path.join(tmp, 'secret.txt'), link); } catch { t.skip('symlinks need elevated rights on this machine'); return; }
  assert.equal(resolveInsideRoot(root, 'people/escape.jpg'), null);
});

test('photo folder validation refuses roots, the app tree and missing folders', () => {
  assert.equal(validatePhotoFolder(path.parse(process.cwd()).root).ok, false);
  assert.equal(validatePhotoFolder(process.cwd()).ok, false);
  assert.equal(validatePhotoFolder('relative/dir').ok, false);
  assert.equal(validatePhotoFolder(path.join(tmp, 'nope')).ok, false);
  assert.equal(validatePhotoFolder(root).ok, true);
  assert.equal(isImageFileName('A.JPG'), true);
  assert.equal(isImageFileName('a.exe'), false);
});

test('refs are classified by shape', () => {
  assert.equal(classifyRef('https://res.cloudinary.com/x/image/upload/a.jpg'), 'cloudinary');
  assert.equal(classifyRef('https://example.com/a.jpg'), 'remote');
  assert.equal(classifyRef('/uploads/students/a.jpg'), 'legacy');
  assert.equal(classifyRef('/offline-photos/8002/a.jpg'), 'legacy');
  assert.equal(classifyRef('media://8002/people/a.jpg'), 'managed');
  assert.equal(classifyRef(''), 'empty');
  assert.equal(classifyRef('data:image/png;base64,AA'), 'data');
  assert.deepEqual(parseManagedRef(managedRef(8002, 'people\\a.jpg')), { schoolId: 8002, rel: 'people/a.jpg' });
  assert.equal(parseManagedRef('media://abc/x'), null);
});

test('folder matching never guesses', () => {
  const people = [
    { personId: 1, kind: 'student', admissionNo: 'ADM/001', displayName: 'Amina N' },
    { personId: 2, kind: 'student', admissionNo: 'adm/002 ', displayName: 'Amina N' },
    { personId: 3, kind: 'student', admissionNo: 'DUP', displayName: 'Sam' },
    { personId: 4, kind: 'student', admissionNo: 'dup', displayName: 'Sam K' },
    { personId: 5, kind: 'student', admissionNo: null, displayName: 'No Number' },
  ];
  // "/" is not allowed in file names, so ADM/001 is saved as ADM-001
  const files = ['ADM-001.jpg', 'adm-002.png', 'DUP.jpg', 'Amina N.jpg', 'ADM-001.jpeg'];
  const { matched, unresolved } = matchFolder(files, people, 'admission_no');
  assert.deepEqual(matched.map(m => [m.personId, m.file]), [[2, 'adm-002.png']]);
  const reasons = Object.fromEntries(unresolved.map(u => [u.file, u.reason]));
  assert.equal(reasons['DUP.jpg'], 'several_people_share_identifier');
  assert.equal(reasons['Amina N.jpg'], 'no_matching_person', 'names are never matched');
  assert.ok(unresolved.some(u => u.reason === 'several_files_for_person' && u.personIds[0] === 1));
  const byId = matchFolder(['5.jpg'], people, 'person_id');
  assert.deepEqual(byId.matched, [{ personId: 5, file: '5.jpg', key: 'person_id' }]);
});

test('zip: a streamed archive is readable by an independent unzip', async (t) => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const out = path.join(tmp, 'test.zip');
  const chunks = [];
  const zip = new ZipWriter(c => { chunks.push(Buffer.from(c)); });
  await zip.add('photos/ADM-001.jpg', Buffer.from('jpeg-bytes'));
  await zip.add('manifest.json', Buffer.from(JSON.stringify({ ok: true })));
  await zip.add('عربي/اسم.txt', Buffer.from('utf8 name'));
  await zip.finish();
  fs.writeFileSync(out, Buffer.concat(chunks));
  let listing;
  try {
    listing = execFileSync('python', ['-c', `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print("\\n".join(i.filename+"|"+z.read(i).decode() for i in z.infolist()))`, out], { encoding: 'utf8' });
  } catch { t.skip('python not available to cross-check the archive'); return; }
  assert.match(listing, /photos\/ADM-001\.jpg\|jpeg-bytes/);
  assert.match(listing, /manifest\.json\|\{"ok":true\}/);
  assert.match(listing, /عربي\/اسم\.txt\|utf8 name/);
});
