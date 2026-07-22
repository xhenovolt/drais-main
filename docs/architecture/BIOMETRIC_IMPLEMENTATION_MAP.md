# DRAIS Biometric System - Comprehensive Implementation Map

## Executive Summary

The DRAIS system has a comprehensive biometric infrastructure supporting both **student** and **staff** biometric enrollment. The system uses:
- **ZKTeco devices** (K40 Pro) for fingerprint enrollment via TCP (local-enroll) and cloud-based polling (relay-enroll)
- **Dahua devices** for attendance capture (fingerprint, card, face recognition)
- **WebAuthn/FIDO2** for browser-based biometric verification
- **USB scanner support** for offline fingerprint registration
- **Device sync mechanisms** with multiple enrollment strategies

---

## 1. DATABASE SCHEMA - BIOMETRIC DATA

### Core Biometric Tables

#### A. `student_fingerprints` (Fingerprint storage)
**Location**: MERGE_IBUNBAZ_SCHEMA.sql (line 583+)

**Schema**:
```sql
- id: bigint (PK)
- school_id: bigint (FK → schools)
- student_id: bigint (FK → students)  [REQUIRED]
- device_id: bigint (FK → biometric_devices)
- finger_position: enum('thumb','index','middle','ring','pinky','unknown')
- hand: enum('left','right')
- template_data: longblob (binary fingerprint template)
- template_format: varchar(50) (e.g., 'ISO/IEC 19794-2')
- biometric_uuid: varchar(100) (device-specific ID)
- quality_score: int (0-100)
- enrollment_timestamp: timestamp
- is_active: tinyint(1)
- status: enum('active','inactive','revoked')
- last_matched_at: timestamp (last verification)
- match_count: int (times successfully matched)
- notes: text
- created_at / updated_at: timestamp
```

**Status**: ✅ Fully implemented for STUDENTS only

---

#### B. `fingerprints` (Legacy/General fingerprints table)
**Location**: MERGE_IBUNBAZ_SCHEMA.sql (line 556+)

**Schema**:
```sql
- id: bigint (PK)
- school_id: bigint
- student_id: bigint (NULL for staff)
- staff_id: bigint (NULL for students)  [SCHEMA SUPPORTS STAFF BUT NOT UI IMPLEMENTED]
- fingerprint_data: longblob
- finger_position: varchar(20)
- quality_score: int
- enrollment_date: timestamp
- is_verified: tinyint(1)
- verified_at: timestamp
```

**Status**: ⚠️ Schema supports both student and staff, but UI/API only implements student

---

#### C. `biometric_devices` (Device management)
**Location**: MERGE_IBUNBAZ_SCHEMA.sql (line 291+)

**Schema**:
```sql
- id: bigint (PK)
- school_id: bigint (FK)
- device_name: varchar(100)
- device_code: varchar(50) [UNIQUE]
- device_type: varchar(50) ('fingerprint', 'face', 'multimodal')
- manufacturer: varchar(100)
- model: varchar(100)
- serial_number: varchar(100) [UNIQUE]
- location: varchar(255)
- ip_address: varchar(45)
- mac_address: varchar(17)
- fingerprint_capacity: int (default: 3000)
- enrollment_count: int
- status: enum('active','inactive','maintenance','offline')
- last_sync_at: timestamp
- sync_status: enum('synced','pending','failed')
- sync_error_message: text
- last_sync_record_count: int
- battery_level: int
- storage_used_percent: decimal(5,2)
- is_master: tinyint(1) (primary device)
- api_key / api_secret: varchar(255)
- created_at / updated_at: timestamp
- deleted_at: timestamp (soft delete)
```

**Key Indexes**:
- idx_school, idx_status, idx_sync_status

---

#### D. `dahua_devices` (Dahua-specific config)
**Location**: MERGE_IBUNBAZ_SCHEMA.sql

