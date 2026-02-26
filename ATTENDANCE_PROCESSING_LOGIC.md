# DRACE Attendance Processing Logic & Algorithm

## Overview

The attendance processing system uses a multi-stage pipeline to convert raw device logs into meaningful attendance records, respecting school-specific rules and allowing for manual overrides.

## Processing Stages

### Stage 1: Device Log Ingestion

```
Device → API/Polling Service → Validation → Queue → Processing
```

**Input**: Raw log from device
- device_user_id
- scan_timestamp
- device_id
- verification_status
- biometric_quality

**Three Ingestion Methods**:

1. **Push Method** (Webhook)
   - Device sends logs via HTTP POST
   - Real-time ingestion
   - Requires network connectivity

2. **Polling Method** (Scheduled)
   - Service polls device every 5 minutes
   - Retrieves logs since last_sync_time
   - Survives network outages

3. **Offline Sync**
   - Device stores logs locally when offline
   - Syncs when connectivity restored
   - Includes device_log_id to prevent duplicates

**Pseudocode**:
```
FUNCTION ingestDeviceLog(rawLog):
    // Validate basic structure
    IF NOT (rawLog.device_user_id AND rawLog.scan_timestamp):
        LOG_ERROR("Invalid log structure")
        RETURN error
    
    // Check for duplicate by device_log_id
    existing = QUERY attendance_logs WHERE 
        school_id = rawLog.school_id AND 
        device_id = rawLog.device_id AND 
        device_log_id = rawLog.device_log_id
    
    IF existing EXISTS:
        MARK existing AS is_duplicate = TRUE
        RETURN "duplicate"
    
    // Check for near-duplicate (same device_user_id within 2 minutes)
    recent = QUERY attendance_logs WHERE
        school_id = rawLog.school_id AND
        device_user_id = rawLog.device_user_id AND
        scan_timestamp BETWEEN (rawLog.scan_timestamp - 2 min) AND 
                               (rawLog.scan_timestamp + 2 min)
    
    IF recent EXISTS:
        MARK rawLog AS is_duplicate = TRUE
        SET duplicate_of_log_id = recent.id
    
    // Validate device exists and is active
    device = QUERY biometric_devices WHERE
        id = rawLog.device_id AND
        school_id = rawLog.school_id AND
        is_active = TRUE
    
    IF NOT device:
        LOG_ERROR("Device not found or inactive")
        RETURN error
    
    // Store raw log
    logRecord = create_record(
        school_id: rawLog.school_id,
        device_id: rawLog.device_id,
        device_user_id: rawLog.device_user_id,
        scan_timestamp: rawLog.scan_timestamp,
        received_timestamp: NOW(),
        verification_status: rawLog.verification_status,
        biometric_quality: rawLog.biometric_quality,
        device_log_id: rawLog.device_log_id,
        processing_status: 'pending',
        raw_data: rawLog
    )
    
    SAVE logRecord TO attendance_logs
    
    // Add to processing queue
    QUEUE_JOB(
        type: 'process_device_logs',
        school_id: rawLog.school_id,
        log_id: logRecord.id,
        priority: 10 // High priority for real-time
    )
    
    RETURN success
```

---

### Stage 2: Device User Mapping

**Purpose**: Map device_user_id to actual Student/Teacher record

**Pseudocode**:
```
FUNCTION mapDeviceUser(log):
    // Find mapping
    deviceUserMapping = QUERY device_users WHERE
        school_id = log.school_id AND
        device_user_id = log.device_user_id AND
        is_enrolled = TRUE AND
        unenrollment_date IS NULL
    
    IF NOT deviceUserMapping:
        LOG_WARN("Device user mapping not found for device_user_id: " + log.device_user_id)
        UPDATE attendance_logs SET
            processing_status = 'error',
            process_error_message = 'Device user mapping not found'
        WHERE id = log.id
        RETURN error
    
    // Get person details (student or teacher)
    person = CASE deviceUserMapping.person_type
        WHEN 'student':
            QUERY students WHERE id = deviceUserMapping.person_id
        WHEN 'teacher':
            QUERY teachers WHERE id = deviceUserMapping.person_id
    
    IF NOT person:
        LOG_ERROR("Person not found after mapping")
        RETURN error
    
    // Store mapping result
    UPDATE attendance_logs SET
        mapped_device_user_id = deviceUserMapping.id
    WHERE id = log.id
    
    RETURN success
```

---

### Stage 3: Duplicate Detection & Filtering

**Purpose**: Ignore duplicate scans within configurable interval

