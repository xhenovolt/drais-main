#!/usr/bin/env node

/**
 * DRAIS V1 - Complete API Endpoint Audit Script
 * Date: March 8, 2026
 * Purpose: Test all API endpoints for errors, performance, and multi-tenant compliance
 */

import http from 'http';

const BASE_URL = 'http://localhost:3003';
const TEST_SCHOOL_ID = 1;
const TEST_AUTH_COOKIE = ''; // Will be populated after login

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

async function makeRequest(path, method = 'GET', body = null, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const startTime = Date.now();
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = await response.text();
    }

    return {
      status: response.status,
      data,
      duration,
      ok: response.ok,
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      status: 0,
      data: null,
      duration: endTime - startTime,
      ok: false,
      error: error.message,
    };
  }
}

function checkPerformance(duration, endpoint) {
  if (duration > 1000) {
    log(`  ⚠️  SLOW (${duration}ms) - ${endpoint}`, 'yellow');
    results.warnings++;
    return 'SLOW';
  } else if (duration > 500) {
    log(`  ⚠️  MEDIUM (${duration}ms) - ${endpoint}`, 'yellow');
    return 'MEDIUM';
  } else {
    log(`  ✓ FAST (${duration}ms) - ${endpoint}`, 'green');
    return 'FAST';
  }
}

function checkDatabaseErrors(data, endpoint) {
  const dataStr = JSON.stringify(data);
  
  if (dataStr.includes('ER_NO_SUCH_TABLE')) {
    log(`  ❌ DATABASE ERROR: Table not found - ${endpoint}`, 'red');
    results.failed++;
    results.errors.push({ endpoint, error: 'ER_NO_SUCH_TABLE', data });
    return false;
  }
  
  if (dataStr.includes('ER_BAD_FIELD_ERROR')) {
    log(`  ❌ DATABASE ERROR: Column not found - ${endpoint}`, 'red');
    results.failed++;
    results.errors.push({ endpoint, error: 'ER_BAD_FIELD_ERROR', data });
    return false;
  }
  
  if (dataStr.includes('ER_PARSE_ERROR')) {
    log(`  ❌ DATABASE ERROR: SQL syntax error - ${endpoint}`, 'red');
    results.failed++;
    results.errors.push({ endpoint, error: 'ER_PARSE_ERROR', data });
    return false;
  }
  
  return true;
}

function checkMultiTenantCompliance(data, endpoint) {
  // Check if response includes school_id field
  if (Array.isArray(data)) {
    if (data.length > 0 && !data[0].school_id) {
      log(`  ⚠️  WARNING: Response missing school_id - ${endpoint}`, 'yellow');
      results.warnings++;
      return false;
    }
  } else if (data && typeof data === 'object' && data.data) {
    return checkMultiTenantCompliance(data.data, endpoint);
  }
  
  return true;
}

// ============================================
// API ENDPOINT TESTS
// ============================================

async function testEndpoint(name, path, expectedStatus = 200, method = 'GET', body = null) {
  log(`\nTesting: ${name}`, 'cyan');
  log(`  Endpoint: ${method} ${path}`, 'blue');
  
  const result = await makeRequest(path, method, body);
  
  // Check status code
  if (result.status === expectedStatus) {
    log(`  ✓ Status ${result.status} (expected ${expectedStatus})`, 'green');
    results.passed++;
  } else {
    log(`  ❌ Status ${result.status} (expected ${expectedStatus})`, 'red');
    results.failed++;
    results.errors.push({ endpoint: path, error: `Unexpected status ${result.status}`, data: result.data });
  }
  
  // Check performance
  checkPerformance(result.duration, path);
  
  // Check for database errors
  if (result.data) {
    checkDatabaseErrors(result.data, path);
    checkMultiTenantCompliance(result.data, path);
  }
  
  // Check error field in response
  if (result.data && result.data.error) {
    log(`  ⚠️  API Error: ${result.data.error}`, 'yellow');
    if (result.data.details) {
      log(`     Details: ${result.data.details}`, 'yellow');
    }
  }
  
  return result;
}

// ============================================
// MAIN AUDIT EXECUTION
// ============================================

