/**
 * 047 — dahua_attendance_logs has no unique constraint at all, and both
 * ingestion routes (api/attendance/dahua/[id]/sync, api/attendance/dahua/[id]/logs)
 * do a plain INSERT with no IGNORE/ON DUPLICATE KEY. Re-syncing an overlapping
 * time window (a normal operational action — "re-sync device") duplicates
 * every record in that window verbatim, both as extra dahua_attendance_logs
 * rows and, via the derived-write further down the same handler, potentially
 * skewed student_attendance state.
 *
 * A punch's real identity here is (device_id, user_id, event_time, event_type)
 * — mirrors the same dedupe-then-key idiom as 005_dedup_unique_keys.mjs.
 */
async function hasIndex(query, table, index) {
  const rows = await query(
    `SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

async function tableExists(query, table) {
  const rows = await query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function dedupe(query, log, { table, groupCols }) {
  const colList = groupCols.join(', ');
  const groups = await query(
    `SELECT MIN(id) AS keep_id, COUNT(*) AS n, ${colList}
       FROM ${table}
      GROUP BY ${colList}
     HAVING COUNT(*) > 1
      LIMIT 5000`,
  );
  let removed = 0;
  for (const g of groups) {
    const where = groupCols.map(c => (g[c] === null ? `${c} IS NULL` : `${c} = ?`)).join(' AND ');
    const params = groupCols.filter(c => g[c] !== null).map(c => g[c]);
    const res = await query(
      `DELETE FROM ${table} WHERE ${where} AND id <> ? LIMIT 1000`,
      [...params, g.keep_id],
    );
    removed += res.affectedRows ?? 0;
  }
  log(`${table}: ${groups.length} duplicate group(s), ${removed} duplicate row(s) removed (kept oldest id)`);
  return groups.length;
}

async function dedupeAndKey(query, log, { table, index, groupCols, keySql }) {
  if (!(await tableExists(query, table))) {
    log(`${table}: table absent — skipped`);
    return;
  }
  if (await hasIndex(query, table, index)) {
    log(`${table}: ${index} already present`);
    return;
  }
  for (let attempt = 1; attempt <= 15; attempt++) {
    for (let pass = 0; pass < 50; pass++) {
      const remaining = await dedupe(query, log, { table, groupCols });
      if (remaining === 0) break;
    }
    try {
      await query(keySql);
      log(`${table}: ${index} added (attempt ${attempt})`);
      return;
    } catch (err) {
      if (err.errno === 1062) {
        log(`${table}: live write recreated a duplicate during ALTER (attempt ${attempt}) — retrying`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${table}: could not add ${index} after 15 attempts — pause device sync and re-run`);
}

export default async function up({ query, log }) {
  await dedupeAndKey(query, log, {
    table: 'dahua_attendance_logs',
    index: 'uk_dahua_event',
    groupCols: ['device_id', 'user_id', 'event_time', 'event_type'],
    keySql: `ALTER TABLE dahua_attendance_logs ADD UNIQUE INDEX uk_dahua_event (device_id, user_id, event_time, event_type)`,
  });
}
