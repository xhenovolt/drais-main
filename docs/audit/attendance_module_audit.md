# Attendance Module Audit - Phase 3

## Overview
This document audits the attendance module's architecture, separating concerns between raw data, processing, and reporting.

---

## CURRENT ARCHITECTURE

### Layer 1: Raw Device Logs

**Tables:**
- `device_logs` - New unified raw logs
- `dahua_raw_logs` - Legacy Dahua raw logs
- `dahua_attendance_logs` - Legacy normalized logs

**Issues:**
- Multiple tables for the same concept
- No clear separation between raw and processed
- Filtering happens at database level (mixing concerns)

### Layer 2: Processing

**Tables:**
- `student_attendance` - Learner daily attendance
- `staff_attendance` - Staff daily attendance
- `attendance_sessions_v2` - New unified sessions
- `tahfiz_attendance` - Tahfiz-specific attendance

**Issues:**
- Inconsistent schemas between student/staff
- Processing logic embedded in API routes
- No dedicated service layer

### Layer 3: Reporting

**Routes:**
- `/api/attendance/stats` - Basic statistics
- `/api/attendance/summary` - Dashboard summary
- `/api/attendance/reports` - Report generation
- `/api/attendance/reconcile` - Reconciliation

**Issues:**
- Reports generated on-the-fly (no caching)
- No materialized views for performance

---

## CURRENT IMPLEMENTATION ISSUES

### 1. Filter Logic Inside Controllers

Example from `/api/attendance/route.ts`:

```typescript
// Filtering mixed with business logic
let sql = `SELECT * FROM student_attendance WHERE 1=1`;
if (date) sql += ` AND date = ?`;
if (classId) sql += ` AND class_id = ?`;
if (status) sql += ` AND status = ?`;
```

**Problems:**
- Filtering at wrong layer (should be separate service)
- Hard to test
- No separation between "get data" and "filter data"

### 2. No Service Layer

All business logic is embedded directly in route handlers:

```
Route Handler → Database Query → Response
```

Should be:

```
Route Handler → Service → Repository → Database
```

### 3. Duplicate Processing Logic

Similar logic exists in multiple places:
- `/api/attendance/route.ts`
- `/api/attendance/summary/route.ts`
- `/api/attendance/stats/route.ts`

### 4. Mixed Responsibilities

Routes handle:
- Data retrieval
- Filtering
- Aggregation
- Business rules
- Response formatting

---

## ARCHITECTURAL WEAKNESSES

### Issue 1: No Separation Between Raw and Processed

**Current State:**
```
device_logs → [implicit processing] → attendance_sessions_v2
                                    ↓
                            student_attendance
                                    ↓
                            Reports (on-the-fly)
```

**Problem:** 
- Processing happens in controllers, not separated
- Cannot trace a log back to its processed attendance
- Hard to debug issues

### Issue 2: Tight Coupling Between Layers

**Current:**
```
API Route ↔ Database Tables
```

**Should be:**
```
API Route ↔ Service ↔ Repository ↔ Database
```

### Issue 3: No Idempotency in Processing

When processing device logs:
- No check if log already processed
- Duplicate attendance records possible
- No transaction safety

---

## RECOMMENDED MODULAR STRUCTURE

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API LAYER                               │
│  (Routes only handle HTTP, validation, auth)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   SERVICE LAYER                              │
│  AttendanceService, DeviceService, LogService              │
│  - Business logic                                          │
│  - Cross-cutting concerns                                  │
│  - Orchestration                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 REPOSITORY LAYER                            │
│  AttendanceRepository, DeviceRepository, LogRepository      │
│  - Data access                                             │
│  - Query building                                          │
│  - Index management                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 DATABASE LAYER                              │
│  Tables, Views, Stored Procedures                          │
└─────────────────────────────────────────────────────────────┘
```

### Service Layer Responsibilities

#### AttendanceService
```typescript
class AttendanceService {
  // Mark attendance (create/update)
  markAttendance(data: MarkAttendanceDTO): Promise<Attendance>
  
