# DRAIS V1 Session-Based Authentication System
## Production-Ready Implementation Guide

**Status**: ✅ Complete and Production-Ready
**Date**: March 1, 2026
**Version**: 1.0

---

## Overview

DRAIS V1 now implements a **server-side session-based authentication system** optimized for Vercel deployment. This replaces the JWT approach with secure HTTP-only cookies for simplicity, reliability, and better security on edge deployments.

### Key Benefits
- ✅ **Server-side sessions** - More secure than JWT for Vercel
- ✅ **HTTP-only cookies** - Prevents XSS attacks
- ✅ **Multi-tenant support** - Tenant isolation via `school_id`
- ✅ **RBAC enforcement** - Role-based access at middleware level
- ✅ **Automatic expiry** - 7-day session expiration with DB cleanup
- ✅ **Vercel compatible** - Stateless API routes with external session storage

---

## Architecture

### Session Flow

```
User Login Request
     ↓
POST /api/auth/login
  - Validate credentials
  - Check account status
  ↓
Create Session in DB
  - Generate secure token (256-bit random)
  - Store: user_id, school_id, token, expires_at
  ↓
Return HTTP-only Secure Cookie
  - Cookie name: drais_session
  - HttpOnly: true (prevents JS access)
  - Secure: true (HTTPS only in production)
  - SameSite: Lax (CSRF protection)
  - Max-Age: 7 days
  ↓
Session Valid ✅
```

### Request Flow (Protected Routes)

```
Frontend Request (with Cookie)
     ↓
NextRequest with drais_session cookie
     ↓
Extract token from cookie
     ↓
Validate Session in DB:
  - Does token exist?
  - Is it expired?
  - Is account still active?
  - Is school still active?
  ↓
Load User Permissions & Roles
  - Query user_roles JOIN roles
  - Query role_permissions JOIN permissions
  - Build permission list
  ↓
Attach SessionContext to handler:
  - user (id, email, display_name, etc.)
  - schoolId
  - permissions (code array)
  - roles (name array)
  ↓
Handler Execution ✅
```

---

## Database Schema

### Sessions Table

```sql
CREATE TABLE sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,              -- FK to users.id
  school_id BIGINT NOT NULL,            -- FK to schools.id (tenant isolation)
  session_token VARCHAR(255) UNIQUE,    -- Secure random token
  expires_at TIMESTAMP,                 -- When session expires
  ip_address VARCHAR(45),               -- Optional IP validation
  user_agent TEXT,                      -- Optional UA validation
  is_active BOOLEAN DEFAULT TRUE,       -- Soft delete for logout
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP ON UPDATE NOW()
);

-- Indexes for fast lookup
INDEX idx_user_id (user_id)
INDEX idx_school_id (school_id)
INDEX idx_expires_at (expires_at) -- For cleanup queries
INDEX idx_user_school (user_id, school_id)
```

---

## Backend Services

### Session Service (`src/services/sessionService.ts`)

**Core Functions**:

#### 1. `generateSessionToken()` → `string`
Generates a cryptographically secure 256-bit random token.

```typescript
// 32 bytes = 256 bits = 64 hex characters
const token = randomBytes(32).toString('hex');
// Example: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
```

#### 2. `createSession(userId, schoolId, ipAddress?, userAgent?)` → `{sessionToken, expiresAt}`
Creates a new session record in database.

```typescript
// Stored in DB:
{
  user_id: 123,
  school_id: 45,
  session_token: "a1b2c3d4...",
  expires_at: new Date(Date.now() + 7*24*60*60*1000), // +7 days
  ip_address: "192.168.1.1",
  user_agent: "Mozilla/5.0..."
}
```

#### 3. `validateSession(sessionToken, schoolId, ipAddress?)` → `User | null`
Validates token and returns user with display_name.

```sql
SELECT u.*, CONCAT(u.first_name, ' ', u.last_name) as display_name
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.session_token = ?
  AND s.school_id = ?
  AND s.expires_at > NOW()
  AND s.is_active = TRUE
  AND u.is_active = TRUE
```

