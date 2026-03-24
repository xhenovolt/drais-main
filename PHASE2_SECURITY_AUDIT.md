# PHASE 2 SECURITY AUDIT - CRITICAL FINDINGS

## Executive Summary
**🚨 CRITICAL VULNERABILITIES DETECTED - IMMEDIATE ACTION REQUIRED**

Multiple API endpoints expose serious multi-tenant isolation flaws:
- ❌ **NO authentication** on results/[id] endpoint
- ❌ **NO school_id filtering** on results table queries
- ❌ **UNAUTHENTICATED UPDATE** to exam results possible
- ❌ Results table lacks direct school_id column

---

## Vulnerability 1: CRITICAL - Unauthenticated Results Update

**File**: [src/app/api/results/[id]/route.ts](src/app/api/results/[id]/route.ts)

**Severity**: 🔴 CRITICAL

**Issue**:
```typescript
export async function PUT(req: Request, { params }: ...) {
  // ❌ NO getSessionSchoolId() check - any user can access
  // ❌ NO school_id validation
  
  await conn.execute(
    'UPDATE results SET score = ?, grade = ?, remarks = ? WHERE id = ?',
    [parseFloat(body.score), body.grade || null, body.remarks || null, id]
  );
  // Anyone with result ID can update any exam result!
}
```

**Impact**: 
- Any unauthenticated user can modify ANY exam result in the system
- Northgate learners' exam results can be modified from outside
- No audit trail of who modified what

**Fix Required**:
```typescript
import { getSessionSchoolId } from '@/lib/auth';

export async function PUT(req: Request, { params }: ...) {
  const session = await getSessionSchoolId(req);  // ADD THIS
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  // Verify result belongs to user's school
  const conn = await getConnection();
  const [result] = await conn.execute(
    `SELECT e.school_id FROM results r 
     JOIN exams e ON r.exam_id = e.id 
     WHERE r.id = ?`, 
    [id]
  );
  if (!result || result.school_id !== session.schoolId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
}
```

---

## Vulnerability 2: CRITICAL - Results Table Design Flaw

**Database Table**: `results`

**Severity**: 🔴 CRITICAL

**Issue**:
```sql
-- Current structure (UNSAFE):
CREATE TABLE results (
  id BIGINT,
  exam_id BIGINT,
  student_id BIGINT,
  score DECIMAL(5,2),
  grade VARCHAR(5),
  remarks TEXT
  -- ❌ MISSING: school_id column
);

-- Query risk:
SELECT * FROM results WHERE id = ?  -- Can't filter by school_id directly!
```

**Why Critical**:
- Results table has NO direct school_id column
- Must filter through exam→school_id join (fragile pattern)
- If code forgets the join, cross-school leakage occurs
- No database-level constraint preventing school boundary violations

**Fix Required**:
```sql
-- Add school_id column
ALTER TABLE results ADD COLUMN school_id BIGINT NOT NULL DEFAULT 6;

-- Backfill from exams table
UPDATE results SET school_id = (
  SELECT school_id FROM exams e WHERE e.id = exam_id
);

-- Add index for performance
CREATE INDEX idx_results_school_id ON results(school_id);

-- Add NOT NULL constraint after backfill
ALTER TABLE results MODIFY COLUMN school_id BIGINT NOT NULL;

-- Optional: Add foreign key constraint
ALTER TABLE results ADD INDEX idx_results_exam_school_id (exam_id, school_id);
```

**All queries must now include**:
```sql
SELECT * FROM results WHERE school_id = ?  -- Direct filter
-- OR safer join:
SELECT r.* FROM results r 
JOIN exams e ON r.exam_id = e.id 
WHERE e.school_id = ? AND r.id = ?
```

---

## Vulnerability 3: HIGH - Missing School_id in Results Queries

**Files Affected**:
- src/app/api/results/[id]/route.ts (PUT - no school_id filter)
- src/app/api/results/edit/route.ts (likely similar)
- src/app/api/class_results/[id]/route.ts (check for school_id)

**Current Risk**: Class_results JOIN to results may bypass school_id checks

---

## Vulnerability 4: MEDIUM - getStudentById Function

