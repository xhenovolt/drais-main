# DRACE Attendance API - Comprehensive Endpoint Design

## Base URL
```
https://api.drace.io/v1
```

## Authentication
All requests require:
```
Authorization: Bearer {jwt_token}
X-School-Id: {school_id}
```

---

## 1. Device Management APIs

### 1.1 Register Biometric Device

```http
POST /schools/{schoolId}/devices
Content-Type: application/json

{
  "device_id": "device_serial_001",
  "device_name": "Gate 1 - Fingerprint Scanner",
  "device_brand": "ZKTeco",
  "device_model": "ZKT-F5",
  "device_type": "fingerprint",
  "location_name": "Main Entrance",
  "location_type": "entrance",
  "api_url": "http://192.168.1.100:8000",
  "api_key": "encrypted_key",
  "polling_interval_minutes": 5
}

Response: 201 Created
{
  "id": 123,
  "school_id": 1,
  "device_id": "device_serial_001",
  "status": "offline",
  "created_at": "2026-02-20T10:00:00Z"
}
```

### 1.2 List Devices

```http
GET /schools/{schoolId}/devices?status=online&limit=20&offset=0

Response: 200 OK
{
  "total": 5,
  "data": [
    {
      "id": 123,
      "device_id": "device_serial_001",
      "device_name": "Gate 1 - Fingerprint Scanner",
      "device_brand": "ZKTeco",
      "location_name": "Main Entrance",
      "status": "online",
      "last_sync_time": "2026-02-20T10:35:00Z",
      "last_heartbeat": "2026-02-20T10:35:15Z",
      "is_active": true
    }
  ]
}
```

### 1.3 Get Device Status

```http
GET /schools/{schoolId}/devices/{deviceId}/status

Response: 200 OK
{
  "device_id": 123,
  "status": "online",
  "last_sync_time": "2026-02-20T10:35:00Z",
  "logs_since_sync": 150,
  "memory_usage": "45%",
  "firmware_version": "2.1.0",
  "enrolled_users": 523,
  "sync_health": {
    "last_error": null,
    "error_count_24h": 0,
    "avg_sync_time_ms": 450,
    "success_rate": 99.9
  }
}
```

### 1.4 Sync Device Logs

```http
POST /schools/{schoolId}/devices/{deviceId}/sync

Body (optional):
{
  "force_full_sync": false,
  "since_timestamp": "2026-02-20T10:00:00Z"
}

Response: 200 OK
{
  "sync_started": true,
  "job_id": "sync_job_12345",
  "expected_logs": 450,
  "status": "queued"
}
```

### 1.5 Update Device Configuration

```http
PATCH /schools/{schoolId}/devices/{deviceId}

{
  "polling_interval_minutes": 3,
  "is_active": true,
  "location_name": "Updated Location"
}

Response: 200 OK
{
  "id": 123,
  "updated_fields": ["polling_interval_minutes", "location_name"],
  "updated_at": "2026-02-20T10:40:00Z"
}
```

### 1.6 Deactivate Device

```http
DELETE /schools/{schoolId}/devices/{deviceId}

Response: 204 No Content
```

---

## 2. Device User Mapping APIs

### 2.1 Map Student to Biometric Device

```http
POST /schools/{schoolId}/device-users

{
  "device_user_id": 1001,
  "person_type": "student",
  "person_id": 5,
  "device_name": "Student Name on Device",
  "biometric_quality": 85
}

Response: 201 Created
{
  "id": 456,
  "device_user_id": 1001,
  "person_type": "student",
  "person_id": 5,
  "is_enrolled": true,
  "enrollment_date": "2026-02-20T10:45:00Z"
}
```

### 2.2 Bulk Enroll Students

```http
POST /schools/{schoolId}/device-users/bulk

{
  "mappings": [
    {"device_user_id": 1001, "person_type": "student", "person_id": 5},
    {"device_user_id": 1002, "person_type": "student", "person_id": 6},
    {"device_user_id": 1003, "person_type": "teacher", "person_id": 10}
  ]
}

Response: 201 Created
{
  "created": 3,
  "failed": 0,
  "results": [
    {"device_user_id": 1001, "status": "success", "id": 456}
  ]
}
```

### 2.3 Find Unmapped Device Users

```http
GET /schools/{schoolId}/device-users/unmapped?device_id=123

Response: 200 OK
{
  "unmapped_count": 12,
  "device_id": 123,
  "unmapped_users": [
    {
      "device_user_id": 1050,
      "device_name": "Unknown User",
      "last_scan": "2026-02-20T08:30:00Z"
    }
  ]
}
```

