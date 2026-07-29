#!/usr/bin/env node
/**
 * Finance Consolidation Plan, Stage B (docs/audits/FINANCE_CONSOLIDATION_PLAN.md).
 *
 * Backfills student_fee_items.fee_item_id (added in migration 038) on
 * historical rows by matching `item` text to `fee_items.name`, scoped to the
 * SAME school — an exact, unambiguous string match only. Any row that
 * doesn't match (no fee_items catalog for that school, or a name that was
 * never catalogued — e.g. an imported/manual balance) is left untouched
 * (fee_item_id stays NULL); it's still readable by `item` text exactly as
 * before. Idempotent: only touches rows where fee_item_id IS NULL, safe to
 * re-run after a school adds more fee_items to its catalog.
 *
 * Verified before the first run (2026-07-28, prod): zero duplicate
 * (school_id, name) pairs in fee_items, so the match can never be ambiguous.
 *
 *   DOTENV_CONFIG_PATH=.env.local node scripts/db/backfill-fee-item-ids.mjs
 *   node scripts/db/backfill-fee-item-ids.mjs --dry-run
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB || 'drais',
    ssl: { rejectUnauthorized: false },
  });

  const [dupes] = await conn.execute(
    `SELECT school_id, name, COUNT(*) n FROM fee_items GROUP BY school_id, name HAVING COUNT(*) > 1`,
  );
  if (dupes.length) {
    console.error('ABORT: ambiguous (school_id, name) pairs in fee_items — resolve before backfilling:', dupes);
    await conn.end();
    process.exit(1);
  }

  const [preview] = await conn.execute(`
    SELECT s.school_id, COUNT(*) would_match
      FROM student_fee_items sfi
      JOIN students s ON s.id = sfi.student_id
      JOIN fee_items fi ON fi.school_id = s.school_id AND fi.name = sfi.item
     WHERE sfi.fee_item_id IS NULL
     GROUP BY s.school_id
  `);
  console.log('Rows that would be matched, by school:', JSON.stringify(preview, null, 2));

  if (DRY_RUN) {
    console.log('Dry run — no rows written.');
    await conn.end();
    return;
  }

  const [result] = await conn.execute(`
    UPDATE student_fee_items sfi
    JOIN students s ON s.id = sfi.student_id
    JOIN fee_items fi ON fi.school_id = s.school_id AND fi.name = sfi.item
    SET sfi.fee_item_id = fi.id
    WHERE sfi.fee_item_id IS NULL
  `);
  console.log(`Backfilled ${result.changedRows} rows.`);

  const [after] = await conn.execute(`
    SELECT s.school_id, COUNT(*) n, SUM(sfi.fee_item_id IS NULL) still_unmatched
      FROM student_fee_items sfi JOIN students s ON s.id = sfi.student_id
     GROUP BY s.school_id
  `);
  console.log('Post-backfill state:', JSON.stringify(after, null, 2));
  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