**Schema**:
```sql
- id: bigint
- school_id: bigint
- device_name: varchar(100)
- device_code: varchar(50) [UNIQUE]
- ip_address: varchar(45)
- port: int (default: 80)
- api_url: varchar(255)
- username / password: encrypted credentials
- device_type: enum('attendance','access_control','hybrid')
- protocol: enum('http','https')
- status: enum('active','inactive','offline','error')
- last_sync / last_sync_status: timestamp / enum
- auto_sync_enabled: tinyint(1)
- sync_interval_minutes: int (default: 15)
- late_threshold_minutes: int (default: 30)
- created_at / updated_at: timestamp
```

**Status**: ✅ Fully implemented

---

#### E. `enrollment_sessions` (Enrollment pipeline tracking)
**Location**: biometric_enrollment_pipeline.sql

**Schema**:
```sql
- id: bigint (PK)
- school_id: int
- device_sn: varchar(64)
- initiated_by: int (users.id)
- student_id: int (NULL until assigned)
- staff_id: int (NULL - schema ready but not used)
- status: enum('ACTIVE','COMPLETED','FAILED','EXPIRED')
- created_at / expires_at: datetime (10-min expiry)
- completed_at: datetime
```

**State Machine**: INITIATED → CAPTURED → UNASSIGNED → ASSIGNED → VERIFIED

---

#### F. `biometric_enrollments` (Per-fingerprint slot tracking)
**Location**: biometric_enrollment_pipeline.sql

**Schema**:
```sql
- id: bigint
- school_id: int
- device_sn: varchar(64)
- device_slot: int (ZK uid: 1, 2, 3…)
- student_id: int (NULL until assigned)
- staff_id: int (NULL - reserved)
- status: enum('INITIATED','CAPTURED','UNASSIGNED','ASSIGNED','VERIFIED','ORPHANED')
- source: enum('local','relay','adms')
- session_id: bigint (FK)
- finger_index: tinyint (0-9)
- initiated_at / captured_at / assigned_at / updated_at: timestamps
```

**Key Index**: UNIQUE KEY (device_sn, device_slot)

---

#### G. `dahua_attendance_logs` (Attendance capture from Dahua)
**Location**: MERGE_IBUNBAZ_SCHEMA.sql

**Schema**:
```sql
- id: bigint
- device_id: bigint (FK → dahua_devices)
- student_id: bigint (FK → students) [can be NULL if not matched]
- card_no / user_id: varchar(100)
- event_time: datetime
- event_type: enum('Entry','Exit','Unknown')
- method: enum('fingerprint','card','face','password','unknown')
- status: enum('present','absent','late','processed')
- raw_log_id: bigint
- matched_at: timestamp
- created_at: timestamp
```

**Status**: ✅ Implemented

---

#### H. `device_user_mappings` (Unified device-user mapping table)
**Location**: Database/IbunNew.sql (line 62)

**Schema** (IMPORTANT - supports both student and staff):
```sql
- id: bigint
- school_id: bigint
- device_id: bigint (FK → biometric_devices)
- student_id: bigint (nullable, FK → students)
- staff_id: bigint (nullable, FK → staff)  [SCHEMA READY BUT NOT IMPLEMENTED IN UI]
- device_user_id: int (device's internal ID)
- status: enum('active','inactive','suspended')
- enrollment_status: enum('enrolled','pending','failed')
- verified: tinyint(1)
- mappings_sync_status: enum('pending','synced','failed')
- last_synced_at: timestamp
- created_at / updated_at: timestamp
- deleted_at: timestamp
```

**UNIQUE Constraints**:
- uk_school_device_user (school_id, device_user_id)
- uk_device_student (device_id, student_id)
- uk_device_staff (device_id, staff_id)  [RESERVED FOR FUTURE]

---

#### I. `device_users` (Simpler device mapping)
**Location**: MERGE_IBUNBAZ_SCHEMA.sql

**Schema**:
```sql
- id: bigint
- school_id: bigint
- device_user_id: int
- person_type: enum('student','teacher')  [supports both]
- person_id: bigint
- device_name: varchar(100)
- is_enrolled: tinyint(1)
- enrollment_date / unenrollment_date: timestamp
- biometric_quality: int
- created_at / updated_at: timestamp
```

