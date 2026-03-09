📋 MULTI-TENANT ISOLATION AUDIT
=============================

🚨 CRITICAL PRINCIPLE 🚨
=============================

Every single database query MUST include:

  WHERE school_id = request.schoolId

NO EXCEPTIONS.

Never trust frontend to provide school_id.
Always derive school_id from session: sessions.school_id

If a query that returns tenant data doesn't have this filter:
  → DATA LEAKAGE VULNERABILITY
  → Cross-tenant data exposure
  → CRITICAL SECURITY BUG

=============================

TABLES REQUIRING school_id FILTERING
=============================

These tables MUST have school_id filter on ALL queries:

✅ users
   Unique key: (school_id, email)
   Query pattern: WHERE school_id = ? AND email = ?

✅ roles
   Unique key: (school_id, name)
   Query pattern: WHERE school_id = ? AND name = ?

✅ user_roles
   Via FK from roles
   Query pattern: WHERE role_id IN (SELECT id FROM roles WHERE school_id = ?)

✅ role_permissions
   Via FK from roles
   Query pattern: WHERE role_id IN (SELECT id FROM roles WHERE school_id = ?)

✅ sessions
   Direct FK
   Query pattern: WHERE school_id = ? AND session_token = ?

✅ audit_logs
   Direct FK
   Query pattern: WHERE school_id = ?

✅ All existing tables (students, classes, staff, attendance, etc.)
   Most have school_id added by 004 migration
   Query pattern: WHERE school_id = ? AND ...

=============================

ENDPOINT AUDIT CHECKLIST
=============================

🔐 Authentication Endpoints
   □ POST /api/auth/login
     - Must check: user.school_id filtering
     - Current: ✅ Checks via email + optional school_id param
   
   □ POST /api/auth/logout  
     - No school_id needed (uses session token)
     - Current: ✅ OK
   
   □ GET /api/auth/me
     - MUST verify: session.school_id = request.schoolId
     - MUST return: school.setup_complete for setup lock
     - Current: ⚠️ Needs verification

🏫 School Endpoints
   □ GET /api/schools/current
     - Query: SELECT * FROM schools WHERE id = ?
     - session.school_id used as parameter
     - Pattern: ✅ OK

   □ PUT /api/settings/school
     - UPDATE schools SET ... WHERE id = ?
     - Verify: school_id from session, not frontend
     - Pattern: ⚠️ Needs verification

👥 User Management Endpoints
   □ GET /api/users
     - MUST include: WHERE school_id = session.school_id
     - NEVER return users from other schools
     - Pattern: ⚠️ Audit needed

   □ POST /api/users
     - MUST set: user.school_id = session.school_id
     - NEVER trust frontend for school_id
     - Pattern: ⚠️ Audit needed

   □ PUT /api/users/[id]
     - MUST verify: user.school_id = session.school_id before update
     - Pattern: ⚠️ Audit needed

   □ DELETE /api/users/[id]
     - MUST verify: user.school_id = session.school_id before delete
     - Pattern: ⚠️ Audit needed

👨‍🎓 Student Endpoints
   □ GET /api/students
     - Query: WHERE school_id = ? ...
     - Pattern: ⚠️ Audit needed

   □ POST /api/students
     - MUST: student.school_id = session.school_id
     - Pattern: ⚠️ Audit needed

🎓 Academic Endpoints
   □ GET /api/classes
     - Query: WHERE school_id = ? ...
     - Pattern: ⚠️ Audit needed

   □ GET /api/subjects
     - Query: WHERE school_id = ? ...
     - Pattern: ⚠️ Audit needed

   □ GET /api/attendance
     - Query: WHERE school_id = ? ...
     - Pattern: ⚠️ Audit needed

