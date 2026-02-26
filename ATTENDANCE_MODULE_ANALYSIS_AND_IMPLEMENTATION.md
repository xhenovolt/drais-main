# DRAIS Attendance Module - System Analysis & Implementation Plan

**Date**: February 8, 2026  
**Project**: DRAIS School Management System  
**Component**: Comprehensive Attendance Management Module  
**Status**: Phase 1 - System Discovery Complete, Phase 2 - Implementation in Progress

---

## EXECUTIVE SUMMARY

The DRAIS system has a foundation for attendance tracking with basic database tables and API endpoints. This document outlines the complete system discovery, identifies gaps, and provides a detailed implementation plan to deliver a **production-grade, enterprise-level Attendance Module** supporting Manual, Automatic (Biometric), and Hybrid modes.

---

## PHASE 1 - SYSTEM DISCOVERY REPORT

### 1.1 Technology Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | Next.js 15+ with TypeScript |
| **Frontend** | React 19+, Tailwind CSS, Framer Motion |
| **Database** | MySQL 8.0+ (InnoDB) |
| **API Pattern** | Next.js App Router (RESTful) |
| **State Management** | SWR, Jotai, React Context |
| **UI Components** | Custom + Lucide Icons |
| **Authentication** | JWT-based (custom implementation) |

### 1.2 Current Database Schema - Attendance Related Tables

#### A. **student_attendance** (Existing)
```
Columns:
- id (BIGINT PK)
- student_id (BIGINT FK)
- date (VARCHAR/DATE)
- status (ENUM: present, absent, late, excused, not_marked)
- notes (TEXT)
- time_in (TIME)
- time_out (TIME)
- class_id (BIGINT FK)
- method (VARCHAR: manual/biometric)
- marked_by (BIGINT FK - User)
- marked_at (TIMESTAMP)

Unique Constraint: (student_id, date)
```

**Issues Identified:**
- ❌ Missing `term_id` and `academic_year_id` for proper scheduling
- ❌ Missing `stream_id` for section-based tracking
- ❌ Missing `subject_id` for subject-specific attendance
- ❌ Missing `teacher_id` for accountability
- ⚠️ No attendance session tracking (class-level sessions)
- ⚠️ No biometric device association

#### B. **student_fingerprints** (Partial Implementation)
```
Columns:
- id (BIGINT PK)
- student_id (BIGINT FK UNIQUE)
- method (VARCHAR: passkey/fingerprint)
- credential_id (VARCHAR)
- public_key (TEXT)
- counter (BIGINT)
- is_active (TINYINT boolean)
- created_at (TIMESTAMP)
- last_used_at (VARCHAR)

Issues:
- ❌ Missing device_id association
- ❌ No device sync tracking
- ❌ No backup fingerprints support
- ❌ Limited to single fingerprint per student (UNIQUE constraint)
- ❌ No status field (active/inactive/revoked)
- ❌ No registration timestamp
```

#### C. **fingerprints** (Legacy)
```
Columns:
- id (BIGINT PK)
- student_id (BIGINT FK)
- method (VARCHAR: phone/biometric)
- credential (TEXT)
- created_at (TIMESTAMP)
- device_info (JSON) - added but not used
- quality_score (INT)

Status: ⚠️ DUPLICATE TABLE - NEEDS CONSOLIDATION
```

#### D. **staff_attendance** (Existing - Staff Only)
```
Columns:
- id (BIGINT PK)
- staff_id (BIGINT FK)
- date (DATE)
- status (ENUM)
- notes (TEXT)
- time_in (TIME)
- time_out (TIME)
- method (VARCHAR)
- marked_by (BIGINT FK)
- marked_at (TIMESTAMP)

Status: ✓ Similar structure to student_attendance
```

#### E. **streams** (Used as Sections)
```
Columns:
- id (BIGINT PK)
- school_id (BIGINT FK)
- class_id (BIGINT FK)
- name (VARCHAR: e.g., "Stream A", "Stream B")

Status: ✓ PROPERLY IMPLEMENTED - Represents sections/streams
```

#### F. **Core Tables (Intact)**
- **classes** - Class definitions
- **academic_years** - School years
- **terms** - School terms/semesters
- **students** - Student records
- **enrollments** - Student class enrollments
- **people** - Personal information
- **servers/schools** - Multi-tenancy

### 1.3 Current API Routes

