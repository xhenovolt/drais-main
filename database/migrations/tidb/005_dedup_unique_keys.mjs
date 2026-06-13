/**
 * 005 — Phase 0 dedup keys, TiDB-safe.
 *
 * TiDB does not reliably support multi-table DELETE, so the dedupe is
 * done in JS: find duplicate groups, keep the OLDEST id, delete the
 * rest with single-table deletes (batched). Then add the unique keys.
 *
 * Deletes touch only exact-duplicate DERIVED rows; the raw forensic
 * truth (zk_raw_logs) is never touched.
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

/**
 * Dedupe until clean, then ALTER — and if the ALTER races a live
 * device push that recreated a duplicate (first production run lost
 * exactly this race: devices re-send their backlog every heartbeat
 * until the new INSERT IGNORE code is deployed), dedupe again and
 * retry the ALTER. The window between the final dedupe pass and the
 * ALTER is sub-second, so a handful of retries always wins.
 */
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
    // Dedupe until a pass finds nothing.
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
  throw new Error(`${table}: could not add ${index} after 15 attempts — pause device traffic and re-run`);
}

export default async function up({ query, log }) {
  await dedupeAndKey(query, log, {
    table: 'zk_attendance_logs',
    index: 'uk_punch',
    groupCols: ['device_sn', 'device_user_id', 'check_time'],
    keySql: `ALTER TABLE zk_attendance_logs ADD UNIQUE INDEX uk_punch (device_sn, device_user_id, check_time)`,
  });
  await dedupeAndKey(query, log, {
    table: 'attendance_raw_events',
    index: 'uk_raw_punch',
    groupCols: ['school_id', 'device_sn', 'device_user_id', 'punch_at', 'source'],
    keySql: `ALTER TABLE attendance_raw_events ADD UNIQUE INDEX uk_raw_punch (school_id, device_sn, device_user_id, punch_at, source)`,
  });
}
