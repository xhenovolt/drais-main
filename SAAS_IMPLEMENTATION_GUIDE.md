# DRAIS V1 Multi-Tenant SaaS Implementation Guide

## Overview

This document describes the complete multi-tenant, role-based access control (RBAC) system for DRAIS V1 - a school management SaaS platform.

---

## 1. Architecture Overview

### Multi-Tenant Model
- Each school is a separate **tenant** with isolated data
- All operations are scoped by `school_id`
- Users belong to one school
- Roles and permissions are school-specific

### Authentication Flow
1. **First User** → Signup → Creates school + becomes SuperAdmin
2. **Subsequent Users** → Can signup but remain inactive until SuperAdmin activation
3. **Login** → JWT tokens with roles/permissions embedded
4. **Session** → Access token expires in 1 hour, refresh token in 7 days

---

## 2. Database Schema

### Core Tables

#### `schools` (Tenant)
```sql
- id (PRIMARY KEY)
- name, address, phone, email, logo_url
- curriculum, country, timezone
- setup_complete (BOOLEAN) - Prevents access until setup done
- subscription_plan, subscription_status
- created_at, updated_at, deleted_at
```

#### `users` (Multi-tenant users)
```sql
- id, school_id (FOREIGN KEY)
- first_name, last_name, email, phone
- password_hash (bcrypt)
- is_active (default FALSE - needs SuperAdmin activation)
- is_verified (email verification)
- failed_login_attempts, locked_until (security)
- last_login_at, last_password_change
- created_at, updated_at, deleted_at
```

#### `roles` (School-specific)
```sql
- id, school_id (FOREIGN KEY)
- name, description
- role_type (system/custom)
- is_super_admin (BOOLEAN)
- is_active
```

#### `permissions` (Global)
```sql
- id
- code (UNIQUE) - e.g., 'user.create', 'attendance.manage'
- name, description
- category (user_management, academics, finance, etc.)
- is_active
```

#### `role_permissions` (Junction)
```sql
- role_id, permission_id (COMPOSITE PRIMARY KEY)
- Defines what each role can do
```

#### `user_roles` (User can have multiple roles)
```sql
- user_id, role_id (COMPOSITE PRIMARY KEY)
- is_active
- assigned_by, assigned_at
```

#### `audit_logs` (Compliance)
```sql
- school_id, user_id
- action (login, permission_change, user_created)
- entity_type, entity_id
- old_values, new_values (JSON)
- status (success/failure), error_message
- ip_address, user_agent
```

---

## 3. Default Roles & Permission Mapping

### SuperAdmin (System Role)
- **Access**: ALL permissions
- **Can**: Manage everything, change other SuperAdmins, override any access
- **Auto-assigned**: First user of a school

### Admin
`Permissions`: user.create, user.read, user.update, user.activate, role.read, school.read, school.update, academics.*

### Teacher
`Permissions`: academics.classes.manage, academics.students.manage, academics.results.enter, attendance.view, attendance.manage

### Bursar
`Permissions`: finance.view, finance.fees.manage, finance.payments.view, finance.reports.view

### Warden
`Permissions`: academics.students.manage, attendance.view, attendance.manage

### Receptionist
`Permissions`: academics.students.manage, school.read, user.read

### Staff
`Permissions`: academics.students.manage, school.read

### Parent
`Permissions`: academics.results.view, school.read

---

## 4. Authentication System

### Password Management
```typescript
// Hashing
import { hashPassword, verifyPassword } from '@/services/authService';
const hash = await hashPassword('plainPassword');
const isValid = await verifyPassword('plainPassword', hash);
```

### JWT Token Structure
```typescript
interface TokenPayload {
  user_id: bigint;
  school_id: bigint;
  email: string;
  roles: string[]; // ['SuperAdmin', 'Admin']
  permissions: string[]; // ['user.create', 'attendance.manage', ...]
  iat: number;
  exp: number;
}
```

### Token Endpoints

#### Signup (Creates school + first user)
```
POST /api/auth/signup
Body: {
  first_name, last_name, email, password,
  school_name, phone, country
}
Response: {
  user: UserWithRoles,
  access_token: string,
  refresh_token: string,
  expires_in: 3600
}
```

