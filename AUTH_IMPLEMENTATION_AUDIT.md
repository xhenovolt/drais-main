📋 DRAIS V1 SESSION AUTH - IMPLEMENTATION AUDIT & ROADMAP
=========================================================

CRITICAL: This is the SPINE of your SaaS. We implement this methodically & correctly.

🗄️ DATABASE SCHEMA VERIFICATION
=================================

Status: ✅ VERIFIED

Tables Required:
✅ sessions - session_token(UNIQUE), user_id, school_id, expires_at, is_active
✅ users - school_id, password_hash, is_active, email(UNIQUE per school)
✅ schools - id, name, setup_complete
✅ roles - school_id, name
✅ permissions - code(UNIQUE), description
✅ user_roles - user_id, role_id
✅ role_permissions - role_id, permission_id

Schema Constraint Check:
✅ users.school_id → schools.id (FK)
✅ sessions.user_id → users.id (FK)
✅ sessions.school_id → schools.id (FK)
✅ roles.school_id → schools.id (FK)
✅ user_roles.user_id → users.id (FK)
✅ user_roles.role_id → roles.id (FK)

========================================================================================

🛣️ ROUTE ACCESS RULES - IMPLEMENTATION CHECKLIST
==================================================

PUBLIC ROUTES (No authentication needed):
- / (homepage)
- /login
- /signup
- /forgot-password
- /reset-password
- /api/auth/login
- /api/auth/signup
- /api/auth/logout

Requirements for public routes:
☐ NO navbar shown
☐ NO sidebar shown
☐ NO session verification
☐ Clean, centered layout
☐ Cannot set cookies for multiple schools (no x-school-id leak)

PROTECTED ROUTES (All others):
- Everything else requires valid session

Requirements:
☐ Session cookie must exist
☐ Session must not be expired
☐ User must be is_active = TRUE
☐ Return 401 if invalid
☐ Show navbar + sidebar if logged in

PERMISSION-BASED ROUTES (Future):
- Some routes may require specific permission
☐ Check user.permissions includes required code
☐ Return 403 if not allowed
☐ Show "Permission Denied" UI

========================================================================================

🔐 SESSION AUTHENTICATION FLOW
==============================

LOGIN ENDPOINT: POST /api/auth/login

Input: { email, password, school_id? }
Process:
  1. Validate input (email + password required)
  2. Query: SELECT * FROM users WHERE email = ? AND school_id = ? AND deleted_at IS NULL
  3. If no user found → 400 { error: "Invalid credentials" }
  4. If user.is_active = FALSE → 401 { error: "Account inactive" }
  5. bcrypt.compare(password, user.password_hash)
  6. If failed → 401 { error: "Invalid credentials" }
  7. Generate session token: crypto.randomBytes(32).toString('hex')
  8. INSERT INTO sessions (user_id, school_id, session_token, expires_at, is_active)
  9. Set HTTP-only cookie: drais_session=token (Max-Age: 7 days)
  10. Return 200: { user: {...}, school: {...} }

☐ MUST set session cookie in response
☐ MUST include HttpOnly flag (no JS access)
☐ MUST include Secure flag (production only)
☐ MUST include SameSite=Lax
☐ MUST NOT leak school_id to frontend
☐ MUST NOT store password in response

LOGOUT ENDPOINT: POST /api/auth/logout

Input: (from session cookie)
Process:
  1. Get session token from cookie
  2. UPDATE sessions SET is_active = FALSE WHERE session_token = ?
  3. Clear cookie in response
  4. Return 200 { success: true }

☐ MUST clear cookie from response
☐ MUST mark session as inactive (not delete)
☐ MUST work even if session is already invalid

ME ENDPOINT: GET /api/auth/me

Input: (from session cookie)
Process:
  1. Get session token from cookie
  2. SELECT s.*, u.*, r.name FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.session_token = ? AND s.school_id = ?
         AND s.expires_at > NOW() AND s.is_active = TRUE
         AND u.is_active = TRUE
  3. If not found → 401 { error: "Session invalid" }
  4. Fetch user permissions: getUserPermissions(u.id, s.school_id)
  5. Fetch user roles: getUserRoles(u.id, s.school_id)
  6. SELECT setup_complete FROM schools WHERE id = ?
  7. Return 200: { user, school: { setup_complete }, permissions, roles }

☐ MUST validate session not expired
☐ MUST validate session is active
☐ MUST validate user is active
☐ MUST return permissions array
☐ MUST return roles array
☐ MUST return school setup status

========================================================================================

🛡️ MIDDLEWARE - REQUEST VALIDATION
===================================