### 2.4 Unenroll Device User

```http
POST /schools/{schoolId}/device-users/{deviceUserId}/unenroll

{
  "reason": "Student graduated"
}

Response: 200 OK
{
  "id": 456,
  "is_enrolled": false,
  "unenrollment_date": "2026-02-20T10:50:00Z"
}
```

---

## 3. Raw Log Ingestion APIs

### 3.1 Receive Log from Device (Webhook)

```http
POST /schools/{schoolId}/device-logs/webhook

{
  "device_id": "device_serial_001",
  "device_user_id": 1001,
  "scan_timestamp": "2026-02-20T08:15:30Z",
  "verification_status": "success",
  "biometric_quality": 92,
  "device_log_id": "log_20260220_081530_001"
}

Response: 202 Accepted
{
  "received": true,
  "log_id": "log_20260220_081530_001",
  "status": "queued",
  "job_id": "process_12345"
}
```

### 3.2 Batch Log Upload

```http
POST /schools/{schoolId}/device-logs/batch

{
  "logs": [
    {
      "device_id": "device_serial_001",
      "device_user_id": 1001,
      "scan_timestamp": "2026-02-20T08:15:30Z",
      "verification_status": "success",
      "biometric_quality": 92,
      "device_log_id": "log_20260220_081530_001"
    },
    // ... more logs
  ]
}

Response: 202 Accepted
{
  "total_provided": 100,
  "accepted": 99,
  "duplicates": 1,
  "processing_job_id": "batch_12345"
}
```

### 3.3 Get Log Processing Status

```http
GET /schools/{schoolId}/device-logs/{logId}/status

Response: 200 OK
{
  "id": "log_20260220_081530_001",
  "input_status": "received",
  "processing_status": "processed",
  "device_user_mapped": true,
  "mapped_to": {
    "person_type": "student",
    "person_id": 5,
    "name": "Ahmed Ali"
  },
  "duplicate_detected": false,
  "processed_at": "2026-02-20T08:15:35Z"
}
```

### 3.4 Query Raw Logs (Admin Only)

```http
GET /schools/{schoolId}/device-logs?
  device_id=123&
  start_date=2026-02-19&
  end_date=2026-02-20&
  processing_status=pending&
  limit=100&
  offset=0

Response: 200 OK
{
  "total": 450,
  "limit": 100,
  "offset": 0,
  "data": [
    {
      "id": "log_20260220_081530_001",
      "device_id": 123,
      "device_user_id": 1001,
      "scan_timestamp": "2026-02-20T08:15:30Z",
      "verification_status": "success",
      "biometric_quality": 92,
      "processing_status": "processed",
      "is_duplicate": false
    }
  ]
}
```

---

## 4. Attendance Rules APIs

### 4.1 Create Attendance Rule

```http
POST /schools/{schoolId}/attendance-rules

{
  "rule_name": "Student Standard Rules",
  "rule_description": "Standard daily attendance rules for students",
  "arrival_start_time": "06:00",
  "arrival_end_time": "08:00",
  "late_threshold_minutes": 15,
  "absence_cutoff_time": "09:00",
  "closing_time": "15:00",
  "applies_to": "students",
  "applies_to_classes": [1, 2, 3],
  "ignore_duplicate_scans_within_minutes": 2,
  "auto_excuse_after_days": 0,
  "is_active": true,
  "effective_date": "2026-02-20",
  "end_date": null,
  "priority": 100
}

Response: 201 Created
{
  "id": 789,
  "school_id": 1,
  "rule_name": "Student Standard Rules",
  "created_at": "2026-02-20T11:00:00Z"
}
```

### 4.2 List Rules

```http
GET /schools/{schoolId}/attendance-rules?applies_to=students&is_active=true

Response: 200 OK
{
  "total": 3,
  "data": [
    {
      "id": 789,
      "rule_name": "Student Standard Rules",
      "arrival_start_time": "06:00",
      "arrival_end_time": "08:00",
      "late_threshold_minutes": 15,
      "absence_cutoff_time": "09:00",
      "closing_time": "15:00",
      "applies_to": "students",
      "is_active": true,
      "priority": 100
    }
  ]
}
```

### 4.3 Update Rule