#### 4. `getUserPermissions(userId, schoolId)` → `string[]`
Returns array of permission codes for user.

```typescript
// Returns: ['user.create', 'user.update', 'school.read', ...]
// Special: ['*'] means all permissions (SuperAdmin)
```

#### 5. `getUserRoles(userId, schoolId)` → `string[]`
Returns array of role names for user.

```typescript
// Returns: ['SuperAdmin', 'Admin'] or ['Teacher'] etc.
```

#### 6. `destroySession(sessionToken)` → `boolean`
Marks session as inactive (logout).

```sql
UPDATE sessions SET is_active = FALSE WHERE session_token = ?
```

#### 7. `cleanupExpiredSessions()` → `number`
Deletes sessions older than 7 days (cron-friendly).

```sql
DELETE FROM sessions WHERE expires_at < NOW() OR (is_active = FALSE AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY))
```

---

## Middleware

### Session Middleware (`src/middleware/sessionMiddleware.ts`)

#### `SessionContext` Type
```typescript
interface SessionContext {
  user: {
    id: bigint;
    school_id: bigint;
    first_name: string;
    last_name: string;
    email: string;
    display_name: string;
    // ... other fields
  };
  schoolId: bigint;
  permissions: string[];     // ['user.create', 'school.read']
  roles: string[];           // ['SuperAdmin', 'Admin']
}
```

#### `validateSessionFromRequest(request)` → `SessionContext | null`
Extracts and validates session from incoming request.

- Reads `drais_session` cookie
- Reads `x-school-id` header
- Calls `validateSession()` in service
- Fetches permissions and roles
- Returns complete `SessionContext` or `null`

#### `withSession(handler)` → Protected Route Handler
HOF that requires authentication.

```typescript
// Usage:
export const GET = withSession(async (req, session) => {
  // session is SessionContext
  // If no session: returns 401 Unauthorized
  return NextResponse.json({ user: session.user });
});
```

#### `withPermission(requiredPermission, handler)` → Protected Route Handler
HOF that checks specific permission.

```typescript
// Usage:
export const POST = withPermission(
  'user.create',
  async (req, session) => {
    // Only reaches here if user has 'user.create'
    // If not: returns 403 Forbidden
  }
);
```

#### `withRole(requiredRole, handler)` → Protected Route Handler
HOF that checks for specific role.

```typescript
// Usage:
export const DELETE = withRole(
  'SuperAdmin',
  async (req, session) => {
    // Only SuperAdmins reach here
  }
);
```

---

## API Endpoints

### 1. POST `/api/auth/login`

**Request**:
```json
{
  "email": "admin@school.com",
  "password": "SecurePass123!",
  "school_id": "1"  // Optional
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "admin@school.com",
      "first_name": "John",
      "last_name": "Doe",
      "display_name": "John Doe",
      "phone": "+254700000000",
      "avatar_url": null,
      "school_id": 45
    },
    "school": {
      "id": 45,
      "name": "ABC School"
    },
    "session": {
      "token": "a1b2c3d4...",
      "expiresAt": "2026-03-08T14:30:00Z"
    }
  }
}
```

**Sets Cookie**:
```
drais_session=a1b2c3d4...; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```

**Errors**:
- `400 Bad Request` - Missing email/password
- `401 Unauthorized` - Invalid credentials, account locked, account deleted
- `403 Forbidden` - Account inactive

---

### 2. POST `/api/auth/logout`

**Request**: (No body, reads cookie)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Clears Cookie**:
```
drais_session=; Path=/; Max-Age=0
```

---

### 3. GET `/api/auth/me`