**Status**: Supports both student/teacher but UI only uses for students

---

### Enrollment Pipeline Tables

#### `enrollment_sessions` + `biometric_enrollments`
- State machine tracking: INITIATED → CAPTURED → ASSIGNED → VERIFIED
- 10-minute session expiry
- Support for local (LAN TCP), relay (cloud), and ADMS paths
- Can be orphaned if device loses connection mid-scan

---

## 2. STUDENT BIOMETRIC IMPLEMENTATION

### 2.1 UI Pages

#### A. Student Fingerprint Registration Modal
**Location**: [src/components/attendance/FingerprintRegistrationModal.tsx](FingerprintRegistrationModal.tsx)

**Features**:
- Device selector dropdown (loads from /api/biometric-devices)
- Finger position selection (thumb, index, middle, ring, pinky)
- Hand selection (left/right)
- USB scanner integration for template capture
- Quality score display
- Biometric UUID input
- Submit to register

**Status**: ✅ Fully implemented

---

#### B. Student Details / Edit Page
**Location**: [src/app/app/students/list/page.tsx](page.tsx)

**Biometric Features**:
- Inline fingerprint status display
- Fingerprint icon indicating enrollment status (green=enrolled, gray=pending)
- "Register Fingerprint" button in action bar
- Cache: 10-minute fingerprint status cache
- Fingerprint enrollment trigger via modal

**Status**: ✅ Fully implemented

---

#### C. Biometric Modal (WebAuthn-based)
**Location**: [src/components/attendance/BiometricModal.tsx](BiometricModal.tsx)

**Features**:
- Step-based UI (choice → setup → verify)
- WebAuthn credential creation (platform authenticator)
- Credential registration to backend
- Verification & attendance marking
- Support for fingerprint, Face ID, Touch ID (platform-dependent)

**Flow**:
1. User chooses "Verify & Mark Present" or "Setup Biometric"
2. Browser prompts for biometric input
3. Credential sent to `/api/students/{id}/fingerprint`
4. Registration stored with `credential_id`
5. Verification via `/api/attendance/biometric`

**Status**: ✅ Fully implemented

---

#### D. Attendance Enrollment Station
**Location**: [src/app/attendance/enrollment/page.tsx](page.tsx)

**Biometric Features**:
- Device sync status display
- Fingerprints captured count (summary card)
- Pending enrollment display
- "Sync Identities" button → calls `/api/students/sync-identities`
- "Enroll Fingerprint" per student → calls `/api/students/enroll-fingerprint`
- Live progress tracking

**Status**: ✅ Fully implemented

---

### 2.2 API Routes (Student)

#### A. Fingerprint Management
**Route**: [src/app/api/fingerprints/route.ts](route.ts)

**Endpoints**:
```
POST /api/fingerprints?action=register-usb
  - Register via USB scanner
  - Body: { student_id, template_data, template_format, finger_position, hand, quality_score, biometric_uuid }
  - Returns: { success, fingerprint_id, message }

POST /api/fingerprints?action=link-existing
  - Link existing device fingerprint
  - Body: { student_id, device_id, biometric_uuid, finger_position, hand }
  - Returns: { success, fingerprint_id }

POST /api/fingerprints?action=verify
  - Verify fingerprint match
  - Body: { student_id, device_id, template_data, confidence_threshold }
  - Returns: { success, matched, fingerprint_id, confidence_score }

POST /api/fingerprints?action=remove
  - Revoke fingerprint
  - Body: { fingerprint_id }
  - Returns: { success }

GET /api/fingerprints?student_id=X&device_id=Y
  - List student fingerprints
  - Returns: { success, data: [...] }
```

**Database Operations**:
- INSERT INTO student_fingerprints
- UPDATE student_fingerprints (SET last_matched_at, match_count)
- SELECT FROM student_fingerprints WHERE status = 'active'

**Status**: ✅ Fully implemented

---

#### B. Student Enrollment
**Route**: [src/app/api/students/enroll-fingerprint/route.ts](route.ts)