```http
PATCH /schools/{schoolId}/attendance-rules/{ruleId}

{
  "late_threshold_minutes": 20,
  "absence_cutoff_time": "09:30"
}

Response: 200 OK
{
  "id": 789,
  "updated_fields": ["late_threshold_minutes", "absence_cutoff_time"],
  "note": "Rule updated. Queued recalculation for last 7 days of attendance."
}
```

### 4.4 Get Rule Details

```http
GET /schools/{schoolId}/attendance-rules/{ruleId}

Response: 200 OK
{
  "id": 789,
  "school_id": 1,
  "rule_name": "Student Standard Rules",
  "arrival_start_time": "06:00",
  "arrival_end_time": "08:00",
  "late_threshold_minutes": 15,
  "absence_cutoff_time": "09:00",
  "closing_time": "15:00",
  "applies_to": "students",
  "applies_to_classes": [1, 2, 3],
  "ignore_duplicate_scans_within_minutes": 2,
  "is_active": true,
  "effective_date": "2026-02-20",
  "end_date": null,
  "priority": 100,
  "affected_persons_count": 523,
  "created_at": "2026-02-20T11:00:00Z",
  "updated_at": "2026-02-20T11:00:00Z"
}
```

### 4.5 Deactivate Rule

```http
DELETE /schools/{schoolId}/attendance-rules/{ruleId}

Response: 204 No Content
```

---

## 5. Daily Attendance APIs

### 5.1 Get Today's Attendance Summary

```http
GET /schools/{schoolId}/attendance/today

Response: 200 OK
{
  "date": "2026-02-20",
  "total_expected": 523,
  "present": 510,
  "late": 8,
  "absent": 5,
  "excused": 0,
  "on_leave": 0,
  "pending": 0,
  "attendance_percentage": 98.5,
  "last_updated": "2026-02-20T10:35:00Z"
}
```

### 5.2 Get Attendance by Date Range

```http
GET /schools/{schoolId}/attendance?
  start_date=2026-02-01&
  end_date=2026-02-28&
  person_type=student&
  class_id=5&
  status=absent&
  limit=100

Response: 200 OK
{
  "total": 245,
  "filters_applied": {
    "date_range": "2026-02-01 to 2026-02-28",
    "person_type": "student",
    "class_id": 5,
    "status": "absent"
  },
  "data": [
    {
      "id": 9001,
      "person_id": 5,
      "person_name": "Ahmed Ali",
      "attendance_date": "2026-02-01",
      "status": "absent",
      "first_arrival_time": null,
      "last_departure_time": null,
      "is_late": false,
      "is_manual_entry": false,
      "excuse_type": "none"
    }
  ]
}
```

### 5.3 Get Individual Attendance Record

```http
GET /schools/{schoolId}/attendance/{attendanceId}

Response: 200 OK
{
  "id": 9001,
  "school_id": 1,
  "person_type": "student",
  "person_id": 5,
  "person_name": "Ahmed Ali",
  "class_name": "Grade 1 - Section A",
  "attendance_date": "2026-02-20",
  "status": "present",
  "first_arrival_time": "07:45",
  "last_departure_time": "15:20",
  "arrival_device_location": "Main Entrance",
  "is_late": false,
  "late_minutes": 0,
  "is_manual_entry": false,
  "excuse_type": "none",
  "marking_rule_id": 789,
  "created_at": "2026-02-20T07:45:30Z",
  "updated_at": "2026-02-20T07:45:30Z",
  "audit_trail": [
    {
      "timestamp": "2026-02-20T07:45:30Z",
      "change": "Auto-calculated from device logs",
      "changed_by": "system"
    }
  ]
}
```

### 5.4 Get Class Attendance Summary

```http
GET /schools/{schoolId}/classes/{classId}/attendance?date=2026-02-20

Response: 200 OK
{
  "class_id": 5,
  "class_name": "Grade 1 - Section A",
  "date": "2026-02-20",
  "total_strength": 45,
  "present": 43,
  "late": 1,
  "absent": 1,
  "excused": 0,
  "on_leave": 0,
  "attendance_percentage": 97.8,
  "students": [
    {
      "student_id": 5,
      "roll_number": 1,
      "name": "Ahmed Ali",
      "status": "present",
      "arrival_time": "07:45",
      "departure_time": "15:20"
    }
  ]
}
```

---

## 6. Manual Attendance Entry APIs

### 6.1 Create Manual Attendance Entry