Global middleware: /middleware.ts OR route-level middleware for protected routes

On Every Protected Request:

Step 1: Extract session token from cookie
  ☐ const token = request.cookies.get('drais_session')?.value
  ☐ If no token → 401

Step 2: Validate session in DB
  ☐ SELECT * FROM sessions WHERE session_token = ? AND is_active = TRUE
  ☐ Check: expires_at > NOW()
  ☐ If invalid → 401

Step 3: Validate user
  ☐ SELECT * FROM users WHERE id = ? AND is_active = TRUE AND deleted_at IS NULL
  ☐ If invalid → 401

Step 4: Load permissions & roles
  ☐ Call getUserPermissions(userId, schoolId)
  ☐ Call getUserRoles(userId, schoolId)

Step 5: Get school info
  ☐ SELECT setup_complete FROM schools WHERE id = ?

Step 6: Attach to request context
  ☐ request.user = { id, email, display_name, school_id, ...}
  ☐ request.permissions = ['user.read', 'user.create', ...]
  ☐ request.roles = ['Admin', 'Teacher', ...]
  ☐ request.schoolSetupComplete = boolean

Permission Check (if route requires specific permission):
  ☐ if (request.permissions.includes('*')) return next() // SuperAdmin
  ☐ if (!request.permissions.includes(requiredPermission)) return 403

Role Check (if route requires specific role):
  ☐ if (!request.roles.includes(requiredRole)) return 403

Multi-Tenant Isolation:
  ☐ ALL database queries MUST use: WHERE school_id = request.schoolId
  ☐ NEVER trust frontend to provide school_id
  ☐ ALWAYS derive from session: sessions.school_id

Error Response Format:
  ☐ 401: { error: "Unauthorized", code: "SESSION_INVALID" }
  ☐ 403: { error: "Forbidden", code: "PERMISSION_DENIED" }
  ☐ 500: { error: "Internal server error", code: "SERVER_ERROR" }

========================================================================================

🎨 LAYOUT SEPARATION (CRITICAL)
================================

PUBLIC LAYOUT (for auth pages): /src/app/(auth)/layout.tsx

Features:
  ✓ No navbar
  ✓ No sidebar
  ✓ Centered container
  ✓ White/light background
  ✓ No user context required
  ✓ Public pages:
    - login
    - signup
    - forgot-password
    - reset-password

Routes:
  ✓ /auth/login → PublicLayout
  ✓ /auth/signup → PublicLayout
  ✓ /auth/forgot-password → PublicLayout
  ✓ /auth/reset-password → PublicLayout

PROTECTED LAYOUT (for app pages): /src/app/(app)/layout.tsx