**Key Features**:
- ZKTeco K40 Pro integration
- Device user ID auto-assignment (sequential PIN allocation)
- Name sanitizer (24 chars, ASCII only)
- Command queuing via `zk_device_commands` table

**Endpoints**:
```
GET /api/students/enroll-fingerprint?command_id=123
  - Check enrollment command status
  - Returns: { success, command: { status, error_message, fingerprint_captured } }

POST /api/students/enroll-fingerprint
  - Queue fingerprint enrollment
  - Body: { student_id, device_sn }
  - Returns: { success, command_id, message }
```

**Device Integration**:
- Resolves device via device_sn
- Looks up/creates zk_user_mapping (device user ID)
- Queues CMD_STARTENROLL on device
- Device captures fingerprint → zk-handler → student_fingerprints

**Note**: K40 Pro doesn't support remote ENROLL (returns -1002), fingerprint must be captured locally on device after identity sync.

**Status**: ✅ Fully implemented (ZKTeco pipeline only)

---

#### C. Student Fingerprint Verification (WebAuthn)
**Route**: [src/app/api/students/[id]/fingerprint/verify/route.ts](route.ts)

**Endpoints**:
```
GET /api/students/{id}/fingerprint/verify?method=biometric&challenge=xxx
  - Verify biometric authentication
  - Returns: { success, verified, student_name }

POST /api/students/{id}/fingerprint
  - Register biometric credential
  - Body: { credential, method: 'passkey' }
  - Returns: { success, credential_id }
```

**Database Operations**:
- SELECT FROM student_fingerprints WHERE status = 'active'
- UPDATE student_fingerprints (credential_id, is_active)

**Status**: ✅ Implemented for WebAuthn

---

#### D. Biometric Attendance
**Route**: [src/app/api/attendance/biometric/route.ts](route.ts)

**Endpoints**:
```
POST /api/attendance/biometric
  - Mark attendance via biometric
  - Body: { credential_id, authenticator_data, client_data_json, signature, date }
  - Returns: { success, message, attendance_id }
```

**Flow**:
1. Lookup student via credential_id in student_fingerprints
2. Verify signature with stored public_key
3. Create attendance record (method: 'biometric')
4. Link to active enrollment session

**Status**: ✅ Implemented

---

#### E. Device Sync & Enrollment
**Route**: [src/app/api/students/sync-identities/route.ts](route.ts)

**Endpoints**:
```
POST /api/students/sync-identities
  - Sync all students to device (create user records)
  - Body: { device_sn }
  - Returns: { success, synced_count, failed_count, details }
```

**Operations**:
- Fetch all students from enrollment
- Get/create zk_user_mapping for each student
- Send CMD_USERTEMP_RW (UPLOAD) to device
- Device confirms → creates user slot

**Status**: ✅ Implemented (ZKTeco K40)

---

### 2.3 Utilities

#### A. Fingerprint Capture (WebAuthn)
**File**: [src/utils/fingerprintCapture.ts](fingerprintCapture.ts)

**Class**: `FingerprintCapture`

**Methods**:
```typescript
async isSupported(): Promise<boolean>
  - Check if device supports WebAuthn

async captureWebAuthn(studentId, schoolName): Promise<FingerprintCaptureResult>
  - Trigger browser biometric prompt
  - Returns: { success, credentialId, rawId, ... }

async capture(studentId): Promise<FingerprintCaptureResult>
  - Main capture method (delegates to captureWebAuthn)
```

**Status**: ✅ Implemented

---

## 3. STAFF BIOMETRIC IMPLEMENTATION

### 3.1 Status: ⚠️ SCHEMA-READY BUT NOT UI IMPLEMENTED

### Database Schema Support
The system has full schema support for staff biometric enrollment:

1. **`fingerprints` table**: `staff_id` column (nullable)
2. **`device_user_mappings` table**: `staff_id` column with UNIQUE constraint
3. **`device_users` table**: `person_type` enum supports 'teacher'
4. **`daily_attendance` table**: `person_type` enum('student','teacher')

