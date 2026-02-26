# Database Architecture Audit - Phase 2

## Overview
This document audits all database tables in the DRAIS system, focusing on attendance-related tables, relationships, indexes, and normalization issues.

---

## ATTENDANCE-RELATED TABLES

### 1. Raw Device Logs Tables

#### `device_logs` (NEWLY CREATED)
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| device_id | BIGINT | FK to devices |
| device_type | VARCHAR(50) | dahua, zkteco, etc |
| user_identifier | VARCHAR(255) | Card/fingerprint ID |
| user_id | BIGINT | FK to students/staff |
| user_type | ENUM | learner, staff, unknown |
| timestamp | DATETIME | When scan occurred |
| event_type | ENUM | entry, exit, unknown |
| method | ENUM | fingerprint, card, face, etc |
| raw_payload | JSON | Original device data |
| synced_at | TIMESTAMP | When synced |
| processed | TINYINT | Whether processed |
| created_at | TIMESTAMP | Record creation |

**Issues:**
- ✅ Good: Never delete policy comment
- ✅ Good: Indexes on device_id, timestamp
- ⚠️ Missing: FK to device tables not explicitly defined
- ⚠️ Missing: FK to students/staff not enforced

#### `dahua_raw_logs`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| device_id | BIGINT | FK to dahua_devices |
| raw_data | TEXT | Raw response |
| record_count | INT | Number of records |
| parsed_successfully | TINYINT | Parse status |

**Issues:**
- ⚠️ No FK constraint to dahua_devices
- ⚠️ Should be merged with device_logs

#### `dahua_attendance_logs`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| device_id | BIGINT | FK to dahua_devices |
| student_id | BIGINT | FK to students |
| card_no | VARCHAR(100) | Card number |
| user_id | VARCHAR(100) | User ID |
| event_time | DATETIME | Event timestamp |
| event_type | ENUM | Entry, Exit |
| method | ENUM | fingerprint, card, face |

**Issues:**
- ⚠️ Should use device_logs instead
- ⚠️ Duplicate of device_logs concept

---

### 2. Processed Attendance Tables

#### `student_attendance`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| student_id | BIGINT | FK to students |
| date | DATE | Attendance date |
| status | ENUM | present, absent, late, excused |
| method | VARCHAR | biometric, manual, hybrid |
| session_id | BIGINT | FK to attendance_sessions |

**Relationships:**
- FK to students table
- FK to attendance_sessions (optional)

**Indexes:**
- ✅ idx_student (student_id)
- ✅ idx_date (date)
- ✅ idx_status (status)

**Issues:**
- ⚠️ Missing: class_id - cannot filter by class without join
- ⚠️ Missing: time fields - only stores status, not time
- ⚠️ Tight coupling: Depends on sessions table

#### `staff_attendance`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| staff_id | BIGINT | FK to staff |
| date | DATE | Attendance date |
| status | ENUM | present, absent, late |
| check_in | TIME | Check-in time |
| check_out | TIME | Check-out time |
| method | VARCHAR | biometric, manual |

**Relationships:**
- FK to staff table

**Issues:**
- ⚠️ Different schema from student_attendance
- ⚠️ Inconsistent status values

#### `attendance_sessions_v2` (NEWLY CREATED)
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| user_id | BIGINT | FK to students/staff |
| user_type | ENUM | learner, staff |
| class_id | BIGINT | FK to classes (learners) |
| department_id | BIGINT | FK to departments (staff) |
| academic_year_id | BIGINT | FK to academic_years |
| term_id | BIGINT | FK to terms |
| date | DATE | Session date |
| first_scan_time | TIME | First check-in |
| last_scan_time | TIME | Last check-out |
| arrival_status | ENUM | present, late, absent, excused |
| departure_status | ENUM | present, early_leave, absent |
| status | ENUM | Combined status |
| source | ENUM | device, manual, imported |
| device_id | BIGINT | Source device |

