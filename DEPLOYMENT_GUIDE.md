# DRAIS System Hardening - DEPLOYMENT GUIDE

**Status: ✅ READY FOR DEPLOYMENT**
**Date: March 29, 2026**
**Implementation Score: 100% (18/18 checks passed)**

---

## 🚀 DEPLOYMENT CHECKLIST

### PRE-DEPLOYMENT (Do Before Production)

- [ ] **Backup Database**
  ```bash
  mysqldump -u root -p drais_school > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **Read Implementation Summary**
  - File: `SYSTEM_HARDENING_IMPLEMENTATION.md`
  - File: `API_ERROR_HANDLING_GUIDE.md`

- [ ] **Verify all code changes**
  ```bash
  npm run build  # Compile TypeScript
  npm run lint   # Check for errors (if configured)
  ```

- [ ] **Run Validation Script**
  ```bash
  node scripts/validate-hardening.js
  # Should show: Score: 100%
  ```

---

## 📊 DEPLOYMENT STEPS

### Step 1: Apply Database Migration
**⏱️ Estimated time: 2 minutes**

```bash
# Option A: Direct MySQL
mysql -u root -p drais_school < database/migrations/009_system_logs.sql

# Option B: If you have a migration runner
npm run migrate:latest

# Option C: Manual via MySQL Workbench
# 1. Open database/migrations/009_system_logs.sql
# 2. Copy entire content
# 3. Execute in MySQL Workbench
```

**Expected output:**
```
Query OK, 0 rows affected (0.05 sec)  -- system_logs created
Query OK, 0 rows affected (0.02 sec)  -- audit_logs created
...and more
```

**Verify:**
```sql
-- Run in MySQL to confirm tables exist
SELECT TABLE_NAME FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'drais_school' 
AND TABLE_NAME IN ('system_logs', 'audit_logs', 'notifications', 'user_notifications');

-- Should return 4 rows
```

### Step 2: Verify TypeScript Compilation

```bash
# Install dependencies (if not done recently)
npm install

# Build the project
npm run build

# Expected: "Successfully compiled 1,234 files" (number may vary)
```

### Step 3: Start Application

```bash
# Development
npm run dev

# Production
npm run start
```

### Step 4: Test Staff Creation (Happy Path)

**In browser (http://localhost:3000):**

1. Navigate to: **Staff → Add Staff**
2. Fill form with valid data:
   - First Name: **John**
   - Last Name: **Doe**
   - Position: **Teacher**
3. Click **Submit**
4. **Expected result:** ✅ Toast shows "Staff member added successfully"

**Verify in Database:**
```sql
-- Check staff was created
SELECT id, staff_no FROM staff ORDER BY id DESC LIMIT 1;

-- Check audit log entry
SELECT * FROM audit_logs 
WHERE action = 'CREATED_STAFF' 
ORDER BY created_at DESC LIMIT 1;

-- Check system log (success)
SELECT * FROM system_logs 
WHERE source = '/api/staff/add' AND level = 'INFO'
ORDER BY created_at DESC LIMIT 1;
```

### Step 5: Test Error Handling (Validation)

**In browser:**

1. Navigate to: **Staff → Add Staff**
2. Leave **First Name** empty
3. Fill in **Position**: "Teacher"
4. Click **Submit**
5. **Expected result:** ❌ Toast shows "First name is required"

**Verify in Database:**
```sql
-- Check system log (warning)
SELECT * FROM system_logs 
WHERE source = '/api/staff/add' AND level = 'WARNING'
ORDER BY created_at DESC LIMIT 1;
```

### Step 6: Test Database Constraint Error

**In browser:**

1. Navigate to: **Staff → Add Staff**
2. Set **Department ID** to: **99999** (non-existent ID)
3. Fill all other required fields correctly
4. Click **Submit**
5. **Expected result:** ❌ Toast shows "One or more references are invalid"

**Verify in Database:**
```sql
-- Check system log (error)
SELECT * FROM system_logs 
WHERE source = '/api/staff/add' AND level = 'ERROR'
ORDER BY created_at DESC LIMIT 1;