### Missing Implementation

#### UI Pages: ❌
- No staff fingerprint registration modal
- No staff biometric dashboard
- No staff enrollment management

#### API Routes: ❌
- `/api/staff/enroll-fingerprint` - NOT IMPLEMENTED
- `/api/staff/[id]/fingerprint` - NOT IMPLEMENTED
- `/api/staff/sync-identities` - NOT IMPLEMENTED

#### Components: ❌
- StaffBiometricModal - NOT IMPLEMENTED
- StaffFingerprintRegistration - NOT IMPLEMENTED

### Files Needing Staff Biometric Implementation

1. **Create new API routes**:
   - `src/app/api/staff/enroll-fingerprint/route.ts`
   - `src/app/api/staff/[id]/fingerprint/route.ts`
   - `src/app/api/staff/sync-identities/route.ts`

2. **Create UI components**:
   - `src/components/staff/StaffBiometricModal.tsx`
   - `src/components/staff/StaffFingerprintRegistration.tsx`

3. **Create UI pages**:
   - Staff enrollment station similar to students
   - Staff fingerprint management dashboard

---

## 4. DEVICE INTEGRATION POINTS

### 4.1 ZKTeco (Fingerprint capture)
**Vendor**: ZKTeco (K40 Pro)

**File**: [src/services/devices/zkteco/](directory)

**Integration Points**:
- Local TCP connection (LAN only, 192.168.x.x)
- Commands: CMD_STARTENROLL, CMD_CANCELCAPTURE, CMD_USERTEMP_RW
- Device capabilities: 3000 fingerprints, 10 fingers per user
- Two enrollment paths:
  1. **Local-enroll** (TCP direct): Immediate response
  2. **Relay-enroll** (cloud polling): Device polls for commands

**Device User ID**:
- NOT the student.id (can overflow)
- Sequential PIN (1, 2, 3…) stored in `zk_user_mapping`
- Device keyboard limited to ~1000 manageable PINs

**Fingerprint Capture Flow**:
1. Admin clicks "Enroll Fingerprint" for student
2. Backend creates enrollment_sessions + biometric_enrollments
3. If local: Connect TCP → CMD_STARTENROLL → Wait for response
4. If relay: Queue command → Device polls → Device sends OPERLOG
5. zk-handler receives template (FP PIN=X TMP=...) → Stores in student_fingerprints

---

### 4.2 Dahua (Attendance access control)
**Vendor**: Dahua Face Recognition / Access Control Devices

**File**: [src/services/devices/dahua/dahuaPoller.ts](dahuaPoller.ts)

**Integration Points**:
- HTTP polling: `http://<device-ip>/cgi-bin/attendanceRecord.cgi?action=getRecords`
- Supports: Fingerprint, Card, Face, Password verification
- Captures: event_time, user_id, event_type (Entry/Exit)

**Sync Strategy**:
- Automatic polling every 15 minutes (configurable)
- Fetches latest records → Parses plain-text response
- Maps user_id → student_id via device_user_mappings
- Creates attendance_logs + daily_attendance records

**Database Tables**:
- `dahua_devices` - Device config
- `dahua_attendance_logs` - Normalized logs
- `dahua_raw_logs` - Raw response storage
- `dahua_sync_history` - Polling history

**Methods Supported**:
- Fingerprint (method = 'fingerprint')
- Card (method = 'card')
- Face (method = 'face')
- Password (method = 'password')

**Status**: ✅ Fully implemented

---

### 4.3 WebAuthn / FIDO2 (Browser-based)
**Standard**: W3C WebAuthn Level 2

**Integration**:
- Browser handles biometric capture (Touch ID, Face ID, Windows Hello)
- Server generates challenge
- Client returns attestation or assertion
- Stored as credential_id + public_key

**Tables**:
- `student_fingerprints.credential_id`
- `student_fingerprints.is_active`

**Status**: ✅ Implemented

---

## 5. API ENDPOINTS - COMPREHENSIVE MAP

