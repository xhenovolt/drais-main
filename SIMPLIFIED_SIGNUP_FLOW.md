# SIGNUP & SCHOOL SELECTION FLOW - SIMPLIFIED MULTI-TENANT ARCHITECTURE
**Date**: March 1, 2026  
**Status**: ✅ COMPLETE

## Overview

Simplified the signup and authentication flow to separate user registration from school selection:
- **Signup → Create user account only (no school)**
- **Login → Redirect to school selection page**
- **School Selection → Join existing or create new school**
- **Dashboard → Full access after school is set**

## Problem Fixed

Previously, the signup flow tried to create both the user AND a school during registration:
```
Signup Page
  ├─ Ask for: First Name, Last Name, Email, Password
  ├─ Ask for: School Name ❌ (PROBLEM: Too much in signup)
  └─ Try to create both user and school ❌ (PROBLEM: Complex, many failure points)
```

**Issues with old approach:**
1. Signup was too complex - multiple things happening at once
2. Users felt pressured to create school during signup
3. Didn't support multi-tenancy well (users belong to multiple schools)
4. High failure rate during signup

## New Flow (✅ IMPLEMENTED)

### 1️⃣ SIGNUP - Simple User Registration
```
POST /api/auth/signup
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "phone": "+254700000000" (optional)
}

Response:
{
  "user": {
    "id": 1,
    "email": "john@example.com",
    "school_id": null,  ← NO SCHOOL YET
    "roles": [],
    "permissions": []
  },
  "access_token": "...",
  "refresh_token": "..."
}
```

**What happens:**
- ✅ Create user account
- ✅ Hash password (bcrypt)
- ✅ Generate session token
- ✅ Create session in DB with NULL school_id
- ✅ Set HTTP-only session cookie
- ✅ Redirect to `/login` page (for email verification)

**Signup Page Changes:**
- ❌ Removed: School Name field
- ❌ Removed: Country field
- ✅ Kept: First Name, Last Name, Email, Password, Phone

### 2️⃣ LOGIN - Authenticate User (with School Selection Check)
```
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "securePassword123"
}

Response (if NO school_id):
{
  "user": {
    "id": 1,
    "email": "john@example.com",
    "school_id": null  ← NEEDS TO SELECT SCHOOL
  },
  "school": null,
  "requiresSchoolSelection": true  ← NEW FLAG
}

→ Redirect to /school-selection page
```

**What happens:**
- ✅ Verify email exists
- ✅ Verify password matches
- ✅ Check if user has school_id
- ✅ If NO school_id → return flag for school selection
- ✅ If HAS school_id → proceed with normal dashboard login

### 3️⃣ SCHOOL SELECTION - Choose or Create School
**New Page:** `/school-selection`

Two options:

#### Option A: Join Existing School
```
GET /api/schools/available
→ Returns list of all active schools

POST /api/schools/select
{
  "school_id": 123
}

→ Updates user.school_id
→ Assigns user to Staff role
→ Redirects to /dashboard
```

#### Option B: Create New School
```
POST /api/schools/create
{
  "name": "ABC School",
  "phone": "+254700000000",
  "curriculum": "Kenya",
  "timezone": "Africa/Nairobi"
}

→ Creates new school
→ Updates user.school_id
→ Assigns user to SuperAdmin role
→ Grants all permissions
→ Redirects to /dashboard
```

### 4️⃣ DASHBOARD - Full Access
Once school_id is set:
- ✅ Access `/dashboard`
- ✅ Access `/students`, `/finance`, `/attendance`, etc.
- ✅ Access `/settings`
- ✅ View school data
- ✅ Manage users within school

## Database Changes

### Sessions Table - Made school_id Nullable
```sql
-- Before:
ALTER TABLE sessions MODIFY school_id BIGINT NOT NULL;

-- After:
ALTER TABLE sessions MODIFY school_id BIGINT NULL;

-- Foreign Key:
ALTER TABLE sessions ADD CONSTRAINT sessions_ibfk_2_new 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;
```

**Why?** Users can have sessions without a school while selecting one during school-selection flow.

## Code Changes

### 1. Signup Page - `/src/app/signup/page.tsx`
```diff
- Removed: school_name field
- Removed: country field
- Kept: first_name, last_name, email, password, phone
- Updated: Form submission to not include school data
```

### 2. Signup API - `/src/app/api/auth/signup/route.ts`
```typescript
// OLD: Create school + user + roles + permissions (232 lines)
// NEW: Create ONLY user (100 lines)

// Simplified:
- ❌ No school creation
- ❌ No role assignment
- ❌ No permission setup
- ✅ Just hash password & create user
- ✅ Return user with school_id = null
```

### 3. Login API - `/src/app/api/auth/login/route.ts`
```typescript
// Added nullable school check:
if (!userSchoolId) {
  // Create session with NULL school_id
  const { sessionToken } = await createSession(userId, null, ipAddress, userAgent);
  
  // Return requiresSchoolSelection: true flag
  return createSuccessResponse({
    user: { ...userData, school_id: null },
    school: null,
    requiresSchoolSelection: true
  });
}

// If user has school_id, continue with normal login
```

