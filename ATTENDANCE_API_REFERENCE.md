# Attendance Management System - API Reference

## Base URL
```
/api/attendance
```

## Endpoints

### 1. Get Daily Attendance
**GET** `/api/attendance`

Get attendance records for a specific date and optional class.

**Query Parameters:**
- `date` (required): YYYY-MM-DD format
- `class_id` (optional): Filter by class ID
- `status` (optional): Filter by status (present, absent, late, excused, not_marked)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "student_id": 1,
      "first_name": "Ahmed",
      "last_name": "Ali",
      "attendance_status": "present",
      "class_name": "Class A",
      "admission_no": "2025-001",
      "time_in": "08:30:00",
      "time_out": null,
      "notes": null,
      "has_fingerprint": 1
    }
  ]
}
```

---

### 2. Mark Attendance
**POST** `/api/attendance`

Mark or update attendance for a student.

**Request Body:**
```json
{
  "student_id": 1,
  "date": "2025-02-20",
  "status": "present",
  "method": "manual",
  "time_in": "08:30:00",
  "time_out": null,
  "notes": "Present"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "data": {
    "id": 123,
    "student_id": 1,
    "status": "present"
  }
}
```

---

### 3. Get Attendance Statistics
**GET** `/api/attendance/stats`

Get summary statistics for attendance.

**Query Parameters:**
- `date` (optional): YYYY-MM-DD format (defaults to today)
- `class_id` (optional): Filter by class

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "present": 140,
    "absent": 5,
    "late": 3,
    "excused": 2,
    "not_marked": 0,
    "percentage": 93.33,
    "biometric_count": 120,
    "manual_count": 20
  }
}
```

---

### 4. Get Attendance Reports
**GET** `/api/attendance/reports`

Retrieve generated attendance reports.

**Query Parameters:**
- `type` (optional): daily_summary, class_wise, student_wise, monthly_overview, trend_analysis, perfect_attendance
- `date` (optional): Report date
- `class_id` (optional): Filter by class

**Response:**
```json
{
  "success": true,
  "data": {
    "report_type": "daily_summary",
    "generated_date": "2025-02-20",
    "summary": {},
    "details": []
  }
}
```

**POST** `/api/attendance/reports`

Generate a new attendance report.

**Request Body:**
```json
{
  "type": "daily_summary",
  "date": "2025-02-20",
  "class_id": null
}
```

---

### 5. Attendance Sessions
**GET** `/api/attendance/sessions`

List all attendance sessions.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Morning Session",
      "start_time": "08:00:00",
      "end_time": "12:00:00",
      "status": "open",
      "created_at": "2025-02-20T08:00:00Z"
    }
  ]
}
```

**POST** `/api/attendance/sessions`

Create a new attendance session.

**Request Body:**
```json
{
  "name": "Morning Session",
  "start_time": "08:00:00",
  "end_time": "12:00:00",
  "description": "First session of the day"
}
```

**PUT** `/api/attendance/sessions/{id}`

Update an attendance session.

**DELETE** `/api/attendance/sessions/{id}`

Delete an attendance session.

---

### 6. Biometric Device Management
**GET** `/api/attendance/biometric`

List all biometric devices.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "device_name": "Entrance Device",
      "device_code": "DEV-001",
      "location": "Main Gate",
      "ip_address": "192.168.1.100",
      "status": "active",
      "last_sync_at": "2025-02-20T10:30:00Z"
    }
  ]
}
```

**POST** `/api/attendance/biometric`

Register a new biometric device.

**Request Body:**
```json
{
  "device_name": "Entrance Device",
  "device_code": "DEV-001",
  "device_type": "ZKTeco",
  "location": "Main Gate",
  "ip_address": "192.168.1.100",
  "mac_address": "00:11:22:33:44:55"
}
```

---

### 7. Attendance Reconciliation
**GET** `/api/attendance/reconcile`

Get reconciliation cases and conflicts.