**File**: [src/lib/db/students.ts](src/lib/db/students.ts#L60)

**Issue**:
```typescript
export async function getStudentById(id: number) {
  // ❌ NO school_id parameter passed in
  // ❌ Query only filters by s.id = ?
  const [rows] = await conn.execute(`
    SELECT * FROM students s
    WHERE s.id = ?  -- Any authenticated user could call with any ID
  `, [id]);
}
```

**Risk**: If used in API without prior school_id validation, cross-school leakage possible

**Status**: ✅ Currently NOT USED in API routes (POST /api/students/[id] has proper filter)
**Action**: Verify this function is never exposed directly to API

---

## Vulnerability 5: MEDIUM - Class Results School ID Enforcement

**Files Affected**:
- src/app/api/class_results/list/route.ts
- src/app/api/class_results/submit/route.ts
- src/app/api/class_results/[id]/route.ts

**Recommendation**: Audit JOIN paths to ensure school_id flows through entire query

---

## Safe Routes (Verified ✅)

**src/app/api/students/route.ts** (POST)
- ✅ Gets school_id from session
- ✅ Uses in all people/students/enrollments INSERT

**src/app/api/students/[id]/route.ts** (GET)
- ✅ WHERE s.id = ? AND s.school_id = ?
- ✅ Proper authentication check

**src/app/api/students/list/route.ts** (GET)
- ✅ Passes session.schoolId to getStudentsList()
- ✅ getStudentsList filters WHERE s.school_id = ?

**src/app/api/results/by-term/route.ts** (GET)
- ✅ WHERE s.school_id = ?
- ✅ Proper authentication

---

## Remediation Priority

### PHASE 2A: CRITICAL - Immediate (Today)
- [ ] Add authentication to results/[id]/route.ts
- [ ] Add school_id validation to results/[id] queries
- [ ] Audit all results editing endpoints

### PHASE 2B: CRITICAL - This Week
- [ ] Add school_id column to results table
- [ ] Backfill school_id from exams
- [ ] Update all results queries to filter by school_id

### PHASE 2C: HIGH - Week 2
- [ ] Audit class_results JOIN paths
- [ ] Verify school_id propagates through all student→class→results chains
- [ ] Add defensive code comments marking school_id checks

### PHASE 2D: MEDIUM - Week 3
- [ ] Test multi-tenant leak scenarios
- [ ] Document tenant isolation architecture
- [ ] Create linter rules to flag unsafe queries

---

## Test Cases to Verify

**Test 1: Unauthenticated Results Access**
```bash
# Should return 401
curl -X PUT /api/results/1 \
  -H "Content-Type: application/json" \
  -d '{"score": 100}'
# Expected: { error: 'Not authenticated' }
```

**Test 2: Cross-School Results Update** (After Fix)
```bash
# Login as Northgate user (school_id=6)
# Try to update Albayan result (school_id=1)
curl -X PUT /api/results/[albayan-result-id] \
  -H "Authorization: Bearer northgate-token" \
  -d '{"score": 100}'
# Expected: { error: 'Unauthorized' }
```

**Test 3: Results Table School_id Filter**
```sql
-- After adding school_id column
SELECT COUNT(*) FROM results WHERE school_id = 6;
-- Should return 10,406 (Northgate results)
-- Compare with: SELECT COUNT(*) FROM results; -- Should also be 10,406 if only Northgate data
```

---

## Verification Checklist

**Before considering PHASE 2 complete:**
- [ ] results/[id]/route.ts has authentication
- [ ] All results queries filter by school_id
- [ ] results table has school_id column (NOT NULL)
- [ ] No queries use bare `SELECT * FROM results WHERE id = ?`
- [ ] All JOIN paths include school_id enforcement
- [ ] Cross-school update attempts return 403
- [ ] No unauthenticated access to exam data
- [ ] Audit log shows who modified results (future)

---

## Related Issues from PHASE 1

**PHASE 1 Finding**: Results table missing school_id column
- **Status**: Confirmed in PHASE 2
- **Action**: Add column immediately (PHASE 2B)

**PHASE 1 Finding**: 5 of 6 tables have school_id
- **Status**: Still valid
- **Tables Safe**: students, people, enrollments, subjects, classes
- **Table At Risk**: results (no direct school_id)

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Critical Vulnerabilities Found | 2 |
| High Priority Issues | 1 |
| Medium Priority Issues | 3 |
| Safe Routes Verified | 4 |
| Files Requiring Fixes | 5+ |
| Northgate Results at Risk | 10,406 |
| Northgate Learners Affected | ~331 |

---

**Generated**: Phase 2 Security Audit
**Status**: FINDINGS REPORTED - AWAITING REMEDIATION
**Next**: Begin PHASE 2A fixes immediately
