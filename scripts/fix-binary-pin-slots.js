#!/usr/bin/env node
/**
 * Queue DATA UPDATE USERINFO commands for the broken slots (2 and 3)
 * so the device restores ASCII PINs at the next heartbeat.
 */
'use strict';
const mysql=require('mysql2/promise'),fs=require('fs'),path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..', '.env.local'),'utf8').split('\n');
for(const l of lines){const t=l.trim();if(!t||t.startsWith('#'))continue;const eq=t.indexOf('=');if(eq<0)continue;const k=t.slice(0,eq).trim(),v=t.slice(eq+1).trim().replace(/^["']|["']$/g,'');if(!process.env[k])process.env[k]=v;}

const DEVICE_SN = 'GED7254601154';

async function main() {
  const c = await mysql.createConnection({
    host:process.env.TIDB_HOST, port:parseInt(process.env.TIDB_PORT||4000),
    user:process.env.TIDB_USER, password:process.env.TIDB_PASSWORD,
    database:process.env.TIDB_DB, ssl:{rejectUnauthorized:false}
  });

  // Get slots 2+3 from zk_user_mapping + student name
  const [maps] = await c.execute(
    `SELECT m.device_user_id, m.school_id, m.student_id,
            p.first_name, p.last_name
     FROM zk_user_mapping m
     LEFT JOIN students s ON s.id = m.student_id
     LEFT JOIN people p ON s.person_id = p.id
     WHERE m.device_user_id IN ('2','3')
     ORDER BY m.id DESC`
  );
  console.log('Slots to fix:', maps.map(r=>({slot:r.device_user_id,sid:r.student_id,name:r.first_name+' '+r.last_name})));

  for (const row of maps) {
    const slot = parseInt(row.device_user_id, 10);
    const rawName = `${row.first_name||''} ${row.last_name||''}`.trim() || `S${row.student_id}`;
    const zkName = rawName.replace(/[^\x20-\x7E]/g,'').slice(0,23).trim();
    // DATA UPDATE USERINFO format — restores ASCII PIN on device
    const cmd = `DATA UPDATE USERINFO PIN=${slot}\tName=${zkName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000\tVerify=0\tVoiceVerify=0`;
    const [res] = await c.execute(
      `INSERT INTO zk_device_commands (device_sn, command, priority, status, school_id, expires_at)
       VALUES (?, ?, 8, 'pending', ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
      [DEVICE_SN, cmd, row.school_id]
    );
    console.log(`✓ Queued slot=${slot} name="${zkName}" cmd_id=${res.insertId}`);
  }

  await c.end();
  console.log('\nDone — device will receive fixes at next heartbeat (~30s).');
}
main().catch(e=>console.error('FATAL:',e.message));