#### Existing Attendance API Endpoints
```
✓ GET  /api/attendance
       - Fetches attendance records for a date
       - Params: date, class_id, status
       - Returns: Student list with attendance status

✓ POST /api/attendance
       - Creates/updates attendance record
       - Body: student_id, date, status, method, notes, marked_by

✓ POST /api/attendance/mark
       - Marks attendance with actions (sign_in, sign_out, mark_absent)
       - Body: student_id, class_id, date, action, method, time

✓ GET  /api/attendance/students
       - Lists students in a class
       - Params: class_id, date
       - Returns: Students with attendance status + photo

✓ POST /api/attendance/bulk-mark
       - Bulk attendance marking
       - Body: attendance_records (array)

✓ GET  /api/attendance/stats
       - Attendance statistics for a date
       - Params: date, class_id
       - Returns: present, absent, late, excused, not_marked counts

✓ GET  /api/attendance/list
       - Lists attendance for a class and date
       - Params: date, class_id, stream_id

✓ GET  /api/attendance/export
       - Exports attendance as CSV/Excel
       - Params: class_id, date

✓ POST /api/attendance/biometric
       - Processes biometric attendance
       - Body: student_id, fingerprint_data

✓ GET  /api/analytics/attendance
       - Advanced attendance analytics
       - Returns: trends, chronic absentees, correlations

✓ POST /api/fingerprint
       - Registers fingerprint
       - Body: student_id, method, credential

✓ GET/POST/PATCH/DELETE /api/staff/attendance
       - Full CRUD for staff attendance
```

**Status**: Good API foundation exists, but LACKS:
- ❌ Attendance session management API
- ❌ Biometric device sync API
- ❌ Fingerprint verification API
- ❌ Attendance lock/finalization API
- ❌ Reconciliation API for hybrid attendance
- ❌ Device SLA and sync monitoring

### 1.4 Frontend Components

#### Existing Components
- **AttendanceSystem.tsx** - Main attendance UI (calendar picker, student list, status marking)
- **BiometricModal.tsx** - Biometric capture modal
- **AttendanceCard.tsx** - Individual student card
- **AttendanceStats.tsx** - Statistics display

**Status**: ✓ Basic UI exists, requires enhancement for:
- Fingerprint registration UI
- Device management
- Session management
- Attendance locking
- Hybrid reconciliation view

### 1.5 User Roles & Permissions

Based on codebase analysis:
- **Admin** - Full system access
- **Teacher/Staff** - Can mark attendance for their classes
- **HeadTeacher/Principal** - View-only access, can override
- **Students/Parents** - View-only attendance history

**Current Gap**: ❌ No explicit role-based access control for attendance operations

### 1.6 Class & Section Structure

- **Classes** - Class/Grade definitions (e.g., Primary 1, Primary 2, etc.)
- **Streams** - Sections within a class (e.g., Stream A, Stream B)
- **Enrollments** - Links students to class+stream+academic_year+term

**Status**: ✓ PROPERLY IMPLEMENTED - All necessary relationships exist

### 1.7 Existing Gaps & Issues

#### Critical Missing Components
1. **Attendance Sessions Table** - No session-level grouping
2. **Biometric Device Management** - No device table/sync tracking
3. **Fingerprint Backup Support** - Only single fingerprint per student
4. **Device Sync Logs** - No logging of biometric sync operations
5. **Attendance Finalization** - No locking mechanism post-submission
6. **Reconciliation Records** - No tracking of hybrid attendance conflicts
7. **Attendance History/Audit** - Limited to basic audit_log

#### Data Quality Issues
- **Orphaned Fingerprints** - No active/inactive status field
- **Method Tracking** - Not consistently recorded across attendance records
- **Device Association** - No link between fingerprint and biometric machine
- **Duplicate Tables** - student_fingerprints and fingerprints conflict

#### Permission/Security Issues
- **No Role-Based Access Control** for attendance operations
- **No Admin Override Trail** for attendance changes
- **Limited Audit Trail** for compliance

---

## PHASE 2 - REQUIRED FUNCTIONALITY & IMPLEMENTATION PLAN

### 2.1 Database Schema Enhancements

#### NEW TABLE: `attendance_sessions`
Purpose: Track class-level attendance sessions/periods