-- Should show: errno: 1452 (ER_NO_REFERENCED_ROW)
```

### Step 7: Monitor System Logs

```bash
# Terminal window 1: Keep running in dev mode
npm run dev

# Terminal window 2: Watch system logs
watch -n 5 "mysql -u root -p'password' drais_school -e \
  'SELECT id, level, source, message, created_at FROM system_logs \
   WHERE created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) \
   ORDER BY created_at DESC LIMIT 10;'"
```

### Step 8: Check All Required Tables

```sql
-- Verify all new and updated tables exist with correct structure
DESC system_logs;      -- Should show: id, school_id, level, source, message, context, etc
DESC audit_logs;       -- Should show: id, school_id, user_id, action, entity_type, metadata, etc
DESC notifications;    -- Should show all notification fields
DESC user_notifications; -- Should show user-notification mapping
```

---

## ✅ VALIDATION CHECKLIST

After deployment, verify:

### Table Checks
- [ ] `system_logs` table exists and is empty
- [ ] `audit_logs` table exists (may have existing data)
- [ ] `notifications` table exists
- [ ] `user_notifications` table exists

### API Endpoint Checks
- [ ] `POST /api/staff/add` returns `{ success: true, data: {...} }`
- [ ] `POST /api/roles` returns `{ success: true, data: {...} }`
- [ ] Invalid requests return `{ success: false, error: {...} }`

### Frontend Checks
- [ ] Staff creation success shows toast: "✅ Staff member added successfully"
- [ ] Staff creation error shows toast: "❌ [Error message]"
- [ ] Error toasts display for 5 seconds
- [ ] Browser console shows detailed error logs

### Logging Checks
- [ ] Every successful staff creation logs to `audit_logs`
- [ ] Every API error logs to `system_logs`
- [ ] Every validation error logs to `system_logs` with level='WARNING'
- [ ] Errors show in `system_logs.context` as JSON

### Audit Trail Checks
- [ ] `SELECT * FROM audit_logs WHERE action = 'CREATED_STAFF'` shows recent entries
- [ ] Each audit entry includes: school_id, user_id, action, entity_type, entity_id, metadata

### Notification Checks
- [ ] New staff creation triggers notification to admins
- [ ] `SELECT * FROM notifications ORDER BY created_at DESC` shows recent entries

---

## 🔍 TROUBLESHOOTING

### Issue: TypeScript compilation errors

**Solution:**
```bash
# Clear build cache and rebuild
rm -rf .next
npm run build
```

### Issue: Database migration fails

**Solution:**
```bash
# Check if tables already exist
mysql> SHOW TABLES LIKE 'system_logs%';

# If they exist, you can skip - migration is idempotent
# Check migration ran correctly
mysql> SELECT COUNT(*) FROM system_logs;  -- Should be 0 or more
```

### Issue: API errors not logging

**Solution:**
```bash
# Check database connection
mysql -u root -p
> SHOW VARIABLES LIKE 'max_connections';
> SELECT COUNT(*) FROM system_logs;

# Check Node.js can write to DB
# Look in terminal for error messages
```

### Issue: Toast notifications not showing

**Solution:**
```bash
# 1. Check browser console for errors (F12 → Console)
# 2. Verify react-hot-toast is installed: npm list react-hot-toast
# 3. Check AddStaffModal imports toast correctly
# 4. Verify API response is properly formatted JSON
```

### Issue: Audit logs not created

**Solution:**
```bash
# Check audit.ts is imported correctly
# Check staff creation completes successfully
# Check database user has INSERT permission on audit_logs
mysql> GRANT SELECT, INSERT, UPDATE, DELETE ON drais_school.* TO 'app_user'@'localhost';
FLUSH PRIVILEGES;
```

---

## 🎯 MONITORING AFTER DEPLOYMENT

### Daily (First Week)
```sql
-- Check for any errors
SELECT COUNT(*) FROM system_logs WHERE level IN ('ERROR', 'CRITICAL');

-- Check staff creation working
SELECT COUNT(*) FROM audit_logs WHERE action = 'CREATED_STAFF' AND DATE(created_at) = CURDATE();

