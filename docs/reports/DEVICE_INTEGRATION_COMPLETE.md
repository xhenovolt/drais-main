# Device Integration Architecture - Implementation Complete

**Date**: March 8, 2026  
**Status**: ✅ Phase 1 Complete (Core Architecture)  
**Repository**: `https://github.com/xhenovolt/drais-main.git`

---

## Overview

DRAIS now supports multi-vendor attendance device integration with a clean abstraction layer:

```
Device → Device Adapter → Attendance Engine → Database
```

This architecture ensures:
- **Multi-tenant isolation**: All queries include `school_id`
- **Duplicate prevention**: 60-second detection window
- **Vendor abstraction**: Easy to add new device types
- **Development flexibility**: Simulator for testing without hardware

---

## Supported Devices

### 1. Dahua Access Control (HTTP Polling)
- **Method**: HTTP GET polling every 30 seconds
- **Endpoint**: `/cgi-bin/attendanceRecord.cgi?action=getRecords`
- **Response Format**: Plain text (key-value pairs)
- **Use Case**: Ibun Baz school deployment

### 2. ZKTeco K40 (Webhook Push)
- **Method**: Real-time webhook POST on fingerprint scan
- **Endpoint**: `/api/device/zkteco/webhook`
- **Payload**: JSON with user_id, timestamp, method
- **Use Case**: Hillside school deployment

---

## Database Schema

### Tables Created

#### `devices`
Stores device configuration for all device types.

```sql
CREATE TABLE devices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  device_name VARCHAR(100) NOT NULL,
  device_type ENUM('dahua', 'zkteco') NOT NULL,
  device_ip VARCHAR(45),              -- For Dahua (polling)
  device_port INT,
  device_identifier VARCHAR(100),     -- For ZKTeco (webhook)
  device_username VARCHAR(100),
  device_password VARCHAR(255),
  webhook_secret VARCHAR(255),        -- For ZKTeco
  poll_interval INT DEFAULT 30,       -- Seconds
  status ENUM('active', 'inactive', 'error') DEFAULT 'active',
  last_poll_at DATETIME,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_type (school_id, device_type),
  INDEX idx_identifier (device_identifier)
);
```

#### `device_users`
Maps device numeric IDs to DRAIS student IDs (critical for attendance).

```sql
CREATE TABLE device_users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  device_id INT NOT NULL,
  device_user_id VARCHAR(50) NOT NULL,  -- Device's numeric ID for user
  student_id INT NOT NULL,              -- DRAIS student ID
  enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_device (school_id, device_id),
  INDEX idx_student (student_id),
  UNIQUE KEY unique_device_user (device_id, device_user_id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
```

#### `device_sync_log`
Tracks all polling/webhook events for debugging.

```sql
CREATE TABLE device_sync_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  device_id INT NOT NULL,
  school_id INT NOT NULL,
  sync_started_at DATETIME NOT NULL,
  sync_completed_at DATETIME,
  records_fetched INT DEFAULT 0,
  records_processed INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  status ENUM('success', 'failed', 'running') DEFAULT 'running',
  error_message TEXT,
  INDEX idx_device_time (device_id, sync_started_at),
  INDEX idx_school (school_id),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
```

#### Attendance Table (Modified)
Added device tracking columns:

```sql
ALTER TABLE attendance ADD COLUMN device_id INT;
ALTER TABLE attendance ADD COLUMN device_type VARCHAR(50);
ALTER TABLE attendance ADD COLUMN method VARCHAR(50);
ALTER TABLE attendance ADD COLUMN scan_type VARCHAR(50);
ALTER TABLE attendance ADD INDEX idx_device (device_id);
```

---

## Implementation

### Core Services

#### 1. Attendance Engine (`src/services/attendance/attendanceEngine.ts`)

Central processor for ALL attendance records (regardless of device type).

**Functions:**

```typescript
processAttendance(record: AttendanceRecord): Promise<ProcessResult>
```
- Validates student exists in school
- Checks for duplicates (60-second window)
- Inserts attendance record with device info

```typescript
processAttendanceBatch(records: AttendanceRecord[]): Promise<BatchResult>
```
- Processes multiple records
- Returns stats: total, processed, duplicates, failed

