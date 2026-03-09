# 🚨 DRAIS V1 - CRITICAL MULTI-TENANT FIXES REQUIRED

**Validation Results:** 224 VIOLATIONS DETECTED  
**Status:** ❌ NOT PRODUCTION READY FOR MULTI-TENANT DEPLOYMENT  
**Risk Level:** 🔴 CRITICAL - DATA SECURITY BREACH RISK

---

## 📊 VALIDATION SUMMARY

```
FILES SCANNED: 207
COMPLIANT: 100 (48%)
VIOLATIONS: 224

SEVERITY:
🔴 CRITICAL: 89 (UPDATE/DELETE operations)
🟠 HIGH: 135 (SELECT operations on sensitive data)
```

---

## 🔥 TOP PRIORITY FIXES (CRITICAL - DO FIRST)

### 1. Authentication Module (URGENT - Security Risk)

**File:** `src/app/api/auth/login/route.ts`

**Violations:**
- Line 145: `UPDATE users SET failed_login_attempts = ... WHERE email = ?`
- Line 195: `UPDATE users SET last_login_at = NOW() WHERE id = ?`

**Fix:**
```typescript
// BEFORE - DANGEROUS: Updates ANY user with matching email
await connection.execute(
  'UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE email = ?',
  [email]
);

// AFTER - SAFE: Only updates users in the correct school
const { searchParams } = new URL(req.url);
const schoolId = parseInt(searchParams.get('school_id') || '1');

await connection.execute(
  'UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE email = ? AND school_id = ?',
  [email, schoolId]
);
```

**Impact:** Without this fix, a failed login attempt in School A could lock out a user with the same email in School B!

---

**File:** `src/app/api/auth/logout/route.ts`

**Violation:**
- Line 18: `UPDATE sessions SET is_active = FALSE WHERE session_id = ?`

**Fix:**
```typescript
// BEFORE - Session hijacking risk
await connection.execute(
  'UPDATE sessions SET is_active = FALSE, updated_at = NOW() WHERE session_id = ?',
  [sessionId]
);

// AFTER - Verify session belongs to user's school
await connection.execute(
  'UPDATE sessions SET is_active = FALSE, updated_at = NOW() WHERE session_id = ? AND user_id IN (SELECT id FROM users WHERE school_id = ?)',
  [sessionId, schoolId]
);
```

---

### 2. Attendance System (CRITICAL - Attendance Data Mixing)

**File:** `src/app/api/attendance/biometric/route.ts`

**Violations:**
- Line 37: `UPDATE student_fingerprints SET last_used_at = ... WHERE fingerprint_id = ?`

**Fix:**
```typescript
// BEFORE - Could update fingerprint from another school
await connection.execute(
  'UPDATE student_fingerprints SET last_used_at = CURRENT_TIMESTAMP WHERE fingerprint_id = ?',
  [fingerprintId]
);

// AFTER - Verify fingerprint belongs to student in correct school
await connection.execute(
  `UPDATE student_fingerprints 
   SET last_used_at = CURRENT_TIMESTAMP 
   WHERE fingerprint_id = ? 
   AND student_id IN (SELECT id FROM students WHERE school_id = ?)`,
  [fingerprintId, schoolId]
);
```

---

**File:** `src/app/api/attendance/route.ts`

**Violations (CRITICAL):**
- Line 15: `UPDATE student_attendance SET status = ? WHERE id = ?`
- Line 149: `UPDATE student_attendance SET check_out_time = ? WHERE id = ?`

**Fix:**
```typescript
// BEFORE - Could mark attendance for ANY school
await connection.execute(
  'UPDATE student_attendance SET status = ? WHERE id = ?',
  [status, attendanceId]
);

// AFTER - Verify attendance record belongs to school
await connection.execute(
  `UPDATE student_attendance 
   SET status = ? 
   WHERE id = ? AND school_id = ?`,
  [status, attendanceId, schoolId]
);
```

---

### 3. Class Results (CRITICAL - Grade Manipulation Risk)

**File:** `src/app/api/class_results/[id]/route.ts`

**Violation:**
- Line 8: `UPDATE class_results SET score = ? WHERE id = ?`

**Fix:**
```typescript
// BEFORE - DANGEROUS: Could change grades in ANY school
const [result] = await connection.execute(
  'UPDATE class_results SET score = ?, updated_at = NOW() WHERE id = ?',
  [score, id]
);

// AFTER - SAFE: Only updates grades in correct school
const { searchParams } = new URL(req.url);
const schoolId = parseInt(searchParams.get('school_id') || '1');

const [result] = await connection.execute(
  'UPDATE class_results SET score = ?, updated_at = NOW() WHERE id = ? AND school_id = ?',
  [score, id, schoolId]
);
```

---

### 4. Student Management (CRITICAL - PII Data Breach)

**File:** `src/app/api/students/[id]/route.ts`

**Violations:**
- Line 84: `UPDATE students SET ... WHERE id = ?`
- Line 154: `DELETE FROM students WHERE id = ?`

