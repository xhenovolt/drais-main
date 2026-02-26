# DRAIS Attendance Module - API Documentation

**Version**: 1.0  
**Date**: February 2026  
**Base URL**: `/api`

---

## Table of Contents
1. [Attendance Sessions](#attendance-sessions)
2. [Biometric Devices](#biometric-devices)
3. [Fingerprints](#fingerprints)
4. [Biometric Sync](#biometric-sync)
5. [Attendance Reconciliation](#attendance-reconciliation)
6. [Attendance Reports](#attendance-reports)

---

## Attendance Sessions

### 1.1 List Attendance Sessions

**Endpoint**: `GET /attendance/sessions`

**Query Parameters**:
- `school_id` (optional, default: 1) - School identifier
- `class_id` (optional) - Filter by class
- `date` (optional) - Filter by session date (YYYY-MM-DD)
- `status` (optional) - Filter by status: draft, open, submitted, locked, finalized
- `academic_year_id` (optional) - Filter by academic year
- `term_id` (optional) - Filter by term

**Example Request**:
```bash
curl -X GET "http://localhost:3000/api/attendance/sessions?class_id=1&date=2026-02-08"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "class_id": 1,
      "class_name": "Primary 1",
      "session_date": "2026-02-08",
      "session_type": "lesson",
      "attendance_type": "hybrid",
      "status": "open",
      "students_count": 45,
      "present_count": 42,
      "absent_count": 2,
      "late_count": 1,
      "teacher_name": "Mr. Kangye",
      "created_at": "2026-02-08T09:00:00Z"
    }
  ]
}
```

---

### 1.2 Create Attendance Session

**Endpoint**: `POST /attendance/sessions`

**Request Body**:
```json
{
  "class_id": 1,
  "stream_id": 1,
  "term_id": 1,
  "academic_year_id": 1,
  "teacher_id": 5,
  "session_date": "2026-02-08",
  "session_start_time": "08:00:00",
  "session_end_time": "09:00:00",
  "session_type": "lesson",
  "attendance_type": "hybrid",
  "notes": "Regular morning attendance"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Attendance session created successfully",
  "data": {
    "id": 1,
    "class_id": 1,
    "session_date": "2026-02-08",
    "status": "draft"
  }
}
```

---

### 1.3 Get Session Details

**Endpoint**: `GET /attendance/sessions/{id}`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "class_id": 1,
    "session_date": "2026-02-08",
    "status": "open",
    "attendance_records": [
      {
        "id": 101,
        "student_id": 10,
        "student_name": "John Doe",
        "status": "present",
        "method": "biometric",
        "time_in": "08:05:00",
        "is_locked": false
      }
    ]
  }
}
```

---

### 1.4 Update Session

**Endpoint**: `PATCH /attendance/sessions/{id}`

**Request Body**:
```json
{
  "session_type": "assembly",
  "attendance_type": "manual",
  "notes": "Updated notes"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Attendance session updated successfully"
}
```

---

### 1.5 Submit Session

**Endpoint**: `POST /attendance/sessions/{id}?action=submit`

**Request Body**:
```json
{
  "submitted_by": 5
}
```

**Response**:
```json
{
  "success": true,
  "message": "Attendance session submitted successfully",
  "unmarked_count": 2
}
```

---

### 1.6 Lock Session

**Endpoint**: `POST /attendance/sessions/{id}?action=lock`

**Request Body**:
```json
{
  "locked_by": 5
}
```

**Response**:
```json
{
  "success": true,
  "message": "Attendance session locked successfully"
}
```

---

### 1.7 Finalize Session

**Endpoint**: `POST /attendance/sessions/{id}?action=finalize`

**Request Body**:
```json
{
  "finalized_by": 5
}
```

**Response**:
```json
{
  "success": true,
  "message": "Attendance session finalized successfully"
}
```

---

## Biometric Devices

### 2.1 List Biometric Devices

**Endpoint**: `GET /biometric-devices`

**Query Parameters**:
- `school_id` (optional, default: 1)
- `status` (optional): active, inactive, maintenance, offline

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "device_name": "Entrance Scanner",
      "device_code": "DEV-001",
      "device_type": "fingerprint",
      "manufacturer": "ZKTeco",
      "model": "ZK5500",
      "location": "Main Entrance",
      "status": "active",
      "last_sync_at": "2026-02-08T15:30:00Z",
      "sync_status": "synced",
      "enrollment_count": 450,
      "is_master": true
    }
  ]
}
```

---

### 2.2 Register Biometric Device

**Endpoint**: `POST /biometric-devices`

**Request Body**:
```json
{
  "device_name": "Entrance Scanner",
  "device_code": "DEV-001",
  "device_type": "fingerprint",
  "manufacturer": "ZKTeco",
  "model": "ZK5500",
  "serial_number": "ZK123456",
  "location": "Main Entrance",
  "ip_address": "192.168.1.100",
  "mac_address": "00:11:22:33:44:55",
  "api_key": "your-api-key",
  "api_secret": "your-api-secret"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Biometric device registered successfully",
  "data": {
    "id": 1,
    "device_code": "DEV-001",
    "status": "active"
  }
}
```

---

## Fingerprints

### 3.1 List Student Fingerprints

**Endpoint**: `GET /fingerprints?student_id=10`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "student_id": 10,
      "student_name": "John Doe",
      "device_id": 1,
      "device_name": "Entrance Scanner",
      "finger_position": "index",
      "hand": "right",
      "quality_score": 92,
      "status": "active",
      "last_matched_at": "2026-02-08T15:30:00Z",
      "match_count": 150
    }
  ]
}
```

---

### 3.2 Register Fingerprint (USB Scanner)

**Endpoint**: `POST /fingerprints?action=register-usb`

**Request Body**:
```json
{
  "student_id": 10,
  "template_data": "base64_encoded_fingerprint_template",
  "template_format": "ISO/IEC 19794-2",
  "finger_position": "index",
  "hand": "right",
  "quality_score": 92,
  "biometric_uuid": "uuid-from-device"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Fingerprint registered successfully",
  "data": {
    "id": 1,
    "student_id": 10,
    "finger_position": "index",
    "quality_score": 92,
    "status": "active"
  }
}
```

---

### 3.3 Link Existing Fingerprint

**Endpoint**: `POST /fingerprints?action=link-existing`

**Request Body**:
```json
{
  "student_id": 10,
  "device_id": 1,
  "biometric_uuid": "uuid-from-device",
  "finger_position": "index",
  "hand": "right"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Fingerprint linked successfully",
  "data": {
    "id": 2,
    "student_id": 10,
    "device_id": 1,
    "status": "active"
  }
}
```

---

### 3.4 Verify Fingerprint

**Endpoint**: `POST /fingerprints?action=verify`

**Request Body**:
```json
{
  "student_id": 10,
  "device_id": 1,
  "template_data": "scanned_fingerprint_template",
  "confidence_threshold": 90
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "matched": true,
    "fingerprint_id": 1,
    "confidence_score": 95,
    "biometric_uuid": "uuid-123"
  }
}
```

---

### 3.5 Remove Fingerprint

**Endpoint**: `POST /fingerprints?action=remove`

**Request Body**:
```json
{
  "fingerprint_id": 1
}
```

**Response**:
```json
{
  "success": true,
  "message": "Fingerprint removed successfully"
}
```

---

## Biometric Sync

### 4.1 Sync Attendance from Device

**Endpoint**: `POST /attendance/biometric/sync`

**Request Body**:
```json
{
  "device_id": 1,
  "school_id": 1,
  "initiated_by": 5,
  "attendance_records": [
    {
      "biometric_uuid": "uuid-123",
      "timestamp": "2026-02-08T08:05:30Z",
      "quality_score": 85
    },
    {
      "biometric_uuid": "uuid-456",
      "timestamp": "2026-02-08T08:10:15Z",
      "quality_score": 90
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Biometric sync completed: 2/2 records synced",
  "data": {
    "sync_log_id": 101,
    "total_records": 2,
    "synced_count": 2,
    "failed_count": 0,
    "sync_percentage": 100
  }
}
```

---

### 4.2 Check Sync Status

**Endpoint**: `GET /attendance/biometric/sync-status?device_id=1`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "device_name": "Entrance Scanner",
      "status": "active",
      "sync_status": "synced",
      "last_sync_at": "2026-02-08T15:30:00Z",
      "last_sync_record_count": 250,
      "enrollment_count": 450,
      "total_syncs": 15,
      "successful_syncs": 14,
      "failed_syncs": 1
    }
  ]
}
```

---

## Attendance Reconciliation

### 5.1 Reconcile Attendance

**Endpoint**: `POST /attendance/reconcile`

**Request Body**:
```json
{
  "attendance_session_id": 1,
  "school_id": 1,
  "reconciled_by": 5
}
```

**Response**:
```json
{
  "success": true,
  "message": "Reconciliation completed: 40/45 records matched",
  "data": {
    "total_records": 45,
    "matched_count": 40,
    "conflict_count": 5,
    "reconciliation_percentage": 89
  }
}
```

---

### 5.2 Get Reconciliation Report

**Endpoint**: `GET /attendance/reconcile?session_id=1`

**Response**:
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": 1,
        "student_id": 10,
        "student_name": "John Doe",
        "manual_status": "present",
        "biometric_status": "present",
        "reconciliation_status": "matched",
        "resolved_at": "2026-02-08T15:30:00Z"
      },
      {
        "id": 2,
        "student_id": 11,
        "student_name": "Jane Smith",
        "manual_status": "absent",
        "biometric_status": "present",
        "reconciliation_status": "conflict",
        "conflict_resolution": "trust_biometric"
      }
    ],
    "summary": {
      "total": 45,
      "matched": 40,
      "conflicts": 5,
      "biometric_only": 0,
      "manual_only": 0
    }
  }
}
```

---

## Attendance Reports

### 6.1 Generate Report

**Endpoint**: `POST /attendance/reports`

**Request Body**:
```json
{
  "school_id": 1,
  "report_type": "daily_summary",
  "date_from": "2026-02-01",
  "date_to": "2026-02-08",
  "class_id": 1,
  "generated_by": 5
}
```

**Supported Report Types**:
- `daily_summary` - Daily attendance overview
- `weekly_trend` - Week-over-week trends
- `monthly_summary` - Monthly attendance statistics
- `class_analysis` - In-depth class performance
- `student_profile` - Individual student profiles
- `period_comparison` - Compare two time periods

**Response** (201 Created):
```json
{
  "success": true,
  "message": "Report generated successfully",
  "data": {
    "report_id": 1,
    "report_type": "daily_summary",
    "generated_at": "2026-02-08T16:00:00Z",
    "type": "daily_summary",
    "period": {
      "from": "2026-02-01",
      "to": "2026-02-08"
    },
    "data": [
      {
        "attendance_date": "2026-02-08",
        "class_name": "Primary 1",
        "total_students": 45,
        "present": 42,
        "absent": 2,
        "late": 1,
        "attendance_rate": 93.33,
        "biometric_count": 30,
        "manual_count": 15
      }
    ]
  }
}
```

---

### 6.2 Retrieve Cached Reports

**Endpoint**: `GET /attendance/reports?report_type=daily_summary`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "report_type": "daily_summary",
      "date_from": "2026-02-01",
      "date_to": "2026-02-08",
      "generated_at": "2026-02-08T16:00:00Z",
      "expires_at": "2026-02-15T16:00:00Z"
    }
  ]
}
```

---

## Error Responses

All endpoints return standard error responses:

**400 Bad Request**:
```json
{
  "success": false,
  "error": "Missing required fields: class_id"
}
```

**404 Not Found**:
```json
{
  "success": false,
  "error": "Attendance session not found"
}
```

**500 Internal Server Error**:
```json
{
  "success": false,
  "error": "Failed to create attendance session"
}
```

---

## Status Codes

| Code | Description |
|------|-------------|
| 200 | OK - Successful GET/PATCH request |
| 201 | Created - Successful POST request |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 500 | Internal Server Error |

---

## Authentication

All endpoints require authentication via JWT token in the `Authorization` header:

```bash
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Rate Limiting

- **Sync Operations**: 10 requests per hour per device
- **Report Generation**: 50 requests per day per school
- **Other Requests**: 1000 requests per hour per user

---

## Webhooks (Future)

The system can send webhooks for:
- Attendance session status changes
- Biometric device sync events
- Reconciliation conflicts
- Report generation completion

---

**Documentation Version**: 1.0  
**Last Updated**: February 8, 2026