#### Login
```
POST /api/auth/login
Body: { email, password }
Response: {
  user: UserWithRoles,
  access_token: string,
  refresh_token: string,
  expires_in: 3600
}
```

#### Token Refresh
```
POST /api/auth/refresh
Body: { refresh_token }
Response: { access_token, expires_in }
```

---

## 5. Authorization & RBAC

### Permission System
Permissions are: `category.action`
- `user.create`, `user.read`, `user.update`, `user.delete`
- `role.create`, `role.read`, `role.update`, `role.permission_manage`
- `academics.classes.manage`, `academics.results.enter`
- `attendance.manage`, `attendance.devices.manage`
- `finance.fees.manage`, `finance.reports.view`

### Middleware for Protected Routes

#### Check Authentication
```typescript
import { getAuthenticatedUser } from '@/middleware/auth';

const user = await getAuthenticatedUser(request);
// user = TokenPayload with school_id, roles, permissions
```

#### Check Permission
```typescript
import { requirePermission } from '@/middleware/auth';

export const POST = requirePermission(
  'user.create',
  async (req, user) => {
    // Only users with user.create permission reach here
    return createSuccessResponse({ message: 'User created' });
  }
);
```

#### Check Tenant Access
```typescript
import { verifyTenantAccess } from '@/middleware/auth';

const user = await verifyTenantAccess(request, request.query.school_id);
// Ensures user only accesses their own school
```

#### Check SuperAdmin
```typescript
import { requireSuperAdmin } from '@/middleware/auth';

const user = await requireSuperAdmin(request);
// Only SuperAdmin can proceed
```

---

## 6. API Routes Structure

### Authentication Routes
```
POST   /api/auth/signup              - Register new school + first user
POST   /api/auth/login               - Login user
POST   /api/auth/refresh             - Refresh access token
POST   /api/auth/logout              - Logout user (optional)
POST   /api/auth/forgot-password     - Request password reset
POST   /api/auth/reset-password      - Reset password with token
```

### Admin Routes (Protected with Permission Checks)
```
GET    /api/admin/users?school_id=X        - List users (user.read)
POST   /api/admin/users                     - Create user (user.create)
PUT    /api/admin/users/:id                 - Edit user (user.update)
DELETE /api/admin/users/:id                 - Delete user (user.delete)
POST   /api/admin/users/:id/activate       - Activate/deactivate user (user.activate)

GET    /api/admin/roles?school_id=X        - List roles (role.read)
POST   /api/admin/roles                     - Create role (role.create)
PUT    /api/admin/roles/:id                 - Edit role (role.update)
DELETE /api/admin/roles/:id                 - Delete role (role.delete) - SuperAdmin only
POST   /api/admin/roles/:id/permissions    - Assign permissions (role.permission_manage)

GET    /api/admin/school                    - Get school info
PUT    /api/admin/school                    - Update school info (school.update)
POST   /api/admin/school/setup              - Complete school setup (school.setup)
GET    /api/admin/school/setup-status      - Check setup progress

GET    /api/admin/audit-logs?school_id=X  - View audit log (SuperAdmin only)
```

### School Setup Flow
```
1. POST /api/auth/signup
   → Creates school with setup_complete = FALSE
   → Creates SuperAdmin user
   
2. GET /api/admin/school/setup-status
   → Returns {
       school_info: true,
       roles_created: true,
       first_class: false,
       first_student: false,
       setup_complete: false
     }
   
3. POST /api/admin/school/setup
   → Update school details,
   → Set setup_complete = TRUE when all items done

4. After setup_complete = TRUE
   → All routes accessible
   → Interactive tour runs
```

---

## 7. Frontend Flow

### Landing Page
```
┌─────────────────┐
│  Get Started    │  → Click
└─────────────────┘
        ↓
┌─────────────────┐
│ Signup / Login  │
└─────────────────┘
```

### Signup: Create School + First User
```
Form Fields:
- School Name
- First Name, Last Name
- Email, Password
- School Address, Phone

On Submit:
POST /api/auth/signup
→ Create school
→ Create user as SuperAdmin
→ Receive tokens
→ Redirect to Dashboard
```

### Login Flow
```
Form Fields:
- Email, Password

On Submit:
POST /api/auth/login
→ Validate credentials
→ Check account locked status
→ Return tokens + user profile
→ Check if school setup_complete
  → If FALSE: Show "Complete School Setup" banner
  → If TRUE: Proceed to dashboard
```

