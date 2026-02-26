# DRACE Attendance Management System - Architecture Design

## Overview

A scalable, production-level attendance system designed to serve 100+ schools with biometric device integration and manual override capabilities.

## System Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│          Dashboard & Reporting Layer                         │
│  (Web UI, Mobile App, Analytics, Reports)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│        Attendance Query & Retrieval Layer                    │
│  (REST API, GraphQL, Real-time WebSocket)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│      Manual Attendance Entry Layer (Override Logic)          │
│  (Admin Input, Excuse Management, Audit Tracking)           │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│    Attendance Processing Layer (Business Logic)              │
│  • Rule Engine (school-specific rules)                       │
│  • Status Computation (Present/Late/Absent)                  │
│  • Duplicate Detection & Filtering                           │
│  • Excused Absence Handling                                  │
│  • Recalculation Jobs                                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│    Raw Logs Layer (Device Events)                            │
│  • Device Log Ingestion (Polling/Push)                       │
│  • Queue Processing (RabbitMQ/Redis)                         │
│  • Offline Mode & Sync                                       │
│  • Duplicate Detection                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│       Data Persistence Layer (Database)                      │
│  • Raw Logs Storage                                          │
│  • Daily Attendance Records                                  │
│  • Manual Entries & Audit Trail                              │
│  • Rules Configuration                                       │
│  • Device Mappings                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│    Integration & Device Layer                                │
│  • Device Adapter Pattern (HID, ZKTeco, U-Attendance, etc.)  │
│  • Webhook Receivers                                         │
│  • Device Polling Service                                    │
│  • Log Sync Manager                                          │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Patterns

### 1. Adapter Pattern for Device Integration
- Abstract device interface
- Implement adapters for each device brand
- Easy to add new biometric device support

### 2. Event Sourcing for Attendance
- All events immutably stored
- Replayable logs allow rule recalculation
- Complete audit trail

### 3. Rule Engine Pattern
- School-specific rules stored in database
- Dynamic rule evaluation
- Configurable without code changes

### 4. Transactional Outbox Pattern
- Reliable event publishing
- Ensures consistency between logs and processing

### 5. CQRS for Read/Write Separation
- Write attendance logs to permanent store
- Read from denormalized daily_attendance
- Optimize queries independently

## Data Flow

### Fingerprint Device Path
```
Device → API/Polling → Queue → Log Processor → 
Daily Attendance Calculator → database → API → Dashboard
```

### Manual Entry Path
```
Admin UI → API → Validation → 
Manual Entry Storage → Audit Log → 
Daily Attendance Override → Dashboard
```

## Scalability Considerations

### Database Optimization
- Hour-based partitioning on attendance_logs
- Composite indexes for (school_id, scan_timestamp, device_user_id)
- Materialized views for dashboards
- Read replicas for analytics

### Processing Optimization
- Batch process logs in 5-minute windows
- Async processing with job queue
- Distributed processing for rule recalculation
- Cache daily_attendance results

### Caching Strategy
- Redis: Session cache, temporary locks during processing
- Application-level: Rule cache (evict on rule update)
- CDN: Static dashboard assets

### API Rate Limiting
- Per-school quota per minute
- Device API: High quota (1000+ logs/min)
- Manual entry: Moderate quota (100 entries/min)
- Dashboard queries: Standard quota

## Security Considerations

### Data Protection
- School data isolation (tenant separation)
- Encrypted device_user_id mapping
- HTTPS for all device communications
- JWT for API authentication

### Audit Trail
- Every manual edit logged with user info
- Timestamp of changes
- IP address of editor
- Reason for edit
- Ability to view audit history

### Access Control
- Role-based permissions (Admin, Teacher, Director)
- Restrict manual edits based on role
- Prevent self-enrollment deletion

### Data Validation
- Device_user_id mapping validation
- Duplicate fingerprint detection
- Anomaly detection (impossible scan times)

## Integration Points

### Device Integration
- **Polling**: Cron job pulls device logs every 5 minutes
- **Push**: Webhook endpoint receives logs in real-time
- **Offline Sync**: Device stores logs locally, syncs when online

### Third-party Integration
- **HR Systems**: Bulk import student/teacher data
- **SMS Gateway**: Send attendance alerts
- **Email**: Send daily attendance reports
- **Analytics**: Send attendance data to BI tools

## Deployment Architecture

### Services
1. **API Server** (Node.js/Django/FastAPI)
   - REST API endpoints
   - Manual entry processing
   - Authentication

2. **Job Queue Worker** (Redis Queue/Celery)
   - Log processing
   - Daily attendance calculation
   - Rule recalculation jobs

3. **Device Adapter Service** (Node.js)
   - Device polling
   - Webhook receivers
   - Log sync manager

4. **Analytics Service** (Optional)
   - Dashboard data aggregation
   - Report generation
   - Real-time metrics

5. **Audit Service**
   - Manual entry logging
   - Access log tracking

### Database
- **Primary**: PostgreSQL or MySQL
- **Cache**: Redis
- **Message Queue**: RabbitMQ or Redis Streams

### Monitoring
- API response times
- Log processing latency
- Daily attendance calculation time
- Device sync health
- Error rates by school

---

## Next Steps
See separate files for:
1. [Database Schema](ATTENDANCE_SCHEMA.sql)
2. [API Endpoints Documentation](ATTENDANCE_API_DESIGN.md)
3. [Attendance Processing Algorithm](ATTENDANCE_PROCESSING_LOGIC.md)
4. [Dashboard UI Structure](ATTENDANCE_DASHBOARD_DESIGN.md)
5. [Role-Based Permissions](ATTENDANCE_RBAC.md)
6. [Integration & Device Adapter Guide](ATTENDANCE_INTEGRATION.md)
