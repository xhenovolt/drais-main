#!/usr/bin/env node
/**
 * JIPRA EMERGENCY ATTENDANCE RECOVERY — K40 Pro (Local TCP)
 * ==========================================================
 * Device: 192.168.1.197:4370 (LAN, node-zklib)
 * Phase 1/2: force full attendance download (this K40/lib does not
 *            support incremental polling — only a full log dump), then
 *            filter to today (2026-07-17) locally.
 * Phase 3: write forensic JSON — exact device data, no invented fields.
 * Phase 4: insert into attendance_raw_events (canonical raw journal,
 *          matched=0, no identity resolution) via INSERT IGNORE so
 *          nothing blocks on mapping and re-runs are idempotent.
 */
const fs = require('fs');
const path = require('path');
const ZKLib = require('node-zklib');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const IP = '192.168.1.197';
const PORT = 4370;
const SCHOOL_ID = 12004;
const DEVICE_SN = 'GED7254601154'; // registered JIPRA device (id 450002) — cross-verified via PIN overlap in zk_user_mapping, not device-reported (this lib has no getSerialNumber)
const TARGET_DATE = '2026-07-17';
const OUT_FILE = path.join(__dirname, '..', 'jipra-2026-07-17-device-attendance.json');

(async () => {
  const zk = new ZKLib(IP, PORT, 15000, 5200);
  await zk.createSocket();
  const info = await zk.getInfo().catch(() => null);
  const att = await zk.getAttendances();
  await zk.disconnect();

  const allRecords = att.data || [];
  // recordTime comes back as a JS Date object from node-zklib, not a string —
  // must call toISOString() explicitly, otherwise String() uses the locale
  // toString() format ("Fri Jul 17 2026 ...") which never matches a
  // YYYY-MM-DD prefix.
  const toIso = (rt) => (rt instanceof Date ? rt.toISOString() : new Date(rt).toISOString());
  const todayRecords = allRecords.filter(r => toIso(r.recordTime).startsWith(TARGET_DATE));

  const forensic = {
    metadata: {
      generatedAt: new Date().toISOString(),
      deviceIp: IP,
      devicePort: PORT,
      registeredDeviceId: 450002,
      inferredDeviceSn: DEVICE_SN,
      inferredDeviceSnMethod: 'PIN-range cross-match against zk_user_mapping (device serial not retrievable via installed node-zklib version)',
      schoolId: SCHOOL_ID,
      deviceLogCounts: info ? info.logCounts : null,
      deviceUserCounts: info ? info.userCounts : null,
      deviceLogCapacity: info ? info.logCapacity : null,
      totalRecordsOnDevice: allRecords.length,
      filterDate: TARGET_DATE,
      recordCountForFilterDate: todayRecords.length,
    },
    records: todayRecords.map(r => ({
      deviceSerial: null, // not returned per-record by device/lib; see metadata.inferredDeviceSn
      devicePin: r.deviceUserId != null ? String(r.deviceUserId) : null,
      deviceLogId: r.userSn ?? null,
      rawName: null, // not returned by getAttendances()
      deviceTimestamp: toIso(r.recordTime),
      verifyMode: null, // not returned by this node-zklib version
      ioMode: null,     // not returned by this node-zklib version
      workCode: null,   // not returned by this node-zklib version
      eventType: null,  // not returned by this node-zklib version
      receivedAt: null,
      mappedPerson: null,
      processingStatus: 'raw',
    })),
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(forensic, null, 2));
  console.log('Wrote', OUT_FILE, 'with', forensic.records.length, 'records for', TARGET_DATE);
  console.log('Device totals: logCounts=', info?.logCounts, 'userCounts=', info?.userCounts, 'totalPulled=', allRecords.length);

  // ── Phase 4: insert into DRAIS (attendance_raw_events, matched=0) ──
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST, port: process.env.TIDB_PORT,
    user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB, ssl: {},
  });

  let inserted = 0, duplicates = 0, failed = 0;
  const failures = [];
  for (const rec of forensic.records) {
    if (!rec.devicePin || !rec.deviceTimestamp) {
      failed++;
      failures.push({ rec, reason: 'missing pin or timestamp' });
      continue;
    }
    try {
      const punchAt = new Date(rec.deviceTimestamp).toISOString().slice(0, 19).replace('T', ' ');
      const [result] = await conn.execute(
        `INSERT IGNORE INTO attendance_raw_events
           (school_id, device_sn, device_user_id, punch_at, device_reported_time,
            time_source, source, matched, legacy_table, legacy_id)
         VALUES (?, ?, ?, ?, ?, 'device', 'manual', 0, ?, ?)`,
        [SCHOOL_ID, DEVICE_SN, parseInt(rec.devicePin, 10), punchAt, punchAt, 'jipra_k40_emergency_recovery', rec.deviceLogId ?? null],
      );
      if (result.affectedRows > 0) inserted++; else duplicates++;
    } catch (err) {
      failed++;
      failures.push({ rec, reason: err.message });
    }
  }

  console.log('DB INSERT RESULT: inserted=', inserted, 'duplicates(skipped)=', duplicates, 'failed=', failed);
  if (failures.length) {
    fs.writeFileSync(path.join(__dirname, '..', 'jipra-2026-07-17-insert-failures.json'), JSON.stringify(failures, null, 2));
    console.log('Failures written to jipra-2026-07-17-insert-failures.json');
  }

  // ── Phase 5: reconciliation count ──
  const [[{ c: dbCount }]] = await conn.execute(
    `SELECT COUNT(*) c FROM attendance_raw_events WHERE school_id=? AND device_sn=? AND DATE(punch_at)=? AND source='manual' AND legacy_table='jipra_k40_emergency_recovery'`,
    [SCHOOL_ID, DEVICE_SN, TARGET_DATE],
  );

  console.log('\n=== PHASE 5 RECONCILIATION ===');
  console.log('Records for', TARGET_DATE, 'on device:', todayRecords.length);
  console.log('Records in JSON file:', forensic.records.length);
  console.log('Records now in attendance_raw_events for this date/source:', dbCount);

  await conn.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
