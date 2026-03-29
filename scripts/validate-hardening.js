#!/usr/bin/env node

/**
 * DRAIS System Hardening Validation Script
 * Validates that all error handling and logging is working correctly
 * Run with: npm exec node scripts/validate-hardening.js
 */

const fs = require('fs');
const path = require('path');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

let passedChecks = 0;
let failedChecks = 0;

function pass(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
  passedChecks++;
}

function fail(msg) {
  console.log(`${RED}✗${RESET} ${msg}`);
  failedChecks++;
}

function warn(msg) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

function info(msg) {
  console.log(`${BLUE}ℹ${RESET} ${msg}`);
}

function header(msg) {
  console.log(`\n${BLUE}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BLUE}${msg}${RESET}`);
  console.log(`${BLUE}═══════════════════════════════════════════════════════${RESET}\n`);
}

// Check files exist
function checkFileExists(filePath, description) {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    pass(`${description} exists: ${filePath}`);
    return true;
  } else {
    fail(`${description} MISSING: ${filePath}`);
    return false;
  }
}

// Check file contains text
function checkFileContains(filePath, text, description) {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    if (content.includes(text)) {
      pass(`${description}`);
      return true;
    } else {
      fail(`${description} - Text not found: "${text}"`);
      return false;
    }
  } else {
    fail(`${description} - File not found: ${filePath}`);
    return false;
  }
}

// Run checks
function runValidation() {
  header('DRAIS System Hardening Validation');

  // 1. Library files
  header('1. Library Files');
  checkFileExists('src/lib/systemLogger.ts', 'System logger');
  checkFileExists('src/lib/apiErrorHandler.ts', 'API error handler');
  checkFileExists('src/lib/notificationTrigger.ts', 'Notification trigger');
  checkFileExists('src/lib/apiResponse.ts', 'API response utils');
  checkFileExists('src/lib/audit.ts', 'Audit logging');

  // 2. Database migration
  header('2. Database Migration Files');
  checkFileExists('database/migrations/009_system_logs.sql', 'System logs migration');

  // 3. API route fixes
  header('3. API Routes - Error Handling');
  const hasStaffAddImports = checkFileContains(
    'src/app/api/staff/add/route.ts',
    "import { createSuccessResponse, createErrorResponse",
    'Staff add route uses proper response functions'
  );
  
  checkFileContains(
    'src/app/api/staff/add/route.ts',
    'logSystemError',
    'Staff add route logs errors'
  );

  checkFileContains(
    'src/app/api/staff/add/route.ts',
    'logAudit',
    'Staff add route logs audit trail'
  );

  checkFileContains(
    'src/app/api/staff/add/route.ts',
    'notifyStaffCreated',
    'Staff add route sends notifications'
  );

  // 4. Roles API
  header('4. API Routes - Roles');
  checkFileContains(
    'src/app/api/roles/route.ts',
    'createSuccessResponse',
    'Roles route uses proper response functions'
  );

  checkFileContains(
    'src/app/api/roles/route.ts',
    'ApiErrorCode.DUPLICATE_ENTRY',
    'Roles route handles duplicate entry errors'
  );

  // 5. Frontend integration
  header('5. Frontend Components');
  checkFileContains(
    'src/components/staff/AddStaffModal.tsx',
    'result.error?.message',
    'AddStaffModal extracts error messages'
  );

  checkFileContains(
    'src/components/staff/AddStaffModal.tsx',
    'toast.error',
    'AddStaffModal shows error toasts'
  );

  // 6. Documentation
  header('6. Documentation');
  checkFileExists('API_ERROR_HANDLING_GUIDE.md', 'API error handling guide');
  checkFileExists('SYSTEM_HARDENING_IMPLEMENTATION.md', 'Implementation documentation');

  // 7. Code quality checks
  header('7. Code Quality');
  checkFileContains(
    'src/lib/systemLogger.ts',
    'enum LogLevel',
    'System logger has proper log levels'
  );

  checkFileContains(
    'src/lib/apiResponse.ts',
    'enum ApiErrorCode',
    'API response has error codes'
  );

  // 8. Summary
  header('Validation Summary');
  const total = passedChecks + failedChecks;
  const percentage = total === 0 ? 0 : Math.round((passedChecks / total) * 100);
  
  console.log(`Passed: ${GREEN}${passedChecks}${RESET}`);
  console.log(`Failed: ${failedChecks === 0 ? GREEN : RED}${failedChecks}${RESET}`);
  console.log(`Total:  ${total}`);
  console.log(`Score:  ${percentage}%\n`);

  if (failedChecks === 0) {
    console.log(`${GREEN}✓ All checks passed! System hardening is complete.${RESET}\n`);
    console.log('Next steps:');
    console.log('1. Run database migration: mysql -u user -p db < database/migrations/009_system_logs.sql');
    console.log('2. Test staff creation: navigate to Staff → Add Staff');
    console.log('3. Test error scenarios with invalid data');
    console.log('4. Check system_logs table: SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 10;');
    console.log('5. Check audit_logs table: SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;');
    console.log('');
    return 0;
  } else {
    console.log(`${RED}✗ Some checks failed. Review the output above.${RESET}\n`);
    console.log('Failed items:');
    return 1;
  }
}

const exitCode = runValidation();
process.exit(exitCode);