Features:
  ✓ Navbar (top)
  ✓ Sidebar (left)
  ✓ User display name in navbar
  ✓ Logout button in navbar
  ✓ Permission-based menu items
  ✓ Requires valid session
  ✓ Protected pages:
    - dashboard
    - students
    - attendance
    - fees
    - users
    - settings
    - all /api/* (except auth)

Routes:
  ✓ /dashboard → ProtectedLayout
  ✓ /students → ProtectedLayout
  ✓ /settings → ProtectedLayout
  ✓ Everything else → ProtectedLayout

HOMEPAGE: / (Public or Redirects)

Logic:
  ✓ Check if session exists
  ✓ If yes → Redirect to /dashboard
  ✓ If no → Show landing page OR redirect to /login

========================================================================================

🔒 SCHOOL SETUP LOCK
====================

After user logs in:
  1. Fetch school.setup_complete from database
  2. If FALSE:
     a. Allow ONLY: /dashboard, /settings/school-setup
     b. Block ALL other routes with 403
     c. Show modal: "Complete school setup to access this feature"
  3. If TRUE:
     a. Allow all routes per permissions
     b. No modal shown

Implementation:
  ☐ Create middleware/setupLock.ts
  ☐ On every protected request:
    - Check: school.setup_complete
    - Check: Is route allowed during setup?
    - If blocked → 403 + modal message

Allowed routes during setup:
  /dashboard
  /settings/school-setup
  /api/auth/* (logout, me)
  /api/settings/school (update school)

========================================================================================

⚠️ ERROR HANDLING (MUST BE COMPREHENSIVE)
=========================================

401 UNAUTHORIZED (Session Invalid):
  ☐ Invalid/missing session token
  ☐ Session expired
  ☐ User is_active = FALSE
  ☐ User deleted
  ☐ Response: { error: "Unauthorized", code: "SESSION_INVALID" }
  ☐ Frontend: Redirect to /login, clear state

403 FORBIDDEN (Permission Denied):
  ☐ Valid session but no permission for this route/action
  ☐ School setup incomplete (if setup lock applies)
  ☐ Response: { error: "Forbidden", code: "PERMISSION_DENIED" }
  ☐ Frontend: Show "You do not have permission" alert

500 SERVER ERROR:
  ☐ Database connection failed
  ☐ Unexpected error
  ☐ Response: { error: "Internal server error", code: "SERVER_ERROR" }
  ☐ Frontend: Show "Something went wrong" alert

Frontend Error Handling:
  ☐ Try/catch on all API calls
  ☐ Handle 401 → redirect to login
  ☐ Handle 403 → show permission denied UI
  ☐ Handle 500 → show error alert
  ☐ Never silently fail
  ☐ Log errors to console (dev) or monitoring (prod)

========================================================================================

🚀 PRODUCTION HARDENING
=======================

Session Expiration:
  ☐ 7-day expiry on sessions table
  ☐ Daily cron job to clean expired sessions
  ☐ SELECT COUNT(*) FROM sessions WHERE expires_at < NOW() (for monitoring)

Session Rotation (Optional):
  ☐ After sensitive action (password change), rotate session token
  ☐ Generate new token, update database, update cookie

Rate Limiting (Optional):
  ☐ Max 5 login attempts per email per hour
  ☐ Lock account for 15 minutes after 5 failures
  ☐ Log failed attempts to audit_logs

IP Validation (Optional):
  ☐ Store session.ip_address on creation
  ☐ On page load, check if current IP matches
  ☐ If different, ask for re-authentication

Audit Logging:
  ☐ Log all login attempts (success + failure)
  ☐ Log logout events
  ☐ Log permission denials
  ☐ Log account activations/deactivations
  ☐ Table: audit_logs (action, user_id, school_id, details, created_at)

Multi-Tenant Isolation Test:
  ☐ Create 2 test schools (school1, school2)
  ☐ Create users in each school with same email
  ☐ Login as school1 user
  ☐ Verify school2 data is NOT visible
  ☐ Verify school2 routes return 403/401

========================================================================================

✅ IMPLEMENTATION CHECKLIST
===========================

Database:
  ☐ sessions table created with proper indexes
  ☐ users table has is_active + password_hash
  ☐ All FK constraints in place
  ☐ No circular dependencies

Backend:
  ☐ POST /api/auth/login - validates, creates session, sets cookie
  ☐ POST /api/auth/logout - deletes session, clears cookie
  ☐ GET /api/auth/me - returns user + permissions + roles + school setup status
  ☐ Global middleware validates session on protected routes
  ☐ All queries include WHERE school_id = session.school_id
  ☐ Error handling: 401, 403, 500 with proper response format
  ☐ School setup lock implemented

Frontend:
  ☐ Call /api/auth/me on app load
  ☐ Store user + permissions + roles in global state
  ☐ If 401 → redirect to /login
  ☐ Navbar shows user display_name
  ☐ Navbar hidden on public routes
  ☐ Sidebar hidden on public routes
  ☐ ProtectedRoute component enforces session
  ☐ Setup alert shown if setup_complete = FALSE

Layouts:
  ☐ PublicLayout (no navbar/sidebar) for /auth/*
  ☐ ProtectedLayout (navbar + sidebar) for /app/*
  ☐ Homepage redirects based on session status

Production:
  ☐ HttpOnly + Secure + SameSite cookies
  ☐ Session cleanup cron job
  ☐ Audit logging enabled
  ☐ Rate limiting (optional but recommended)
  ☐ Multi-tenant isolation verified with tests

========================================================================================

🎯 NEXT STEPS
=============

1. Review existing code:
   - Check sessionService.ts completeness
   - Check existing middleware patterns
   - Check existing API routes (login, logout, me)

2. Create missing pieces:
   - Next.js middleware.ts (edge middleware for route protection)
   - PublicLayout component
   - ProtectedLayout component
   - Error pages (401, 403, 500)
   - SetupLock middleware

3. Fix any bugs:
   - Verify all queries have school_id filter
   - Verify error responses match spec
   - Verify cookie handling

4. Test:
   - Manual: Login → see user name in navbar → logout
   - Manual: Try to access protected route without session → 401 + redirect
   - Manual: Create 2 schools, verify isolation
   - Manual: Setup lock: set school.setup_complete = FALSE, verify lock works

5. Deploy:
   - Set SESSION_SECRET env var
   - Deploy to Vercel
   - Test in production

========================================================================================
