#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.join(__dirname, '../database/Database/NorthgateschoolEndofTerm3.sql');

console.log('\n📊 EXTRACTING ALL LEARNERS FROM SQL FILE\n');

const sql = fs.readFileSync(SQL_FILE, 'utf8');
const learners = [];

// Extract the students section
const startMarker = "INSERT INTO `students`";
const endMarker = "-- ----";
const startIdx = sql.indexOf(startMarker);
const endIdx = sql.indexOf(endMarker, startIdx);
const section = sql.substring(startIdx, endIdx);

// Split by lines
const lines = section.split('\n');
let captureRows = false;

for (const line of lines) {
  const trimmed = line.trim();
  
  if (trimmed.includes('VALUES')) {
    captureRows = true;
    continue;
  }
  
  if (!captureRows) continue;
  if (trimmed === ');') break;
  if (!trimmed.startsWith('(')) continue;
  
  try {
    // Remove outer parens and trailing comma
    let data = trimmed.slice(1);
    if (data.endsWith(',')) data = data.slice(0, -1);
    data = data.slice(0, -1);
    
    // Split by comma, but respect quoted strings
    const parts = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      
      if (char === "'" && (data[i-1] !== '\\' || data[i-1] === undefined)) {
        inQuote = !inQuote;
        current += char;
      } else if (char === ',' && !inQuote) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    
    // Extract fields
    // 0=id, 1=student_id, 2=firstname, 3=lastname, 4=othername, 5=class_id, 6=stream_id, 7=DOB, 8=gender
    if (parts.length >= 9) {
      const student_id = parts[1]?.replace(/'/g, '')?.trim() || '';
      const firstname = parts[2]?.replace(/'/g, '')?.trim() || '';
      const lastname = parts[3]?.replace(/'/g, '')?.trim() || '';
      const othername = parts[4]?.replace(/'/g, '')?.trim() || '';
      const class_id = parseInt(parts[5]?.replace(/'/g, '')?.trim() || '0');
      const gender = parts[8]?.replace(/'/g, '')?.trim() || 'M';
      
      if (student_id && firstname) {
        learners.push({
          student_id,
          firstname,
          lastname,
          othername,
          class_id,
          gender
        });
      }
    }
  } catch (e) {}
}

// Remove duplicates by student_id
const seen = new Set();
const unique = [];
for (const l of learners) {
  if (!seen.has(l.student_id)) {
    unique.push(l);
    seen.add(l.student_id);
  }
}

console.log(`✅ EXTRACTED: ${unique.length} UNIQUE LEARNERS\n`);

// Save CSV
const csv = ['#,student_id,firstname,lastname,othername,class_id,gender'];
unique.forEach((l, i) => {
  csv.push(`${i+1},"${l.student_id}","${l.firstname}","${l.lastname}","${l.othername}",${l.class_id},"${l.gender}"`);
});
const csvFile = path.join(__dirname, '../northgate_all_learners.csv');
fs.writeFileSync(csvFile, csv.join('\n'));
console.log(`📄 Saved: ${csvFile}\n`);

// Class mapping
const classMap = {1: 'P7', 2: 'Baby', 3: 'Middle', 4: 'Top', 5: 'P1', 6: 'P2', 7: 'P3', 8: 'P4', 9: 'P5', 10: 'P6', 0: 'Unassigned'};
const counts = {};
unique.forEach(l => {
  const cn = classMap[l.class_id] || `Class${l.class_id}`;
  counts[cn] = (counts[cn] || 0) + 1;
});

console.log('📊 BREAKDOWN BY CLASS:');
Object.entries(counts).forEach(([cn, c]) => {
  console.log(`  ${cn}: ${c} learners`);
});

console.log('\n🔍 FIRST 20 LEARNERS:');
unique.slice(0, 20).forEach((l, i) => {
  const cn = classMap[l.class_id] || l.class_id;
  console.log(`${(i+1).toString().padStart(3, ' ')}. ${l.firstname.padEnd(15)} ${l.lastname.padEnd(15)} (${l.student_id}) - ${cn}`);
});

console.log(`\n✅ Total: ${unique.length} learners extracted and ready for import\n`);