**Fix:**
```typescript
// BEFORE - Could modify/delete students from other schools
await connection.execute(
  'UPDATE students SET first_name = ?, last_name = ? WHERE id = ?',
  [firstName, lastName, studentId]
);

// AFTER - Verify student belongs to school
await connection.execute(
  'UPDATE students SET first_name = ?, last_name = ? WHERE id = ? AND school_id = ?',
  [firstName, lastName, studentId, schoolId]
);

// DELETE with school_id check
await connection.execute(
  'UPDATE students SET deleted_at = NOW() WHERE id = ? AND school_id = ?',
  [studentId, schoolId]
);
```

---

### 5. Finance Module (CRITICAL - Financial Data Security)

**File:** `src/app/api/finance/fee_payments/route.ts`

**Violations:**
- Line 46: `SELECT ... FROM student_fee_items WHERE student_id = ?`

**Fix:**
```typescript
// BEFORE - Could access fee items from any school
const [items] = await connection.execute(
  'SELECT id, amount FROM student_fee_items WHERE student_id = ?',
  [studentId]
);

// AFTER - Verify student and fees belong to school
const [items] = await connection.execute(
  `SELECT id, amount 
   FROM student_fee_items 
   WHERE student_id = ? 
   AND student_id IN (SELECT id FROM students WHERE school_id = ?)`,
  [studentId, schoolId]
);
```

---

## 🛠️ AUTOMATED FIX STRATEGY

### Step 1: Add School ID Extraction to All Routes

Add this to EVERY API route file:

```typescript
export async function GET(req: NextRequest) {
  // Extract school_id from query params or session
  const { searchParams } = new URL(req.url);
  const schoolId = parseInt(searchParams.get('school_id') || '1');
  
  // Or from session (recommended for production)
  // const session = await getSession(req);
  // const schoolId = session.user.school_id;
  
  // Rest of your code...
}
```

### Step 2: Update ALL Database Queries

**Pattern Matching:**
```regex
Find: WHERE\s+(\w+\.)?id\s*=\s*\?
Replace: WHERE $1id = ? AND $1school_id = ?
```

**Before:**
```sql
SELECT * FROM students WHERE id = ?
UPDATE staff SET status = 'active' WHERE id = ?
DELETE FROM classes WHERE id = ?
```

**After:**
```sql
SELECT * FROM students WHERE id = ? AND school_id = ?
UPDATE staff SET status = 'active' WHERE id = ? AND school_id = ?
DELETE FROM classes WHERE id = ? AND school_id = ?
```

### Step 3: Update Parameter Arrays

**Before:**
```typescript
await connection.execute(query, [id]);
```

**After:**
```typescript
await connection.execute(query, [id, schoolId]);
```

---

## 📋 COMPLETE FIX CHECKLIST

### Authentication (5 files) - PRIORITY 1
- [ ] `/api/auth/login/route.ts` - Fix lines 145, 195
- [ ] `/api/auth/logout/route.ts` - Fix line 18
- [ ] `/api/auth/signup/route.ts` - Fix line 272
- [ ] `/api/auth/me/route.ts` - Fix lines 132, 150
- [ ] `/api/auth/session/route.ts` - Add school_id validation

### Students (12 files) - PRIORITY 1
- [ ] `/api/students/[id]/route.ts` - Fix UPDATE/DELETE operations
- [ ] `/api/students/route.ts` - Add school_id to all queries
- [ ] `/api/students/search/route.ts` - Add school_id filter
- [ ] `/api/students/bulk/route.ts` - Validate school_id for all operations
- [ ] All other student endpoints...

### Attendance (8 files) - PRIORITY 2
- [ ] `/api/attendance/route.ts` - Fix lines 15, 149
- [ ] `/api/attendance/biometric/route.ts` - Fix line 37
- [ ] `/api/attendance/signout/route.ts` - Add school_id filters
- [ ] All attendance-related endpoints

### Finance (15 files) - PRIORITY 1 (Sensitive Financial Data)
- [ ] `/api/finance/payments/route.ts` - Add school_id to all queries
- [ ] `/api/finance/invoices/route.ts` - Fix lines 29, 75, 82
- [ ] `/api/finance/fee_payments/route.ts` - Fix line 46
- [ ] `/api/finance/waivers/route.ts` - Add school_id validation
- [ ] All finance endpoints

### Class Results (10 files) - PRIORITY 2
- [ ] `/api/class-results/[id]/route.ts` - Fix lines 27, 53
- [ ] `/api/class_results/[id]/route.ts` - Fix line 8 (UPDATE)
- [ ] `/api/class_results/missing/route.ts` - Add school_id filters
- [ ] All class results endpoints

### Academics (20 files) - PRIORITY 3
- [ ] `/api/terms/route.ts` - Already has school_id ✓
- [ ] `/api/academic_years/route.ts` - Fix line 6
- [ ] `/api/classes/route.ts` - Add school_id filters
- [ ] All academic endpoints

### Devices & Biometric (6 files) - PRIORITY 2
- [ ] `/api/devices/route.ts` - Add school_id validation
- [ ] `/api/device-mappings/route.ts` - Fix school_id filtering
- [ ] `/api/biometric-devices/route.ts` - Fix line 101
- [ ] All device endpoints