### School Setup Page (If setup_complete = FALSE)
```
Components:
1. Setup Progress Bar
   - School Info (Editable)
   - Add Admin/Teachers (Create Users)
   - Create Classes
   - Enroll Students

2. Each section:
   POST /api/admin/school/setup (with partial completion)
   Updates school table
   Triggers progress refresh

3. On Complete:
   PUT /api/admin/school/setup → setup_complete = TRUE
   Redirect to Dashboard + Show Tour
```

### Dashboard (After Setup)
```
1. Check school.setupcomplete
   → If FALSE: Show banner with "Complete Setup" button
   
2. Interactive Tour Highlights:
   - Dashboard Overview
   - Sidebar Navigation
   - Quick Actions
   - Reports & Analytics

3. Role-Based Menu
   - SuperAdmin: See All Features
   - Admin: Users, School Settings, Academics
   - Teacher: Classes, Attendance, Marks
   - Bursar: Fees & Payments
   - Warden: Discipline & Attendance

4. Permission-Based Visibility
   - Hide buttons/routes user doesn't have permission for
   - Show "No Permission" message on denied access
```

### Permission Denied UI
```
When user tries to access route without permission:

1. Backend Response:
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource",
    "required_permission": "user.create"
  }
}

2. Frontend Handler:
// Check response error.code
if (error.code === 'FORBIDDEN') {
  showModal("Access Denied", 
    `You need permission: ${error.required_permission}
     Please contact your administrator.`);
}

3. User Sees:
Modal with "Access Denied" message
Button to request permission / contact admin
```

---

## 8. Security Considerations

### Password Security
- Minimum 8 characters
- Hashed with bcrypt (12 rounds)
- Last password change tracked

### Account Lockout
- 5 failed login attempts → Account locked for 30 minutes
- `failed_login_attempts` counter reset on successful login
- `locked_until` timestamp set

### Multi-Tenancy Isolation
- Every query filters by `school_id`
- Users cannot access other schools' data
- Foreign keys enforce tenant isolation
- Example:
  ```sql
  -- Safe query (tenant-isolated)
  SELECT * FROM students WHERE school_id = ? AND class_id = ?;
  
  -- WRONG (could leak data)
  SELECT * FROM students WHERE class_id = ?;
  ```

### Audit Logging
- All sensitive actions logged:
  - User login (success/failure)
  - User creation/modification
  - Permission changes
  - School setup
  - Failed permission checks
- Includes: IP address, user agent, old/new values

### JWT Security
- Tokens signed with HS256 algorithm
- Short expiry (1 hour for access, 7 days for refresh)
- Tokens include school_id to prevent cross-tenant token reuse
- refresh tokens only usable at `/api/auth/refresh`

### HTTPS Requirement
- In production: only Send cookies with `Secure` flag
- Use `SameSite: Lax` to prevent CSRF

---

## 9. Error Handling

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200  | OK      | Login successful |
| 201  | Created | User created |
| 400  | Bad Request | Missing fields |
| 401  | Unauthorized | Invalid token / wrong password |
| 403  | Forbidden | Missing permission / tenant violation |
| 404  | Not Found | User doesn't exist |
| 409  | Conflict | Email already exists |
| 500  | Server Error | Database error |

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to create users",
    "details": null
  },
  "meta": {
    "timestamp": "2026-03-01T12:00:00Z"
  }
}
```

### Frontend Error Handler
```typescript
// Catch auth errors
if (error.response?.status === 401) {
  // Token expired - refresh or logout
  redirectTo('/login');
}

// Catch permission errors
if (error.response?.status === 403) {
  // Show permission denied modal
  const required = error.response.data.error.required_permission;
  showModal(`Permission Required: ${required}`);
}