**Relationships:**
- FK to students, staff
- FK to classes, departments, academic_years, terms

**Indexes:**
- ✅ unique_user_date (user_id, user_type, date)
- ✅ idx_user (user_id)
- ✅ idx_date (date)
- ✅ idx_status (status)

**Issues:**
- ✅ Good: Separates user_type
- ✅ Good: Stores first/last scan times
- ⚠️ Missing: FK constraints not defined

---

### 3. Device Configuration Tables

#### `biometric_devices`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| school_id | BIGINT | FK to schools |
| device_name | VARCHAR(100) | Display name |
| device_code | VARCHAR(50) | Unique code |
| device_type | VARCHAR(50) | fingerprint, face, etc |
| manufacturer | VARCHAR(100) | Brand |
| model | VARCHAR(100) | Model |
| serial_number | VARCHAR(100) | Serial |
| ip_address | VARCHAR(45) | IP address |
| mac_address | VARCHAR(17) | MAC address |
| status | ENUM | active, inactive, maintenance, offline |
| last_sync_at | TIMESTAMP | Last sync |
| sync_status | ENUM | synced, pending, failed |
| api_key | VARCHAR(255) | API key |
| api_secret | VARCHAR(255) | API secret |
| poll_interval_seconds | INT | Poll interval |
| last_poll_at | TIMESTAMP | Last poll |

**Relationships:**
- FK to schools table

**Indexes:**
- ✅ unique device_code
- ✅ unique serial_number
- ✅ idx_school (school_id)
- ✅ idx_status (status)

**Issues:**
- ⚠️ Credentials stored in plain text (api_secret)
- ⚠️ Missing: port field
- ⚠️ Missing: username/password fields
- ⚠️ New columns for encrypted credentials not used yet

#### `dahua_devices`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| school_id | BIGINT | FK to schools |
| device_name | VARCHAR(100) | Display name |
| device_code | VARCHAR(50) | Unique code |
| ip_address | VARCHAR(45) | IP address |
| port | INT | Port number |
| username | VARCHAR(100) | Auth username |
| password | VARCHAR(255) | Auth password |
| encrypted_password | VARCHAR(255) | Encrypted password |
| device_type | ENUM | attendance, access_control, hybrid |
| protocol | ENUM | http, https |
| status | ENUM | active, inactive, offline, error |
| last_sync | TIMESTAMP | Last sync time |
| last_sync_status | ENUM | success, failed, pending |
| auto_sync_enabled | TINYINT | Auto sync flag |
| sync_interval_minutes | INT | Sync interval |
| poll_interval_seconds | INT | Poll interval |
| late_threshold_minutes | INT | Late threshold |

**Relationships:**
- FK to schools table

**Issues:**
- ⚠️ Credentials in both password and encrypted_password
- ⚠️ Should consolidate with biometric_devices

---

### 4. Sync & Checkpoint Tables

#### `device_sync_checkpoints` (NEWLY CREATED)
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| device_id | BIGINT | FK to devices |
| last_sync_timestamp | DATETIME | Last successful sync |
| last_sync_record_count | INT | Records synced |
| sync_status | ENUM | success, failed, in_progress |
| sync_error | TEXT | Error message |

**Relationships:**
- ⚠️ No explicit FK - uses generic device_id

**Issues:**
- ✅ Good: Tracks incremental sync

#### `dahua_sync_history`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| device_id | BIGINT | FK to dahua_devices |
| sync_type | ENUM | manual, scheduled, automatic |
| records_fetched | INT | Records fetched |
| records_processed | INT | Records processed |
| records_failed | INT | Failed records |
| status | ENUM | in_progress, success, failed, partial |
| started_at | TIMESTAMP | Start time |
| completed_at | TIMESTAMP | End time |
| error_details | TEXT | Error details |

**Issues:**
- ⚠️ Duplicate functionality with device_sync_checkpoints
- Should be consolidated