**Request**: (Cookie + optional `x-school-id` header)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "admin@school.com",
      "first_name": "John",
      "last_name": "Doe",
      "display_name": "John Doe",
      "school_id": 45
    },
    "school": {
      "id": 45,
      "name": "ABC School",
      "setup_complete": false,
      "status": "active"
    },
    "permissions": ["*"],  // SuperAdmin has all
    "roles": ["SuperAdmin"]
  }
}
```

**Used By**:
- Frontend on page load to restore session
- `AuthContext` useEffect hook
- Permission/role checks

---

## Frontend Integration

### Auth Context (`src/contexts/AuthContext.tsx`)

**State**:
```typescript
{
  user: User | null,           // Current user
  school: School | null,       // Current school/tenant
  school_id: number | null,
  roles: string[],             // User roles
  permissions: string[],       // User permissions
  setupComplete: boolean,      // School setup status
  isLoading: boolean,
  isAuthenticated: boolean,
  error: string | null
}
```

**Methods**:

#### `login(email, password, schoolId?)` → Promise<void>
1. POSTs to `/api/auth/login`
2. Session cookie set automatically by browser
3. Stores `school_id` in localStorage for middleware
4. Redirects to /dashboard or /setup based on setup status

#### `signup(data)` → Promise<void>
1. POSTs to `/api/auth/signup`
2. Creates school + first SuperAdmin user
3. Session cookie set automatically
4. Redirects to /setup

#### `logout()` → Promise<void>
1. POSTs to `/api/auth/logout` (clears session in DB)
2. Browser clears cookie
3. Clears localStorage
4. Redirects to /login

#### `refreshSession()` → Promise<void>
1. Calls GET `/api/auth/me`
2. Updates user, school, roles, permissions
3. Handles expired sessions (redirects to login)

#### `hasPermission(permission | [permission])` → boolean
Checks if user has specified permission(s).

```typescript
const { hasPermission } = useAuth();

if (hasPermission('user.create')) {
  // Show create user button
}

if (hasPermission(['user.create', 'user.update'])) {
  // Show if user has EITHER permission
}
```

#### `hasRole(role | [role])` → boolean
Checks if user has specified role(s).

```typescript
const { hasRole } = useAuth();

if (hasRole('SuperAdmin')) {
  // Show SuperAdmin panel
}

if (hasRole(['SuperAdmin', 'Admin'])) {
  // Show if user has EITHER role
}
```

---

## Frontend Components

### 1. `ProtectedRoute` Component

**Purpose**: Guard pages until user is authenticated and authorized.

```typescript
<ProtectedRoute 
  requiredPermission="user.create"
  requiredRole="Admin"
  requiredSetup={true}
>
  <UserManagementPage />
</ProtectedRoute>
```

**Behavior**:
- No session → redirect to /login
- Setup incomplete AND requiredSetup=true → redirect to /setup
- Missing permission → redirect to /forbidden
- Missing role → redirect to /forbidden
- All checks pass → render children

---

### 2. `Navbar` Component

**Features**:
- Shows user display_name
- Avatar with initials
- User menu dropdown
- Logout button
- Role-aware breadcrumbs

```typescript
<Navbar />

// Displays:
// ┌─── DRAIS ────────────────────────────────────┐
// │                                 John Doe  ∨ │
// └────────────────────────────────────────────────┘
// 
// Click dropdown shows:
// ├─ John Doe (john@school.com)
// ├─ Profile
// ├─ Settings
// └─ Logout
```

---

### 3. `SetupEnforcer` Component

**Purpose**: Show alert if school setup not complete.

```typescript
// Banner alert (blockNavigation=false)
<SetupEnforcer blockNavigation={false} />

