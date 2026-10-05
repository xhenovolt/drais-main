#!/usr/bin/env node
/**
 * db:download:photos — download a school's real student photos into a
 * local folder DRAIS can read without internet, and rewrite the LOCAL
 * SQLite install's `people.photo_url` to point at those local files.
 * Phase 7 sub-effort 25 (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md).
 *
 *   node scripts/db/download-photos.mjs --school-id=8002 --sqlite-path=<path> [--uploads-base-url=<url>]
 *
 * Two real photo_url shapes exist in production, confirmed live:
 *   - Cloudinary (https://res.cloudinary.com/...) — the current, active
 *     upload path (src/lib/cloudinary.ts). Downloaded directly.
 *   - Legacy relative paths (/uploads/students/...) — pre-Cloudinary
 *     uploads. These need a real origin to fetch from; this script never
 *     guesses one. Pass --uploads-base-url=https://<the real deployment>
 *     if you know it, or they're reported as skipped — never silently
 *     dropped, never fetched against a guessed domain.
 *
 * Photos land under public/offline-photos/<schoolId>/ — Next.js serves
 * public/ statically with zero extra route code, exactly how the
 * existing /uploads/... legacy path already works, so a relative
 * photo_url resolves identically online or fully offline.
 *
 * Only the LOCAL sqlite file's photo_url is rewritten — never the live
 * TiDB row. The .drs export stays photo-free and lean on purpose (photos
 * are the single biggest size driver; this is a deliberate, separate step
 * run after import, not baked into the .drs itself).
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import { loadEnv, onlineConfig } from './_shared.mjs';

loadEnv();
process.env.DRAIS_ALLOW_LOCAL = 'false'; // force reading the REAL online TiDB for the real photo_url values

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [key, ...rest] = a.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const schoolId = Number(args['school-id']);
const sqlitePath = args['sqlite-path'];
const uploadsBaseUrl = args['uploads-base-url'];
if (!Number.isInteger(schoolId) || schoolId <= 0) throw new Error('--school-id must be a positive integer');
if (!sqlitePath || !fs.existsSync(sqlitePath)) throw new Error('--sqlite-path must point to an existing local SQLite install');

const PUBLIC_DIR = path.resolve('public', 'offline-photos', String(schoolId));

function extFromUrl(url) {
  const m = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

async function main() {
  const conn = await mysql.createConnection(onlineConfig());
  const [[school]] = await conn.query('SELECT id, name FROM schools WHERE id = ?', [schoolId]);
  if (!school) throw new Error(`School ${schoolId} was not found`);
  console.log(`[download-photos] "${school.name}" (school ${schoolId})`);

  const [people] = await conn.query(`
    SELECT p.id AS person_id, p.photo_url
    FROM people p
    JOIN students s ON s.person_id = p.id
    WHERE s.school_id = ? AND p.photo_url IS NOT NULL AND p.photo_url != ''
  `, [schoolId]);
  await conn.end();

  console.log(`[download-photos] ${people.length} students have a photo_url set.`);
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  const db = new Database(sqlitePath);
  const update = db.prepare('UPDATE people SET photo_url = ? WHERE id = ?');

  let downloaded = 0, skippedNoOrigin = 0, failed = 0;
  for (const { person_id, photo_url } of people) {
    let sourceUrl = null;
    if (photo_url.startsWith('http')) {
      sourceUrl = photo_url;
    } else if (photo_url.startsWith('/') && uploadsBaseUrl) {
      sourceUrl = uploadsBaseUrl.replace(/\/$/, '') + photo_url;
    } else {
      skippedNoOrigin++;
      continue;
    }

    const ext = extFromUrl(sourceUrl);
    const fileName = `person_${person_id}.${ext}`;
    const localPath = `/offline-photos/${schoolId}/${fileName}`;
    try {
      const bytes = await downloadToFile(sourceUrl, path.join(PUBLIC_DIR, fileName));
      update.run(localPath, person_id);
      downloaded++;
      if (downloaded % 50 === 0) console.log(`[download-photos] ${downloaded}/${people.length - skippedNoOrigin}...`);
    } catch (e) {
      failed++;
      console.error(`  person ${person_id}: FAILED (${e.message})`);
    }
  }
  db.close();

  console.log(`\n✅ Downloaded ${downloaded} photos to ${PUBLIC_DIR}`);
  console.log(`   Skipped (legacy path, no --uploads-base-url given): ${skippedNoOrigin}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Local sqlite file's people.photo_url rewritten for every photo actually downloaded.`);
}

main().catch((e) => { console.error('[download-photos] FAILED:', e); process.exit(1); });