```sql
CREATE TABLE attendance_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  stream_id BIGINT,
  term_id BIGINT,
  academic_year_id BIGINT,
  subject_id BIGINT,  -- Optional: for subject-specific attendance
  teacher_id BIGINT,  -- User who initiated session
  session_date DATE NOT NULL,
  session_start_time TIME,
  session_end_time TIME,
  session_type ENUM('morning_check', 'lesson', 'assembly', 'afternoon_check', 'custom') DEFAULT 'lesson',
  attendance_type ENUM('manual', 'biometric', 'hybrid') DEFAULT 'manual',
  status ENUM('draft', 'open', 'submitted', 'locked', 'finalized') DEFAULT 'draft',
  notes TEXT,
  submitted_at TIMESTAMP NULL,
  submitted_by BIGINT,
  finalized_at TIMESTAMP NULL,
  finalized_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  INDEX idx_class_date (class_id, session_date),
  INDEX idx_status (status),
  INDEX idx_academic_year (academic_year_id),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (stream_id) REFERENCES streams(id),
  FOREIGN KEY (term_id) REFERENCES terms(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### ENHANCED: `student_attendance` Table
Add missing columns:

```sql
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS attendance_session_id BIGINT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS term_id BIGINT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS academic_year_id BIGINT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS stream_id BIGINT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS subject_id BIGINT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS teacher_id BIGINT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS device_id BIGINT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS biometric_timestamp TIMESTAMP NULL;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(5,2);
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS is_locked TINYINT(1) DEFAULT 0;
ALTER TABLE student_attendance ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP NULL;
ALTER TABLE student_attendance ADD UNIQUE INDEX idx_session_student (attendance_session_id, student_id);
ALTER TABLE student_attendance ADD FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions(id) ON DELETE SET NULL;
```

#### NEW TABLE: `biometric_devices`
Purpose: Track fingerprint machines and sync status

```sql
CREATE TABLE biometric_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  device_name VARCHAR(100) NOT NULL,
  device_code VARCHAR(50) UNIQUE,
  device_type VARCHAR(50) DEFAULT 'fingerprint',  -- fingerprint, face, iris, etc.
  manufacturer VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100) UNIQUE,
  location VARCHAR(255),  -- Where the device is installed
  ip_address VARCHAR(45),
  mac_address VARCHAR(17),
  fingerprint_capacity INT DEFAULT 3000,
  enrollment_count INT DEFAULT 0,
  status ENUM('active', 'inactive', 'maintenance', 'offline') DEFAULT 'active',
  last_sync_at TIMESTAMP NULL,
  sync_status ENUM('synced', 'pending', 'failed') DEFAULT 'pending',
  sync_error_message TEXT,
  last_sync_record_count INT DEFAULT 0,
  battery_level INT,  -- For wireless devices
  storage_used_percent DECIMAL(5,2),
  is_master TINYINT(1) DEFAULT 0,  -- Central hub device
  api_key VARCHAR(255),  -- For API integration
  api_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  INDEX idx_school (school_id),
  INDEX idx_status (status),
  INDEX idx_sync_status (sync_status),
  FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### ENHANCED: `student_fingerprints` Table (Replace old)
Purpose: Store biometric credentials with multiple fingerprints support

```sql
-- Drop old duplicate table
DROP TABLE IF EXISTS student_fingerprints;

-- Create new comprehensive fingerprint table
CREATE TABLE student_fingerprints (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  device_id BIGINT,  -- Device where fingerprint was captured
  finger_position ENUM('thumb', 'index', 'middle', 'ring', 'pinky', 'unknown') DEFAULT 'unknown',
  hand ENUM('left', 'right') DEFAULT 'right',
  template_data LONGBLOB,  -- Binary fingerprint template
  template_format VARCHAR(50),  -- ISO/IEC 19794-2, etc.
  biometric_uuid VARCHAR(100),
  quality_score INT DEFAULT 0,  -- 0-100
  enrollment_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) DEFAULT 1,
  status ENUM('active', 'inactive', 'revoked') DEFAULT 'active',
  last_matched_at TIMESTAMP NULL,
  match_count INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY (student_id, device_id, finger_position),  -- Allow multiple fingerprints per student
  INDEX idx_student (student_id),
  INDEX idx_device (device_id),
  INDEX idx_status (status),
  INDEX idx_biometric_uuid (biometric_uuid),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### NEW TABLE: `device_sync_logs`
Purpose: Track all biometric device sync operations

```sql
CREATE TABLE device_sync_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  sync_type ENUM('attendance_download', 'fingerprint_upload', 'logs_fetch', 'device_sync') DEFAULT 'attendance_download',
  sync_direction ENUM('pull', 'push', 'bidirectional') DEFAULT 'pull',
  status ENUM('pending', 'in_progress', 'success', 'partial_success', 'failed') DEFAULT 'pending',
  records_processed INT DEFAULT 0,
  records_synced INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  error_message TEXT,
  details_json JSON,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  duration_seconds INT,
  initiated_by BIGINT,  -- User who triggered sync
  
  INDEX idx_device (device_id),
  INDEX idx_started_at (started_at),
  INDEX idx_status (status),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (device_id) REFERENCES biometric_devices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### NEW TABLE: `attendance_reconciliation`
Purpose: Track hybrid attendance conflicts and resolutions

