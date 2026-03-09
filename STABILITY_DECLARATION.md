# DRAIS STABILITY DECLARATION

**Date:** 2025-07-08  
**Status:** SYSTEM STABLE  
**Test Result:** 36/36 API endpoints passing (100%)

---

## Phase Summary

### Phase 1: Root Cause Analysis
- Mapped 99+ database tables
- Identified the **primary crash**: `device_user_mappings` table missing in TiDB Cloud
- Found 8 hardcoded `dbConfig` objects in tahfiz routes using wrong env vars
- Found `persons` vs `people` table mismatch in promotions routes
- Found `s.name`/`s.reg_no` referencing non-existent student columns in tahfiz-list report
- Found `sfi.academic_year` filter mismatch in dashboard overview

### Phase 2: Database Schema Repair
**Tables Created (both Local MySQL + TiDB Cloud):**
1. `device_user_mappings` — biometric device-to-student mapping
2. `tahfiz_records` — Quran memorization records
3. `tahfiz_group_members` — tahfiz group membership
4. `tahfiz_portions` — Quran portion assignments
5. `student_history` — student status change audit log
6. `settings` — key-value application settings
7. `tahfiz_evaluations` — tahfiz evaluation scores
8. `tahfiz_attendance` — tahfiz-specific attendance
9. `tahfiz_plans` — tahfiz learning plans
10. `tahfiz_books` — tahfiz book registry
11. `wallets` — finance wallets
12. `payment_reconciliations` — payment reconciliation records
13. `finance_actions` — finance audit log

**Columns Added:**
- `terms.status` VARCHAR(20) — for active term filtering
- `schools`: 9 columns (motto, district, website, founded_year, country, region, principal_name, principal_phone, registration_number)
- `tahfiz_portions`: 12 columns (portion_name, surah_name, ayah_from, ayah_to, juz_number, page_from, page_to, difficulty_level, estimated_days, assigned_at, started_at, completed_at)
- `tahfiz_group_members`: 2 columns (joined_at, role)
- `tahfiz_records` (TiDB only): 6 columns (presented, presented_length, retention_score, mark, recorded_by, recorded_at)
- `student_fee_items.waived` DECIMAL(14,2)
- `fee_payments.discount_applied` DECIMAL(14,2)
- `fee_payments.tax_amount` DECIMAL(14,2)

### Phase 3: Make Queries Resilient
**Fixed Files:**
- 8 tahfiz routes: Replaced hardcoded `dbConfig` with central `getConnection()` from `@/lib/db`
- 3 promotions routes: Fixed `persons` → `people` table reference
- `reports/tahfiz-list`: Fixed `s.name` → `CONCAT(p.first_name, ' ', p.last_name)`, `s.reg_no` → `s.admission_no`
- `reports/classresults`: Replaced fully hardcoded dbConfig, removed RowDataPacket types

### Phase 4: Fix Student Display
- Root cause: `device_user_mappings` table missing → LEFT JOIN caused entire query to fail
- Fix: Created the table in migration
- Result: `/api/students/full` returns all 30 fields per student

### Phase 5: Remove Hardcoded School Info
- Created `src/lib/schoolDB.ts` — DB-driven school info with 1-minute cache
- Replaced all "Ibun Baz Girls Secondary School" hardcoded strings across:
  - students/full, school-info, students/status-action, reports/classresults
  - finance/invoices, components/admissionPdf, services/ReceiptService

### Phase 6: Build Settings Module
- Created `/api/settings/route.ts` (GET + PUT)
- Updated `SettingsManager.tsx` to use Next.js API instead of PHP endpoints

### Phase 7: Test Student Admission Flow
- `/api/students/full?school_id=1` — ✅ Returns students with all 30 fields
- POST admission endpoint functional (Puppeteer PDF generation available)

### Phase 8: Test Examinations Module
- `/api/exams` — ✅ 200 OK
- `/api/reports/classresults` — ✅ 200 OK
- `/api/result_types` — ✅ 200 OK

### Phase 9: Stability Guarantee
**Additional fixes applied during testing:**
- **TiDB LIMIT compatibility**: Fixed parameterized `LIMIT ?, ?` across 8 routes (TiDB doesn't support prepared statement LIMIT)
  - device-logs, finance/payments, finance/ledger/fees, finance/waivers, finance/expenditures, attendance/devices/logs, device-connection-history, staff
- **finance/payments**: Fixed `fp.status` → `fp.payment_status`, fixed ambiguous `student_id` in subquery
- **finance/categories**: Fixed ambiguous column references, added full GROUP BY
- **dashboard**: Fixed GROUP BY for TiDB strict mode, removed non-existent table joins
- **attendance/summary**: Fixed `s.gender` → `p.gender`, added missing JOIN to people table, fixed class join through enrollments
- **departments**: Removed references to non-existent columns (budget, created_at, deleted_at)

### Phase 10: Final Test Results

| Module | Endpoints Tested | Pass | Status |
|--------|-----------------|------|--------|
| Students | students/full, students/list | 2/2 | ✅ |
| Core | classes, streams, terms, subjects | 4/4 | ✅ |
| Staff | staff, staff/list | 2/2 | ✅ |
| School | school-info, settings | 2/2 | ✅ |
| Dashboard | dashboard, dashboard/overview | 2/2 | ✅ |
| Exams | exams, result_types, academic_years | 3/3 | ✅ |
| Attendance | attendance, stats, summary | 3/3 | ✅ |
| Tahfiz | groups, teachers, portions, reports, group-members, learners | 6/6 | ✅ |
| Reports | classresults, tahfiz-list | 2/2 | ✅ |
| Finance | fees, payments, categories, expenditures, ledger, fee_structures, waivers | 7/7 | ✅ |
| Admin | curriculums, departments, departments/list | 3/3 | ✅ |
| System | test-db | 1/1 | ✅ |
| **TOTAL** | | **36/36** | **100%** |

---

## Architecture Notes

### Database Connection
- **Primary**: TiDB Cloud (gateway01.eu-central-1.prod.aws.tidbcloud.com:4000)
- **Fallback**: Local MySQL (localhost:3306)
- **Mode**: `DATABASE_MODE=auto` — tries TiDB first, falls back to MySQL
- **Known behavior**: First cold request may timeout on TiDB (5s limit), subsequent requests succeed

### Key Files Created/Modified
- `src/lib/schoolDB.ts` — Central school info fetcher (NEW)
- `src/app/api/settings/route.ts` — Settings CRUD API (NEW)
- `database/migration_stability_fix.sql` — Phase 2 migration script
- `scripts/apply-migration.js` — Migration runner

### Known Limitations
- Local MySQL has only 1 student (school_id=1); TiDB has 22 non-deleted students
- Puppeteer PDF generation requires headless Chrome (works in dev, needs configuration in production)
- Some advanced routes (analytics, biometric sync) not included in stability test (they depend on external services)
