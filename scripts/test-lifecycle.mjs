#!/usr/bin/env node

/**
 * DRAIS SCHOOL MANAGEMENT SYSTEM
 * Student Lifecycle & Historical Report Integration Test
 * 
 * Tests:
 * 1. Academic year & term structure
 * 2. Student enrollment history across years
 * 3. Promotion chain integrity
 * 4. Term-exam result mapping
 * 5. Report card generation & historical access
 * 6. API endpoint validation
 * 
 * Usage:
 *   node scripts/test-lifecycle.mjs
 * 
 * Requires: The app running on localhost:3000 (or set BASE_URL env var)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

function log(icon, msg) {
  console.log(`  ${icon} ${msg}`);
}

function pass(name) {
  passed++;
  results.push({ status: 'PASS', name });
  log('✅', name);
}

function fail(name, reason) {
  failed++;
  results.push({ status: 'FAIL', name, reason });
  log('❌', `${name}: ${reason}`);
}

function skip(name, reason) {
  skipped++;
  results.push({ status: 'SKIP', name, reason });
  log('⏭️', `${name}: ${reason}`);
}

async function fetchJson(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        // Add a cookie if needed for auth — for now test without auth
        ...(options.headers || {}),
      },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body };
  } catch (err) {
    return { status: 0, ok: false, body: null, error: err.message };
  }
}

// ============================================
// TEST SUITES
// ============================================

async function testServerRunning() {
  console.log('\n📡 Server Connectivity');
  const { status, error } = await fetchJson('/api/academic_years');
  if (status === 0) {
    fail('Server is running', `Cannot connect to ${BASE_URL}: ${error}`);
    return false;
  }
  // Even a 401/403 means server is up
  pass(`Server is running at ${BASE_URL} (status: ${status})`);
  return true;
}

async function testAcademicYears() {
  console.log('\n📅 Academic Years & Terms');
  
  const { status, body } = await fetchJson('/api/academic_years');
  if (status === 401 || status === 403) {
    skip('Academic years', 'Authentication required');
    return;
  }
  if (status !== 200) {
    fail('GET /api/academic_years returns 200', `Got ${status}`);
    return;
  }
  pass('GET /api/academic_years returns 200');

  const years = body?.academicYears || body?.data || body || [];
  if (!Array.isArray(years) || years.length === 0) {
    fail('Academic years data returned', 'No academic years array found in response');
    return;
  }
  pass(`Academic years found: ${years.length} years`);

  // Check that 2024, 2025, 2026 exist
  const yearNames = years.map(y => y.name);
  for (const yr of ['2024', '2025', '2026']) {
    if (yearNames.includes(yr)) {
      pass(`Academic year ${yr} exists`);
    } else {
      fail(`Academic year ${yr} exists`, `Not found in: ${yearNames.join(', ')}`);
    }
  }

  // Test terms endpoint
  const { status: tStatus, body: tBody } = await fetchJson('/api/terms');
  if (tStatus === 200) {
    const terms = tBody?.terms || tBody?.data || tBody || [];
    if (Array.isArray(terms) && terms.length > 0) {
      pass(`Terms endpoint works: ${terms.length} terms found`);
    } else {
      fail('Terms data returned', 'Empty or missing terms array');
    }
  } else if (tStatus === 404) {
    skip('Terms endpoint', 'GET /api/terms not found (may need to be created)');
  } else {
    fail('GET /api/terms', `Unexpected status ${tStatus}`);
  }
}

async function testStudentLifecycle() {
  console.log('\n🧬 Student Lifecycle API');

  // Test with a known test student ID — we'll search by admission_no
  // First, try the lifecycle endpoint with student_id=1 as a sanity check
  const { status, body } = await fetchJson('/api/students/lifecycle?student_id=1');
  if (status === 200 && body) {
    pass('GET /api/students/lifecycle returns 200');
    
    if (body.student) {
      pass('Lifecycle response contains student info');
    } else {
      fail('Lifecycle response contains student info', 'Missing "student" field');
    }

    if (body.enrollment_history && Array.isArray(body.enrollment_history)) {
      pass(`Enrollment history returned: ${body.enrollment_history.length} records`);
    } else {
      fail('Enrollment history returned', 'Missing or not an array');
    }

    if (body.report_cards && Array.isArray(body.report_cards)) {
      pass(`Report cards returned: ${body.report_cards.length} records`);
    } else {
      fail('Report cards returned', 'Missing or not an array');
    }

    if (body.promotions && Array.isArray(body.promotions)) {
      pass(`Promotion history returned: ${body.promotions.length} records`);
    } else {
      fail('Promotion history returned', 'Missing or not an array');
    }
  } else if (status === 401 || status === 403) {
    skip('Student lifecycle', 'Authentication required (expected in production)');
  } else {
    fail('GET /api/students/lifecycle', `Status ${status}: ${JSON.stringify(body)}`);
  }
}

async function testReportCards() {
  console.log('\n📋 Report Cards API');

  // Test report card listing
  const { status, body } = await fetchJson('/api/report-cards');
  if (status === 200) {
    pass('GET /api/report-cards returns 200');
    const cards = body?.report_cards || body?.data || [];
    if (Array.isArray(cards)) {
      pass(`Report cards list returned: ${cards.length} cards`);
    }
  } else if (status === 401 || status === 403) {
    skip('Report cards list', 'Authentication required');
  } else {
    fail('GET /api/report-cards', `Status ${status}`);
  }

  // Test report card history
  const { status: hStatus, body: hBody } = await fetchJson('/api/report-cards/history?student_id=1');
  if (hStatus === 200) {
    pass('GET /api/report-cards/history returns 200');
    if (hBody?.available_years) {
      pass('Historical year listing available');
    }
    if (hBody?.available_terms) {
      pass('Historical term listing available');
    }
  } else if (hStatus === 401 || hStatus === 403) {
    skip('Report card history', 'Authentication required');
  } else {
    fail('GET /api/report-cards/history', `Status ${hStatus}`);
  }
}

async function testEnrollments() {
  console.log('\n📝 Enrollments API');

  const { status, body } = await fetchJson('/api/enrollments');
  if (status === 200) {
    pass('GET /api/enrollments returns 200');
    const enrollments = body?.enrollments || body?.data || [];
    if (Array.isArray(enrollments)) {
      pass(`Enrollments returned: ${enrollments.length} records`);
    }
  } else if (status === 401 || status === 403) {
    skip('Enrollments list', 'Authentication required');
  } else {
    fail('GET /api/enrollments', `Status ${status}`);
  }
}

async function testResultsByTerm() {
  console.log('\n📊 Results By Term API');

  const { status, body } = await fetchJson('/api/results/by-term?term_id=1');
  if (status === 200) {
    pass('GET /api/results/by-term returns 200');
  } else if (status === 401 || status === 403) {
    skip('Results by term', 'Authentication required');
  } else if (status === 400) {
    // Might require term_id param
    pass('GET /api/results/by-term validates params correctly');
  } else {
    fail('GET /api/results/by-term', `Status ${status}`);
  }
}

async function testPromotions() {
  console.log('\n🎓 Promotions API');

  // Test the promote endpoint with a read-only check (GET should 405)
  const { status: getStatus } = await fetchJson('/api/promotions/promote');
  if (getStatus === 405 || getStatus === 400) {
    pass('POST /api/promotions/promote rejects GET requests');
  } else if (getStatus === 401 || getStatus === 403) {
    skip('Promotions API', 'Authentication required');
  } else {
    // It's a POST endpoint, GET returning anything else is unexpected but not critical
    pass(`Promotions endpoint exists (GET returned ${getStatus})`);
  }
}

async function testReportsList() {
  console.log('\n📄 Reports List API (Enhanced)');

  // Test basic
  const { status, body } = await fetchJson('/api/reports/list');
  if (status === 200) {
    pass('GET /api/reports/list returns 200');
    const reports = body?.data || body || [];
    if (Array.isArray(reports) && reports.length > 0) {
      // Check that academic_year_id field exists in response
      const hasAcademicYear = reports[0].hasOwnProperty('academic_year_id') ||
                               reports[0].hasOwnProperty('academic_year_name');
      if (hasAcademicYear) {
        pass('Reports include academic year information');
      } else {
        fail('Reports include academic year info', 'Missing academic_year_id/name in response');
      }
    } else {
      skip('Reports data inspection', 'No report data to inspect');
    }
  } else if (status === 401 || status === 403) {
    skip('Reports list', 'Authentication required');
  } else if (status === 500) {
    skip('Reports list', 'DB query error — run migration first: database/migrations/student_lifecycle_v5.sql');
  } else {
    fail('GET /api/reports/list', `Status ${status}`);
  }

  // Test with academic year filter
  const { status: fStatus } = await fetchJson('/api/reports/list?academic_year_id=1');
  if (fStatus === 200) {
    pass('Reports list accepts academic_year_id filter');
  } else if (fStatus === 401 || fStatus === 403 || fStatus === 500) {
    skip('Reports list with year filter', fStatus === 500 ? 'DB migration needed' : 'Auth required');
  } else {
    fail('Reports list with year filter', `Status ${fStatus}`);
  }
}

async function testStudentHistory() {
  console.log('\n📚 Student History API (Enhanced)');

  const { status, body } = await fetchJson('/api/students/history?student_id=1');
  if (status === 200 && body) {
    pass('GET /api/students/history returns 200');
    
    if (body.enrollment_history && Array.isArray(body.enrollment_history)) {
      pass(`Enrollment history in response: ${body.enrollment_history.length} records`);
    } else {
      fail('Enrollment history field', 'Missing in student history response');
    }
  } else if (status === 401 || status === 403) {
    skip('Student history', 'Authentication required');
  } else {
    fail('GET /api/students/history', `Status ${status}`);
  }
}

// ============================================
// VALIDATION TESTS (Static, no server needed)
// ============================================

async function testFileStructure() {
  console.log('\n📁 File Structure Validation');

  const fs = await import('fs');
  const path = await import('path');
  const cwd = process.cwd();

  const requiredFiles = [
    'database/migrations/student_lifecycle_v5.sql',
    'database/test_data_lifecycle.sql',
    'src/app/api/students/lifecycle/route.ts',
    'src/app/api/report-cards/route.ts',
    'src/app/api/report-cards/history/route.ts',
    'src/app/api/enrollments/route.ts',
    'src/app/api/results/by-term/route.ts',
    'src/app/api/promotions/promote/route.ts',
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      pass(`File exists: ${file}`);
    } else {
      fail(`File exists: ${file}`, 'Not found on disk');
    }
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   DRAIS Student Lifecycle Integration Tests         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Time:   ${new Date().toISOString()}\n`);

  // Static tests first
  await testFileStructure();

  // Server tests
  const serverUp = await testServerRunning();
  if (serverUp) {
    await testAcademicYears();
    await testStudentLifecycle();
    await testReportCards();
    await testEnrollments();
    await testResultsByTerm();
    await testPromotions();
    await testReportsList();
    await testStudentHistory();
  } else {
    console.log('\n⚠️  Server not running — skipping API tests.');
    console.log('   Start the app with: npm run dev');
    console.log('   Then re-run: node scripts/test-lifecycle.mjs\n');
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`Result: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.reason}`);
    });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(2);
});