```http
POST /schools/{schoolId}/manual-attendance

{
  "person_type": "student",
  "person_id": 5,
  "attendance_date": "2026-02-20",
  "status": "present",
  "arrival_time": "08:30",
  "departure_time": "15:00",
  "override_type": "status_change",
  "reason": "Medical appointment, joined later",
  "notes": "Mother accompanied, had doctor's letter"
}

Response: 201 Created
{
  "id": 1001,
  "daily_attendance_id": 9001,
  "status": "present",
  "arrival_time": "08:30",
  "departure_time": "15:00",
  "created_by_user_id": 10,
  "created_at": "2026-02-20T11:15:00Z",
  "audit_entry": {
    "id": 5001,
    "change_type": "manual_override",
    "timestamp": "2026-02-20T11:15:00Z"
  }
}
```

### 6.2 Bulk Create Manual Entries

```http
POST /schools/{schoolId}/manual-attendance/bulk

{
  "entries": [
    {
      "person_type": "student",
      "person_id": 5,
      "attendance_date": "2026-02-20",
      "status": "absent",
      "reason": "Sick leave",
      "override_type": "excuse_update"
    },
    {
      "person_type": "student",
      "person_id": 6,
      "attendance_date": "2026-02-20",
      "status": "late",
      "arrival_time": "09:00",
      "reason": "Traffic",
      "override_type": "time_correction"
    }
  ]
}

Response: 201 Created
{
  "created": 2,
  "failed": 0,
  "results": [
    {"person_id": 5, "status": "success", "id": 1001}
  ]
}
```

### 6.3 Update Manual Entry

```http
PATCH /schools/{schoolId}/manual-attendance/{manualEntryId}

{
  "status": "excused",
  "reason": "Medical leave - updated",
  "excuse_type": "medical"
}

Response: 200 OK
{
  "id": 1001,
  "status": "excused",
  "updated_at": "2026-02-20T11:30:00Z",
  "audit_entry": {
    "change_type": "update",
    "previous_values": {
      "status": "present",
      "reason": "Medical appointment, joined later"
    },
    "new_values": {
      "status": "excused",
      "reason": "Medical leave - updated"
    }
  }
}
```

### 6.4 Delete Manual Entry (Soft Delete)

```http
DELETE /schools/{schoolId}/manual-attendance/{manualEntryId}

Response: 204 No Content
```

### 6.5 Get Manual Entry Audit Trail

```http
GET /schools/{schoolId}/manual-attendance/{manualEntryId}/audit

Response: 200 OK
{
  "entry_id": 1001,
  "audit_trail": [
    {
      "action": "created",
      "timestamp": "2026-02-20T11:15:00Z",
      "user_id": 10,
      "user_name": "Admin User",
      "change_summary": "Manual entry created: Status changed to present"
    },
    {
      "action": "updated",
      "timestamp": "2026-02-20T11:30:00Z",
      "user_id": 10,
      "user_name": "Admin User",
      "change_summary": "Status updated to excused",
      "previous_values": {...},
      "new_values": {...}
    }
  ]
}
```

---

## 7. Attendance Analytics & Reporting APIs

### 7.1 Get Attendance Trends

```http
GET /schools/{schoolId}/attendance/analytics/trends?
  period=month&
  start_date=2026-01-01&
  end_date=2026-02-28&
  group_by=daily

Response: 200 OK
{
  "period": "month",
  "data": [
    {
      "date": "2026-02-01",
      "total_expected": 523,
      "present_count": 510,
      "late_count": 8,
      "absent_count": 5,
      "attendance_percentage": 98.5
    }
  ]
}
```

### 7.2 Get Student Attendance Report

```http
GET /schools/{schoolId}/students/{studentId}/attendance-report?
  start_date=2026-02-01&
  end_date=2026-02-28

Response: 200 OK
{
  "student_id": 5,
  "student_name": "Ahmed Ali",
  "class": "Grade 1 - Section A",
  "period": "2026-02 to 2026-02-28",
  "attendance_summary": {
    "total_school_days": 20,
    "present_days": 19,
    "late_days": 1,
    "absent_days": 0,
    "excused_days": 0,
    "on_leave_days": 0,
    "attendance_percentage": 95.0
  },
  "details": [
    {
      "date": "2026-02-01",
      "status": "present",
      "arrival_time": "07:45",
      "departure_time": "15:20"
    }
  ]
}
```

### 7.3 Get Late Students Report

