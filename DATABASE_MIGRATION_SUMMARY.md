# DRAIS Database Migration Summary

## Overview
This document summarizes the changes made to align the DRAIS system with the Albayan database schema and fix the school name issue.

## Changes Completed

### 1. School Name Fix (Database Level)

#### Updated Files:
- **`database/drais_school_Albayan_2025.sql`**
  - Added INSERT statement for `schools` table with the correct school name:
    ```
    Albayan Quran Memorization Centre Nursery and Primary School
    ```
  - Added INSERT statements for `school_settings` table with school configuration

#### API Updates:
- **`src/app/api/school-info/route.ts`** (NEW FILE)
  - Created dynamic school info API endpoint
  - Fetches school name from `schools` table (primary) or `school_settings` table (fallback)
  - Returns dynamic school information for all system components

- **`src/app/api/students/full/route.ts`**
  - Updated admission letter generation to fetch school name dynamically from database
  - Fixed puppeteer headless mode TypeScript error

- **`src/components/students/StudentWizard.tsx`**
  - Fixed duplicate function definition
  - Updated hardcoded school name to use dynamic fetching from `/api/school-info`
  - Corrected school name to: "Albayan Quran Memorization Centre Nursery and Primary School"

- **`src/components/layout/Navbar.tsx`**
  - Already configured to fetch school name dynamically from `/api/school-info`
  - No changes required

### 2. Student Admission UI Fixes

#### Issues Fixed:
1. **Duplicate Function Definition**
   - Removed duplicate `generateAdmissionPDF` function in `StudentWizard.tsx`

2. **Hardcoded School Name**
   - Updated all hardcoded school names to use dynamic database values

3. **TypeScript Errors**
   - Fixed puppeteer headless mode configuration

### 3. Schema Comparison & Validation

#### Albayan Database Tables (77 total):
```
academic_years, audit_log, branches, classes, class_results, class_subjects,
contacts, counties, curriculums, departments, department_workplans, districts,
documents, document_types, enrollments, events, exams, fee_payments,
fee_structures, finance_categories, ledger, living_statuses, nationalities,
orphan_statuses, parishes, payroll_definitions, people, permissions,
report_card_metrics, report_cards, report_card_subjects, requirements_master,
results, result_types, role_permissions, roles, salary_payments, schools,
school_settings, staff, staff_attendance, staff_salaries, streams,
student_attendance, student_contacts, student_curriculums,
student_education_levels, student_family_status, student_fee_items,
student_hafz_progress_summary, student_next_of_kin, student_profiles,
student_requirements, students, subcounties, subjects, tahfiz_attendance,
tahfiz_books, tahfiz_evaluations, tahfiz_group_members, tahfiz_groups,
tahfiz_migration_log, tahfiz_plans, tahfiz_portions, tahfiz_records,
term_progress_log, term_requirement_items, term_requirements, terms,
term_student_reports, term_student_requirement_status, timetable,
user_people, users, villages, wallets, workplans
```

#### Scripts Created:
1. **`scripts/schema-validator.sh`**
   - Compares Albayan schema with current database
   - Identifies missing tables
   - Provides validation summary

2. **`scripts/import-albayan-db.sh`**
   - Flushes current database
   - Imports Albayan database
   - Verifies import success
   - Validates school name

## Next Steps: Database Import

### Option 1: Automated Import (Recommended)
```bash
cd /home/xhenvolt/Systems/DRAIS
./scripts/import-albayan-db.sh
```

### Option 2: Manual Import
```bash
mysql -u root -p -e "DROP DATABASE IF EXISTS drais_school;"
mysql -u root -p -e "CREATE DATABASE drais_school CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
mysql -u root -p drais_school < database/drais_school_Albayan_2025.sql
```

### Option 3: Using phpMyAdmin/XAMPP
1. Open phpMyAdmin
2. Select the current database
3. Click "Drop" to remove all tables
4. Create new database `drais_school`
5. Import `database/drais_school_Albayan_2025.sql`

## Verification Steps

After importing, verify:

1. **School Name**
   ```sql
   SELECT name FROM schools WHERE id=1;
   -- Expected: Albayan Quran Memorization Centre Nursery and Primary School
   ```

2. **Table Count**
   ```sql
   SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='drais_school';
   -- Expected: 77
   ```

3. **System Functionality**
   - Access `/students/list` - should show students
   - Access Navbar - should show correct school name
   - Try adding a new student - should use correct school name in admission letter

## Rollback Plan

If issues occur, restore from backup:
```bash
mysql -u root -p drais_school < backup_of_previous_database.sql
```

## Notes

- The Albayan database already contains all 77 required tables
- No additional schema modifications are needed
- All system components now use dynamic school name from database
- Student admission process will use the correct school name in all generated documents

## Support

For issues or questions, check:
- `DATABASE_FIXES_APPLIED.md` for historical fixes
- Application logs for runtime errors
- Database error logs for SQL issues
