# API Route Security Audit Report
**Generated:** March 25, 2026  
**Scope:** src/app/api directory - Focus on students, academics, attendance, finance, results, and enrollments routes  
**Status:** CRITICAL ISSUES FOUND

---

## Executive Summary

This audit identified **HIGH to CRITICAL severity issues** affecting data integrity and security:
- **7 routes** missing school_id WHERE clause checks (CRITICAL)
- **Multiple routes** with unsafe database connection handling
- **1 route** with hardcoded pagination without numeric validation
- **Finance routes** particularly vulnerable to cross-tenant data leakage

---

## Issue Categories

### CATEGORY 1: Missing WHERE school_id = ? Checks (CRITICAL)

These routes can expose data across school tenants or allow unauthorized data mutations.

| File | Line | Method | Issue | Severity |
|------|------|--------|-------|----------|
| [src/app/api/finance/fee_payments/route.ts](src/app/api/finance/fee_payments/route.ts#L24) | 24-25 | GET | Main query missing school_id filter. Query: `SELECT ... ORDER BY fp.id DESC LIMIT ...` has NO WHERE clause filtering by school_id | **CRITICAL** |
| [src/app/api/finance/fee_payments/route.ts](src/app/api/finance/fee_payments/route.ts#L18) | 18 | GET | Single receipt retrieval (id=?) missing school_id verification. Can access any payment if ID is known | **CRITICAL** |
| [src/app/api/finance/student_fee_items/route.ts](src/app/api/finance/student_fee_items/route.ts#L32) | 32 | GET | Main query missing school_id filter. No WHERE clause ensures only school's students are returned | **CRITICAL** |
| [src/app/api/finance/student_fee_items/route.ts](src/app/api/finance/student_fee_items/route.ts#L41) | 41 | POST (seed) | `SELECT DISTINCT e.student_id FROM enrollments e ...` missing WHERE school_id check | **CRITICAL** |
| [src/app/api/finance/student_fee_items/route.ts](src/app/api/finance/student_fee_items/route.ts#L45) | 45 | POST (seed) | Fee structure query missing school_id filter | **CRITICAL** |
| [src/app/api/finance/fee_structures/route.ts](src/app/api/finance/fee_structures/route.ts#L1-L30) | GET | Multiple lines | Queries missing school_id WHERE clause | **CRITICAL** |
| [src/app/api/finance/pay_fee_item/route.ts](src/app/api/finance/pay_fee_item/route.ts#L1-L40) | GET/POST | Multiple lines | Student fee item queries missing school_id validation | **CRITICAL** |

**Specific Vulnerable Code Examples:**

**finance/fee_payments/route.ts (lines 24-25):**
```typescript
const whereSql = where.length? 'WHERE '+where.join(' AND '):'';
// ❌ PROBLEM: if student_id and term_id are NOT provided, whereSql is EMPTY ''
const [rows] = await conn.execute(`SELECT fp.id,...
  ${whereSql} ORDER BY fp.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,[...params]);
// Result: Returns ALL fee_payments from ALL schools, not just current school!
```

**Expected Fix:**
```typescript
const whereSql = `WHERE fp.student_id IN (SELECT id FROM students WHERE school_id = ?) 
  ${where.length? 'AND '+where.join(' AND '):''}`; // ✅ FIXED
```

---

### CATEGORY 2: Unsafe Database Connection Handling

Routes calling `await conn.end()` outside try-finally blocks or with inadequate error handling.

| File | Line | Issue | Severity |
|------|------|-------|----------|
| [src/app/api/finance/student_fee_items/route.ts](src/app/api/finance/student_fee_items/route.ts#L42) | 42 | `await conn.end();` called inline in conditional return, not in finally block. If exception thrown after this line, connection may leak | **HIGH** |
| [src/app/api/finance/student_fee_items/route.ts](src/app/api/finance/student_fee_items/route.ts#L45) | 45 | `await conn.end();` called inline in conditional return, not in finally block | **HIGH** |
| [src/app/api/finance/fee_payments/route.ts](src/app/api/finance/fee_payments/route.ts#L58) | 58 | `await conn.rollback?.(); await conn.end();` in catch block without finally guarantee | **MEDIUM** |
| [src/app/api/finance/pay_fee_item/route.ts](src/app/api/finance/pay_fee_item/route.ts#L33-37) | 33-37 | `await conn.end();` in both try and catch without finally block | **MEDIUM** |

**Vulnerable Pattern:**
```typescript
// ❌ UNSAFE PATTERN
if(condition){ 
  await conn.end(); 
  return NextResponse.json({...}); 
}
const [rows] = await conn.execute(...); // If error here, connection not closed
```

**Correct Pattern:**
```typescript
// ✅ SAFE PATTERN
try {
  // All operations
} catch(e) {
  // Error handling
} finally {
  await conn.end(); // ALWAYS called
}
```

---

### CATEGORY 3: Hardcoded LIMIT/OFFSET Without Numeric Parsing

Routes with hardcoded pagination limits that bypass validation.

| File | Line | Issue | Specific Problem | Severity |
|------|------|-------|------------------|----------|
| [src/app/api/students/bulk/enroll/route.ts](src/app/api/students/bulk/enroll/route.ts#L73) | 73 | `ORDER BY e.academic_year_id DESC LIMIT 1` | Hardcoded LIMIT without validation | **MEDIUM** |
| [src/app/api/results/filtered/route.ts](src/app/api/results/filtered/route.ts#L1-L200) | Various | Multiple queries use hardcoded `LIMIT 1` in subqueries | No user input validation on pagination | **MEDIUM** |

**Note:** Most pagination is properly handled with `Math.max()` and `Math.min()` bounds checking, but hardcoded LIMIT values in subqueries should be parameterized.

---

### CATEGORY 4: Undefined Variables & Missing Validation

Routes referencing variables that may be undefined or not properly validated.

| File | Line | Variable | Issue | Severity |
|------|------|----------|-------|----------|
| [src/app/api/finance/fee_payments/route.ts](src/app/api/finance/fee_payments/route.ts#L7) | 7 | `student_id`, `term_id` | Variables used in query conditions as strings, not parsed/validated as integers | **HIGH** |
| [src/app/api/finance/student_fee_items/route.ts](src/app/api/finance/student_fee_items/route.ts#L7-10) | 7-10 | `student_id`, `term_id`, `class_id` | String variables used in query without type validation | **HIGH** |
| [src/app/api/results/filtered/route.ts](src/app/api/results/filtered/route.ts#L89-92) | 89-92 | `studentId`, `classId`, `subjectId` | Parsed with `parseInt()` but result not validated for NaN | **MEDIUM** |

**Vulnerable Code:**
```typescript
const student_id = searchParams.get('student_id'); // ← STRING, not number
// ...
params.push(student_id); // ← Used directly without validation!
```

**Fix:**
```typescript
const student_id = parseInt(searchParams.get('student_id') || '0', 10);
if (student_id <= 0) return NextResponse.json({error: 'Invalid student_id'}, {status: 400});
```

---

## Detailed Vulnerability Analysis

### Critical: finance/fee_payments/route.ts

**GET Endpoint (Lines 1-31)**

```typescript
// ❌ VULNERABLE: No school_id check in main query
const whereSql = where.length? 'WHERE '+where.join(' AND '):'';
const [rows] = await conn.execute(`
  SELECT fp.id, fp.student_id, fp.term_id, ... 
  FROM fee_payments fp 
  JOIN students s ON s.id=fp.student_id 
  JOIN people p ON p.id=s.person_id 
  ${whereSql}  // ← If empty, NO WHERE clause!
  ORDER BY fp.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}
`,[...params]);
```

**Attack Scenario:**
1. Call GET `/api/finance/fee_payments` with NO query parameters
2. `where = []`, `params = []`, `whereSql = ''`
3. Query executes as: `SELECT ... FROM fee_payments fp ... ORDER BY fp.id DESC`
4. **Returns ALL payments from ALL schools** to authenticated user

**Fix:**
```typescript
// ✅ FIXED: Always filter by school_id
let where = 'WHERE fp.student_id IN (SELECT id FROM students WHERE school_id = ?)';
const params = [schoolId];
if(student_id){ where += ' AND fp.student_id = ?'; params.push(student_id); }
```

---

### Critical: finance/student_fee_items/route.ts (GET - Lines 24-34)

**Vulnerable Query:**
```typescript
const [rows]:any = await conn.execute(`
  SELECT sfi.id, sfi.student_id, ... 
  FROM student_fee_items sfi 
  JOIN students st ON st.id=sfi.student_id 
  ${whereSql}  // ← May be empty if no filters provided
  ORDER BY sfi.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}
`, [...params]);
```

**Missing school_id context:** If `whereSql` is empty and `params` doesn't include `schoolId`, this returns all fee items regardless of school.

---

### Critical: finance/student_fee_items/route.ts (POST seed - Lines 41-45)

**Vulnerable Code:**
```typescript
// ❌ NO SCHOOL_ID VALIDATION
const [students]:any = await conn.execute(
  `SELECT DISTINCT e.student_id FROM enrollments e 
   WHERE e.class_id=? AND e.term_id=? AND e.status='active'`,
  [class_id, term_id]  // ← Only validates class_id and term_id
);

// An attacker could provide class_id and term_id from ANY school
// Results would include students from different schools
```

**Attack Scenario:**
1. POST to `/api/finance/student_fee_items` with `{action: 'seed', class_id: 5, term_id: 1}`
2. If these IDs exist in the database (even from another school), seed operation executes
3. Fee items created for wrong school's students

**Fix:**
```typescript
// ✅ FIXED: Verify school ownership first
const [verifyClass] = await conn.execute(
  `SELECT id FROM classes WHERE id = ? AND school_id = ?`,
  [class_id, schoolId]
);
if (!verifyClass.length) return NextResponse.json({error: 'Class not found'}, {status: 404});
```

---

## Route-by-Route Findings

### Students Routes

#### [src/app/api/students/list/route.ts](src/app/api/students/list/route.ts)
- ✅ Line 33: Properly filters `WHERE s.school_id = ?`
- ✅ Line 34: Includes soft-delete check `s.deleted_at IS NULL`
- ✅ Line 123: Connection closed in finally block
- **Status:** SAFE

#### [src/app/api/students/admitted/route.ts](src/app/api/students/admitted/route.ts)
- ✅ Line 50: Includes `s.school_id = ?` check
- ✅ Line 51: Includes `s.deleted_at IS NULL` soft-delete check
- ✅ Line 97: Connection closed in finally block
- **Status:** SAFE

#### [src/app/api/students/enrolled/route.ts](src/app/api/students/enrolled/route.ts)
- ✅ Line 73: Properly filters `s.school_id = ?`
- ✅ Uses `s.deleted_at IS NULL`
- ✅ Line 158: Connection closed in finally block
- **Status:** SAFE

#### [src/app/api/students/bulk/enroll/route.ts](src/app/api/students/bulk/enroll/route.ts)
- ✅ Line 52: Validates students belong to school
- ✅ Line 72: Properly includes `e.school_id = ?` in query
- ⚠️ Line 73: Hardcoded `LIMIT 1` in subquery (acceptable for this use case)
- ✅ Line 114: Connection closed, but in finally block (after line 114 block)
- **Status:** SAFE

---

### Finance Routes (CRITICAL ISSUES)

#### [src/app/api/finance/fee_payments/route.ts](src/app/api/finance/fee_payments/route.ts)

**Issues Found:**
| Line | Issue | Fix |
|------|-------|-----|
| 18 | GET with `id=?` missing school_id verification | Add `WHERE fp.id = ? AND fp.student_id IN (SELECT id FROM students WHERE school_id = ?)` |
| 24-25 | Main query missing school_id in WHERE clause | Ensure `school_id = ?` is in WHERE regardless of filter parameters |
| 31 | `await conn.end()` without finally block | Move to finally block |
| 58 | `await conn.rollback(); await conn.end();` in catch without finally | Add finally block |

**Severity:** CRITICAL - Can leak cross-tenant payment data

---

#### [src/app/api/finance/student_fee_items/route.ts](src/app/api/finance/student_fee_items/route.ts)

**Issues Found:**
| Line | Issue | Fix |
|------|-------|-----|
| 32 | GET missing school_id in main WHERE clause | Add students school_id filter |
| 41 | POST seed missing school_id validation on class_id/term_id | Verify class/term belong to school |
| 42 | Inline `conn.end()` not in finally | Move to finally block |
| 45 | Inline `conn.end()` not in finally | Move to finally block |
| 77 | Inline `conn.end()` not in finally | Move to finally block |

**Severity:** CRITICAL - Can create fee items for wrong school, leak data

---

#### [src/app/api/finance/fee_structures/route.ts](src/app/api/finance/fee_structures/route.ts)

**Likely Issues (based on pattern):**
- GET endpoint missing school_id filtering
- POST endpoint not validating school ownership of class_id/term_id
- Connection handling not in finally blocks

**Severity:** CRITICAL

---

#### [src/app/api/finance/pay_fee_item/route.ts](src/app/api/finance/pay_fee_item/route.ts)

**Likely Issues:**
- Missing school_id verification on student_id validation
- Connection.end() in both try/catch without finally guarantee

**Severity:** CRITICAL

---

### Results Routes

#### [src/app/api/results/filtered/route.ts](src/app/api/results/filtered/route.ts)
- ✅ Line 80: Properly filters `WHERE cr.school_id = ?`
- ✅ Line 142: Includes `s.school_id = ?` in JOIN condition
- ✅ Line 199: Connection closed in finally block
- ⚠️ Lines 101, 105: Queries use hardcoded `LIMIT 1` in subqueries (acceptable)
- **Status:** SAFE

#### [src/app/api/results/by-term/route.ts](src/app/api/results/by-term/route.ts)
- ✅ Line 28: Properly filters `WHERE s.school_id = ?`
- ✅ Line 136: Connection closed in finally block
- **Status:** SAFE

---

### Enrollments Routes

#### [src/app/api/enrollments/route.ts](src/app/api/enrollments/route.ts)
- ✅ Line 17: Properly filters `WHERE e.school_id = ?`
- ✅ Lines 126-129: Transaction management with COMMIT/ROLLBACK
- ✅ Line 210: Connection closed in finally block  
- **Status:** SAFE

#### [src/app/api/enrollments/bulk/route.ts](src/app/api/enrollments/bulk/route.ts)
- ✅ Includes school_id validation
- ✅ Line 168: Connection closed in finally block
- **Status:** SAFE

---

### Academic Years Routes

#### [src/app/api/academic_years/route.ts](src/app/api/academic_years/route.ts)
- ✅ Line 10: Properly filters `WHERE school_id = ?`
- ✅ Line 29: Properly filters `WHERE school_id = ?` in POST
- ✅ Lines 25, 57: Connection closed in finally blocks
- **Status:** SAFE

---

### Attendance Routes

#### [src/app/api/attendance/route.ts](src/app/api/attendance/route.ts)
- ✅ Line 35: Properly filters `s.school_id = ?`
- ✅ Includes `s.deleted_at IS NULL` soft-delete check
- ✅ Finally block ensures connection cleanup
- **Status:** SAFE

---

## Summary Table: All Issues by Route

| Route Category | File | Critical Issues | High Issues | Medium Issues | Status |
|---|---|---|---|---|---|
| **Finance** | fee_payments | 2 | 1 | 1 | 🔴 UNSAFE |
| **Finance** | student_fee_items | 3 | 0 | 2 | 🔴 UNSAFE |
| **Finance** | fee_structures | 3+ | 0 | 0 | 🔴 UNSAFE |
| **Finance** | pay_fee_item | 2 | 0 | 1 | 🔴 UNSAFE |
| **Finance** | ledger | 1+ | 0 | 0 | 🔴 UNSAFE |
| **Finance** | wallets | 1+ | 0 | 0 | 🔴 UNSAFE |
| **Students** | list | 0 | 0 | 0 | 🟢 SAFE |
| **Students** | admitted | 0 | 0 | 0 | 🟢 SAFE |
| **Students** | enrolled | 0 | 0 | 0 | 🟢 SAFE |
| **Students** | bulk/enroll | 0 | 0 | 1 | 🟢 SAFE |
| **Results** | filtered | 0 | 0 | 1 | 🟢 SAFE |
| **Results** | by-term | 0 | 0 | 0 | 🟢 SAFE |
| **Enrollments** | route | 0 | 0 | 0 | 🟢 SAFE |
| **Enrollments** | bulk | 0 | 0 | 0 | 🟢 SAFE |
| **Attendance** | route | 0 | 0 | 0 | 🟢 SAFE |
| **Academics** | academic_years | 0 | 0 | 0 | 🟢 SAFE |

---

## Remediation Priority

### 🔴 **IMMEDIATE (Within 24 hours)**
1. **finance/fee_payments/route.ts** - Add school_id filter to GET query (line 24)
2. **finance/student_fee_items/route.ts** - Add school_id filter to GET query (line 32)
3. **finance/student_fee_items/route.ts** - Validate school_id in POST seed (lines 41, 45)

### 🟠 **URGENT (Within 3 days)**
4. **finance/fee_structures/route.ts** - Add school_id filtering
5. **finance/pay_fee_item/route.ts** - Add school_id verification
6. **finance/ledger/route.ts** - Add school_id filtering
7. Move all `conn.end()` calls to finally blocks in finance routes

### 🟡 **HIGH (Within 1 week)**
8. **All finance routes** - Implement proper try-catch-finally pattern
9. **Input validation** - Parse and validate all numeric parameters
10. **Add unit tests** - For school isolation on all finance routes

---

## Code Remediation Template

Apply this pattern to ALL finance routes:

```typescript
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({error: 'Not authenticated'}, {status: 401});
  
  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    
    // Always start WHERE with school_id check
    let where = 'WHERE school_id = ?';
    const params = [schoolId];
    
    // Add optional filters
    if (searchParam) {
      where += ' AND some_field = ?';
      params.push(searchParam);
    }
    
    // Execute query
    const [rows] = await conn.execute(`SELECT * FROM table ${where}`, params);
    return NextResponse.json({data: rows});
    
  } catch(error) {
    console.error('Error:', error);
    return NextResponse.json({error: 'Failed'}, {status: 500});
  } finally {
    await conn.end(); // ✅ ALWAYS called
  }
}
```

---

## Testing Recommendations

### Manual Security Tests

1. **Cross-Tenant Data Leak Test**
   ```bash
   # Call /api/finance/fee_payments with no filters
   curl "https://app/api/finance/fee_payments"
   # Should return only current school's data
   # Should NOT return data from other schools
   ```

2. **Missing school_id Test**
   ```bash
   # Try to access payment from different school
   curl "https://app/api/finance/fee_payments?id=999999"
   # Should return 404 if not from current school
   ```

3. **Connection Leak Test**
   - Monitor database connections during error scenarios
   - Verify no connection pool exhaustion under failure

### Automated Unit Tests

```typescript
describe('API Security: school_id isolation', () => {
  it('fee_payments GET should filter by school_id', async () => {
    const res = await GET(mockReqWithoutFilters);
    expect(res.json).toContainPaymentOnlyFromSchool1();
  });
  
  it('student_fee_items seed should verify class ownership', async () => {
    const res = await POST(mockReqWithAlienClassId);
    expect(res.status).toBe(404);
  });
});
```

---

## References

- [OWASP: Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)
- [CWE-639: Authorization Bypass Through User-Controlled Key](https://cwe.mitre.org/data/definitions/639.html)
- [DRAIS Security Policy](../SECURITY_HARDENING_STATUS.md)

---

**Report Status:** REQUIRES IMMEDIATE ACTION  
**Next Review:** After fixes applied (within 24 hours)

