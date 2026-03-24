#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql');

console.log('\n📊 EXTRACTING ALL LEARNERS FROM SQL FILE\n');

const sql = fs.readFileSync(SQL_FILE, 'utf8');
const learners = [];

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
        if (content[i] === "'" && content[i-1] !== '\\') quote = !quote;
        else if (content[i] === ',' && !quote) {
          fields.push(curr.trim());
          curr = '';
          continue;
        }
        curr += content[i];
      }
      fields.push(curr.trim());
      
      if (fields.length < 6) continue;
      
      const sid = fields[1].replace(/'/g, '').trim();
      const fname = fields[2].replace(/'/g, '').trim();
      const lname = fields[3].replace(/'/g, '').trim();
      const cid = parseInt(fields[5] || '1');
      
      if (!sid || !fname) continue;
      
      learners.push({
        student_id: sid,
        first_name: fname,
        last_name: lname,
        class_id: cid,
        gender: fname.toLowerCase().endsWith('a') ? 'F' : 'M'
      });
    } catch (e) {}
  }
}

// Save to CSV for review
const csv = ['student_id,first_name,last_name,class_id,gender'];
learners.forEach(l => {
  csv.push(`"${l.student_id}","${l.first_name}","${l.last_name}",${l.class_id},"${l.gender}"`);
});

const csvFile = path.join(__dirname, '../northgate_all_learners.csv');
fs.writeFileSync(csvFile, csv.join('\n'));

// Also save as JSON for processing
const jsonFile = path.join(__dirname, '../northgate_all_learners.json');
fs.writeFileSync(jsonFile, JSON.stringify(learners, null, 2));

console.log(`✅ EXTRACTED: ${learners.length} LEARNERS\n`);
console.log(`Files saved:`);
console.log(`  📄 ${csvFile}`);
console.log(`  📋 ${jsonFile}\n`);

// Show summary
const classCounts = {};
learners.forEach(l => {
  classCounts[l.class_id] = (classCounts[l.class_id] || 0) + 1;
});

console.log('📊 Breakdown by class:');
Object.keys(classCounts).sort((a, b) => a - b).forEach(cid => {
  console.log(`  Class ${cid}: ${classCounts[cid]} learners`);
});

console.log('\n🔍 FIRST 10 LEARNERS:');
learners.slice(0, 10).forEach((l, i) => {
  console.log(`${i+1}. ${l.first_name} ${l.last_name} (ID: ${l.student_id}) - Class ${l.class_id}`);
});

console.log('\n✅ Ready for manual review!\n');
