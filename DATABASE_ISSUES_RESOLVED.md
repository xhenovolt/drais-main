# Database Issues Resolution Report
**Date:** February 7, 2026  
**Status:** ✅ COMPLETED

## Issues Identified and Resolved

### 1. Missing Feature Flags Columns
**Error:** `Unknown column 'route_name' in 'field list'`

**Root Cause:** The `feature_flags` table was created with an older schema that lacked the required columns for the API to function properly.

**Solution:** Added the following columns to the `feature_flags` table:
- `route_name` VARCHAR(255) - Route identifier for the feature
- `route_path` VARCHAR(255) - API route path
- `label` VARCHAR(255) - Display label
- `is_new` BOOLEAN - Flag for new features
- `version_tag` VARCHAR(50) - Version identifier
- `category` VARCHAR(100) - Feature category
- `priority` INT - Priority for sorting
- `date_added` TIMESTAMP - Creation timestamp
- `expires_at` TIMESTAMP - Expiration date for feature flags

**Database Changes:**
```sql
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS route_name VARCHAR(255) NOT NULL DEFAULT 'default' AFTER school_id;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS route_path VARCHAR(255) NOT NULL DEFAULT '/' AFTER route_name;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS label VARCHAR(255) NOT NULL DEFAULT 'Feature' AFTER route_path;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE AFTER is_enabled;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS version_tag VARCHAR(50) DEFAULT 'v_current' AFTER is_new;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'general' AFTER version_tag;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0 AFTER category;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER priority;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL DEFAULT NULL AFTER date_added;
```

**Affected API Endpoint:**
- `GET /api/feature-flags`
- `GET /api/feature-flags?school_id=<id>`

---

### 2. Missing Villages Table
**Error:** `Table 'drais_school.villages' doesn't exist`

**Root Cause:** The students query joins with a `villages` table for location hierarchy lookup, but the table was not created in the database.

**Solution:** Created the `villages` table with proper structure to support the location hierarchy:

**Database Changes:**
```sql
CREATE TABLE IF NOT EXISTS villages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  parish_id BIGINT DEFAULT NULL,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_villages_parish (parish_id),
  KEY idx_villages_name (name),
  KEY idx_villages_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Villages table for location hierarchy';
```

**Table Structure:**
| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| id | BIGINT | NO | Primary key |
| parish_id | BIGINT | YES | Reference to parish location |
| name | VARCHAR(255) | NO | Village name (unique) |
| description | TEXT | YES | Optional village description |
| created_at | TIMESTAMP | NO | Creation timestamp |
| updated_at | TIMESTAMP | NO | Last update timestamp |
| deleted_at | TIMESTAMP | YES | Soft delete timestamp |

**Related Column:**
- Added `village_id` to `students` table (already existed) to reference villages

**Affected API Endpoint:**
- `GET /api/students/full` - Student list with location data

---

## Files Updated

### 1. Database Schema
- **File:** `/home/xhenvolt/Systems/DRAIS/database/drais_school_Albayan_2025.sql`
- **Changes:** 
  - Added 9 ALTER TABLE statements for feature_flags columns (lines 12463-12471)
  - Added CREATE TABLE statement for villages table (lines 12473-12486)
  - Backed up original file to: `drais_school_Albayan_2025.sql.backup2`

### 2. Database Live Instance
- **Database:** `drais_school` (localhost)
- **Status:** Both changes applied successfully
- **Verification:** Queries execute without errors

---

## Verification Results

### Feature Flags Table
✅ All required columns exist and can be queried
```
Total columns: 23
Required columns: route_name, route_path, label, is_new, version_tag, category, priority, date_added, expires_at
Status: All present
```

### Villages Table
✅ Table created successfully
```
Table: villages
Records: 0 (empty, ready for data)
Indexes: 3 (parish_id, name, deleted_at)
Status: Operational
```

### Students Query Test
✅ Query returns student data without errors
```sql
SELECT s.*, p.*, v.name as village_name 
FROM students s
JOIN people p ON s.person_id = p.id
LEFT JOIN villages v ON s.village_id = v.id
LIMIT 5;
Result: 5 students returned successfully
```

---

## API Endpoints Restored

### 1. Feature Flags API
**Endpoint:** `GET /api/feature-flags`
**Status:** ✅ Fixed - Now queries feature_flags with all required columns

**Endpoint:** `GET /api/feature-flags?school_id=<id>`
**Status:** ✅ Fixed - School-specific feature flags now work

### 2. Students API
**Endpoint:** `GET /api/students/full`
**Status:** ✅ Fixed - Students list with village location data now returns learners

**Endpoint:** `GET /api/students/full?q=<search>`
**Status:** ✅ Fixed - Student search with location data works

---

## Impact Summary

| Component | Before | After | Status |
|-----------|--------|-------|--------|
| Feature Flags Table | Missing 9 columns | All columns present | ✅ Fixed |
| Villages Table | Does not exist | Created with proper schema | ✅ Fixed |
| Students Query | Returns error | Returns learner data | ✅ Fixed |
| API /feature-flags | 500 Error | Operational | ✅ Fixed |
| API /students/full | 500 Error | Operational | ✅ Fixed |

---

## Future Considerations

1. **Data Population**: The `villages` table is currently empty. Populate it with actual village data related to your parishes for complete location hierarchy support.

2. **Feature Flags Data**: Consider adding default feature flags to the feature_flags table with appropriate routes and settings.

3. **Backups**: Two backup files are available:
   - `drais_school_Albayan_2025.sql.backup` - Original migration backup
   - `drais_school_Albayan_2025.sql.backup2` - Pre-fix backup (for reference)

---

## Technical Notes

- All ALTER TABLE statements use standard MySQL/MariaDB syntax
- Foreign key constraints are not enforced on villages → parishes relationship for flexibility
- Soft delete support via `deleted_at` timestamp field
- All changes are idempotent (can be re-applied safely)
- Changes are documented in the Albayan schema file for reproducibility

---

**Resolution Completed:** February 7, 2026
