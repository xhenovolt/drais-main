import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const apiDir = path.join(projectRoot, 'src/app/api');

const CRITICAL_PATTERNS = [
  { regex: /SELECT.*FROM\s+(\w+).*WHERE.*(?<!school_id.*=|school_id\s*=)/i, severity: 'CRITICAL', msg: 'Query missing school_id filter' },
  { regex: /WHERE\s+s\.id\s*=.*(?!school_id)/i, severity: 'CRITICAL', msg: 'WHERE s.id only - no school_id check' },
  { regex: /execute.*SELECT.*FROM\s+students.*WHERE\s+id\s*=\s*\?(?!\s*AND.*school_id)/i, severity: 'CRITICAL', msg: 'Student query by ID only, no school_id' },
  { regex: /SELECT.*FROM\s+\w+.*WHERE\s+\w+\.id\s*=\s*\?(?!\s*AND.*school_id)/i, severity: 'HIGH', msg: 'ID-only WHERE clause without school_id AND filter' }
];

const SAFE_PATTERNS = [
  { regex: /school_id.*=|schoolId.*WHERE|s\.school_id\s*=\s*\?|WHERE.*school_id/i, msg: 'Has school_id filter' }
];

function walkDir(dir) {
  let files = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      files = files.concat(walkDir(filePath));
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      files.push(filePath);
    }
  });
  return files;
}

const files = walkDir(apiDir);
const results = { critical: [], high: [], safe: [] };

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let risky = false;

  CRITICAL_PATTERNS.forEach(pattern => {
    if (pattern.regex.test(content)) {
      results.critical.push({ file: path.relative(projectRoot, file), issue: pattern.msg });
      risky = true;
    }
  });

  if (risky) {
    results.critical.forEach(r => {
      if (r.file === path.relative(projectRoot, file)) {
        const lines = content.split('\n');
        const firstMatch = lines.findIndex(line => line.includes('SELECT') || line.includes('WHERE'));
        if (firstMatch >= 0) {
          r.lineNumber = firstMatch + 1;
        }
      }
    });
  } else if (SAFE_PATTERNS.some(p => p.regex.test(content))) {
    results.safe.push(path.relative(projectRoot, file));
  }
});

console.log(`\n🚨 PHASE 2 SECURITY AUDIT RESULTS\n`);
console.log(`📊 SUMMARY: ${results.critical.length} CRITICAL | ${results.high.length} HIGH | ${results.safe.length} SAFE`);

if (results.critical.length > 0) {
  console.log(`\n❌ CRITICAL VULNERABILITIES (${results.critical.length}):`);
  results.critical.forEach(r => {
    console.log(`  - ${r.file}${r.lineNumber ? ` (Line ${r.lineNumber})` : ''}`);
    console.log(`    Issue: ${r.issue}`);
  });
}

if (results.safe.length > 0) {
  console.log(`\n✅ SAFE QUERIES (Sample ${Math.min(5, results.safe.length)}):`);
  results.safe.slice(0, 5).forEach(f => console.log(`  - ${f}`));
  if (results.safe.length > 5) console.log(`  ... and ${results.safe.length - 5} more`);
}

process.exit(results.critical.length > 0 ? 1 : 0);