```typescript
mapDeviceUserToStudent(deviceId, deviceUserId, schoolId): Promise<number | null>
```
- Maps device numeric ID → DRAIS student_id
- Enforces school isolation

**AttendanceRecord Interface:**

```typescript
interface AttendanceRecord {
  schoolId: number;
  studentId: number;
  deviceId: number;
  deviceType: string;
  method: string;        // 'card', 'fingerprint', 'face', etc.
  scanType: string;      // 'entry' or 'exit'
  timestamp: Date;
}
```

---

#### 2. Dahua Polling Service (`src/services/devices/dahua/dahuaPoller.ts`)

Polls Dahua devices via HTTP and processes attendance records.

**Functions:**

```typescript
pollDahuaDevice(device: DahuaDevice): Promise<void>
```
- Fetches records from device endpoint
- Parses plain text response
- Maps device users → students
- Calls `attendanceEngine.processAttendanceBatch()`
- Logs to `device_sync_log`

```typescript
pollAllDahuaDevices(schoolId?: number): Promise<void>
```
- Polls all active Dahua devices
- Can filter by school

```typescript
startDahuaPollingLoop(intervalSeconds: number): Promise<void>
```
- Continuous polling loop for production deployment
- Default: 30 seconds

**Dahua Response Format:**

```
found=3
records[0].RecNo=1
records[0].UserID=101
records[0].CreateTime=1771782789
records[0].Method=21
records[0].Type=Entry
records[1].RecNo=2
...
```

---

### API Endpoints

#### Device Simulator (`/api/device-simulator/dahua/attendance`)

**GET**  
Simulates a real Dahua device for development.

**Query Parameters:**
- `action`: Must be `getRecords` (matches real device)
- `count`: Number of records to generate (default: 5)

**Response:**
```
found=5
records[0].RecNo=1
records[0].UserID=101
records[0].CreateTime=1771782799
records[0].Method=21
records[0].Type=Entry
...
```

**Usage:**
```bash
curl "http://localhost:3000/api/device-simulator/dahua/attendance?action=getRecords&count=10"
```

---

#### ZKTeco Webhook (`/api/device/zkteco/webhook`)

**POST**  
Receives real-time attendance events from ZKTeco K40 devices.

**Request Body:**
```json
{
  "device_id": "ZKTECO-K40-001",
  "user_id": "105",
  "timestamp": 1771783000,
  "method": "fingerprint",
  "scan_type": "entry",
  "webhook_secret": "your-secret-key"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Attendance processed successfully",
  "is_duplicate": false,
  "attendance_id": 42
}
```

**Configuration:**
On ZKTeco device, configure webhook URL:
```
http://your-domain.com/api/device/zkteco/webhook
```

---

#### Device User Mapping (`/api/devices/[id]/users`)

**GET** - List all user mappings for a device  
**POST** - Create new mapping  
**DELETE** - Remove mapping  

**POST Example:**
```bash
curl -X POST http://localhost:3000/api/devices/1/users \
  -H "Content-Type: application/json" \
  -d '{
    "device_user_id": "105",
    "student_id": 42
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "User mapping created successfully",
  "mapping": {
    "id": 10,
    "device_user_id": "105",
    "student_id": 42,
    "student_name": "Ahmad Ibrahim"
  }
}
```

---

#### Device Sync Management (`/api/devices/[id]/sync`)

**GET** - View sync history and stats  
**POST** - Manually trigger sync (Dahua only)

**POST Example (Manual Sync):**
```bash
curl -X POST http://localhost:3000/api/devices/1/sync
```

**Response:**
```json
{
  "success": true,
  "message": "Dahua device sync triggered. Check sync history for results.",
  "device_name": "Ibun Baz Main Gate",
  "device_type": "dahua"
}
```

**GET Example (Sync History):**
```bash
curl http://localhost:3000/api/devices/1/sync?limit=20
```

**Response:**
```json
{
  "device": {
    "id": 1,
    "name": "Ibun Baz Main Gate",
    "type": "dahua"
  },
  "stats": {
    "total_syncs": 150,
    "total_fetched": 450,
    "total_processed": 420,
    "total_failed": 30,
    "avg_duration_seconds": 2.5
  },
  "sync_history": [
    {
      "id": 150,
      "sync_started_at": "2026-03-08 14:30:00",
      "sync_completed_at": "2026-03-08 14:30:03",
      "records_fetched": 5,
      "records_processed": 5,
      "records_failed": 0,
      "status": "success",
      "error_message": null
    }
  ]
}
```