**Pseudocode**:
```
FUNCTION filterDuplicates(logs, school_id):
    LOAD rule = GET attendance_rules WHERE
        school_id = school_id AND
        is_active = TRUE
    
    ignore_interval = rule.ignore_duplicate_scans_within_minutes * 60 SECONDS
    
    FOR EACH log IN logs:
        IF log.is_duplicate:
            CONTINUE // Already marked as duplicate
        
        // Find all scans for this device_user in time window
        similarScans = QUERY attendance_logs WHERE
            school_id = log.school_id AND
            device_user_id = log.device_user_id AND
            scan_timestamp BETWEEN (log.scan_timestamp - ignore_interval) 
                              AND (log.scan_timestamp + ignore_interval) AND
            verification_status = 'success' AND
            id != log.id AND
            is_duplicate = FALSE
        
        IF COUNT(similarScans) > 0:
            // Keep earliest, mark others as duplicate
            earliestScan = GET MIN(similarScans.scan_timestamp)
            
            IF log.scan_timestamp > earliestScan.scan_timestamp:
                UPDATE attendance_logs SET
                    is_duplicate = TRUE,
                    duplicate_of_log_id = earliestScan.id
                WHERE id = log.id
    
    RETURN filtered_logs
```

---

### Stage 4: Daily Attendance Calculation

This is the core business logic that transforms logs into attendance status.

**Key Rules Logic**:

```
ALGORITHM CalculateDailyAttendance(person_id, person_type, date, school_id):
    
    // ========== STEP 1: GET APPLICABLE RULES ==========
    rules = QUERY attendance_rules WHERE
        school_id = school_id AND
        is_active = TRUE AND
        (applies_to = 'all' OR applies_to = person_type) AND
        effective_date <= date AND
        (end_date IS NULL OR end_date >= date)
    
    // Use rule with highest priority
    rule = SORT_BY(rules, priority ASC)[0] // Lowest priority number = highest priority
    
    IF NOT rule:
        LOG_ERROR("No applicable rules found")
        RETURN {status: 'pending', error: 'No rules configured'}
    
    
    // ========== STEP 2: GET VALID SCANS FOR THE DAY ==========
    // Find device_user mapping first
    deviceUserMapping = QUERY device_users WHERE
        person_type = person_type AND
        person_id = person_id AND
        school_id = school_id AND
        is_enrolled = TRUE
    
    IF NOT deviceUserMapping:
        RETURN {status: 'absent', reason: 'Not enrolled in device'}
    
    // Get all valid, non-duplicate scans for this person on this date
    validScans = QUERY attendance_logs WHERE
        school_id = school_id AND
        mapped_device_user_id = deviceUserMapping.id AND
        DATE(scan_timestamp) = date AND
        verification_status = 'success' AND
        is_duplicate = FALSE AND
        processing_status != 'error'
    
    // Sort by timestamp
    SORT validScans BY scan_timestamp ASC
    
    
    // ========== STEP 3: DETERMINE ATTENDANCE STATUS ==========
    
    // Extract timings
    first_scan_time = validScans[0].scan_timestamp.TIME() IF validScans.COUNT > 0 ELSE NULL
    last_scan_time = validScans[-1].scan_timestamp.TIME() IF validScans.COUNT > 0 ELSE NULL
    
    // Initialize attendance record
    attendance = {
        status: 'absent',
        first_arrival_time: NULL,
        last_departure_time: NULL,
        arrival_device_id: NULL,
        is_late: FALSE,
        late_minutes: 0,
        marking_rule_id: rule.id
    }
    
    
    // CASE 1: No scans at all
    IF validScans.COUNT == 0:
        return attendance with {status: 'absent'}
    
    
    // CASE 2: Scans exist, check against time rules
    
    // Check if first scan is within arrival window
    IF time_between(first_scan_time, rule.arrival_start_time, rule.arrival_end_time):
        // First scan within normal arrival time
        attendance.status = 'present'
        attendance.first_arrival_time = first_scan_time
        attendance.arrival_device_id = validScans[0].device_id
        attendance.is_late = FALSE
    
    ELSE IF first_scan_time > rule.arrival_end_time AND 
            first_scan_time <= rule.absence_cutoff_time:
        // Scan is after arrival window but before absence cutoff
        attendance.status = 'late'
        attendance.first_arrival_time = first_scan_time
        attendance.arrival_device_id = validScans[0].device_id
        attendance.is_late = TRUE
        attendance.late_minutes = minutes_between(rule.arrival_end_time, first_scan_time)
    
    ELSE IF first_scan_time > rule.absence_cutoff_time:
        // Scan is after absence cutoff - too late
        attendance.status = 'absent'
    
    ELSE IF first_scan_time < rule.arrival_start_time:
        // Very early scan (before school opens) - ignore? Or accept?
        // Conservative: accept it as valid arrival
        attendance.status = 'present'
        attendance.first_arrival_time = first_scan_time
        attendance.arrival_device_id = validScans[0].device_id
    
    
    // ========== STEP 4: CAPTURE DEPARTURE TIME ==========
    // Get scans after closing_time as departure
    departureCandidates = FILTER validScans WHERE 
        scan_timestamp.TIME() > rule.closing_time
    
    IF departureCandidates.COUNT > 0:
        // Last scan after closing time is departure
        attendance.last_departure_time = departureCandidates[-1].scan_timestamp.TIME()
    
    
    // ========== STEP 5: CHECK MANUAL OVERRIDES ==========
    manualEntry = QUERY manual_attendance_entries WHERE
        school_id = school_id AND
        person_id = person_id AND
        person_type = person_type AND
        attendance_date = date AND
        deleted_at IS NULL
    
    IF manualEntry EXISTS:
        // Apply manual override
        attendance.status = manualEntry.status
        attendance.first_arrival_time = manualEntry.arrival_time
        attendance.last_departure_time = manualEntry.departure_time
        
        IF manualEntry.override_type = 'excuse_update':
            attendance.excuse_type = manualEntry.excuse_type
            attendance.excuse_note = manualEntry.notes
            // If excused, don't mark as absent for metrics
            IF attendance.status = 'excused':
                attendance.is_late = FALSE
    
    
    // ========== STEP 6: SAVE ATTENDANCE RECORD ==========
    INSERT attendance_record INTO daily_attendance:
        school_id: school_id
        person_type: person_type
        person_id: person_id
        attendance_date: date
        status: attendance.status
        first_arrival_time: attendance.first_arrival_time
        last_departure_time: attendance.last_departure_time
        arrival_device_id: attendance.arrival_device_id
        is_late: attendance.is_late
        late_minutes: attendance.late_minutes
        marking_rule_id: rule.id
        processed_at: NOW()
        processing_metadata: {
            total_scans: validScans.COUNT,
            device_ids: extract_unique(validScans, 'device_id'),
            rule_applied: rule.rule_name
        }
    
    RETURN attendance
```