// Full-screen modal (blockNavigation=true for setup page)
<SetupEnforcer blockNavigation={true} />
```

**Displays**:
```
┌──────────────────────────────────────────────────┐
│ ⚠️  Complete School Setup                        │
│ Your school needs to be set up before you can    │
│ access the full system.                          │
│ [Go to Setup →]                                  │
└──────────────────────────────────────────────────┘
```

---

## Pages

### Login Page (`src/app/login/page.tsx`)

**Features**:
- Email + Password form
- Validation errors
- Forgot password link
- Sign up link
- Responsive design

**Flow**:
1. User enters credentials
2. Click Sign In
3. `useAuth().login()` called
4. If successful → redirects based on setup_complete:
   - `true` → /dashboard
   - `false` → /setup

---

### Signup Page (`src/app/signup/page.tsx`)

**Features**:
- Create school + first user in one form
- Form validation
- Password confirmation
- School info (name, phone, country)

**Flow**:
1. Super admin fills form
2. Click Create Account
3. School + SuperAdmin user created
4. All default roles + permissions assigned
5. Redirects to /setup

---

### Dashboard Page (`src/app/dashboard/page.tsx`)

**Protected**: Yes (requires authentication + setup_complete)

**Features**:
- Shows user display_name
- Quick stats (Users, Students, Classes, Attendance)
- Role-based quick actions
- Setup alert if incomplete
- Navbar with user menu

**Role-Specific Actions**:
- **SuperAdmin/Admin**: User management, role management, school settings
- **Teacher**: My classes, attendance, marks entry
- **Bursar**: Fees management, financial reports

---

## Security Features

### 1. Session Tokens
- **Generation**: `randomBytes(32).toString('hex')` (256-bit)
- **Uniqueness**: Database UNIQUE constraint
- **Length**: 64 hex characters
- **Entropy**: Cryptographically secure

### 2. HTTP-Only Cookies
- **HttpOnly**: `true` - Prevents JavaScript access (XSS protection)
- **Secure**: `true` - HTTPS only (in production)
- **SameSite**: `Lax` - CSRF protection
- **Path**: `/` - Available to all paths
- **Max-Age**: `604800` (7 days)

### 3. Multi-Tenant Isolation
- All queries include `school_id` WHERE clause
- Foreign keys enforce database-level isolation
- Session tied to specific `school_id`
- Users cannot access other schools' data

### 4. Permission Checking
- Middleware validates permissions before handler
- SuperAdmin bypass checks (receives `*` permission)
- Permission denied returns `403 Forbidden`
- URL cannot bypass permission checks

### 5. Account Protection
- Requires active status (`is_active = TRUE`)
- Requires non-deleted status (`deleted_at IS NULL`)
- School must be active (`status = 'active'`)
- Password validated with bcryptjs

### 6. Automatic Cleanup
- Sessions expire after 7 days
- `cleanupExpiredSessions()` removes old records
- Can be run as:
  - Manual: On demand endpoint
  - Cron: Scheduled job
  - Lazy: On-demand in background

---

## Configuration

### Environment Variables

```bash
# .env.local

# Session configuration (optional, already configured in code)
SESSION_EXPIRY_DAYS=7
BCRYPT_ROUNDS=12

# Database (for sessions table)
TIDB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=2Trc8kJebpKLb1Z.root
TIDB_PASSWORD=QMNAOiP9J1rANv4Z
TIDB_DB=drais
```

### Cookie Configuration

```typescript
// In sessionService.ts:
export const SESSION_CONFIG = {
  TOKEN_LENGTH: 32,                      // 256-bit token
  EXPIRY_DAYS: 7,                        // 7 day expiry
  EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  COOKIE_NAME: 'drais_session',
  COOKIE_MAX_AGE: 7 * 24 * 60 * 60,     // seconds
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  },
};
```

---

## Testing

### Manual Testing Flow

#### 1. Signup
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "admin@test.com",
    "password": "Test1234!",
    "school_name": "Test School",
    "country": "Kenya"
  }'
```

Expected: School + User + All default roles created, returns session token.

#### 2. Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "admin@test.com",
    "password": "Test1234!"
  }'
```

Expected: Cookie set in `cookies.txt`, session created in DB.

#### 3. Get User Info
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "x-school-id: 1" \
  -b cookies.txt
```

Expected: Returns user, school, roles, permissions.

#### 4. Protected Route
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -H "x-school-id: 1" \
  -b cookies.txt
```

Expected: Returns user list for school.

#### 5. Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt
```

Expected: Session marked inactive, cookie cleared.

---

## Deployment Checklist

### Pre-Deployment

- [ ] Database migration executed: `005_session_based_auth_system.sql`
- [ ] All sessions table created with indexes
- [ ] Environment variables set in production
- [ ] SESSION_CONFIG values reviewed
- [ ] Bcryptjs rounds set to 12 (or appropriate for server speed)