### Staff (8 files) - PRIORITY 2
- [ ] `/api/staff/route.ts` - Add school_id filters
- [ ] `/api/staff/[id]/route.ts` - Add UPDATE/DELETE protection
- [ ] All staff endpoints

### Tahfiz (7 files) - PRIORITY 3
- [ ] `/api/tahfiz/groups/route.ts` - Add school_id filters
- [ ] `/api/tahfiz/records/route.ts` - Add school_id validation
- [ ] All tahfiz endpoints

---

## 🚀 DEPLOYMENT PLAN

### Phase 1: Critical Security Fixes (Day 1)
1. ✅ Run validator script: `node scripts/validate-tenant-isolation.mjs`
2. ⚠️ Fix ALL CRITICAL violations (89 issues)
3. ⚠️ Fix authentication module (5 files)
4. ⚠️ Fix finance module (15 files)
5. Test with 2+ schools in staging

### Phase 2: High Priority Fixes (Day 2-3)
1. ⚠️ Fix ALL HIGH violations (135 issues)
2. ⚠️ Fix attendance system
3. ⚠️ Fix class results
4. ⚠️ Fix student management
5. Test all CRUD operations per school

### Phase 3: Verification (Day 4)
1. ⚠️ Re-run validator: `node scripts/validate-tenant-isolation.mjs`
2. ⚠️ Verify 0 CRITICAL violations
3. ⚠️ Verify 0 HIGH violations
4. ⚠️ Run API audit: `node scripts/api-audit.mjs`
5. Manual penetration testing

### Phase 4: Production Deployment (Day 5)
1. ⚠️ Deploy to staging with 5+ test schools
2. ⚠️ Load test with concurrent users
3. ⚠️ Monitor for data leaks
4. ⚠️ Deploy to production
5. ⚠️ Continuous monitoring

---

## 🔐 TESTING STRATEGY

### Unit Tests (Per Endpoint)
```typescript
describe('Multi-Tenant Isolation', () => {
  it('should only return data for the specified school', async () => {
    const school1Data = await fetch('/api/students?school_id=1');
    const school2Data = await fetch('/api/students?school_id=2');
    
    // Verify no data overlap
    expect(school1Data).not.toContainAnyItemsFrom(school2Data);
  });
  
  it('should prevent cross-school updates', async () => {
    const studentInSchool1 = { id: 1, school_id: 1 };
    const response = await fetch('/api/students/1', {
      method: 'PUT',
      headers: { 'school_id': '2' }, // Try to update as school 2
      body: JSON.stringify({ name: 'Hacked' })
    });
    
    expect(response.status).toBe(403); // Forbidden
  });
});
```

### Integration Tests
```bash
# Test script to verify isolation
./scripts/test-tenant-isolation.sh

# Should test:
# 1. Create student in School A
# 2. Try to access from School B → Should fail
# 3. Update student from School A → Should succeed
# 4. Update student from School B → Should fail
# 5. Delete student from School B → Should fail
```

---

## 📊 SUCCESS METRICS

**Current State:**
- ❌ Multi-Tenant Compliance: 48% (100/207 files compliant)
- ❌ Critical Violations: 89
- ❌ High Violations: 135

**Target State (Production Ready):**
- ✅ Multi-Tenant Compliance: 100% (0 violations)
- ✅ Critical Violations: 0
- ✅ High Violations: 0
- ✅ Automated tests: 95%+ coverage
- ✅ Penetration test: PASSED

---

## 🎯 ESTIMATED EFFORT

| Phase | Tasks | Estimated Time | Status |
|-------|-------|----------------|--------|
| Phase 1 | Critical fixes (89 issues) | 16 hours | ⏳ TODO |
| Phase 2 | High priority (135 issues) | 24 hours | ⏳ TODO |
| Phase 3 | Testing & validation | 8 hours | ⏳ TODO |
| Phase 4 | Production deployment | 4 hours | ⏳ TODO |
| **TOTAL** | **224 violations** | **52 hours** | ⏳ **TODO** |

---

## ⚠️ WARNING

**DO NOT DEPLOY TO PRODUCTION WITH MULTIPLE SCHOOLS UNTIL ALL VIOLATIONS ARE FIXED!**

**Current system is ONLY safe for:**
- ✅ Single-school deployment
- ✅ Development/testing environment
- ✅ Demo with isolated data

**Current system is NOT safe for:**
- ❌ Multi-tenant production
- ❌ Multiple schools sharing database
- ❌ Any scenario where data privacy matters

---

## 📞 NEXT ACTIONS

1. ⚠️ **STOP** any plans for multi-school production deployment
2. ⚠️ **ASSIGN** developer team to fix critical violations
3. ⚠️ **SCHEDULE** daily progress reviews
4. ⚠️ **TEST** each fix with 2+ schools before marking complete
5. ⚠️ **VALIDATE** using automated scripts after all fixes

---

**Report Generated:** March 8, 2026  
**Validator Script:** `scripts/validate-tenant-isolation.mjs`  
**Full Report:** `multi-tenant-compliance-report.txt`  
**Next Validation:** After Phase 1 completion