---

### Stage 5: Handling Special Cases

#### A. Excused Absences

```
FUNCTION applyExcuse(attendance, excuseType, reason):
    
    // Auto-excuse after configured days
    rule = GET_APPLICABLE_RULE(attendance.school_id)
    
    IF rule.auto_excuse_after_days > 0:
        daysSinceAbsent = DAYS_SINCE(attendance.attendance_date, TODAY())
        
        IF daysSinceAbsent >= rule.auto_excuse_after_days AND
           excuseType = 'medical':
            // Auto-mark as excused
            UPDATE daily_attendance SET
                status = 'excused',
                excuse_type = 'medical',
                excuse_note = 'Auto-excused after ' + rule.auto_excuse_after_days + ' days'
            WHERE id = attendance.id
            
            AUDIT_LOG("Auto-excused attendance", attendance.id)
    
    RETURN attendance
```

#### B. On Leave Status

```
FUNCTION checkLeaveStatus(person_id, person_type, date, school_id):
    
    // Check if person is on approved leave
    leaveRecord = QUERY leaves WHERE
        person_id = person_id AND
        person_type = person_type AND
        school_id = school_id AND
        date BETWEEN start_date AND end_date AND
        status = 'approved'
    
    IF leaveRecord EXISTS:
        // Mark as on_leave instead of absent
        RETURN {
            status: 'on_leave',
            leave_subject: leaveRecord.subject,
            leave_id: leaveRecord.id
        }
    
    RETURN NULL
```

#### C. Device Offline Fallback

```
FUNCTION handleDeviceOffline(device_id, school_id):
    
    device = QUERY biometric_devices WHERE id = device_id
    
    // Check if device has been offline too long
    timeOffline = NOW() - device.last_heartbeat
    
    IF timeOffline > 24 HOURS:
        // Device offline for > 24 hours
        // Should notify admin
        SEND_ALERT({
            type: 'device_offline',
            device_id: device_id,
            duration: timeOffline,
            school_id: school_id
        })
        
        // Optionally mark today's records as pending
        // until device comes back online
        UPDATE daily_attendance SET
            status = 'pending'
        WHERE DATE(attendance_date) = TODAY() AND
              school_id = school_id AND
              arrival_device_id = device_id
```

---

### Stage 6: Batch Processing

**Daily Attendance Calculation Job**:

```
ASYNC FUNCTION calculateDailyAttendanceJob(school_id, date):
    
    START_TRANSACTION()
    
    TRY:
        // Get all persons in school who have active enrollment
        allPersons = UNION(
            QUERY students WHERE school_id = school_id AND status = 'enrolled',
            QUERY teachers WHERE school_id = school_id AND status = 'active'
        )
        
        // For each person, calculate attendance
        successCount = 0
        errorCount = 0
        
        FOR EACH person IN allPersons:
            TRY:
                attendance = CalculateDailyAttendance(
                    person.id, 
                    person.person_type, 
                    date, 
                    school_id
                )
                successCount += 1
            CATCH error:
                LOG_ERROR("Failed to calculate attendance for " + person.id, error)
                errorCount += 1
                // Continue with next person
        
        COMMIT_TRANSACTION()
        
        // Post-processing
        SEND_ALERT({
            type: 'daily_attendance_calculated',
            school_id: school_id,
            date: date,
            success_count: successCount,
            error_count: errorCount
        })
        
        // Cache the results
        CACHE_SET(
            key: 'attendance:' + school_id + ':' + date,
            value: QUERY_SUMMARY(school_id, date),
            ttl: 24 HOURS
        )
        
        RETURN {status: 'success', summary: successCount + ' records calculated'}
    
    CATCH transaction_error:
        ROLLBACK_TRANSACTION()
        LOG_ERROR("Transaction failed", transaction_error)
        RETURN {status: 'error', message: transaction_error.message}
```

---

### Stage 7: Recalculation on Rule Change

When school rules change, all affected records must be recalculated:

```
FUNCTION recalculateOnRuleChange(rule_id, school_id):
    
    rule = QUERY attendance_rules WHERE id = rule_id
    
    // Determine affected dates (e.g., last 7 days + upcoming 7 days)
    dateRange = {
        start: TODAY() - 7 DAYS,
        end: TODAY() + 7 DAYS
    }
    
    // Queue recalculation jobs
    FOR date IN dateRange.START to dateRange.END:
        QUEUE_JOB({
            type: 'recalculate_date_range',
            school_id: school_id,
            date: date,
            rule_id: rule_id,
            priority: 5 // Lower priority than real-time
        })
    
    // Delete existing calculations for affected dateRange
    DELETE FROM daily_attendance WHERE
        school_id = school_id AND
        attendance_date BETWEEN dateRange.start AND dateRange.end AND
        is_manual_entry = FALSE
    
    AUDIT_LOG('Rules changed, queued recalculation', rule_id)
```

---

## Performance Optimization Strategies

### 1. Batch Log Processing
- Process logs in 5-minute windows
- Batch 100-1000 logs per transaction
- Use bulk insert for better throughput

### 2. Indexed Queries
- `(school_id, scan_timestamp)` - for log retrieval
- `(person_type, person_id, attendance_date)` - for duplicate check
- `(device_user_id, scan_timestamp)` - for device scans

### 3. Caching
- Cache applicable rules per school (5-minute TTL)
- Cache device mappings (1-hour TTL)
- Cache daily attendance summaries (24-hour TTL)

### 4. Async Processing
- Use message queue (Redis/RabbitMQ)
- Process high-priority logs first
- Retry failed jobs with exponential backoff

### 5. Database Partitioning
- Partition `attendance_logs` by month
- Archive logs older than 1 year
- Separate read replicas for analytics

---

## Error Handling & Recovery

```
FUNCTION processLogWithErrorHandling(log):
    maxRetries = 3
    retryCount = 0
    backoffMs = 1000
    
    WHILE retryCount < maxRetries:
        TRY:
            RESULT = processLog(log)
            RETURN success
        CATCH error:
            retryCount += 1
            
            IF retryCount >= maxRetries:
                // Final failure
                SAVE_ERROR({
                    log_id: log.id,
                    error_type: error.type,
                    error_message: error.message,
                    timestamp: NOW(),
                    failed_after_retries: maxRetries
                })
                
                // Notify admin
                SEND_ALERT({
                    type: 'log_processing_failed',
                    log_id: log.id,
                    error: error
                })
                
                RETURN failure
            ELSE:
                // Wait before retry (exponential backoff)
                WAIT(backoffMs)
                backoffMs = backoffMs * 2
                CONTINUE
```

---

## API for Processing Status

```
GET /api/v1/schools/{schoolId}/attendance/processing-status
Response:
{
    "pending_logs": 0,
    "processing_count": 5,
    "last_batch_timestamp": "2026-02-20T10:30:00Z",
    "success_rate": 99.8,
    "errors_in_last_hour": 2,
    "queue_depth": 0,
    "device_sync_status": {
        "device_1": { "status": "online", "last_sync": "2026-02-20T10:35:00Z" },
        "device_2": { "status": "offline", "last_sync": "2026-02-20T09:45:00Z" }
    }
}
```

This layered approach ensures:
✅ Scalability to 1M+ logs
✅ Fault tolerance & recovery
✅ Flexibility for rule changes
✅ Audit trail for compliance
✅ Real-time & batch processing support