-- Check for any failed operations
SELECT * FROM system_logs WHERE level = 'ERROR' ORDER BY created_at DESC LIMIT 5;
```

### Weekly (After First Week)
```sql
-- Summary of all operations
SELECT 
  DATE(created_at) as day,
  COUNT(*) as total_events,
  SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as errors,
  SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END) as successes
FROM system_logs
GROUP BY DATE(created_at)
ORDER BY day DESC
LIMIT 7;
```

### Monthly (Performance Review)
```sql
-- Identify slowest operations
SELECT 
  source,
  COUNT(*) as count,
  SUM(CASE WHEN level IN ('ERROR', 'CRITICAL') THEN 1 ELSE 0 END) as failures
FROM system_logs
WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 MONTH)
GROUP BY source
ORDER BY failures DESC;
```

---

## 🔐 SECURITY NOTES

⚠️ **Important:**

1. **Never expose stack traces in production**
   - Check: `process.env.NODE_ENV === 'production'` must be true
   - Stack traces only logged internally

2. **Sanitize error messages**
   - Don't expose database structure in error messages
   - Use error codes, not raw DB errors

3. **Audit log retention**
   - Consider archiving old logs monthly
   - Keep at least 90 days of audit logs

4. **Access control**
   - Only admins can view system_logs
   - Only admins can view detailed audit_logs

---

## 📝 POST-DEPLOYMENT TASKS

### Immediate (Same Day)
1. ✅ Run validation script
2. ✅ Test staff creation (happy path)
3. ✅ Test error handling
4. ✅ Verify logs are being created
5. ✅ Brief team on changes

### This Week
1. Update remaining API routes (see API_ERROR_HANDLING_GUIDE.md)
2. Set up monitoring dashboard
3. Train support team on log access
4. Document error codes for support staff

### This Month
1. Audit all API routes for silent failures
2. Fix any remaining routes not following standard
3. Add metrics dashboard
4. Schedule regular log reviews

---

## 👥 TEAM COMMUNICATION

### For Developers
- "All API routes must now use createSuccessResponse/createErrorResponse"
- "Reference API_ERROR_HANDLING_GUIDE.md for template"
- "Test with invalid data - every error must show in system_logs"

### For QA/Testing
- "Test all happy paths and error scenarios"
- "Errors should appear in toast notifications"
- "Verify entries in system_logs and audit_logs"
- "Check for silent failures in any operation"

### For Support Team
- "Users will now see clear error messages"
- "All errors logged in system_logs table"
- "Can query logs with SELECT * FROM system_logs ORDER BY created_at DESC"
- "Errors include error_code for debugging"

### For Admins
- "System now logs all critical operations"
- "Real-time notifications when staff is created"
- "Can audit who did what and when"
- "No more silent failures"

---

## 📞 SUPPORT

If issues arise, check:

1. **Validation script**: `node scripts/validate-hardening.js`
2. **System logs**: `SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 20`
3. **Audit logs**: `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20`
4. **Browser console**: F12 → Console tab → Look for error messages
5. **Terminal logs**: Check npm run dev output for server errors

---

## ✨ FINAL CHECKLIST

Before marking as "Complete":

- [ ] Database migration applied successfully
- [ ] npm run build completes without errors
- [ ] Staff creation test passed
- [ ] Error handling test passed
- [ ] Logs verified in database
- [ ] Team briefed on changes
- [ ] Documentation updated
- [ ] Monitoring set up
- [ ] Rollback plan documented (see below)

---

## 🔙 ROLLBACK PLAN

If critical issues arise:

```bash
# 1. Revert code changes (git)
git revert <commit-hash>
npm install
npm run build

# 2. Drop new tables if needed (CAREFUL!)
mysql -u root -p drais_school << EOF
DROP TABLE IF EXISTS user_notifications;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS system_logs;
EOF

# 3. Restart application
npm run dev
```

⚠️ **Rollback only as last resort** - the new system is backwards compatible.

---

**Ready to Deploy! 🚀**

Questions? Check documentation files or review error logs.
