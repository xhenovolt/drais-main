// Local database safety (directive 2026-10, issue 4): a bad .drs payload never replaces a
// database, a replaced database is backed up first, a missing database is reported (never
// silently recreated), and install/mode-switch accept only the DRAIS window's own requests.
import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drais-install-'));
process.env.DRAIS_SQLITE_PATH = path.join(dir, 'local.sqlite');
process.env.DRAIS_CONFIG_FILE = path.join(dir, 'drais.env');

const { openSqliteDb, closeSqliteDb } = await import('@/lib/repo/sqlite/connection');
const { getSqliteDb, resetSqliteDb, LocalDatabaseMissingError } = await import('@/lib/repo/sqlite/singleton');
const { installDrsPayload, InstallTargetExistsError, InstallPayloadInvalidError } = await import('@/lib/desktop/install');
const { requireDesktopWindow } = await import('@/lib/desktop/desktop-guard');

/** A real DRAIS SQLite file (full schema) holding the given school names. */
function schoolDb(names) {
  const f = path.join(dir, `src-${Math.random().toString(36).slice(2)}.sqlite`);
  const db = openSqliteDb(f);
  for (const n of names) db.prepare('INSERT INTO schools (name) VALUES (?)').run(n);
  db.pragma('wal_checkpoint(TRUNCATE)');
  closeSqliteDb(db);
  return fs.readFileSync(f);
}
const target = () => process.env.DRAIS_SQLITE_PATH;
const clean = () => { resetSqliteDb(); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); };

describe('installDrsPayload', () => {
  beforeEach(clean);

  it('installs a valid one-school database', async () => {
    const r = await installDrsPayload(schoolDb(['Alpha School']), false);
    assert.equal(r.installedAt, target());
    assert.equal(r.schoolName, 'Alpha School');
    assert.equal(r.backupDir, undefined);
    assert.match(fs.readFileSync(process.env.DRAIS_CONFIG_FILE, 'utf8'), /DRAIS_DB_MODE=local-sqlite/);
  });

  it('refuses to replace without force', async () => {
    await installDrsPayload(schoolDb(['Alpha School']), false);
    await assert.rejects(installDrsPayload(schoolDb(['Beta School']), false), InstallTargetExistsError);
  });

  it('backs up the current database (with its WAL) before replacing it', async () => {
    await installDrsPayload(schoolDb(['Alpha School']), false);
    const live = getSqliteDb();
    live.prepare("UPDATE schools SET name = 'Alpha (edited)'").run(); // lands in the WAL
    const r = await installDrsPayload(schoolDb(['Beta School']), true);
    assert.ok(r.backupDir && fs.existsSync(r.backupDir));
    const backup = openSqliteDb(path.join(r.backupDir, 'local.sqlite'));
    assert.equal(backup.prepare('SELECT name FROM schools').get().name, 'Alpha (edited)');
    closeSqliteDb(backup);
    assert.equal(getSqliteDb().prepare('SELECT name FROM schools').get().name, 'Beta School');
  });

  for (const [label, payload, re] of [
    ['not SQLite at all', () => Buffer.from('this is not a database'), /not a SQLite database|SQLite could not read it/],
    ['two schools', () => schoolDb(['A', 'B']), /holds 2 schools/],
    ['no school', () => schoolDb([]), /holds 0 schools/],
  ]) {
    it(`rejects a payload that is ${label}, and leaves the current database untouched`, async () => {
      await installDrsPayload(schoolDb(['Alpha School']), false);
      resetSqliteDb();
      const before = fs.readFileSync(target());
      await assert.rejects(installDrsPayload(payload(), true), (e) => e instanceof InstallPayloadInvalidError && re.test(e.message));
      assert.deepEqual(fs.readFileSync(target()), before);
      assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('.tmp-')), [], 'temp file removed');
      assert.ok(!fs.existsSync(path.join(dir, 'replaced')), 'nothing was backed up because nothing was replaced');
    });
  }
});

describe('getSqliteDb', () => {
  before(clean);
  it('reports a missing database and does not create one', () => {
    assert.throws(() => getSqliteDb(), (e) => e instanceof LocalDatabaseMissingError && e.code === 'LOCAL_DB_MISSING' && e.path === target());
    assert.equal(fs.existsSync(target()), false);
  });
});

describe('requireDesktopWindow', () => {
  const req = (h) => new NextRequest('http://127.0.0.1:3210/api/db-mode', { method: 'POST', headers: h });
  it('allows everything when not running inside the desktop app', () => {
    delete process.env.DRAIS_DESKTOP_TOKEN;
    assert.equal(requireDesktopWindow(req({})), null);
  });
  it('inside the desktop app, accepts only the window token', () => {
    process.env.DRAIS_DESKTOP_TOKEN = 'a'.repeat(64);
    assert.equal(requireDesktopWindow(req({}))?.status, 403);
    assert.equal(requireDesktopWindow(req({ 'x-drais-desktop': 'b'.repeat(64) }))?.status, 403);
    assert.equal(requireDesktopWindow(req({ 'x-drais-desktop': 'short' }))?.status, 403);
    assert.equal(requireDesktopWindow(req({ 'x-drais-desktop': 'a'.repeat(64) })), null);
    delete process.env.DRAIS_DESKTOP_TOKEN;
  });
});
