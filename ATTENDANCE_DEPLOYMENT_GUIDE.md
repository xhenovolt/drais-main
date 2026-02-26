# DRACE Attendance System - Implementation & Deployment Guide

## Overview

This guide provides step-by-step instructions for implementing and deploying the DRACE Attendance Management System across the platform.

---

## Phase 1: Pre-Implementation Planning (Week 1-2)

### 1.1 Infrastructure Setup

```bash
# Infrastructure checklist
- [ ] Database server (PostgreSQL/MySQL)
  - Primary: 10+ GB storage
  - Replicas: For read-heavy operations
  - Backup: Daily encrypted backups

- [ ] Redis cluster (Caching & Queue)
  - 3-node cluster for HA
  - 64GB+ memory for queue and cache
  - Persistence: RDB + AOF

- [ ] Message Queue (RabbitMQ/Redis Streams)
  - 10k+ messages/sec capacity
  - Persistent message storage
  - Dead letter queue for errors

- [ ] API Server Infrastructure
  - Load balancer (Nginx/HAProxy)
  - 4+ API server instances
  - Auto-scaling on CPU > 70%

- [ ] Storage (for logs, exports, reports)
  - S3-compatible storage
  - Versioning enabled
  - Lifecycle policies for cost optimization

- [ ] Monitoring & Observability
  - Prometheus + Grafana
  - ELK Stack for logs
  - Jaeger for distributed tracing
```

### 1.2 Team Alignment

```
Backend Team:
- Database schema implementation
- API endpoints development
- Processing logic implementation
- Device adapter development

Frontend Team:
- Dashboard UI implementation
- Mobile responsive design
- Real-time WebSocket implementation
- Reporting interfaces

DevOps Team:
- Infrastructure setup
- CI/CD pipeline
- Monitoring & alerting
- Backup & disaster recovery

QA Team:
- Test case creation (1000+ tests)
- Performance testing (1M+ logs)
- Security testing
- Device integration testing
```

---

## Phase 2: Database Implementation (Week 3-4)

### 2.1 Database Setup

```sql
-- 1. Initialize database
CREATE DATABASE drace_attendance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Run schema script (ATTENDANCE_SCHEMA.sql)
mysql -u root -p drace_attendance < ATTENDANCE_SCHEMA.sql

-- 3. Create indexes for performance
CREATE INDEX idx_attendance_logs_composite 
ON attendance_logs(school_id, scan_timestamp, device_user_id);

CREATE INDEX idx_daily_attendance_school_date
ON daily_attendance(school_id, attendance_date);

-- 4. Set up partitioning for attendance_logs
-- Run quarterly maintenance job to add new partitions

-- 5. Configure replication
-- Set up master-slave replication for read replicas

-- 6. Initialize audit trail
INSERT INTO audit_logs (entity_type, change_type, user_id, timestamp)
VALUES ('system', 'database_initialized', NULL, NOW());
```

### 2.2 Sample Data for Testing

```sql
-- Insert test schools
INSERT INTO schools (tenant_id, school_code, school_name, timezone)
VALUES 
  (1, 'TEST_SCH_001', 'Test School 1', 'Asia/Riyadh'),
  (1, 'TEST_SCH_002', 'Test School 2', 'Asia/Riyadh');

-- Insert test devices
INSERT INTO biometric_devices (school_id, device_id, device_brand, device_type, location_name)
VALUES 
  (1, 'DEV_001', 'ZKTeco', 'fingerprint', 'Main Entrance'),
  (1, 'DEV_002', 'ZKTeco', 'fingerprint', 'Side Gate'),
  (2, 'DEV_003', 'U-Attendance', 'fingerprint', 'Main Entrance');

-- Insert test students
INSERT INTO students (school_id, student_id_number, first_name, last_name, class_id, status)
VALUES
  (1, 'STU-001', 'Ahmed', 'Ali', 1, 'enrolled'),
  (1, 'STU-002', 'Fatima', 'Hassan', 1, 'enrolled');

-- Insert device mappings
INSERT INTO device_users (school_id, device_user_id, person_type, person_id, is_enrolled)
VALUES
  (1, 1001, 'student', 1, TRUE),
  (1, 1002, 'student', 2, TRUE);
```

---

## Phase 3: Backend Implementation (Week 5-8)

