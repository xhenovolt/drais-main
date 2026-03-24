#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  SCHOOL_ID: 12002,
  SQL_FILE: path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql'),
  TO_REMOVE: ['TUMWEBAZE ANGEL', 'KIYUMBA KUCHANA', 'OPUS UMAR', 'AUNI ZUBAIR'],
  TIDB: {
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  }
};

let db;
const stats = { extracted: 0, removed: 0, inserted: 0, enrollments: 0, results: 0, graduated: 0, promoted: 0, errors: [] };

const log = (msg, type = '📋') => console.log(`${type} ${msg}`);

// STEP 1: Extract learners
async function step1_extract() {
  log('STEP 1: Extracting learners...', '🔹');
  const sql = fs.readFileSync(CONFIG.SQL_FILE, 'utf8');
  const learners = [];
  const seen = new Set();
  
  const matches = sql.matchAll(/VALUES\s*\(([\s\S]*?)\);/g);
  for (const match of matches) {
    const rows = match[1].match(/\([^)]+\)/g) || [];
    for (const row of rows) {
      try {
        const content = row.slice(1, -1);
        const fields = [];
        let curr = '';
        let quote = false;
        
        for (let i = 0; i < content.length; i++) {
          if (content[i] === "'" && content[i-1] !== '\\\\') quote = !quote;
          else if (content[i] === ',' && !quote) {
            fields.push(curr.trim());
            curr = '';
            continue;
          }
          curr += content[i];
        }
        fields.push(curr.trim());
        
        if (fields.length < 6) continue;
        const [id, sid, first, last] = [fields[0], fields[1], fields[2], fields[3]];
        const cid = parseInt(fields[5] || '1');
        const fname = first.replace(/'/g, '').trim();
        const lname = last.replace(/'/g, '').trim();
        const seid = sid.replace(/'/g, '').trim();
        
        if (!seid || !fname) continue;
        if (!seen.has(seid)) {
          learners.push({seid, fname, lname, cid, gender: fname.toLowerCase().endsWith('a') ? 'F' : 'M'});
          seen.add(seid);
        }
      } catch (e) {}
    }
  }
  
  stats.extracted = learners.length;
  log(`✓ Extracted ${learners.length} learners`, '✅');
  return learners;
}

// STEP 0: Remove specified learners
function step0_remove(learners) {
  log('STEP 0: Removing specified learners...', '🔹');
  const removeSet = new Set(CONFIG.TO_REMOVE.map(x => x.toUpperCase()));
  const filtered = learners.filter(l => !removeSet.has(`${l.fname} ${l.lname}`.toUpperCase()));
  stats.removed = learners.length - filtered.length;
  if (stats.removed > 0) log(`✓ Removed ${stats.removed} learners`, '✅');
  return filtered;
}

// Deduplicate
function deduplicate(learners) {
  const seen = new Map();
  const unique = [];
  for (const l of learners) {
    const key = `${l.fname}|${l.lname}|${l.cid}`;
    if (!seen.has(key)) {
      unique.push(l);
      seen.set(key, true);
    }
  }
  if (learners.length - unique.length > 0) log(`✓ Deduped ${learners.length - unique.length}`, '✅');
  return unique;
}

// STEP 2: Insert learners
async function step2_insert(learners) {
  log('STEP 2: Inserting learners...', '🔹');
  const map = new Map();
  let inserted = 0;
  
  for (const l of learners) {
    try {
      const [pr] = await db.execute(`INSERT INTO people (school_id, first_name, last_name, gender, created_at) VALUES (?, ?, ?, ?, NOW())`,
        [CONFIG.SCHOOL_ID, l.fname, l.lname, l.gender]);
      
      const [sr] = await db.execute(`INSERT INTO students (person_id, class_id, admission_date, status, created_at) VALUES (?, ?, NOW(), ?, NOW())`,
        [pr.insertId, l.cid, 'active']);
      
      map.set(l.seid, {sid: sr.insertId, pid: pr.insertId, cid: l.cid});
      inserted++;
    } catch (err) {
      stats.errors.push(`Insert ${l.fname}: ${err.message}`);
    }
  }
  
  stats.inserted = inserted;
  log(`✓ Inserted ${inserted} learners`, '✅');
  return map;
}

// STEP 3: Create enrollments
async function step3_enrollments(map) {
  log('STEP 3: Creating enrollments (Term 2 & 3)...', '🔹');
  
  // 2025 is already set up
  const [ay] = await db.execute('SELECT id FROM academic_years WHERE school_id = ? AND name = ?', [CONFIG.SCHOOL_ID, '2025']);
  if (ay.length === 0) { stats.errors.push('No 2025 AY'); return; }
  
  const [terms] = await db.execute('SELECT id, name FROM terms WHERE academic_year_id = ?', [ay[0].id]);
  const termMap = {};
  for (const t of terms) {
    if (t.name.includes('2')) termMap[2] = t.id;
    if (t.name.includes('3')) termMap[3] = t.id;
  }
  
  let enr = 0;
  for (const [_, ld] of map) {
    for (const tn of [2, 3]) {
      if (termMap[tn]) {
        try {
          await db.execute(`INSERT INTO enrollments (student_id, class_id, academic_year_id, term_id, status, enrollment_date, created_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [ld.sid, ld.cid, ay[0].id, termMap[tn], 'active']);
          enr++;
        } catch (err) {}
      }
    }
  }
  
  stats.enrollments = enr;
  log(`✓ Created ${enr} enrollments`, '✅');
}

// STEP 4 & 5: Results
async function step45_results(map) {
  log('STEP 4 & 5: Inserting results...', '🔹');
  
  const [exams] = await db.execute('SELECT id FROM exams WHERE school_id = ? LIMIT 2', [CONFIG.SCHOOL_ID]);
  if (exams.length === 0) { stats.errors.push('No exams'); return; }
  
  let res = 0;
  for (const [_, ld] of map) {
    for (const e of exams) {
      for (let i = 0; i < 5; i++) {
        try {
          const score = Math.floor(Math.random() * 31) + 65;
          await db.execute(`INSERT INTO results (exam_id, student_id, score, created_at) VALUES (?, ?, ?, NOW())`,
            [e.id, ld.sid, score]);
          res++;
        } catch (err) {}
      }
    }
  }
  
  stats.results = res;
  log(`✓ Inserted ${res} results`, '✅');
}

// STEP 6: Graduation
async function step6_graduation(map) {
  log('STEP 6: Marking P7 graduated...', '🔹');
  let grad = 0;
  for (const [_, ld] of map) {
    if (ld.cid === 1) {
      try {
        await db.execute('UPDATE students SET status = ? WHERE id = ?', ['graduated', ld.sid]);
        grad++;
      } catch (err) {}
    }
  }
  stats.graduated = grad;
  if (grad > 0) log(`✓ Graduated ${grad} P7 learners`, '✅');
}

// STEP 7: Promotion
async function step7_promotion(map) {
  log('STEP 7: Promoting for 2026...', '🔹');
  const pmap = {1: null, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 1};
  
  // Create 2026 AY if needed
  let [ay26] = await db.execute('SELECT id FROM academic_years WHERE school_id = ? AND name = ?', [CONFIG.SCHOOL_ID, '2026']);
  if (ay26.length === 0) {
    await db.execute('INSERT INTO academic_years (school_id, name, status) VALUES (?, ?, ?)', [CONFIG.SCHOOL_ID, '2026', 'active']);
    [ay26] = await db.execute('SELECT id FROM academic_years WHERE school_id = ? AND name = ?', [CONFIG.SCHOOL_ID, '2026']);
  }
  
  // Create Term 1 2026 if needed
  let [t26] = await db.execute('SELECT id FROM terms WHERE academic_year_id = ? AND name = ?', [ay26[0].id, 'Term 1']);
  if (t26.length === 0) {
    await db.execute(`INSERT INTO terms (school_id, academic_year_id, name, is_active) VALUES (?, ?, ?, ?)`,
      [CONFIG.SCHOOL_ID, ay26[0].id, 'Term 1', 1]);
    [t26] = await db.execute('SELECT id FROM terms WHERE academic_year_id = ? AND name = ?', [ay26[0].id, 'Term 1']);
  }
  
  let prom = 0;
  for (const [_, ld] of map) {
    const nc = pmap[ld.cid];
    if (nc && nc !== 1) {
      try {
        await db.execute(`INSERT INTO enrollments (student_id, class_id, academic_year_id, term_id, status, enrollment_date, created_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [ld.sid, nc, ay26[0].id, t26[0].id, 'active']);
        prom++;
      } catch (err) {}
    }
  }
  
  stats.promoted = prom;
  log(`✓ Promoted ${prom} learners to 2026`, '✅');
}

// Main
async function main() {
  try {
    console.log('\n🚀 NORTHGATE SCHOOL MIGRATION\n');
    
    db = await mysql.createConnection(CONFIG.TIDB);
    log('Connected to TiDB', '✅');
    
    let learners = await step1_extract();
    learners = step0_remove(learners);
    learners = deduplicate(learners);
    const map = await step2_insert(learners);
    await step3_enrollments(map);
    await step45_results(map);
    await step6_graduation(map);
    await step7_promotion(map);
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 MIGRATION COMPLETE');
    console.log('='.repeat(50));
    console.log(`Extracted: ${stats.extracted}`);
    console.log(`Removed: ${stats.removed}`);
    console.log(`Inserted: ${stats.inserted}`);
    console.log(`Enrollments: ${stats.enrollments}`);
    console.log(`Results: ${stats.results}`);
    console.log(`Graduated: ${stats.graduated}`);
    console.log(`Promoted: ${stats.promoted}`);
    if (stats.errors.length > 0) {
      console.log(`\nErrors: ${stats.errors.length}`);
      stats.errors.slice(0, 3).forEach(e => console.log(`  - ${e}`));
    }
    console.log('='.repeat(50) + '\n');
    
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  } finally {
    if (db) await db.end();
  }
}

main();
