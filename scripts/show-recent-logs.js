#!/usr/bin/env node
'use strict';
const mysql=require('mysql2/promise'),fs=require('fs'),path=require('path');
const lines=fs.readFileSync(path.join(__dirname,'..', '.env.local'),'utf8').split('\n');
for(const l of lines){const t=l.trim();if(!t||t.startsWith('#'))continue;const eq=t.indexOf('=');if(eq<0)continue;const k=t.slice(0,eq).trim(),v=t.slice(eq+1).trim().replace(/^["']|["']$/g,'');if(!process.env[k])process.env[k]=v;}

(async()=>{
  const c=await mysql.createConnection({
    host:process.env.TIDB_HOST,port:parseInt(process.env.TIDB_PORT||4000),
    user:process.env.TIDB_USER,password:process.env.TIDB_PASSWORD,
    database:process.env.TIDB_DB,ssl:{rejectUnauthorized:false}
  });

  console.log('=== LAST 30 RAW LOGS (ADMS traffic) ===');
  const [raw]=await c.execute(
    `SELECT id, device_sn, http_method, query_string,
            LEFT(raw_body,500) AS body, created_at
     FROM zk_raw_logs ORDER BY id DESC LIMIT 30`
  );
  raw.forEach(x=>console.log(JSON.stringify({id:x.id,sn:x.device_sn,m:x.http_method,qs:x.query_string,body:x.body,ts:x.created_at})));

  console.log('\n=== LAST 20 ATTENDANCE PUNCHES ===');
  const [att]=await c.execute(
    `SELECT id, device_sn, device_user_id, student_id, staff_id,
            check_time, matched, created_at
     FROM zk_attendance_logs ORDER BY id DESC LIMIT 20`
  );
  att.forEach(x=>console.log(JSON.stringify(x)));

  console.log('\n=== ZK_USER_MAPPING (all) ===');
  const [map]=await c.execute(`SELECT * FROM zk_user_mapping ORDER BY id DESC LIMIT 30`);
  map.forEach(x=>console.log(JSON.stringify(x)));

  await c.end();
})().catch(e=>console.error('FATAL:',e.message));