---

## Testing Workflow

### 1. Apply Database Schema

```bash
mysql -u root -p ibunbaz_drais < database/device_integration_schema.sql
```

### 2. Start Development Server

```bash
npm run dev
```

### 3. Test Dahua Simulator

```bash
# Test simulator endpoint
curl "http://localhost:3000/api/device-simulator/dahua/attendance?action=getRecords&count=5"

# Expected output:
# found=5
# records[0].RecNo=1
# records[0].UserID=101
# ...
```

### 4. Register Test Device

```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -H "Cookie: drais_session=YOUR_SESSION_COOKIE" \
  -d '{
    "device_name": "Test Dahua Simulator",
    "device_type": "dahua",
    "device_ip": "localhost:3000/api/device-simulator/dahua/attendance",
    "device_port": 80,
    "poll_interval": 60
  }'
```

### 5. Create Device User Mappings

```bash
# Map device user 101 → student ID 1
curl -X POST http://localhost:3000/api/devices/1/users \
  -H "Content-Type: application/json" \
  -H "Cookie: drais_session=YOUR_SESSION_COOKIE" \
  -d '{
    "device_user_id": "101",
    "student_id": 1
  }'

# Map device user 102 → student ID 2
curl -X POST http://localhost:3000/api/devices/1/users \
  -H "Content-Type: application/json" \
  -H "Cookie: drais_session=YOUR_SESSION_COOKIE" \
  -d '{
    "device_user_id": "102",
    "student_id": 2
  }'
```

### 6. Trigger Manual Sync

```bash
curl -X POST http://localhost:3000/api/devices/1/sync \
  -H "Cookie: drais_session=YOUR_SESSION_COOKIE"
```

### 7. Verify Attendance Records

```bash
# Check attendance table
mysql -u root -p ibunbaz_drais -e "
  SELECT a.id, a.student_id, s.first_name, s.last_name, 
         a.date, a.time_in, a.device_type, a.method, a.scan_type
  FROM attendance a
  JOIN students s ON a.student_id = s.id
  WHERE a.device_id = 1
  ORDER BY a.created_at DESC
  LIMIT 10;
"
```

### 8. View Sync Logs

```bash
curl "http://localhost:3000/api/devices/1/sync?limit=10" \
  -H "Cookie: drais_session=YOUR_SESSION_COOKIE"
```

### 9. Test ZKTeco Webhook (with curl)

```bash
curl -X POST http://localhost:3000/api/device/zkteco/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "ZKTECO-K40-001",
    "user_id": "105",
    "timestamp": 1771783000,
    "method": "fingerprint",
    "scan_type": "entry",
    "webhook_secret": "test-secret-key"
  }'
```

---

## Production Deployment

### Dahua Device Setup

**1. Network Configuration**
- Ensure device is on same network or configure router port forwarding
- Device must be accessible via HTTP from DRAIS server

**2. Device Registration**
```bash
curl -X POST https://drais.xhenvolt.com/api/devices \
  -H "Content-Type: application/json" \
  -H "Cookie: drais_session=YOUR_SESSION_COOKIE" \
  -d '{
    "device_name": "Ibun Baz Main Gate",
    "device_type": "dahua",
    "device_ip": "192.168.1.50",
    "device_port": 80,
    "device_username": "admin",
    "device_password": "device-password",
    "poll_interval": 30
  }'
```

**3. Enroll Students**
- Use device management UI to enroll students
- Each student gets a numeric ID on the device
- Create mapping: device_user_id → student_id

**4. Start Polling Service**
```typescript
// In production deployment (e.g., workers/devicePoller.ts)
import { startDahuaPollingLoop } from '@/services/devices/dahua/dahuaPoller';

startDahuaPollingLoop(30); // Poll every 30 seconds
```

---

### ZKTeco Device Setup

**1. Network Configuration**
- Device must have internet access
- Configure webhook URL in device settings

