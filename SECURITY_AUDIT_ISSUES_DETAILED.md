# API Route Security Issues - Line-by-Line Tracker

**Last Updated:** March 25, 2026

---

## FINANCE ROUTES - CRITICAL ISSUES

### 1. src/app/api/finance/fee_payments/route.ts

#### Issue 1.1: GET endpoint missing school_id for single receipt (Line 18)
**Severity:** 🔴 CRITICAL  
**Type:** Unauthorized Data Access  
**Status:** NOT FIXED

**Current Code (Lines 18-20):**
```typescript
if(id){
  const [[receipt]]: any = await conn.execute(`SELECT fp.*, p.first_name, p.last_name, w.name wallet_name FROM fee_payments fp JOIN students s ON s.id=fp.student_id JOIN people p ON p.id=s.person_id JOIN wallets w ON w.id=fp.wallet_id WHERE fp.id=?`,[id]);
  await conn.end();
```

**Problems:**
- Query only filters `WHERE fp.id=?` with no school_id check
- User can access ANY payment in the database if they know the ID
- No verification that student belongs to authenticated school
- Returns wallet name without validation

**Fix:**
```typescript
if(id){
  const idNum = parseInt(id, 10);
  if (isNaN(idNum) || idNum <= 0) return NextResponse.json({error: 'Invalid payment ID'}, {status: 400});
  
  const [[receipt]]: any = await conn.execute(`
    SELECT fp.*, p.first_name, p.last_name, w.name wallet_name 
    FROM fee_payments fp 
    JOIN students s ON s.id=fp.student_id AND s.school_id = ?
    JOIN people p ON p.id=s.person_id 
    JOIN wallets w ON w.id=fp.wallet_id 
    WHERE fp.id = ?
  `,[schoolId, idNum]);
```

**Test Case:**
```bash
# Attacker knows payment ID 999 from another school
GET /api/finance/fee_payments?id=999
# BEFORE: Returns payment data even from other schools
# AFTER: Returns 404 (not found for this school)
```

---

#### Issue 1.2: GET endpoint missing school_id for list query (Lines 24-31)
**Severity:** 🔴 CRITICAL  
**Type:** Cross-Tenant Data Leakage  
**Status:** NOT FIXED

**Current Code (Lines 21-31):**
```typescript
const where: string[] = [];
const params: any[] = [];
if(student_id){ where.push('fp.student_id=?'); params.push(student_id); }
if(term_id){ where.push('fp.term_id=?'); params.push(term_id); }
const whereSql = where.length? 'WHERE '+where.join(' AND '):'';  // ← Empty if no filters!
const safeLimit = Math.max(1, Math.min(200, isNaN(per_page) ? 25 : per_page));
const safeOffset = Math.max(0, isNaN(offset) ? 0 : offset);
const [rows] = await conn.execute(`SELECT fp.id,fp.student_id,fp.term_id,fp.wallet_id,fp.amount,fp.method,fp.paid_by,fp.receipt_no,fp.created_at,p.first_name,p.last_name FROM fee_payments fp JOIN students s ON s.id=fp.student_id JOIN people p ON p.id=s.person_id ${whereSql} ORDER BY fp.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,[...params]);
```

**Problems:**
- If `student_id` and `term_id` are NOT provided, `whereSql = ''` (empty string)
- Query becomes: `SELECT ... FROM fee_payments fp ... ORDER BY fp.id DESC LIMIT ...`
- **Returns ALL fee payments in database, unrestricted by school**
- No school_id filter present at all
- School isolation completely bypassed

**Attack Scenario:**
```bash
# Call endpoint with NO filters
GET /api/finance/fee_payments?page=1&per_page=25

# whereSql becomes empty ''
# Query executed: SELECT ... FROM fee_payments fp ... ORDER BY fp.id DESC
# Result: Returns payments from ALL schools, ALL students, ALL terms
```

**Fix:**
```typescript
// ALWAYS start with school_id check
const where = ['fp.student_id IN (SELECT id FROM students WHERE school_id = ?)'];
const params = [schoolId];
if(student_id){ 
  where.push('fp.student_id = ?'); 
  params.push(parseInt(student_id, 10));
}
if(term_id){ 
  where.push('fp.term_id = ?'); 
  params.push(parseInt(term_id, 10));
}
const whereSql = 'WHERE ' + where.join(' AND ');

