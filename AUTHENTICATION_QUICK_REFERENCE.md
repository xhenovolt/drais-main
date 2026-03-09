# DRAIS Authentication - Quick Reference

## 🔍 Verify Authentication is Working

### Check 1: Server Logs Show Protection
```bash
# Look for this in dev server output:
[PROTECTED-LAYOUT] ❌ No session token - redirecting to /login

# This proves auth is active
```

### Check 2: Test Protected Route
```bash
curl -i http://localhost:3002/dashboard

# WITHOUT session:
# → Redirects to /login

# WITH valid session:  
# → Returns dashboard HTML
```

### Check 3: Database Has Sessions
```bash
# Check if sessions are being created:
SELECT COUNT(*) FROM sessions;
SELECT user_id, email, expires_at FROM sessions 
  JOIN users ON sessions.user_id = users.id
  LIMIT 5;
```

---

## 🚀 Adding New Protected Routes

### Option 1: Simple Inheritance (Recommended)
Routes automatically inherit protection from `/(protected)` layout:

```
src/app/(protected)/
├── dashboard/          # ✅ Protected
├── students/
│   └── page.tsx        # ✅ Auto-protected
└── settings/
    └── page.tsx        # ✅ Auto-protected
```

### Option 2: Manual Layout Protection
For routes outside `/(protected)` group, add auth check:

```typescript
// src/app/custom-route/layout.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function CustomLayout({ children }) {
  const cookieStore = await cookies();
  const session = cookieStore.get('drais_session')?.value;
  
  if (!session) {
    redirect('/login');
  }
  
  return <>{children}</>;
}
```

---

## 🔐 Session Cookie Details

### Cookie Configuration
```javascript
{
  name: 'drais_session',
  httpOnly: true,           // Can't access from JS
  secure: true,             // HTTPS only (production)
  sameSite: 'lax',          // CSRF protection
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  path: '/'
}
```

### Token Details
- **Length**: 256-bit random (generated via crypto.randomBytes)
- **Storage**: Database `sessions` table
- **Expiration**: 7 days from creation
- **Validation**: Checked on every protected page load

---

## 🛠️ Troubleshooting

### Routes Still Accessible Without Session?

**Check 1**: Is route in `/(protected)` group?
```bash
ls -la src/app/\(protected\)/
# Should see: dashboard, etc.
```

**Check 2**: Does layout.tsx have auth check?
```bash
cat src/app/\(protected\)/layout.tsx
# Should show: redirect('/login') check
```

**Check 3**: Is cache stale?
```bash
rm -rf .next          # Clear Next.js cache
npm run dev           # Restart dev server
```

### Login Returns 401?

**Check 1**: Is database connected?
```bash
# Look for in logs:
[Database] ✅ Using TiDB Cloud as primary database
```

**Check 2**: Do users exist in database?
```sql
SELECT COUNT(*) FROM users;
SELECT email FROM users LIMIT 5;
```

**Check 3**: Is password correct?
- Run database query to check user email exists
- Verify password wasn't hashed incorrectly
- Try test user from SQL migrations

### Sessions Expire Too Soon?

**Change expiration time** in `src/app/api/auth/login/route.ts`:
```typescript
// Current: 7 days
DATE_ADD(NOW(), INTERVAL 7 DAY)

// Change to: 30 days
DATE_ADD(NOW(), INTERVAL 30 DAY)
```

---

## 📊 Key Files Reference

| File | Purpose | Notes |
|------|---------|-------|
| `src/app/(protected)/layout.tsx` | Route protection | Server component - runs before rendering |
| `src/app/api/auth/login/route.ts` | Login endpoint | Creates sessions, sets cookies |
| `src/app/api/auth/logout/route.ts` | Logout endpoint | Destroys sessions, clears cookies |
| `src/services/sessionService.ts` | Session management | Utilities for session CRUD |
| `src/contexts/AuthContext.tsx` | Client auth state | React context for UI |
| `middleware.ts` | Production middleware | Disabled in dev mode |

---

## ✅ Production Deployment

### Pre-Deployment Checklist
- [ ] Load test database credentials (TiDB Cloud)
- [ ] Run migrations (sessions, users, etc.)
- [ ] Test login with real credentials
- [ ] Verify HTTPS is enabled
- [ ] Set `secure: true` for production cookies
- [ ] Monitor session table for orphaned entries

### Environment Variables Needed
```
# Database
DB_HOST=gateway01.eu-central-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=2Trc8kJebpKLb1Z.root
DB_PASSWORD=QMNAOiP9J1rANv4Z
DB_NAME=drais

# Application
NODE_ENV=production
VERCEL_ENV=production
```

---

## 🔄 Session Lifecycle

```
1. User visits /login
   └─ Page loads (no auth required)

2. User submits credentials
   └─ POST /api/auth/login
      ├─ Validate email/password
      ├─ Generate 256-bit token
      ├─ Store in sessions table
      ├─ Set drais_session cookie
      ├─ Return { success: true, user, ... }

3. User visits /dashboard
   └─ /(protected)/layout.tsx checks
      ├─ Read drais_session cookie
      ├─ Query database to validate
      ├─ If valid: render page
      ├─ If invalid/missing: redirect to /login

4. User visits another protected route
   └─ Same process repeats (cookie auto-sent)

5. User clicks logout
   └─ POST /api/auth/logout
      ├─ Delete token from sessions table
      ├─ Clear drais_session cookie
      ├─ Return { success: true }

6. User tries to access /dashboard again
   └─ /(protected)/layout.tsx checks
      ├─ No session cookie found
      ├─ Redirect to /login
      └─ Process repeats
```

---

## 📈 Monitoring

### Watch Session Growth
```sql
-- Check sessions created today
SELECT DATE(created_at), COUNT(*) 
FROM sessions
WHERE DATE(created_at) = CURDATE()
GROUP BY DATE(created_at);

-- Find orphaned sessions (user deleted)
SELECT s.id, s.token
FROM sessions s
LEFT JOIN users u ON s.user_id = u.id
WHERE u.id IS NULL;

-- Find expired sessions
SELECT id, token FROM sessions
WHERE expires_at < NOW()
LIMIT 10;
```

### Recommended Maintenance
```bash
# Weekly: Delete expired sessions
DELETE FROM sessions WHERE expires_at < NOW();

# Monthly: Review login patterns
SELECT DATE(created_at), COUNT(*) as logins
FROM sessions
WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at)
ORDER BY created_at DESC;
```

---

## 🎯 Common Use Cases

### Add New User
```sql
INSERT INTO users (school_id, email, password_hash, display_name)
VALUES (1, 'newuser@school.com', '<bcrypt_hash>', 'New User');
```

### Reset User Password
```php
// In your reset handler:
$hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
UPDATE users SET password_hash = ? WHERE id = ?;
```

### Force Logout All Sessions for a User
```sql
DELETE FROM sessions WHERE user_id = ?;
```

### Get Session Details
```sql
SELECT 
  s.token,
  s.expires_at,
  u.email,
  sch.name as school
FROM sessions s
JOIN users u ON s.user_id = u.id
JOIN schools sch ON s.school_id = sch.id
WHERE s.token = '<session_token>';
```

---

## 📞 Support

**Issue**: Routes not protected?
→ Check `src/app/(protected)/layout.tsx` exists

**Issue**: Can't login?
→ Check database has users, verify TiDB connection

**Issue**: Session expires too fast?
→ Change interval in login route (default: 7 days)

**Issue**: CORS errors on auth endpoints?
→ Add CORS headers to API routes if needed

---

## Last Updated
March 1, 2026 - Authentication system complete and tested ✅