```http
GET /schools/{schoolId}/attendance/reports/late-students?
  date=2026-02-20&
  class_id=5

Response: 200 OK
{
  "date": "2026-02-20",
  "late_count": 8,
  "students": [
    {
      "student_id": 5,
      "name": "Ahmed Ali",
      "class": "Grade 1 - Section A",
      "roll_no": 1,
      "arrival_time": "08:15",
      "late_minutes": 15,
      "reason": null
    }
  ]
}
```

### 7.4 Get Absent Students Report

```http
GET /schools/{schoolId}/attendance/reports/absent-students?
  start_date=2026-02-01&
  end_date=2026-02-28&
  excuse_status=unexcused

Response: 200 OK
{
  "period": "2026-02-01 to 2026-02-28",
  "total_absent": 34,
  "unexcused_absent": 20,
  "excused_absent": 14,
  "students": [
    {
      "student_id": 5,
      "name": "Ahmed Ali",
      "class": "Grade 1 - Section A",
      "absent_dates": ["2026-02-05", "2026-02-12"],
      "total_absent_days": 2,
      "reason": "Not provided"
    }
  ]
}
```

---

## 8. Real-time Dashboard APIs

### 8.1 WebSocket Connection for Live Updates

```javascript
// Client connects to WebSocket
const ws = new WebSocket('wss://api.drace.io/v1/schools/1/attendance/live');

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  // Updates from server
  {
    "type": "arrival",
    "student_id": 5,
    "student_name": "Ahmed Ali",
    "class": "Grade 1 - Section A",
    "arrival_time": "07:45",
    "device_location": "Main Entrance",
    "timestamp": "2026-02-20T07:45:30Z"
  }
  
  // OR
  {
    "type": "manual_entry",
    "student_id": 6,
    "status": "marked_absent",
    "timestamp": "2026-02-20T08:30:00Z"
  }
});
```

### 8.2 Get Dashboard Summary

```http
GET /schools/{schoolId}/dashboard/summary?date=2026-02-20

Response: 200 OK
{
  "date": "2026-02-20",
  "summary": {
    "total_students": 523,
    "present": 510,
    "late": 8,
    "absent": 5,
    "excused": 0,
    "on_leave": 0,
    "pending": 0,
    "attendance_percentage": 98.5
  },
  "recent_arrivals": [
    {
      "student_id": 5,
      "name": "Ahmed Ali",
      "arrival_time": "07:45",
      "device_location": "Main Entrance"
    }
  ],
  "recent_manual_entries": [
    {
      "student_id": 6,
      "name": "Fatima Hassan",
      "status": "marked_absent",
      "reason": "Sick leave",
      "marked_at": "2026-02-20T08:30:00Z",
      "marked_by": "Admin User"
    }
  ]
}
```

---

## 9. Error Handling

All API responses follow standard error format:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Device user mapping not found",
    "details": {
      "device_user_id": 1001,
      "school_id": 1
    },
    "timestamp": "2026-02-20T10:00:00Z",
    "request_id": "req_12345"
  }
}
```

### Common Error Codes
- `INVALID_REQUEST` (400) - Validation failed
- `UNAUTHORIZED` (401) - Invalid or missing token
- `FORBIDDEN` (403) - Insufficient permissions
- `NOT_FOUND` (404) - Resource not found
- `CONFLICT` (409) - Duplicate or conflicting data
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INTERNAL_SERVER_ERROR` (500) - Server error
- `SERVICE_UNAVAILABLE` (503) - Temporarily unavailable

---

## 10. Rate Limiting

```
Device API: 1000 logs/min per device
Manual Entry: 100 entries/min per school
Dashboard Queries: 500 requests/min per user
Rule Updates: 10 requests/min per school
```

All endpoints return rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1645268700
```

---

## 11. Pagination

Standard pagination for list endpoints:
```
GET /schools/{schoolId}/attendance?limit=20&offset=0

Response includes:
{
  "total": 500,
  "limit": 20,
  "offset": 0,
  "data": [...]
}
```

---

## 12. Filtering & Searching

Standard filter syntax:
```
GET /schools/{schoolId}/attendance?
  status=present,late&
  person_type=student&
  class_id=5&
  date_from=2026-02-01&
  date_to=2026-02-28&
  search=Ahmed&
  sort=attendance_date:desc,name:asc
```

This API design ensures:
✅ Comprehensive device integration
✅ Flexible manual entry management
✅ Real-time dashboard updates
✅ Detailed audit trail
✅ Role-based access control
✅ Scalable to serve 100+ schools