**Query Parameters:**
- `date_from` (optional): Start date
- `date_to` (optional): End date
- `status` (optional): pending, resolved, rejected

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "student_id": 1,
      "date": "2025-02-20",
      "conflict_type": "duplicate_entry",
      "status": "pending",
      "created_at": "2025-02-20T10:00:00Z"
    }
  ]
}
```

**POST** `/api/attendance/reconcile`

Resolve a reconciliation case.

**Request Body:**
```json
{
  "case_id": 1,
  "action": "approve",
  "notes": "Approved after verification"
}
```

---

### 8. Mark Bulk Attendance
**POST** `/api/attendance/bulk-mark`

Mark attendance for multiple students at once.

**Request Body:**
```json
{
  "date": "2025-02-20",
  "records": [
    {
      "student_id": 1,
      "status": "present",
      "method": "biometric"
    },
    {
      "student_id": 2,
      "status": "absent",
      "method": "manual"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Attendance marked for 2 students",
  "marked": 2,
  "failed": 0
}
```

---

### 9. Export Attendance Data
**POST** `/api/attendance/export`

Export attendance data to CSV or Excel.

**Request Body:**
```json
{
  "format": "csv",
  "date_from": "2025-02-01",
  "date_to": "2025-02-28",
  "class_id": null
}
```

**Response:**
File download (CSV or Excel)

---

### 10. Attendance History
**GET** `/api/attendance/students`

Get attendance history for students.

**Query Parameters:**
- `student_id` (optional): Specific student
- `date_from` (optional): Start date
- `date_to` (optional): End date
- `class_id` (optional): Filter by class

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-02-20",
      "status": "present",
      "time_in": "08:30:00",
      "time_out": "15:00:00",
      "method": "biometric"
    }
  ]
}
```

---

## Error Responses

All endpoints use standard error format:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "error_code"
}
```

**Common Error Codes:**
- `INVALID_DATE`: Invalid date format
- `CLASS_NOT_FOUND`: Class ID not found
- `STUDENT_NOT_FOUND`: Student ID not found
- `DEVICE_NOT_FOUND`: Biometric device not found
- `SESSION_NOT_FOUND`: Session not found
- `INVALID_STATUS`: Invalid attendance status
- `DB_ERROR`: Database error
- `UNAUTHORIZED`: Unauthorized access

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 500 | Internal Server Error - Server error |

---

## Attendance Status Values

- `present`: Student is present
- `absent`: Student is absent
- `late`: Student arrived late
- `excused`: Absence is excused (medical, official, etc.)
- `on_leave`: Student is on approved leave
- `pending`: Awaiting confirmation
- `not_marked`: Not yet marked

---

## Method Values

- `biometric`: Marked via biometric device
- `manual`: Manually marked by staff
- `api`: Marked via API
- `sync`: Synced from external source

---

## Examples

### Mark a student as present
```bash
curl -X POST http://localhost:3000/api/attendance \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": 1,
    "date": "2025-02-20",
    "status": "present",
    "method": "manual"
  }'
```

### Get today's attendance stats
```bash
curl http://localhost:3000/api/attendance/stats?date=2025-02-20
```

### Export attendance to CSV
```bash
curl -X POST http://localhost:3000/api/attendance/export \
  -H "Content-Type: application/json" \
  -d '{
    "format": "csv",
    "date_from": "2025-02-01",
    "date_to": "2025-02-28"
  }' \
  --output attendance_report.csv
```

---

## Rate Limiting

- No rate limiting applied (configurable)
- Recommended: 100 requests/minute per user

---

## Authentication

- All endpoints require valid session/JWT token
- Token validated in middleware

---

## Data Validation

- Dates must be in YYYY-MM-DD format
- Times must be in HH:MM:SS format
- Status values must be from the allowed list
- Student IDs and Class IDs must exist in database

---

## Pagination

Supported endpoints:
- `/api/attendance` - Optional `limit` and `offset` parameters
- `/api/attendance/reports` - Optional `limit` and `offset` parameters
- `/api/attendance/sessions` - Optional `limit` and `offset` parameters

Example:
```
GET /api/attendance?date=2025-02-20&limit=50&offset=0
```

---

## Caching

- Stats endpoint: Cached for 5 minutes
- Sessions endpoint: Cached for 10 minutes
- Reports endpoint: No caching (always fresh)
- Other endpoints: Cache-control based on content type

---

## WebSocket Support

Real-time attendance updates available via WebSocket:
```javascript
const ws = new WebSocket('wss://localhost:3000/ws/attendance');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle real-time updates
};
```

---

## Version

**API Version:** 1.0
**Last Updated:** 2025-02-20
**Changelog:** See ATTENDANCE_CHANGELOG.md