### 3.1 Project Structure

```
src/
├── api/
│   ├── routes/
│   │   ├── devices.ts
│   │   ├── device-users.ts
│   │   ├── attendance-logs.ts
│   │   ├── daily-attendance.ts
│   │   ├── manual-entries.ts
│   │   ├── attendance-rules.ts
│   │   └── analytics.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── validation.ts
│   │   ├── permissions.ts
│   │   └── error-handler.ts
│   └── controllers/
│       ├── attendance.controller.ts
│       ├── device.controller.ts
│       └── manual-entry.controller.ts
│
├── services/
│   ├── attendance-processing.service.ts
│   ├── device-adapter.service.ts
│   ├── device-polling.service.ts
│   ├── attendance-calculation.service.ts
│   ├── rule-engine.service.ts
│   └── audit.service.ts
│
├── adapters/
│   ├── device-adapter.interface.ts
│   ├── zkteco-adapter.ts
│   ├── u-attendance-adapter.ts
│   ├── hid-global-adapter.ts
│   └── adapter-factory.ts
│
├── queue/
│   ├── log-processor.worker.ts
│   ├── attendance-calculator.worker.ts
│   └── queue-manager.ts
│
├── database/
│   ├── models/
│   │   ├── school.model.ts
│   │   ├── student.model.ts
│   │   ├── attendance-log.model.ts
│   │   └── daily-attendance.model.ts
│   ├── migrations/
│   │   ├── 001-initial-schema.ts
│   │   ├── 002-add-partitioning.ts
│   │   └── ...
│   └── seeds/
│       └── test-data.ts
│
├── utils/
│   ├── logger.ts
│   ├── cache.ts
│   ├── validators.ts
│   └── helpers.ts
│
├── config/
│   ├── database.ts
│   ├── redis.ts
│   ├── queue.ts
│   └── adapters.tsx
│
└── app.ts (Express/Fastify app)
```

### 3.2 Core Service Implementation

