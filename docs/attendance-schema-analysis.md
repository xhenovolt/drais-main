# Attendance Schema Analysis — DRAIS TiDB Cloud
_Generated: April 17, 2026_

## Executive Summary

DRAIS has a rich attendance schema with 15 attendance-related tables. However, **all canonical attendance tables are EMPTY**. The only real attendance data lives in `zk_attendance_logs` (592 rows, biometric device scans). This doc maps the full schema, identifies the live data path, and defines the intelligence strategy.

---

## Table Inventory

| Table | Rows | Status | Purpose |
|---|---|---|---|
| `student_attendance` | 0 | **EMPTY** | Canonical per-student daily attendance |
| `daily_attendance` | 0 | **EMPTY** | Processed daily records (present/absent/late) |
| `attendance_sessions` | 0 | **EMPTY** | Session-level attendance (lesson/morning check) |
| `manual_attendance_entries` | 0 | **EMPTY** | Manual overrides |
| `attendance_logs` | 0 | **EMPTY** | Generic device scan log bridge |
| `dahua_attendance_logs` | 0 | **EMPTY** | Dahua camera scan logs |
| `zk_attendance_logs` | **592** | ✅ **LIVE** | ZK biometric device scans (primary data source) |
| `attendance_audit_logs` | ? | Audit | Change history |
| `attendance_processing_queue` | ? | Queue | Pending processing |
| `attendance_reconciliation` | ? | Reconcile | Data conflict resolution |
| `attendance_reports` | ? | Reports | Pre-generated report cache |
| `attendance_rules` | ? | Config | School attendance rules |
| `staff_attendance` | ? | Staff | Staff sign-in/out |
| `tahfiz_attendance` | ? | Quran | Tahfiz-specific attendance |

---

## Key Table Schemas

### `zk_attendance_logs` (LIVE — 592 rows)
```
id, school_id, device_sn, device_user_id, student_id (nullable), 
staff_id (nullable), check_time (datetime), verify_type, io_mode,
log_id, work_code, processed, matched, raw_log_id, created_at
```
**Insights:**
- `school_id` = 12005 (primary active school for this tenant)
- 592 total scans → 346 have `student_id` linked → 199 distinct students
- Unmatched scans (246 rows): `device_user_id` is non-numeric (biometric chars) → not yet matched to student
- Date range: April 7–17, 2026 (11 days of data)
- Two schools in ZK logs: school_id 12003 (155 students) and 12005 (44 students)

### `student_attendance` (EMPTY — designed target)
```
id, school_id, student_id, date, status (varchar 20), method (varchar 50),
time_in, time_out, notes, marked_at, marked_by, attendance_session_id,
term_id, academic_year_id, stream_id, subject_id, teacher_id,
device_id, biometric_timestamp, confidence_score, override_reason,
is_locked, locked_at
```
**Gap:** ZK biometric scans are NOT being processed into this table. The attendance processing pipeline (attendance_processing_queue → daily_attendance → student_attendance) is built but not running.

### `daily_attendance` (EMPTY — processing output)
```
id, school_id, person_type, person_id, attendance_date,
status (present/late/absent/excused/on_leave/pending),
first_arrival_time, last_departure_time, arrival_device_id,
is_manual_entry, is_late, late_minutes, late_reason,
excuse_type, excuse_note, processing_metadata (json)
```

---

## Relationship Map

```
students (school_id=8002: 3,835 total)
  └── enrollments → terms → academic_years
  └── class_results (7,508 rows, school_id=8002 only)
  └── student_attendance (0 rows — EMPTY)

students (school_id=12003/12005: biometric schools)
  └── zk_attendance_logs (592 rows — LIVE DATA)
  └── biometric_enrollments / fingerprints
  └── class_results (0 rows for these schools)
```

---

## Critical Findings

### 1. School Data Silo Problem
| School | class_results | zk_attendance_logs | Overlap |
|---|---|---|---|
| 8002 (IbunBaz) | 7,505 results / 701 students | 0 rows | None |
| 12003 | 0 rows | 155 students scanned | None |
| 12005 (active) | 0 rows | 44 students scanned | None |

**Impact:** No school currently has BOTH attendance AND academic performance data. The performance-correlation engine is architecturally correct but will return `data_available: false` until a school populates both.

### 2. Processing Pipeline Gap
ZK biometric scans arrive → stored in `zk_attendance_logs` → **pipeline NOT running** → `student_attendance` stays empty. Fix: run `/api/attendance/devices/process-logs` regularly.

### 3. student_id Match Rate
Of 592 ZK scans, only 346 (58%) have a student_id matched. The remaining 246 are from device users not yet mapped to students. 

### 4. Terms
- School 12005 has 1 active term: `TERM I` (id=180004, Feb 9 – May 1, 2026)
- School 8002 has terms id=30004 (5,440 results) and 30005 (2,065 results)

---

## Intelligence Data Strategy

Given the empty canonical tables, the intelligence engine uses:

1. **`zk_attendance_logs`** — Primary source for attendance presence detection
   - 1 student-day = 1 DISTINCT (student_id, DATE(check_time))
   - "School days tracked" = DISTINCT DATE(check_time) values where any scan occurred
   - Attendance % per student = days_present / total_school_days × 100

2. **`class_results`** — Academic performance (school 8002)
   - Correlation possible only when same school has both data types

3. **Absence detection** — Indirect: a student with no ZK scan on a day when others scanned = likely absent

---

## Missing Data Points

| Gap | Severity | Impact |
|---|---|---|
| No school calendar/holidays table | Medium | Can't distinguish weekends from absences |
| No excuse/late marking pipeline | High | All absences look the same |
| No attendance-academic school overlap | Critical | Correlation engine has no data |
| 42% of ZK scans unmatched to student_id | Medium | Underestimates real attendance |
| student_attendance table empty | High | All existing attendance UIs show 0 |

---

## Recommendations

1. **Immediate**: Run `process-logs` cron to push ZK data → `student_attendance`
2. **Short-term**: Map remaining 246 unmatched device users to students
3. **Medium-term**: Ensure school 8002 (with class_results) installs ZK device to enable correlation
4. **Intelligence layer**: Built on zk_attendance_logs directly — works now for schools 12003/12005