### 5.1 Biometric Sessions
```
POST /api/biometric/sessions
  - Create enrollment session
  - Body: { device_sn, student_id?, finger? }
  - Returns: { session_id, expires_at }

PATCH /api/biometric/sessions
  - Close session
  - Body: { session_id, status: 'COMPLETED'|'FAILED' }
  - Returns: { success }
```

---

### 5.2 Device Enrollment (Local TCP)
```
POST /api/device/local-enroll
  - Direct LAN enrollment (immediate response)
  - Body: { student_id, device_ip, device_port?, finger? }
  - Returns: { success, uid, student_name, message }
  - Hardware: ZKTeco K40 Pro
  - Security: LAN IPv4 validation
```

---

### 5.3 Device Enrollment (Relay / Cloud)
```
POST /api/device/relay-enroll
  - Cloud-based polling enrollment
  - Body: { student_id, device_sn }
  - Returns: { command_id, expires_at }
  - Hardware: Any ZKTeco with ADMS support
```

---

### 5.4 Attendance Sync (Dahua)
```
POST /api/attendance/biometric/sync
  - Sync attendance logs from Dahua device
  - Body: { device_id }
  - Returns: { success, processed_count, failed_count }
```

---

### 5.5 Attendance Marking (Biometric)
```
POST /api/attendance/biometric
  - Mark attendance via biometric verification
  - Body: { credential_id, authenticator_data, signature, date }
  - Returns: { success, attendance_id }

POST /api/attendance/mark
  - Traditional manual attendance (includes biometric)
  - Body: { student_id, date, status, method: 'biometric' }
  - Returns: { success, attendance_id }
```

---

### 5.6 Student Fingerprints
```
GET /api/fingerprints?student_id=X&device_id=Y
  - List student fingerprints
  - Returns: { data: [...] }

POST /api/fingerprints?action=register-usb
  - Register USB scanner capture
  - Body: { student_id, template_data, ... }

POST /api/fingerprints?action=verify
  - Verify fingerprint match (simulated in dev)
  - Body: { student_id, device_id, template_data, ... }

POST /api/fingerprints?action=remove
  - Revoke fingerprint
  - Body: { fingerprint_id }
```

---

### 5.7 Biometric Device Management
```
GET /api/biometric-devices
  - List all biometric devices for school
  - Returns: { data: [...] }

POST /api/biometric-devices
  - Create new device
  - Body: { device_name, device_type, ip_address, ... }

PUT /api/biometric-devices/{id}
  - Update device config
  - Body: { ... }

DELETE /api/biometric-devices/{id}
  - Delete device (soft delete)
```

---

## 6. DAHUA DEVICE SUPPORT

### Integration Points
**File**: [src/services/devices/dahua/dahuaPoller.ts](dahuaPoller.ts)

**Configuration Tables**:
- `dahua_devices` - Device credentials & settings
- `device_configs` - Generic device config (alternative path)

**Data Flow**:
1. HTTP GET `http://<ip>/cgi-bin/attendanceRecord.cgi?action=getRecords`
2. Parse plain-text response (format: key1=value1\nkey2=value2)
3. Map records to students via card_no or user_id
4. Create dahua_attendance_logs + daily_attendance

**Supported Methods**:
- Fingerprint recognition
- Card swipe
- Face recognition
- Password entry
- Unknown (unmapped user)

**Sync Intervals**: Every 15 minutes (configurable)

---

## 7. KEY FILES STRUCTURE

