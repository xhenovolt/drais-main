#!/usr/bin/env node
/**
 * Re-seed zk_user_mapping with the 5 current device users,
 * matching them to students by name prefix lookup.
 */
'use strict';

const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

// load .env.local
const lines = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n');
for (const l of lines) {
  const eq = l.indexOf('=');
  if (eq > 0 && !l.trim().startsWith('#')) {
    const k = l.slice(0, eq).trim();
    const v = l.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const DEVICE_SN = 'GED7254601154';
const SCHOOL_ID = 8002;

// Pulled from live getUsers() above
const DEVICE_USERS = [
  { device_user_id: 1,  name: 'ABDULLAH MUSA MUGAYA' },
  { device_user_id: 14, name: 'ABALINABYO CYNTHIA' },
  { device_user_id: 17, name: 'ABBO ANJELLINA MERCe' },
  { device_user_id: 21, name: 'ABAKAWAYA HERBERT' },
  { device_user_id: 22, name: 'hamuza ibrahim' },
];

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.TIDB_HOST,
    port:     parseInt(process.env.TIDB_PORT || '4000', 10),
    user:     process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl:      { rejectUnauthorized: false },
  });

  // Debug: sample what's actually in the DB
  const [sample] = await conn.execute(
    `SELECT s.id, s.school_id, p.first_name, p.last_name
     FROM students s JOIN people p ON s.person_id = p.id
     WHERE s.deleted_at IS NULL
     LIMIT 10`,
  );
  console.log('Sample students in DB:');
  sample.forEach(r => console.log(`  school=${r.school_id} id=${r.id} "${r.first_name}" "${r.last_name}"`));
  console.log('');

  for (const u of DEVICE_USERS) {
    const firstName = u.name.split(' ')[0];
    const lastName  = u.name.split(' ').slice(-1)[0];
    const [rows] = await conn.execute(
      `SELECT s.id, p.first_name, p.last_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.deleted_at IS NULL
         AND (p.first_name LIKE ? OR p.last_name LIKE ?
              OR p.first_name LIKE ? OR p.last_name LIKE ?)
       LIMIT 1`,
      [`%${firstName}%`, `%${firstName}%`, `%${lastName}%`, `%${lastName}%`],
    );
    const student = rows[0];

    if (student) {
      await conn.execute(
        `INSERT INTO zk_user_mapping
           (school_id, student_id, device_user_id, user_type, device_sn)
         VALUES (?, ?, ?, 'student', ?)
         ON DUPLICATE KEY UPDATE
           student_id = VALUES(student_id),
           device_sn  = VALUES(device_sn)`,
        [SCHOOL_ID, student.id, u.device_user_id, DEVICE_SN],
      );
      console.log(`✓ slot ${u.device_user_id} "${u.name}" → student_id=${student.id} (${student.first_name} ${student.last_name})`);
    } else {
      await conn.execute(
        `INSERT INTO zk_user_mapping
           (school_id, student_id, device_user_id, user_type, device_sn)
         VALUES (?, NULL, ?, 'student', ?)
         ON DUPLICATE KEY UPDATE device_sn = VALUES(device_sn)`,
        [SCHOOL_ID, u.device_user_id, DEVICE_SN],
      );
      console.log(`! slot ${u.device_user_id} "${u.name}" → no DB match, inserted unmapped`);
    }
  }

  await conn.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