### 4. New School Selection Page - `/src/app/school-selection/page.tsx`
```typescript
// Client component with:
// - Tab to select existing school
// - Tab to create new school
// - Calls /api/schools/available and /api/schools/create
```

### 5. New API Endpoints
```
GET  /api/schools/available
  → List all schools user can join

POST /api/schools/select
  → Set user.school_id
  → Assign default Staff role
  → Update session

POST /api/schools/create
  → Create new school
  → Set user as SuperAdmin
  → Grant all permissions
  → Update user.school_id
```

### 6. AuthContext Updates - `/src/contexts/AuthContext.tsx`
```typescript
// User interface:
interface User {
  school_id: number | null  ← NOW NULLABLE
}

// Signup data:
interface SignupData {
  - school_name ❌
  - country ❌
  + Keep: first_name, last_name, email, password, phone
}

// Signup function:
await signup(data)
→ Redirect to /school-selection  ← NEW

// Login function:
if (response.data.requiresSchoolSelection) {
  router.push('/school-selection')  ← NEW
}
```

### 7. Session Service Update - `/src/services/sessionService.ts`
```typescript
// OLD:
export async function createSession(
  userId: bigint,
  schoolId: bigint  ← REQUIRED
)

// NEW:
export async function createSession(
  userId: bigint,
  schoolId: bigint | null  ← NULLABLE
)
```

### 8. Auth Service Update - `/src/services/authService.ts`
```typescript
// OLD:
export function generateRefreshToken(payload: {
  user_id: bigint;
  school_id: bigint
})

// NEW:
export function generateRefreshToken(payload: {
  user_id: bigint;
  school_id: bigint | null  ← NULLABLE
})
```

## Flow Diagram

```
┌─────────────┐
│   Signup    │
│   Page      │
└──────┬──────┘
       │ POST /api/auth/signup (no school)
       ▼
┌─────────────────────┐
│ Create User Account │
│ session_token       │
│ school_id = NULL    │
└──────┬──────────────┘
       │ Redirect
       ▼
┌──────────────────┐
│   Login Page     │
│ (User confirms)  │
└────────┬─────────┘
         │ POST /api/auth/login
         ▼
┌────────────────────────────────┐
│ Check school_id                │
├────────────────────────────────┤
│ If NULL:                       │  If School Set:
│ ├─ Return requiresSchoolSelect │  └─ Go to Dashboard
│ └─ Redirect to School Select   │
└────────┬───────────────────────┘
         │
    ┌────▼─────────────────────┐
    │   School Selection Page   │
    │ (user-facing)            │
    └────┬──────────────────────┘
         │
    ┌────┴────────────────────────────┐
    │                                 │
    ▼                                 ▼
┌─────────────────┐         ┌──────────────────┐
│ Join Existing   │         │  Create New      │
│ School          │         │  School          │
│ (SELECT)        │         │  (CREATE)        │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         └──────────┬────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Update user.school_id│
         │ Assign Role          │
         │ Grant Permissions    │
         └──────────┬───────────┘
                    │ Redirect
                    ▼
            ┌──────────────┐
            │  Dashboard   │
            │  Full Access │
            └──────────────┘
```

## Benefits of New Approach

✅ **Simpler Signup**
- Less form fields
- Faster registration
- Lower error rate

✅ **Clearer User Journey**
- Signup = Create account
- School = Selected after login
- Clear separation of concerns

✅ **Better Multi-Tenancy**
- Users can join multiple schools (future)
- Schools independent of signup
- Scalable architecture

✅ **Flexible School Setup**
- Join existing school or create new one
- Admin can configure school before users join
- Onboarding process clear

✅ **Secure**
- Session still created immediately
- Temporary session while selecting school
- School isolation maintained via sessions

✅ **Better for Mobile**
- Fewer fields to fill
- Faster first-time experience
- Less data entry errors

## Testing

### Test User Already Created
```
Email: test@drais.local
Password: test@123
School: None (needs selection)
```

### Test the Flow:
1. **Signup** (`/signup`)
   - Fill form WITHOUT school
   - Click "Create Account"
   - Should redirect to `/login`

2. **Login** (`/login`)
   - Enter test@drais.local / test@123
   - Should redirect to `/school-selection`

3. **School Selection** (`/school-selection`)
   - Option A: Select existing school → Redirects to `/dashboard`
   - Option B: Create new school → Redirects to `/dashboard`

4. **Dashboard** (`/dashboard`)
   - Full access to all features
   - school_id is now set in user context

## Migration Script

Applied migration to database:
```sql
-- File: database/migrations/006_allow_null_school_in_sessions.sql
ALTER TABLE sessions MODIFY school_id BIGINT NULL;
```

**Status**: ✅ Applied successfully

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Signup Complexity | High (school + user) | Low (user only) |
| School Selection | During signup | After login |
| User Flow | Direct to dashboard | Via school selection |
| Database Changes | None | sessions.school_id nullable |
| Code Changes | 232 lines (signup) | ~100 lines (signup) + new pages |
| User Experience | Confusing | Clear & Simple |

The authentication flow is now **simplified, more secure, and better** for a multi-tenant SaaS application.