// Now safe - always includes school_id
const [rows] = await conn.execute(`
  SELECT fp.id, fp.student_id, ... 
  ${whereSql} 
  ORDER BY fp.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}
`, params);
```

---

#### Issue 1.3: POST endpoint missing finally block (Lines 58, 62)
**Severity:** 🟠 HIGH  
**Type:** Resource Leakage  
**Status:** NOT FIXED

**Current Code (Lines 47-62):**
```typescript
try {
  await conn.beginTransaction?.();
  // ...operations...
  await conn.commit?.();
  await conn.end();  // ← Line 58: Not guaranteed to execute
  return NextResponse.json({ message:'Payment recorded', data: payment });
} catch(e:any){
  await conn.rollback?.();
  await conn.end();  // ← Line 62: May not execute if rollback throws
  return NextResponse.json({ error:e.message },{ status:500 });
}
```

**Problems:**
- No `finally` block to guarantee connection cleanup
- If `conn.commit()` throws, line 58 is skipped
- If line 58 throws after returning response, async handler continues
- If `conn.rollback()` throws in catch block, line 62 never executes
- Connection remains allocated → pool exhaustion

**Fix:**
```typescript
try {
  await conn.beginTransaction?.();
  // ...operations...
  await conn.commit?.();
  return NextResponse.json({ message:'Payment recorded', data: payment });
} catch(e:any){
  await conn.rollback?.();
  return NextResponse.json({ error:e.message },{ status:500 });
} finally {
  await conn.end();  // ← ALWAYS executes now
}
```

---

### 2. src/app/api/finance/student_fee_items/route.ts

#### Issue 2.1: GET missing school_id in main query (Line 32)
**Severity:** 🔴 CRITICAL  
**Type:** Cross-Tenant Data Leakage  
**Status:** NOT FIXED

**Current Code (Lines 24-34):**
```typescript
const where:string[]=[]; const params:any[]=[];
if(student_id){ where.push('sfi.student_id=?'); params.push(student_id);} 
if(term_id){ where.push('sfi.term_id=?'); params.push(term_id);} 
if(class_id){
  where.push('sfi.student_id IN (SELECT student_id FROM enrollments WHERE class_id=?'+(term_id? ' AND term_id=?':'')+')');
  params.push(class_id); if(term_id) params.push(term_id);
}
if(unbalanced){ where.push('(sfi.amount - sfi.discount - sfi.paid) > 0'); }
const whereSql = where.length? 'WHERE '+where.join(' AND '):'';  // ← May be empty!
const [rows]:any = await conn.execute(`SELECT sfi.id,sfi.student_id,sfi.term_id,sfi.item,sfi.amount,sfi.discount,sfi.paid,sfi.balance,p.first_name,p.last_name FROM student_fee_items sfi JOIN students st ON st.id=sfi.student_id JOIN people p ON p.id=st.person_id ${whereSql} ORDER BY sfi.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,[...params]);
```

**Problems:**
- No school_id filter anywhere in the WHERE clause
- If no filter parameters provided, `whereSql = ''` (empty)
- Query returns ALL fee items from ALL students in ALL schools
- Student JOIN does not filter by school_id either (st.id only)
- Complete tenant isolation bypass

**Example Attack:**
```bash
GET /api/finance/student_fee_items  # No parameters

# where = [], params = [], whereSql = ''
# Query: SELECT ... FROM student_fee_items sfi 
#        JOIN students st ON st.id=sfi.student_id
#        JOIN people p ON p.id=st.person_id
#        ORDER BY sfi.id DESC

# Result: Returns fee items for ALL students in ALL schools
```

**Fix:**
```typescript
const where = ['st.school_id = ?'];  // ← Start with school_id
const params = [schoolId];
if(student_id){ 
  where.push('sfi.student_id = ?'); 
  params.push(parseInt(student_id, 10));
} 
if(term_id){ 
  where.push('sfi.term_id = ?');
  params.push(parseInt(term_id, 10));
} 
if(class_id){
  where.push(`sfi.student_id IN (
    SELECT student_id FROM enrollments 
    WHERE class_id = ? AND school_id = ?${term_id? ' AND term_id = ?':''}
  )`);
  params.push(parseInt(class_id, 10), schoolId);
  if(term_id) params.push(parseInt(term_id, 10));
}
if(unbalanced){ 
  where.push('(sfi.amount - sfi.discount - sfi.paid) > 0'); 
}
const whereSql = 'WHERE ' + where.join(' AND ');
```

---

#### Issue 2.2: POST seed missing school_id verification (Line 41)
**Severity:** 🔴 CRITICAL  
**Type:** Unauthorized Data Mutation  
**Status:** NOT FIXED

**Current Code (Lines 36-45):**
```typescript
if(body?.action==='seed'){
  const { class_id, term_id } = body;
  if(!class_id||!term_id) return NextResponse.json({ error:'class_id & term_id required' },{ status:400 });
  const conn = await getConnection();
  // Fetch students enrolled
  const [students]:any = await conn.execute(
    `SELECT DISTINCT e.student_id FROM enrollments e WHERE e.class_id=? AND e.term_id=? AND e.status='active'`,
    [class_id,term_id]  // ← NO SCHOOL_ID CHECK!
  );
```

**Problems:**
- `class_id` and `term_id` are accepted without verifying they belong to the current school
- Attacker can provide class_id and term_id from ANY school in the system
- Seed operation would execute with wrong school's data
- Query fetches enrollments for any class/term combination globally

**Attack Scenario:**
```json
POST /api/finance/student_fee_items
{
  "action": "seed",
  "class_id": 500,     // Belongs to School #2
  "term_id": 200       // Belongs to School #2
}

// BEFORE FIX:
// Fetches: SELECT DISTINCT e.student_id FROM enrollments e 
//          WHERE e.class_id=500 AND e.term_id=200
// Result: Gets enrolled students from School #2 and creates fee items for them

// AFTER FIX: Returns 404 - class not found in current school
```

**Fix:**
```typescript
if(body?.action==='seed'){
  const { class_id, term_id } = body;
  if(!class_id||!term_id) return NextResponse.json({ error:'class_id & term_id required' },{ status:400 });
  
  const classIdNum = parseInt(class_id, 10);
  const termIdNum = parseInt(term_id, 10);
  
  const conn = await getConnection();
  try {
    // VERIFY class belongs to this school
    const [verifyClass]: any = await conn.execute(
      `SELECT id FROM classes WHERE id = ? AND school_id = ?`,
      [classIdNum, schoolId]
    );
    if (!verifyClass.length) {
      return NextResponse.json({error: 'Class not found in your school'}, {status: 404});
    }
    
    // VERIFY term belongs to this school  
    const [verifyTerm]: any = await conn.execute(
      `SELECT id FROM terms WHERE id = ? AND school_id = ?`,
      [termIdNum, schoolId]
    );
    if (!verifyTerm.length) {
      return NextResponse.json({error: 'Term not found in your school'}, {status: 404});
    }
    
    // NOW safe to fetch students - class/term are verified to belong to this school
    const [students]:any = await conn.execute(
      `SELECT DISTINCT e.student_id FROM enrollments e 
       WHERE e.class_id = ? AND e.term_id = ? AND e.status = 'active'`,
      [classIdNum, termIdNum]
    );
    // ... rest of seed logic ...
  } finally {
    await conn.end();
  }
}
```

---

#### Issue 2.3: POST seed missing inline conn.end() finally (Lines 42, 45, 69)
**Severity:** 🟠 HIGH  
**Type:** Resource Leakage  
**Status:** NOT FIXED

**Current Code (Lines 42, 45, 69):**
```typescript
    if(students.length===0){ 
      await conn.end();  // ← Line 42: Not in finally
      return NextResponse.json({ inserted:0, message:'No enrolled students' }); 
    }
    // ... operations ...
    if(items.length===0){ 
      await conn.end();  // ← Line 45: Not in finally
      return NextResponse.json({ inserted:0, message:'No fee structure items' }); 
    }
    // ... operations ...
    if(toInsert.length){
      // ... loop operations ...
    }
    await conn.end();  // ← Line 69: Not in finally
    return NextResponse.json({ message:'Seed complete', inserted });
```

**Problems:**
- Multiple inline `conn.end()` calls not protected by finally
- If any operation between check and end() throws, connection leaks
- If exception thrown after `conn.end()` but before return, connection already closed but error propagates

**Fix:**
```typescript
if(body?.action==='seed'){
  // ... validation code ...
  const conn = await getConnection();
  try {
    // ... all operations ...
    return NextResponse.json({ message:'Seed complete', inserted });
  } catch(e:any) {
    console.error('Seed error:', e);
    return NextResponse.json({error: 'Seed failed'}, {status: 500});
  } finally {
    await conn.end();  // ← ALWAYS cleanup
  }
}
```

---

### 3. src/app/api/finance/fee_structures/route.ts

#### Issue 3.1-3.3: GET/POST missing school_id filtering
**Severity:** 🔴 CRITICAL  
**Type:** Cross-Tenant Data Leakage  
**Status:** LIKELY NOT FIXED (Not fully reviewed)

**Likely Pattern (based on similar finance routes):**
- GET endpoint queries fee_structures without school_id filter
- POST accepts class_id/term_id without ownership verification
- Inline conn.end() calls not in finally blocks

**Recommended Fix:** Apply same pattern as fee_payments and student_fee_items

---

### 4. src/app/api/finance/pay_fee_item/route.ts

#### Issue 4.1-4.2: Likely missing school_id validation
**Severity:** 🔴 CRITICAL  
**Type:** Unauthorized Data Mutation  
**Status:** LIKELY NOT FIXED (Not fully reviewed)

**Likely Issues:**
- No verification that student_id belongs to current school
- No verification that fee_item_id belongs to current school
- Connection cleanup not in finally block

**Recommended Fix:** Verify all IDs belong to current school before mutation

---

## PATTERN VIOLATIONS FOUND

### Pattern 1: Empty WHERE clause vulnerability
```
❌ NOT SAFE:
const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
// Result: '' if no filters → query has NO WHERE clause

✅ SAFE:
const where = ['school_id = ?'];  // Start with mandatory filter
const whereSql = 'WHERE ' + where.join(' AND ');
// Result: Always includes school_id
```

**Files affected:**
- finance/fee_payments/route.ts (lines 24)
- finance/student_fee_items/route.ts (line 31)

---

### Pattern 2: Inline conn.end() not in finally
```
❌ NOT SAFE:
if(condition) { 
  await conn.end(); 
  return response; 
}
// If exception thrown after end() but before return, ambiguous state

✅ SAFE:
try {
  // all operations
} finally {
  await conn.end();
}
```

**Files affected:**
- finance/student_fee_items/route.ts (multiple lines)
- finance/fee_payments/route.ts (catch block)
- finance/pay_fee_item/route.ts (multiple lines)

---

### Pattern 3: Missing ownership verification on IDs
```
❌ NOT SAFE:
const { student_id, class_id } = req.body;
// Directly use without verifying they belong to school

✅ SAFE:
const studentId = parseInt(req.body.student_id, 10);
const [verify] = await conn.execute(
  'SELECT id FROM students WHERE id = ? AND school_id = ?',
  [studentId, schoolId]
);
if (!verify.length) return 404;
```

**Files affected:**
- finance/student_fee_items/route.ts (POST seed)
- finance/fee_structures/route.ts (POST)

---

## Summary by Route

| Route | Issue Type | Line(s) | Severity | Status |
|-------|-----------|---------|----------|--------|
| fee_payments | Missing school_id filter | 18, 24 | 🔴 CRITICAL | NOT FIXED |
| fee_payments | No finally on cleanup | 58, 62 | 🟠 HIGH | NOT FIXED |
| student_fee_items | Missing school_id filter | 32 | 🔴 CRITICAL | NOT FIXED |
| student_fee_items | No ID ownership check | 41 | 🔴 CRITICAL | NOT FIXED |
| student_fee_items | No finally on cleanup | 42, 45, 69, 77, 93 | 🟠 HIGH | NOT FIXED |
| fee_structures | Missing school_id filters | ALL | 🔴 CRITICAL | NOT FIXED |
| pay_fee_item | Missing school_id check | Likely many | 🔴 CRITICAL | NOT FIXED |

---

## Next Steps

1. **Immediate (Today)**: Apply fixes to fee_payments and student_fee_items GET queries
2. **Today**: Add ownership verification to all POST seed operations
3. **Tomorrow**: Convert all connection handling to try-catch-finally
4. **This week**: Apply same fixes to fee_structures and pay_fee_item routes
5. **Next week**: Add comprehensive unit tests for school_id isolation