💰 Finance Endpoints
   □ GET /api/finance/*
     - Query: WHERE school_id = ? ...
     - Pattern: ⚠️ Audit needed

📊 Reports Endpoints
   □ GET /api/reports/*
     - Query: WHERE school_id = ? ...
     - Pattern: ⚠️ Audit needed

=============================

CODE PATTERNS TO ENFORCE
=============================

❌ WRONG - No school_id filter:
   const [users] = await connection.execute(
     'SELECT * FROM users WHERE email = ?',
     [email]
   );

✅ CORRECT - Includes school_id:
   const [users] = await connection.execute(
     'SELECT * FROM users WHERE school_id = ? AND email = ?',
     [schoolId, email]
   );

❌ WRONG - Trusting frontend for school_id:
   const schoolId = req.body.school_id;
   // Frontend could send different school_id

✅ CORRECT - Derive from session:
   const schoolId = session.schoolId;
   // session.schoolId comes from DB, not frontend

❌ WRONG - JOIN without school_id filter:
   SELECT u.*, r.name FROM users u
   JOIN user_roles ur ON u.id = ur.user_id
   JOIN roles r ON ur.role_id = r.id;

✅ CORRECT - Filter by school_id:
   SELECT u.*, r.name FROM users u
   JOIN user_roles ur ON u.id = ur.user_id
   JOIN roles r ON ur.role_id = r.id
   WHERE u.school_id = ? AND r.school_id = ?;

❌ WRONG - Update without school_id check:
   await connection.execute(
     'UPDATE users SET ... WHERE id = ?',
     [userId]
   );

✅ CORRECT - Verify ownership by school_id:
   await connection.execute(
     'UPDATE users SET ... WHERE id = ? AND school_id = ?',
     [userId, schoolId]
   );

=============================

REQUEST/RESPONSE VALIDATION
=============================

Every Protected Route Handler Must:

1. Extract session from middleware/context
2. Get schoolId from session: const schoolId = session.schoolId
3. Use schoolId in ALL database queries
4. NEVER accept school_id from request body
5. NEVER accept school_id from request query params

Example - Safe API Handler:

```typescript
export async function GET(request: NextRequest) {
  // Get session (already validated by middleware)
  const session = await validateSessionFromRequest(request);
  if (!session) return 401 Unauthorized;

  // GET schoolId from session (AUTHORITATIVE SOURCE)
  const schoolId = session.schoolId;

  // Query with school_id filter
  const [rows] = await connection.execute(
    'SELECT * FROM users WHERE school_id = ?',
    [schoolId]
  );

  // Verify response only contains data for this school
  // Already guaranteed by query filter

  return Response(rows);
}
```

Example - UNSAFE API Handler (DO NOT DO THIS):

```typescript
export async function GET(request: NextRequest) {
  // ❌ WRONG: Getting school_id from query param
  const schoolId = request.nextUrl.searchParams.get('school_id');

  // ❌ WRONG: Trusting frontend input
  const [rows] = await connection.execute(
    'SELECT * FROM users WHERE school_id = ?',
    [schoolId]  // Frontend can send different school_id
  );

  return Response(rows);
}
```

=============================

TESTING MULTI-TENANT ISOLATION
=============================

Critical Tests (Must Pass):

1. Two-School Data Isolation
   ✓ Create school1 + school2
   ✓ Create users in each school with same email
   ✓ Login as school1 user
   ✓ Call GET /api/users → should see ONLY school1 users
   ✓ Manually try to access school2 via ?school_id=2 → should fail
   ✓ Verify school2 data is NOT in response

2. Permission Isolation
   ✓ User in school1 with role "Teacher"
   ✓ User in school2 with role "Admin"
   ✓ Login as school1 user
   ✓ Verify roles = ["Teacher"], not ["Admin"]
   ✓ Verify permissions don't include school2 permissions

3. Session Isolation
   ✓ Create sessions for user in school1 and school2
   ✓ With school1 session cookie, access school2 → 401
   ✓ Verify session.school_id enforced

4. Cross-Tenant Attack Prevention
   ✓ Login as school1 user
   ✓ Try to UPDATE user in school2: PUT /api/users/999 { school_id: 2 }
   ✓ Should fail with 403 or 404 (not found in school1)

=============================

IMPLEMENTATION PRIORITY
=============================

Must Fix First (Critical):
1. Audit all /api/users/* endpoints
2. Audit all /api/students/* endpoints
3. Audit all /api/classes/* endpoints

Should Fix Soon (Important):
4. Audit all /api/attendance/* endpoints
5. Audit all /api/finance/* endpoints
6. Audit all /api/reports/* endpoints

Good to Do (Nice to Have):
7. Audit all other endpoints
8. Add automated tests for multi-tenant isolation

=============================

ISOLATION VERIFICATION SCRIPT
=============================

Create this test to verify multi-tenant isolation:

```typescript
// test/multi-tenant-isolation.test.ts

async function testMultiTenantIsolation() {
  // 1. Create two schools
  const school1 = await createSchool('School 1');
  const school2 = await createSchool('School 2');

  // 2. Create users in each school
  const user1 = await createUser(school1, 'user@test.com');
  const user2 = await createUser(school2, 'user@test.com'); // same email!

  // 3. Login as user1 in school1
  const session1 = await login(user1.email, 'password', school1.id);

  // 4. Fetch users list with school1 session
  const users = await getUsers(session1); // Should have school1.schoolId

  // 5. Verify isolation
  assert(users.every(u => u.school_id === school1.id), 
    'FAIL: Got users from other school!');

  assert(!users.find(u => u.id === user2.id),
    'FAIL: Got user from school2!');

  console.log('✅ Multi-tenant isolation verified');
}
```

=============================