  // Process device logs → attendance
  processDeviceLogs(deviceId: number): Promise<ProcessingResult>
  
  // Get filtered attendance
  getAttendance(filters: AttendanceFilters): Promise<PaginatedResult>
  
  // Calculate statistics
  getStatistics(date: Date, filters: Filters): Promise<Stats>
}
```

#### DeviceService
```typescript
class DeviceService {
  // Manage devices
  registerDevice(data: DeviceDTO): Promise<Device>
  testConnection(device: DeviceDTO): Promise<ConnectionTest>
  
  // Sync operations
  syncDevice(deviceId: number): Promise<SyncResult>
  syncAllDevices(): Promise<void>
}
```

#### LogService
```typescript
class LogService {
  // Raw log operations
  ingestLogs(deviceId: number, rawLogs: RawLog[]): Promise<IngestResult>
  
  // Query logs (for debugging)
  queryLogs(filters: LogFilters): Promise<Log[]>
  
  // Export
  exportLogs(filters: LogFilters, format: 'csv' | 'json'): Promise<ExportResult>
}
```

---

## SPECIFIC RECOMMENDATIONS

### 1. Create Repository Pattern

Instead of direct database calls in routes:

```typescript
// Bad - current approach
export async function GET(req: NextRequest) {
  const connection = await getConnection();
  await connection.execute(`SELECT * FROM student_attendance...`);
}

// Good - repository pattern
export async function GET(req: NextRequest) {
  const attendance = await attendanceRepository.find(filters);
  return Response.json(attendance);
}
```

### 2. Separate Query Building

```typescript
// repositories/AttendanceRepository.ts
class AttendanceRepository {
  buildFilterQuery(filters: AttendanceFilters): QueryBuilder {
    let query = this.baseQuery;
    
    if (filters.date) {
      query = query.where('date', filters.date);
    }
    if (filters.classId) {
      query = query.join('students').where('class_id', filters.classId);
    }
    
    return query;
  }
}
```

### 3. Move Processing to Service

```typescript
// services/DeviceService.ts
async processDeviceLogs(deviceId: number): Promise<ProcessingResult> {
  // Get unprocessed logs
  const logs = await logRepository.findUnprocessed(deviceId);
  
  for (const log of logs) {
    // Determine user type and ID
    const user = await this.identifyUser(log.userIdentifier);
    
    // Determine attendance status based on rules
    const status = this.determineStatus(log.timestamp, user.type);
    
    // Create or update attendance
    await attendanceRepository.upsert({
      userId: user.id,
      userType: user.type,
      date: log.date,
      status
    });
    
    // Mark log as processed
    await logRepository.markProcessed(log.id);
  }
}
```

### 4. Add Transaction Support

```typescript
async processDeviceLogs(deviceId: number): Promise<ProcessingResult> {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    
    // All processing in transaction
    const logs = await logRepository.findUnprocessed(deviceId);
    // ... process logs
    
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
```

---

## SUMMARY OF ISSUES

| Issue | Impact | Priority |
|-------|--------|----------|
| No service layer | Hard to test, maintain | HIGH |
| Mixed filtering in controllers | Poor separation of concerns | HIGH |
| Duplicate processing logic | Code duplication, bugs | MEDIUM |
| No transaction safety | Data inconsistency | HIGH |
| On-the-fly report generation | Performance issues | MEDIUM |
| No repository pattern | Tight coupling | HIGH |

---

## SUGGESTED IMPROVEMENTS (HIGH-LEVEL)

1. **Create Service Layer**
   - Extract business logic from routes
   - Create AttendanceService, DeviceService, LogService

2. **Create Repository Layer**
   - Abstract database access
   - Build reusable query builders

3. **Add Transaction Support**
   - Ensure data consistency
   - Prevent duplicate processing

4. **Implement Caching**
   - Cache statistics
   - Use Redis for real-time data

5. **Create Background Jobs**
   - Move heavy processing to workers
   - Process logs asynchronously