```typescript
// src/services/attendance-calculation.service.ts

import { AttendanceRulesService } from './attendance-rules.service';
import { CacheService } from '../utils/cache';
import { Logger } from '../utils/logger';

export class AttendanceCalculationService {
  constructor(
    private rulesService: AttendanceRulesService,
    private cache: CacheService,
    private logger: Logger
  ) {}

  async calculateDailyAttendance(
    schoolId: string,
    personId: string,
    personType: 'student' | 'teacher',
    date: Date
  ): Promise<DailyAttendance> {
    const cacheKey = `attendance:${schoolId}:${personType}:${personId}:${date.toDateString()}`;
    
    // Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      // 1. Get applicable rules
      const rule = await this.rulesService.getApplicableRule(schoolId, personType);
      
      // 2. Fetch device logs
      const logs = await this.getValidScans(
        schoolId,
        personId,
        personType,
        date
      );

      // 3. Calculate attendance
      const attendance = this.processLogs(logs, rule, personId, personType, date);

      // 4. Check for manual overrides
      const manualEntry = await this.getManualOverride(
        schoolId,
        personId,
        personType,
        date
      );

      if (manualEntry) {
        return this.applyManualOverride(attendance, manualEntry);
      }

      // 5. Cache result (24 hour TTL)
      await this.cache.set(cacheKey, JSON.stringify(attendance), 86400);

      // 6. Save to database
      await this.saveAttendanceRecord(attendance);

      return attendance;

    } catch (error) {
      this.logger.error(`Attendance calculation failed: ${error.message}`);
      throw error;
    }
  }

  private async getValidScans(
    schoolId: string,
    personId: string,
    personType: 'student' | 'teacher',
    date: Date
  ): Promise<BiometricLog[]> {
    // Fetch from database
    return await db.query('attendance_logs')
      .select()
      .where('school_id', schoolId)
      .where('person_type', personType)
      .where('person_id', personId)
      .where(db.raw('DATE(scan_timestamp) = ?', [date]))
      .where('is_duplicate', false)
      .where('verification_status', 'success')
      .orderBy('scan_timestamp', 'asc');
  }

  private processLogs(
    logs: BiometricLog[],
    rule: AttendanceRule,
    personId: string,
    personType: string,
    date: Date
  ): DailyAttendance {
    const attendance: DailyAttendance = {
      school_id: rule.school_id,
      person_id: parseInt(personId),
      person_type: personType,
      attendance_date: date,
      status: 'absent',
      first_arrival_time: null,
      last_departure_time: null,
      is_late: false,
      late_minutes: 0,
      marking_rule_id: rule.id,
      created_at: new Date()
    };

    if (logs.length === 0) {
      return attendance;
    }

    const firstScan = logs[0];
    const firstTime = this.extractTime(firstScan.scan_timestamp);

    // Check arrival
    if (this.isBetween(firstTime, rule.arrival_start_time, rule.arrival_end_time)) {
      attendance.status = 'present';
      attendance.first_arrival_time = firstTime;
      attendance.is_late = false;
    } else if (
      this.isAfter(firstTime, rule.arrival_end_time) &&
      this.isBefore(firstTime, rule.absence_cutoff_time)
    ) {
      attendance.status = 'late';
      attendance.first_arrival_time = firstTime;
      attendance.is_late = true;
      attendance.late_minutes = this.minutesBetween(
        rule.arrival_end_time,
        firstTime
      );
    } else if (this.isAfter(firstTime, rule.absence_cutoff_time)) {
      attendance.status = 'absent';
    }

    // Check departure
    const lastScan = logs[logs.length - 1];
    const lastTime = this.extractTime(lastScan.scan_timestamp);
    
    if (this.isAfter(lastTime, rule.closing_time)) {
      attendance.last_departure_time = lastTime;
    }

    return attendance;
  }

  private async getManualOverride(
    schoolId: string,
    personId: string,
    personType: string,
    date: Date
  ): Promise<ManualAttendanceEntry | null> {
    return await db.query('manual_attendance_entries')
      .where('school_id', schoolId)
      .where('person_id', personId)
      .where('person_type', personType)
      .where('attendance_date', date)
      .where('deleted_at', null)
      .first();
  }

  private applyManualOverride(
    attendance: DailyAttendance,
    manual: ManualAttendanceEntry
  ): DailyAttendance {
    return {
      ...attendance,
      status: manual.status,
      first_arrival_time: manual.arrival_time,
      last_departure_time: manual.departure_time,
      is_manual_entry: true,
      manual_entry_id: manual.id,
      updated_at: new Date()
    };
  }

  private async saveAttendanceRecord(attendance: DailyAttendance): Promise<void> {
    await db.query('daily_attendance')
      .insert(attendance)
      .onConflict(['school_id', 'person_type', 'person_id', 'attendance_date'])
      .merge();
  }

  // Helper methods...
}
```

---

## Phase 4: Testing (Week 9-10)

### 4.1 Test Suite

```typescript
// tests/attendance.calculation.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { AttendanceCalculationService } from '../src/services/AttendanceCalculationService';

describe('AttendanceCalculationService', () => {
  let service: AttendanceCalculationService;

  beforeEach(() => {
    // Setup test fixtures
  });

  it('should mark present if scan within arrival window', () => {
    // Test implementation
  });

  it('should mark late if scan after arrival window', () => {
    // Test implementation
  });

  it('should mark absent if no scans', () => {
    // Test implementation
  });
});
```

### 4.2 Performance Testing

```bash
# Load test: 1M logs processed
k6 run load-test.js

# Database query performance
EXPLAIN ANALYZE SELECT * FROM daily_attendance 
WHERE school_id = 1 AND attendance_date = '2026-02-20';

# API response time
wrk -t12 -c400 -d30s https://api.drace.io/v1/schools/1/attendance
```

---

## Phase 5: Deployment (Week 11)

### 5.1 Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

EXPOSE 3000
CMD ["node", "dist/app.js"]
```

### 5.2 Kubernetes Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: drace-attendance-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: drace-attendance-api
  template:
    metadata:
      labels:
        app: drace-attendance-api
    spec:
      containers:
      - name: api
        image: drace-attendance:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
```

---

## Post-Deployment Checklist

- [ ] All systems operational
- [ ] Monitoring and alerting active
- [ ] Backup procedures verified
- [ ] Team trained
- [ ] Documentation complete
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] User acceptance testing passed

---

This implementation guide ensures:
✅ Structured 14-week deployment
✅ Clear team responsibilities
✅ Quality at each phase
✅ Production-ready infrastructure
✅ Scalability to 100+ schools
✅ Enterprise reliability