```
src/
├── app/api/
│   ├── biometric/
│   │   ├── sessions/route.ts          [Create/close enrollment sessions]
│   │   └── unassigned/route.ts        [List unassigned fingerprints]
│   ├── device/
│   │   ├── local-enroll/route.ts      [LAN TCP enrollment]
│   │   ├── relay-enroll/route.ts      [Cloud polling enrollment]
│   │   └── test-probe/route.ts        [Device connectivity test]
│   ├── attendance/
│   │   ├── biometric/route.ts         [Mark attendance via biometric]
│   │   ├── biometric/sync/route.ts    [Sync Dahua logs]
│   │   ├── dahua/route.ts             [Dahua API wrapper]
│   │   ├── zk-tcp/route.ts            [ZKTeco TCP integration]
│   │   └── zk/route.ts                [ZKTeco polling]
│   ├── fingerprints/route.ts          [Fingerprint CRUD]
│   ├── biometric-devices/route.ts     [Device management]
│   └── students/
│       ├── enroll-fingerprint/route.ts [Enroll student fingerprint]
│       ├── sync-identities/route.ts   [Sync to device]
│       └── [id]/fingerprint/          [Fingerprint verification]
├── components/
│   ├── attendance/
│   │   ├── BiometricModal.tsx         [WebAuthn setup/verify]
│   │   └── FingerprintRegistrationModal.tsx [USB scanner & device]
│   └── students/
│       └── StudentTable.tsx           [Fingerprint icons/actions]
├── services/
│   └── devices/
│       ├── dahua/
│       │   ├── dahuaPoller.ts         [HTTP polling]
│       │   └── dahuaAdapter.ts        [Response parsing]
│       └── zkteco/
│           ├── ZKAdapter.ts           [Protocol wrapper]
│           └── commands.ts            [CMD constants]
└── utils/
    ├── fingerprintCapture.ts          [WebAuthn client-side]
    └── biometricDevice.ts             [Device utilities]

database/
├── biometric_enrollment_pipeline.sql  [Enrollment state machine]
├── dahua_device_integration.sql       [Dahua device tables]
├── device_integration_schema.sql      [Generic device schema]
└── MERGE_IBUNBAZ_SCHEMA.sql           [Complete schema]
```

---

## 8. DIFFERENCES: STUDENT vs STAFF IMPLEMENTATION

| Aspect | Student | Staff | Status |
|--------|---------|-------|--------|
| Database Schema | ✅ Full support | ✅ Full support | Both ready |
| UI Pages | ✅ Fingerprint dashboard | ❌ Missing | Unbalanced |
| Registration Modal | ✅ FingerprintRegistrationModal | ❌ Missing | Unbalanced |
| Biometric Modal (WebAuthn) | ✅ BiometricModal | ❌ Missing | Unbalanced |
| API: Enroll | ✅ /api/students/enroll-fingerprint | ❌ /api/staff/enroll-fingerprint NOT FOUND | Unbalanced |
| API: Sync Identities | ✅ /api/students/sync-identities | ❌ /api/staff/sync-identities NOT FOUND | Unbalanced |
| API: Verification | ✅ /api/students/[id]/fingerprint/verify | ❌ /api/staff/[id]/fingerprint/verify NOT FOUND | Unbalanced |
| Device Mappings | ✅ Via device_user_mappings.student_id | ⚠️ schema.staff_id ready, no API | Ready for dev |
| Attendance Marking | ✅ /api/attendance/biometric | ⚠️ Dahua only captures student_id | Partial |
| ZKTeco Pipeline | ✅ Full local-enroll + relay | ❌ Staff identity sync not implemented | Missing |

---

## 9. UNIQUE IDENTIFIERS ACROSS SYSTEM

### Device User ID Allocation (ZKTeco)
- **NOT**: student.id (can overflow 16-bit uint)
- **IS**: Sequential PIN (1, 2, 3…) in `zk_user_mapping.device_user_id`
- **Mapping**: zk_user_mapping.student_id → device_user_id
- **Reason**: K40 Pro device slot is 16-bit, keyboard max ~1000

### Biometric UUID
- **WebAuthn**: credential.id (base64-encoded)
- **USB Scanner**: Generated hash (e.g., 'USB-{timestamp}')
- **Device**: Serial number + slot (e.g., 'ZK40-001-SLOT-5')

---

## 10. FILES THAT NEED STAFF BIOMETRIC SUPPORT

### Required New Files