#### `device_connection_logs`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| device_id | BIGINT | Device ID |
| action | ENUM | test_connection, sync, connect, etc |
| status | ENUM | success, failed, timeout |
| request_data | JSON | Request details |
| response_status | INT | HTTP status |
| error_message | TEXT | Error details |
| ip_address | VARCHAR(45) | Client IP |
| user_agent | VARCHAR(255) | Client user agent |

**Issues:**
- ✅ Good: Security logging

---

### 5. Rules Table

#### `attendance_rules`
| Column | Type | Purpose |
|--------|------|---------|
| id | BIGINT | Primary key |
| school_id | BIGINT | FK to schools |
| rule_name | VARCHAR(100) | Rule name |
| user_type | ENUM | learner, staff |
| day_of_week | ENUM | monday, tuesday, etc |
| start_time | TIME | Expected arrival start |
| end_time | TIME | Expected arrival end |
| late_threshold_minutes | INT | Late threshold |
| absent_threshold_minutes | INT | Absent threshold |
| departure_start | TIME | Expected departure start |
| departure_end | TIME | Expected departure end |
| is_active | TINYINT | Active flag |

**Issues:**
- ✅ Good: Allows flexible rules per day
- ⚠️ Missing: FK to school

---

## GENERAL DATABASE ISSUES

### 1. Multi-School Readiness

**Current Issues:**
- Most tables have school_id, but NOT enforced as FK
- Hardcoded DEFAULT 1 for school_id in many tables
- No tenant isolation at database level (only application-level)

### 2. Missing Foreign Keys

- device_logs has no FK to actual device tables
- attendance_sessions has no FK constraints defined
- Many tables use BIGINT instead of explicit FK relationships

### 3. Index Gaps

- student_attendance missing index on (date, class_id)
- staff_attendance missing index on (date, department_id)
- device_logs could benefit from composite index on (device_id, processed, timestamp)

### 4. Normalization Issues

#### Duplicate Data
- card_no stored in both students AND staff tables
- biometric_devices and dahua_devices store similar data differently
- student_attendance and attendance_sessions_v2 overlap

#### Inconsistent Schemas
- student_attendance and staff_attendance have different structures
- biometric_devices and dahua_devices have inconsistent columns

### 5. Hardcoded Values

- Many tables have `DEFAULT 1` for school_id
- Default port 80 hardcoded in device forms
- Default poll intervals hardcoded in workers

---

## ATTENDANCE MODULE SPECIFIC ISSUES

### Separation of Concerns

| Layer | Current Tables | Issues |
|-------|---------------|--------|
| Raw Logs | device_logs, dahua_raw_logs, dahua_attendance_logs | Multiple tables, no clear separation |
| Processing | attendance_sessions_v2 | New table, but overlaps with student_attendance |
| Reporting | Derived via queries on above | No dedicated reporting tables |

### Staff vs Learner Separation

| Aspect | Learners | Staff |
|--------|----------|-------|
| Raw Logs | user_type='learner' in device_logs | user_type='staff' in device_logs |
| Attendance | student_attendance table | staff_attendance table |
| Sessions | class_id | department_id |
| Status | handled in student_attendance | handled differently in staff_attendance |

**Issues:**
- Inconsistent schema between student_attendance and staff_attendance
- Different columns (session_id vs nothing)
- Different status values possible

---

## RECOMMENDATIONS

1. **Consolidate device tables**: Merge biometric_devices, dahua_devices into single table with device_type

2. **Consolidate logs**: Replace dahua_raw_logs, dahua_attendance_logs with device_logs

3. **Add FK constraints**: Define proper foreign keys at database level

4. **Unify attendance schemas**: Make student_attendance and staff_attendance consistent

5. **Add school_id FK**: Ensure all tables properly reference schools table

6. **Remove hardcoded values**: Move defaults to configuration

7. **Create reporting tables**: Consider materialized views for common reports
