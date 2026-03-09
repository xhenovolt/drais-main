#!/usr/bin/env node

/**
 * DRAIS V1 - Multi-Tenant Isolation Validator
 * Automatically scans API routes for missing school_id filtering
 */

import fs from 'fs';
import path from 'path';

const API_DIR = './src/app/api';
const REPORT_FILE = './multi-tenant-compliance-report.txt';

// Patterns that indicate potential multi-tenant violations
const VIOLATION_PATTERNS = [
  {
    name: 'SELECT without school_id filter',
    pattern: /SELECT\s+.*\s+FROM\s+(\w+).*WHERE(?!.*school_id)/gi,
    severity: 'HIGH',
  },
  {
    name: 'UPDATE without school_id filter',
    pattern: /UPDATE\s+(\w+)\s+SET.*WHERE(?!.*school_id)/gi,
    severity: 'CRITICAL',
  },
  {
    name: 'DELETE without school_id filter',
    pattern: /DELETE\s+FROM\s+(\w+).*WHERE(?!.*school_id)/gi,
    severity: 'CRITICAL',
  },
  {
    name: 'SELECT without WHERE clause',
    pattern: /SELECT\s+.*\s+FROM\s+(\w+)(?!.*WHERE)/gi,
    severity: 'HIGH',
  },
];

// Tables that should always have school_id filtering
const TABLES_REQUIRING_SCHOOL_ID = [
  'students', 'staff', 'classes', 'terms', 'academic_years',
  'enrollments', 'student_attendance', 'class_results', 'results',
  'device_user_mappings', 'biometric_devices', 'device_configs',
  'finance_payments', 'fee_templates', 'invoices', 'receipts',
  'tahfiz_groups', 'tahfiz_records', 'promotions',
  'result_types', 'subjects', 'departments', 'roles',
];

// Tables that don't need school_id (system-wide)
const SYSTEM_TABLES = [
  'schools', 'db_migrations', 'system_logs', 'information_schema',
];

const results = {
  totalFiles: 0,
  scannedFiles: 0,
  violations: [],
  safeFiles: [],
};

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  
  VIOLATION_PATTERNS.forEach(({ name, pattern, severity }) => {
    const matches = [...content.matchAll(pattern)];
    
    matches.forEach(match => {
      const tableName = match[1];
      
      // Skip if it's a system table
      if (SYSTEM_TABLES.some(t => tableName.toLowerCase().includes(t.toLowerCase()))) {
        return;
      }
      
      // Check if table requires school_id
      const requiresSchoolId = TABLES_REQUIRING_SCHOOL_ID.some(t => 
        tableName.toLowerCase().includes(t.toLowerCase())
      );
      
      if (requiresSchoolId || severity === 'CRITICAL') {
        violations.push({
          file: filePath,
          line: findLineNumber(content, match.index),
          pattern: name,
          severity,
          query: match[0].substring(0, 100) + '...',
          table: tableName,
        });
      }
    });
  });
  
  return violations;
}

function findLineNumber(content, index) {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

function generateReport() {
  console.log('🔍 Scanning API routes for multi-tenant violations...\n');
  
  const files = getAllFiles(API_DIR);
  results.totalFiles = files.length;
  
  files.forEach(file => {
    results.scannedFiles++;
    const violations = scanFile(file);
    
    if (violations.length > 0) {
      results.violations.push(...violations);
    } else {
      results.safeFiles.push(file);
    }
  });
  
  // Console output
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DRAIS V1 - MULTI-TENANT COMPLIANCE REPORT');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`📁 Files Scanned: ${results.scannedFiles}`);
  console.log(`✅ Compliant Files: ${results.safeFiles.length}`);
  console.log(`❌ Files with Violations: ${results.violations.length > 0 ? new Set(results.violations.map(v => v.file)).size : 0}`);
  console.log(`🔴 Total Violations: ${results.violations.length}\n`);
  
  // Group by severity
  const critical = results.violations.filter(v => v.severity === 'CRITICAL');
  const high = results.violations.filter(v => v.severity === 'HIGH');
  const medium = results.violations.filter(v => v.severity === 'MEDIUM');
  
  console.log(`🔴 CRITICAL: ${critical.length}`);
  console.log(`🟠 HIGH: ${high.length}`);
  console.log(`🟡 MEDIUM: ${medium.length}\n`);
  
  // Detailed violations
  if (results.violations.length > 0) {
    console.log('───────────────────────────────────────────────────────────');
    console.log('  VIOLATIONS DETECTED');
    console.log('───────────────────────────────────────────────────────────\n');
    
    results.violations.forEach((v, index) => {
      console.log(`${index + 1}. [${v.severity}] ${v.file}`);
      console.log(`   Line ${v.line}: ${v.pattern}`);
      console.log(`   Table: ${v.table}`);
      console.log(`   Query: ${v.query}`);
      console.log('');
    });
  }
  
  // Recommendations
  console.log('───────────────────────────────────────────────────────────');
  console.log('  RECOMMENDATIONS');
  console.log('───────────────────────────────────────────────────────────\n');
  
  if (results.violations.length === 0) {
    console.log('✅ No violations detected! System is multi-tenant compliant.\n');
  } else {
    console.log('⚠️  Add school_id filtering to ALL queries that access tenant data:\n');
    console.log('   const { searchParams } = new URL(req.url);');
    console.log('   const schoolId = parseInt(searchParams.get(\'school_id\') || \'1\');\n');
    console.log('   Then update queries:');
    console.log('   WHERE table.school_id = ? AND [other conditions]\n');
    
    console.log('🔧 Priority Fix Order:');
    console.log('   1. CRITICAL: UPDATE/DELETE queries (data loss risk)');
    console.log('   2. HIGH: Finance/Student data queries (privacy risk)');
    console.log('   3. MEDIUM: Reporting queries (data leakage risk)\n');
  }
  
  // Save to file
  const reportContent = `
DRAIS V1 - Multi-Tenant Compliance Report
Generated: ${new Date().toISOString()}

FILES SCANNED: ${results.scannedFiles}
COMPLIANT: ${results.safeFiles.length}
VIOLATIONS: ${results.violations.length}

SEVERITY BREAKDOWN:
- CRITICAL: ${critical.length}
- HIGH: ${high.length}
- MEDIUM: ${medium.length}

DETAILED VIOLATIONS:
${results.violations.map((v, i) => `
${i + 1}. [${v.severity}] ${v.file}
   Line ${v.line}: ${v.pattern}
   Table: ${v.table}
   Query: ${v.query}
`).join('\n')}

RECOMMENDATIONS:
${results.violations.length === 0 
  ? '✅ No violations detected! System is multi-tenant compliant.'
  : `
⚠️  Multi-tenant violations detected. Add school_id filtering to all queries.

Fix Pattern:
  const { searchParams } = new URL(req.url);
  const schoolId = parseInt(searchParams.get('school_id') || '1');
  
  // Then update queries:
  WHERE table.school_id = ? AND [other conditions]

Priority:
  1. Fix CRITICAL violations first (UPDATE/DELETE)
  2. Fix HIGH violations (student/finance data)
  3. Fix MEDIUM violations (reporting queries)
`}
`;
  
  fs.writeFileSync(REPORT_FILE, reportContent);
  console.log(`📄 Full report saved to: ${REPORT_FILE}\n`);
  
  // Exit code
  process.exit(results.violations.length > 0 ? 1 : 0);
}

// Run the validator
generateReport();