1. **API Routes**:
   - `src/app/api/staff/enroll-fingerprint/route.ts` [Mirror of students/enroll-fingerprint]
   - `src/app/api/staff/[id]/fingerprint/route.ts` [Mirror of students/[id]/fingerprint]
   - `src/app/api/staff/sync-identities/route.ts` [Mirror of students/sync-identities]

2. **UI Components**:
   - `src/components/staff/StaffBiometricModal.tsx` [Mirror of BiometricModal]
   - `src/components/staff/StaffFingerprintRegistration.tsx` [Mirror of FingerprintRegistrationModal]

3. **UI Pages**:
   - `src/app/app/staff/biometric-setup/page.tsx` [Setup page]
   - `src/app/app/attendance/staff-enrollment/page.tsx` [Enrollment station]

4. **Database**:
   - Migration: Add staff_id FK constraints to `student_fingerprints` (currently only has student_id)
   - OR: Create separate `staff_fingerprints` table (cleaner approach)

---

## 11. INTEGRATION CHECKLIST

### For Complete Biometric System

- [x] Student fingerprint registration (USB + Device)
- [x] Student biometric verification (WebAuthn)
- [x] Student attendance marking (Biometric)
- [x] ZKTeco device support (K40 Pro)
- [x] Dahua device support
- [x] Device sync & enrollment
- [x] Enrollment pipeline state machine
- [ ] Staff fingerprint registration
- [ ] Staff biometric verification
- [ ] Staff attendance marking
- [ ] Staff device sync
- [ ] Multi-device load balancing
- [ ] Biometric matching algorithms (currently simulated)
- [ ] Liveness detection (WebAuthn platform handles)
- [ ] Audit logging of enrollment/verification

---

## 12. NOTES & CAVEATS

1. **ZKTeco K40 Pro Limitations**:
   - Remote enrollment not supported (returns -1002)
   - Fingerprint capture must happen locally on device
   - Sequential PIN limited to ~1000 users per device
   - Device polling for OPERLOG can lag 1-2 minutes

2. **Dahua Integration**:
   - Polling-based (not real-time webhooks)
   - 15-minute interval configurable
   - Card number mapping to student requires manual setup
   - Face recognition not yet integrated into UI

3. **WebAuthn (Browser)**:
   - Platform-dependent (Touch ID, Face ID, Windows Hello)
   - Not all devices support true biometric
   - Fallback to PIN on older systems

4. **Missing Staff Support**:
   - Database schema ready, but zero UI/API implementation
   - Can be rapidly implemented by mirroring student code
   - Estimated effort: 2-3 days for complete implementation

5. **Biometric Matching**:
   - Currently simulated (always returns 95% confidence)
   - Production requires: OpenFinger, NEC NeoFace, or similar library
   - Would integrate into `/api/fingerprints?action=verify`

6. **Enrollment Sessions**:
   - 10-minute expiry by default
   - Sessions expire if device disconnects
   - Orphaned fingerprints can be reassigned manually

---

## 13. QUICK START - TESTING ENDPOINTS

### Test Student Enrollment
```bash
# 1. Create session
curl -X POST http://localhost:3000/api/biometric/sessions \
  -H "Content-Type: application/json" \
  -d '{"device_sn":"ZK40-001","student_id":1}'

# 2. Sync identities to device
curl -X POST http://localhost:3000/api/students/sync-identities \
  -H "Content-Type: application/json" \
  -d '{"device_sn":"ZK40-001"}'

# 3. Enroll fingerprint
curl -X POST http://localhost:3000/api/students/enroll-fingerprint \
  -H "Content-Type: application/json" \
  -d '{"student_id":1,"device_sn":"ZK40-001"}'

# 4. Check status
curl -X GET "http://localhost:3000/api/students/enroll-fingerprint?command_id=123"

# 5. Verify fingerprint
curl -X POST http://localhost:3000/api/fingerprints?action=verify \
  -H "Content-Type: application/json" \
  -d '{"student_id":1,"template_data":"..."}'
```

---

**Document Last Updated**: April 17, 2026
**System**: DRAIS School Management System v2.x
**Scope**: Complete biometric enrollment and verification pipeline