```sql
CREATE TABLE attendance_reconciliation (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  attendance_session_id BIGINT,
  student_id BIGINT NOT NULL,
  manual_status ENUM('present', 'absent', 'late', 'excused') NULL,
  manual_marked_by BIGINT,
  manual_marked_at TIMESTAMP NULL,
  biometric_status ENUM('present', 'absent', 'late') NULL,  -- Derived from fingerprint
  biometric_marked_at TIMESTAMP NULL,
  reconciliation_status ENUM('matched', 'conflict', 'biometric_only', 'manual_only') DEFAULT 'matched',
  conflict_resolution ENUM('trust_biometric', 'trust_manual', 'manual_correction') DEFAULT 'trust_biometric',
  resolved_at TIMESTAMP NULL,
  resolved_by BIGINT,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_session_student (attendance_session_id, student_id),
  INDEX idx_reconciliation_status (reconciliation_status),
  FOREIGN KEY (school_id) REFERENCES schools(id),
  FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions(id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (manual_marked_by) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### NEW TABLE: `attendance_reports`
Purpose: Generate and cache attendance reports

```sql
CREATE TABLE attendance_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  report_type ENUM('daily_summary', 'weekly_trend', 'monthly_summary', 'class_analysis', 'student_profile', 'period_comparison') DEFAULT 'daily_summary',
  date_from DATE,
  date_to DATE,
  class_id BIGINT,
  stream_id BIGINT,
  academic_year_id BIGINT,
  report_data JSON,  -- Cached report data
  generated_by BIGINT,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,  -- Cache expiry
  
  INDEX idx_school (school_id),
  INDEX idx_generated_at (generated_at),
  FOREIGN KEY (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 2.2 API Route Implementations

#### New Routes to Create:

**1. Attendance Sessions Management**
- `POST /api/attendance/sessions` - Create attendance session
- `GET /api/attendance/sessions` - List sessions
- `PATCH /api/attendance/sessions/:id` - Update session
- `POST /api/attendance/sessions/:id/submit` - Submit session
- `POST /api/attendance/sessions/:id/lock` - Lock attendance
- `POST /api/attendance/sessions/:id/finalize` - Finalize attendance

**2. Biometric Device Management**
- `GET /api/biometric-devices` - List configured devices
- `POST /api/biometric-devices` - Register new device
- `PATCH /api/biometric-devices/:id` - Update device info
- `POST /api/biometric-devices/:id/sync` - Trigger device sync
- `GET /api/biometric-devices/:id/sync-logs` - View sync history
- `DELETE /api/biometric-devices/:id` - Remove device

**3. Fingerprint Management**
- `POST /api/fingerprints/register` - Register fingerprint (USB scanner)
- `POST /api/fingerprints/link` - Link existing fingerprint ID
- `GET /api/fingerprints/:student_id` - Get student's fingerprints
- `PATCH /api/fingerprints/:id` - Update fingerprint status
- `DELETE /api/fingerprints/:id` - Remove fingerprint
- `POST /api/fingerprints/verify` - Verify fingerprint match

**4. Biometric Attendance Processing**
- `POST /api/attendance/biometric/sync` - Sync attendance from device
- `POST /api/attendance/biometric/process` - Process captured logs
- `GET /api/attendance/biometric/sync-status` - Check sync status
- `POST /api/attendance/reconcile` - Reconcile manual vs biometric

**5. Attendance Analytics & Reports**
- `GET /api/attendance/reports/daily` - Daily attendance summary
- `GET /api/attendance/reports/trends` - Attendance trends
- `GET /api/attendance/reports/analysis` - Deep analysis
- `GET /api/attendance/reports/export` - Generate downloadable report

---

## PHASE 3 - IMPLEMENTATION ROADMAP

### Task Breakdown (in order of priority):

1. **Database Migrations** (1-2 hours)
   - Create all new tables
   - Enhance existing tables
   - Add indexes and foreign keys
   - Test data integrity

2. **API Development** (4-6 hours)
   - Attendance session endpoints
   - Biometric device management
   - Fingerprint registration & linking
   - Reconciliation logic

3. **Frontend Components** (3-4 hours)
   - Fingerprint registration modal
   - Device management interface
   - Session management view
   - Hybrid attendance reconciliation display

4. **Testing & Documentation** (2 hours)
   - API testing with Postman/curl
   - Frontend E2E testing
   - Documentation updates

---

## NEXT STEPS

Proceed to Phase 3 - Full implementation with all code files, migrations, and components.

---

**Report Prepared By**: System Analysis Agent  
**Date**: February 8, 2026  
**Status**: Ready for Implementation