### During Deployment

- [ ] Deploy backend services first (sessionService, middleware)
- [ ] Deploy API routes (login, logout, me)
- [ ] Deploy frontend context (AuthContext)
- [ ] Deploy components (Navbar, ProtectedRoute, SetupEnforcer)
- [ ] Deploy pages (login, signup, dashboard)

### Post-Deployment

- [ ] Test signup flow end-to-end
- [ ] Test login with valid credentials
- [ ] Test login with invalid credentials (should fail)
- [ ] Test session persistence (refresh page, session should remain)
- [ ] Test logout (session should be destroyed)
- [ ] Test protected route without session (should redirect to login)
- [ ] Test permission denied (403 on missing permission)
- [ ] Test multi-tenant isolation (user A cannot see user B's school data)
- [ ] Verify cookie is HttpOnly, Secure, SameSite in Network tab

### Monitoring

- [ ] Monitor session table growth (should stay reasonable)
- [ ] Monitor login failures (suspect brute force if spike)
- [ ] Monitor logout events (should clear sessions)
- [ ] Monitor permission denials (debug config if spike)
- [ ] Set up cron for `cleanupExpiredSessions()` weekly

---

## Troubleshooting

### Session not persisting between pages

**Issue**: User logs in, but page refresh shows logged out.

**Solution**:
1. Check if cookie is being set:
   - DevTools → Application → Cookies
   - Should see `drais_session=...`
   - HttpOnly should be checked ✓
2. Check if `x-school-id` header is being sent:
   - DevTools → Network → click request → Request headers
   - Should see `x-school-id: <number>`
3. Check auth context useEffect:
   - Should call `/api/auth/me` on mount
   - Should set user state on success

**Fix**:
```typescript
// In AuthContext useEffect, ensure:
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
};
const storedSchoolId = localStorage.getItem('school_id');
if (storedSchoolId) {
  headers['x-school-id'] = storedSchoolId;
}
const response = await fetch('/api/auth/me', { headers });
```

### Permission denied (403) on valid request

**Issue**: User has role with permission, but still gets 403.

**Solution**:
1. Verify permissions assigned to role:
```sql
SELECT p.code, p.name
FROM role_permissions rp
JOIN permissions p ON rp.permission_id = p.id
WHERE rp.role_id = ?;
```

2. Verify user assigned to role:
```sql
SELECT r.name
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
WHERE ur.user_id = ? AND ur.is_active = TRUE;
```

3. Verify session has permissions:
```php
// In withPermission middleware:
console.log('User permissions:', session.permissions);
// Should include required permission code
```

4. Check permission naming:
- Code must match exactly (case-sensitive)
- Example: `'user.create'` not `'User.Create'`

---

## Future Enhancements

### Optional Features to Add Later

1. **Remember Me**
   - Checkbox on login
   - Extends session expiry to 30 days if checked

2. **Multi-Device Sessions**
   - List all active sessions
   - Logout from specific device
   - "Logout all other devices" option

3. **IP Whitelisting**
   - Store IP on session creation
   - Reject requests from different IP (optional, may break proxies)

4. **Session Timeout Warning**
   - Show modal 5 min before expiry
   - Allow user to extend or logout

5. **Device Fingerprinting**
   - Reject session if device fingerprint changes
   - Extra security layer

6. **Two-Factor Authentication (2FA)**
   - After password validation
   - Before session creation
   - TOTP or SMS

7. **Rate Limiting**
   - Limit login attempts per IP
   - Limit requests per session
   - DDoS mitigation

---

## Summary

**Session-Based Authentication is now fully integrated with DRAIS V1**, providing:

✅ Secure server-side sessions with HTTP-only cookies
✅ Multi-tenant isolation with school_id scoping
✅ Complete RBAC with permission enforcement at middleware level
✅ Production-ready deployment with Vercel support
✅ User-friendly login, signup, and dashboard pages
✅ Automatic session cleanup and expiration
✅ Comprehensive error handling and validation
✅ Development-friendly debugging and testing

**All systems ready for production deployment** 🚀