// Catch validation errors
if (error.response?.status === 400) {
  // Show form errors
  const details = error.response.data.error.details;
  displayValidationErrors(details);
}
```

---

## 10. Implementation Checklist

### Database Setup
- [x] Create migration file: `004_multi_tenant_saas_system.sql`
- [ ] Run migration on production TiDB
- [ ] Verify all tables created
- [ ] Insert default permissions

### Backend Services
- [x] Create `src/types/saas.ts` (Type definitions)
- [x] Create `src/services/authService.ts` (Auth logic)
- [x] Create `src/middleware/auth.ts` (Protected routes)
- [ ] Create `src/app/api/auth/signup/route.ts` (✓ Updated)
- [ ] Create `src/app/api/auth/login/route.ts` (✓ Updated)
- [ ] Create `src/app/api/auth/refresh/route.ts`
- [ ] Create `src/app/api/admin/users/route.ts` (✓ Created)
- [ ] Create `src/app/api/admin/users/[id]/route.ts`
- [ ] Create `src/app/api/admin/roles/route.ts`
- [ ] Create `src/app/api/admin/school/route.ts`
- [ ] Create `src/app/api/admin/audit-logs/route.ts`

### Frontend Components
- [ ] Create `src/components/auth/LoginForm.tsx`
- [ ] Create `src/components/auth/SignupForm.tsx`
- [ ] Create `src/components/auth/ProtectedRoute.tsx`
- [ ] Create `src/components/school/SetupWizard.tsx`
- [ ] Create `src/components/dashboard/InteractiveTour.tsx`
- [ ] Create `src/components/error/PermissionDenied.tsx`
- [ ] Create `src/components/error/ErrorModal.tsx`

### Context & State Management
- [ ] Create `src/contexts/AuthContext.tsx` (User state, tokens)
- [ ] Create `src/hooks/useAuth.ts` (Hook for auth)
- [ ] Create `src/hooks/usePermission.ts` (Permission check hook)

### Pages
- [ ] Update `src/app/page.tsx` (Landing with "Get Started")
- [ ] Create `src/app/login/page.tsx`
- [ ] Create `src/app/signup/page.tsx`
- [ ] Create `src/app/dashboard/page.tsx`
- [ ] Create `src/app/setup/page.tsx`
- [ ] Create `src/app/admin/users/page.tsx`

### Testing
- [ ] Test signup with new school
- [ ] Test login with multiple users
- [ ] Test permission denied scenarios
- [ ] Test multi-tenancy isolation
- [ ] Test account lockout
- [ ] Test audit logging

---

## 11. Deployment Checklist

### Environment Variables (Update .env.local)
```
# JWT Settings
JWT_SECRET=<generate-secure-random-string>
JWT_EXPIRES_IN=1h
REFRESH_SECRET=<generate-secure-random-string>
REFRESH_TOKEN_EXPIRES_IN=7d
BCRYPT_ROUNDS=12

# TiDB Settings (Already have these)
TIDB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=2Trc8kJebpKLb1Z.root
TIDB_PASSWORD=QMNAOiP9J1rANv4Z
TIDB_DB=drais
```

### Pre-Deployment
- [ ] Run database migration
- [ ] Insert default permissions
- [ ] Test signup flow end-to-end
- [ ] Test login flow end-to-end
- [ ] Verify JWT tokens work
- [ ] Check tenant isolation
- [ ] Review security checklist

### Monitoring
- Monitor failed login attempts
- Monitor permission denials
- Check audit logs for suspicious activity
- Monitor token usage patterns

---

## 12. Quick Start for Development

### Run Signup
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "admin@school.com",
    "password": "SecurePass123!",
    "school_name": "ABC School",
    "country": "Kenya"
  }'
```

### Run Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "SecurePass123!"
  }'
```

### Use Token for Protected Route
```bash
# Get token from login response
TOKEN="eyJhbGciOiJIUzI1NiIs..."

curl -X GET "http://localhost:3000/api/admin/users?school_id=1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 13. Future Enhancements

1. **SSO Integration**: Google, Microsoft, Okta
2. **2FA/MFA**: TOTP, SMS codes
3. **Invite Links**: SuperAdmin invite users via email
4. **Bulk User Import**: CSV upload for users
5. **API Keys**: For third-party integrations
6. **Custom Roles**: SuperAdmin can create custom roles
7. **Permission Delegation**: SuperAdmin can delegate permissions
8. **Session Management**: View active sessions, logout remotely
9. **Password Policies**: Complexity requirements
10. **Backup & Recovery**: School data export/import

---

**Document Version**: 1.0
**Last Updated**: March 1, 2026
**Status**: Ready for Implementation
