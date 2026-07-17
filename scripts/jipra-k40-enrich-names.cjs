#!/usr/bin/env node
/**
 * Enrichment pass: pull user names from K40 (getUsers), then
 * 1) rewrite rawName in jipra-2026-07-17-device-attendance.json
 * 2) UPDATE display_name in attendance_raw_events for the inserted rows
 */
const fs = require('fs');
const path = require('path');
const ZKLib = require('node-zklib');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const IP = '192.168.1.197';
const PORT = 4370;
const SCHOOL_ID = 12004;
const DEVICE_SN = 'GED7254601154';
const JSON_FILE = path.join(__dirname, '..', 'jipra-2026-07-17-device-attendance.json');

(async () => {
  // 1. Pull users from device over TCP
  const zk = new ZKLib(IP, PORT, 15000, 5200);
  await zk.createSocket();
  const usersResult = await zk.getUsers();
  await zk.disconnect();

  const users = usersResult.data || [];
  console.log('Users pulled from device:', users.length);

  // Build PIN → name map (userId field is the PIN/deviceUserId)
  const nameMap = {};
  for (const u of users) {
    const pin = u.userId != null ? String(u.userId) : null;
    if (pin && u.name) nameMap[pin] = u.name.trim();
  }
  console.log('Name map entries:', Object.keys(nameMap).length);

  // 2. Enrich JSON file
  const forensic = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  let namedCount = 0;
  for (const rec of forensic.records) {
    const name = rec.devicePin ? nameMap[String(rec.devicePin)] : null;
    if (name) { rec.rawName = name; namedCount++; }
  }
  forensic.metadata.enrichedAt = new Date().toISOString();
  forensic.metadata.enrichmentSource = 'getUsers() via local TCP';
  forensic.metadata.namedRecords = namedCount;
  fs.writeFileSync(JSON_FILE, JSON.stringify(forensic, null, 2));
  console.log('JSON enriched:', namedCount, '/', forensic.records.length, 'records now have rawName');

  // 3. UPDATE attendance_raw_events display_name for the rows we inserted
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST, port: process.env.TIDB_PORT,
    user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB, ssl: {},
  });

  let updated = 0;
  for (const [pin, name] of Object.entries(nameMap)) {
    const [result] = await conn.execute(
      `UPDATE attendance_raw_events
          SET display_name = ?
        WHERE school_id = ?
          AND device_sn = ?
          AND device_user_id = ?
          AND DATE(punch_at) = '2026-07-17'
          AND legacy_table = 'jipra_k40_emergency_recovery'`,
      [name, SCHOOL_ID, DEVICE_SN, parseInt(pin, 10)],
    );
    updated += result.affectedRows || 0;
  }
  console.log('DB rows updated with display_name:', updated);

  await conn.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
