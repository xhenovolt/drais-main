# Promotions Route Fix - February 7, 2026

## Problem Identified
The `/api/promotions` route was not displaying any learners due to two database query issues:

### Issue 1: Non-existent Column Reference
**Column**: `s.term_promoted_in`
- This column doesn't exist in the `students` table
- The actual columns in the students table are:
  - `promotion_status`
  - `last_promoted_at`
  - `previous_class_id`
  - `previous_year_id`

**Fix**: Removed the non-existent `term_promoted_in` column from the SELECT clause and replaced it with `previous_year_id`

### Issue 2: DISTINCT with ORDER BY Conflict
**Problem**: MySQL 8.0 requires all ORDER BY columns to be in the SELECT list when using DISTINCT
- Original query: `SELECT DISTINCT ... ORDER BY p.first_name ASC, p.last_name ASC`
- Error: "Expression #1 of ORDER BY clause is not in SELECT list, references column which is not in SELECT list; this is incompatible with DISTINCT"

**Fix**: Removed the DISTINCT keyword since we're already selecting all relevant columns that make each row unique

## Modified Query

### Before:
```sql
SELECT DISTINCT
  s.id,
  s.admission_no,
  s.person_id,
  s.promotion_status,
  s.last_promoted_at,
  s.previous_class_id,
  s.term_promoted_in,  -- ❌ DOESN'T EXIST
  p.first_name,
  p.last_name,
  ...
FROM students s
JOIN people p ON s.person_id = p.id
...
ORDER BY p.first_name ASC, p.last_name ASC  -- ❌ CONFLICTS WITH DISTINCT
```

### After:
```sql
SELECT
  s.id,
  s.admission_no,
  s.person_id,
  s.promotion_status,
  s.last_promoted_at,
  s.previous_class_id,
  s.previous_year_id,  -- ✅ CORRECT COLUMN
  p.first_name,
  p.last_name,
  ...
FROM students s
JOIN people p ON s.person_id = p.id
...
ORDER BY p.first_name ASC, p.last_name ASC  -- ✅ WORKS WITHOUT DISTINCT
```

## Test Results
✅ Query now executes successfully
✅ Returns all 632 active students with correct data
✅ Sample output shows:
- Student IDs and admission numbers
- Promotion status (currently all "pending")
- Student full names
- Current class assignments
- Academic year information (where available)

## File Modified
- `/home/xhenvolt/Systems/DRAIS/src/app/api/promotions/route.ts`

## Next Steps
1. Restart the development server
2. Visit `/promotions` page
3. Confirm learners are now displayed in the list
4. Test promotion functionality with actual promotions