async function runAudit() {
  log('╔══════════════════════════════════════════════════════════╗', 'bright');
  log('║     DRAIS V1 - COMPLETE API ENDPOINT AUDIT               ║', 'bright');
  log('║     Testing for: Errors, Performance, Multi-Tenancy     ║', 'bright');
  log('╚══════════════════════════════════════════════════════════╝', 'bright');
  
  // ========== DASHBOARD ENDPOINTS ==========
  logSection('1. DASHBOARD ENDPOINTS');
  await testEndpoint('Dashboard Overview', '/api/dashboard/overview?school_id=1');
  await testEndpoint('Dashboard Stats', '/api/dashboard/stats?school_id=1');
  
  // ========== TERMS & ACADEMIC YEARS ==========
  logSection('2. TERMS & ACADEMIC YEARS');
  await testEndpoint('Get Terms', '/api/terms?school_id=1');
  await testEndpoint('Get Academic Years', '/api/academic-years?school_id=1');
  
  // ========== STUDENTS ==========
  logSection('3. STUDENT MANAGEMENT');
  await testEndpoint('List Students', '/api/students?school_id=1');
  await testEndpoint('Student Search', '/api/students/search?q=test&school_id=1');
  
  // ========== STAFF ==========
  logSection('4. STAFF MANAGEMENT');
  await testEndpoint('List Staff', '/api/staff?school_id=1');
  
  // ========== CLASSES ==========
  logSection('5. CLASS MANAGEMENT');
  await testEndpoint('List Classes', '/api/classes?school_id=1');
  await testEndpoint('Class Details', '/api/classes/1?school_id=1', 404); // May not exist
  
  // ========== ATTENDANCE ==========
  logSection('6. ATTENDANCE SYSTEM');
  await testEndpoint('Attendance Records', '/api/attendance?school_id=1&date=' + new Date().toISOString().split('T')[0]);
  await testEndpoint('Attendance Stats', '/api/attendance/stats?school_id=1');
  
  // ========== DEVICE MANAGEMENT ==========
  logSection('7. BIOMETRIC DEVICE MANAGEMENT');
  await testEndpoint('List Devices', '/api/devices?school_id=1');
  await testEndpoint('Device Mappings', '/api/device-mappings?school_id=1');
  await testEndpoint('Device Logs', '/api/device-logs?school_id=1');
  
  // ========== RESULT TYPES ==========
  logSection('8. RESULT TYPES (Schema Validation)');
  await testEndpoint('List Result Types', '/api/result_types');
  
  // ========== FINANCE ==========
  logSection('9. FINANCE MODULE');
  await testEndpoint('Finance Dashboard', '/api/finance/dashboard?school_id=1');
  await testEndpoint('Fee Templates', '/api/finance/fees?school_id=1');
  await testEndpoint('Payments', '/api/finance/payments?school_id=1');
  await testEndpoint('Waivers', '/api/finance/waivers?school_id=1');
  
  // ========== TAHFIZ ==========
  logSection('10. TAHFIZ MODULE');
  await testEndpoint('Tahfiz Dashboard', '/api/tahfiz/dashboard?school_id=1');
  await testEndpoint('Tahfiz Groups', '/api/tahfiz/groups?school_id=1');
  
  // ========== PROMOTIONS ==========
  logSection('11. PROMOTIONS');
  await testEndpoint('Promotion History', '/api/promotions?school_id=1');
  
  // ========== ANALYTICS ==========
  logSection('12. ANALYTICS');
  await testEndpoint('Analytics Overview', '/api/analytics/overview?school_id=1');
  await testEndpoint('Analytics Requirements', '/api/analytics/requirements?school_id=1');
  
  // ========== ADMIN ==========
  logSection('13. ADMIN ENDPOINTS');
  await testEndpoint('List Users', '/api/admin/users?school_id=1');
  await testEndpoint('List Roles', '/api/roles?school_id=1');
  
  // ========== DEPARTMENTS ==========
  logSection('14. DEPARTMENTS');
  await testEndpoint('List Departments', '/api/departments/list?school_id=1');
  
  // ========== FINAL REPORT ==========
  logSection('AUDIT SUMMARY');
  
  log(`\n✓ Passed Tests: ${results.passed}`, 'green');
  log(`❌ Failed Tests: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`⚠️  Warnings: ${results.warnings}`, results.warnings > 0 ? 'yellow' : 'green');
  
  if (results.errors.length > 0) {
    logSection('CRITICAL ERRORS FOUND');
    results.errors.forEach((error, index) => {
      log(`\n${index + 1}. ${error.endpoint}`, 'red');
      log(`   Error Type: ${error.error}`, 'red');
      if (error.data) {
        log(`   Response: ${JSON.stringify(error.data, null, 2)}`, 'yellow');
      }
    });
  }
  
  // Calculate success rate
  const totalTests = results.passed + results.failed;
  const successRate = ((results.passed / totalTests) * 100).toFixed(2);
  
  logSection('OVERALL HEALTH');
  log(`Success Rate: ${successRate}%`, successRate >= 90 ? 'green' : successRate >= 70 ? 'yellow' : 'red');
  
  if (successRate >= 90) {
    log('\n🎉 EXCELLENT! System is stable and healthy', 'green');
  } else if (successRate >= 70) {
    log('\n⚠️  MODERATE: Some issues detected, review recommended', 'yellow');
  } else {
    log('\n❌ CRITICAL: Multiple failures detected, immediate action required', 'red');
  }
  
  // Save results to file
  const fs = await import('fs');
  const reportPath = './audit-report-' + new Date().toISOString().split('T')[0] + '.json';
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings,
      successRate: `${successRate}%`,
    },
    errors: results.errors,
  }, null, 2));
  
  log(`\n📄 Full report saved to: ${reportPath}`, 'cyan');
}

// Run the audit
runAudit().catch(console.error);