**2. Device Registration**
```bash
curl -X POST https://drais.xhenvolt.com/api/devices \
  -H "Content-Type: application/json" \
  -H "Cookie: drais_session=YOUR_SESSION_COOKIE" \
  -d '{
    "device_name": "Hillside K40 Fingerprint",
    "device_type": "zkteco",
    "device_identifier": "ZKTECO-K40-001",
    "webhook_secret": "generate-random-secret-here"
  }'
```

**3. Configure Webhook on Device**
- URL: `https://drais.xhenvolt.com/api/device/zkteco/webhook`
- Method: POST
- Secret: (same as device registration)

**4. Enroll Students**
- Enroll fingerprints on device (each gets numeric ID)
- Create mappings in DRAIS: device_user_id → student_id

---

## Multi-Tenant Isolation

All queries enforce school isolation:

```typescript
// ✅ CORRECT: Includes school_id
const [students] = await connection.execute(
  'SELECT * FROM students WHERE id = ? AND school_id = ?',
  [studentId, schoolId]
);

// ❌ WRONG: Missing school_id (security violation!)
const [students] = await connection.execute(
  'SELECT * FROM students WHERE id = ?',
  [studentId]
);
```

---

## Duplicate Prevention

Attendance engine ignores scans within 60 seconds:

```sql
SELECT id FROM attendance 
WHERE student_id = ? 
  AND school_id = ?
  AND device_id = ?
  AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) < 60
```

---

## Future Enhancements

### Phase 2: Device Management UI
- [ ] Device list page (`/app/settings/devices/page.tsx`)
- [ ] Add device form
- [ ] Device status indicators
- [ ] Test connection button
- [ ] User enrollment UI (`/app/settings/devices/[id]/users/page.tsx`)
- [ ] Bulk enrollment import (CSV)

### Phase 3: Additional Device Types
- [ ] Hikvision Access Control
- [ ] Anviz biometric devices
- [ ] Generic HTTP webhook adapter

### Phase 4: Advanced Features
- [ ] Device health monitoring
- [ ] Automatic failover (multiple devices per location)
- [ ] Offline mode (local caching)
- [ ] Real-time dashboard (attendance counts)

---

## Troubleshooting

### Device Not Syncing

**Check device status:**
```bash
curl "http://localhost:3000/api/devices/1/sync?limit=5" \
  -H "Cookie: drais_session=YOUR_SESSION"
```

**Common issues:**
- Device IP unreachable (check network connectivity)
- Incorrect credentials (verify username/password)
- Polling service not running
- Device user not mapped to student

---

### User Scans Not Appearing

**Check user mapping:**
```bash
curl "http://localhost:3000/api/devices/1/users" \
  -H "Cookie: drais_session=YOUR_SESSION"
```

**Verify:**
- Device user ID matches what device reports
- Student ID is valid and belongs to correct school
- Device is active (status = 'active')

---

### Duplicate Scans

**Expected behavior:**
- Scans within 60 seconds are ignored
- Check `device_sync_log` for duplicate count

**To adjust duplicate window:**
Edit `attendanceEngine.ts`:
```typescript
// Change 60 to desired seconds
AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) < 60
```

---

## Files Created

### Database Schema
- `database/device_integration_schema.sql` (160 lines)

### Services
- `src/services/attendance/attendanceEngine.ts` (177 lines)
- `src/services/devices/dahua/dahuaPoller.ts` (400+ lines)

### API Routes
- `src/app/api/device-simulator/dahua/attendance/route.ts` (100+ lines)
- `src/app/api/device/zkteco/webhook/route.ts` (260+ lines)
- `src/app/api/devices/[id]/users/route.ts` (270+ lines)
- `src/app/api/devices/[id]/sync/route.ts` (215+ lines)

---

## Summary

✅ **Core architecture complete**:
- Attendance engine with validation and duplicate prevention
- Dahua HTTP polling service
- ZKTeco webhook receiver
- Device user mapping API
- Device sync management API
- Dahua device simulator for development

🔄 **Next steps**:
- Build device management UI
- Test with real hardware at Ibun Baz and Hillside schools
- Create device enrollment workflows

📊 **Total lines of code**: ~1,600+ lines across 6 new files

---

**End of Implementation Document**
