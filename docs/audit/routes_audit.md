# Routes Audit - Phase 1

## Overview
This document audits all HTTP routes in the DRAIS system, identifying structure, redundancies, and architectural issues.

---

## ATTENDANCE ROUTES

### Core Attendance Routes

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance` | GET, POST | Main attendance CRUD | Too much logic in single route |
| `/api/attendance/list` | GET | List attendance | Likely redundant - same as main route |
| `/api/attendance/stats` | GET | Get attendance statistics | Okay |
| `/api/attendance/summary` | GET | Attendance summary dashboard | Okay |
| `/api/attendance/export` | GET | Export attendance | Okay |
| `/api/attendance/mark` | POST | Mark attendance | Should be part of main route |
| `/api/attendance/bulk-mark` | POST | Bulk mark attendance | Okay |

### Session Management

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance/sessions` | GET, POST | List/create sessions | Good separation |
| `/api/attendance/sessions/[id]` | GET, PUT, DELETE | Single session management | Good |

### Student-Specific

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance/students` | GET | List student attendance | Redundant - filtering can be done in main |
| `/api/attendance/student/[id]` | GET, POST | Student-specific attendance | Good separation |

### Sign-In/Out

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance/signin` | POST | Record sign-in | Should be part of main attendance |
| `/api/attendance/signout` | POST | Record sign-out | Should be part of main attendance |

### Biometric Routes

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance/biometric` | POST | Biometric attendance marking | Good |
| `/api/attendance/biometric/sync` | POST | Sync biometric logs | Good |

### Dahua Device Routes (DUPLICATE STRUCTURE)

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance/dahua` | GET, POST | Dahua devices | Duplicates biometric-devices |
| `/api/attendance/dahua/[id]` | GET, PUT, DELETE | Single Dahua device | Duplicates generic device |
| `/api/attendance/dahua/[id]/sync` | POST | Trigger sync | Duplicates sync API |
| `/api/attendance/dahua/[id]/logs` | GET | Get device logs | Duplicates unified logs |

### New Unified Device Routes

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance/devices` | GET, POST | Unified device management | Good - but duplicates biometric-devices |
| `/api/attendance/devices/[id]` | GET, PUT, DELETE | Single device | Good |
| `/api/attendance/devices/test-connection` | POST | Test device connectivity | Good |
| `/api/attendance/devices/logs` | GET, POST | Device logs with export | Good - proper separation |

### Generic Biometric Devices

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/biometric-devices` | GET, POST | Generic biometric devices | Duplicates dahua and new devices API |

### Reports & Reconciliation

| Route | Methods | Purpose | Issues |
|-------|---------|---------|--------|
| `/api/attendance/reports` | GET, POST | Generate reports | Okay |
| `/api/attendance/reconcile` | GET, POST, PATCH | Reconcile manual vs biometric | Good |

---

## REDUNDANT ROUTES IDENTIFIED

### Attendance Module Redundancy

1. **`/api/attendance` vs `/api/attendance/list`** - These do the same thing
2. **`/api/attendance/signin` & `/api/attendance/signout`** - Should be merged into `/api/attendance`
3. **`/api/attendance/students`** - Redundant filtering, can use query params on main route

### Device Module Redundancy (CRITICAL)

**Three separate device APIs exist:**

1. **`/api/biometric-devices`** - Generic biometric devices
2. **`/api/attendance/dahua`** - Dahua-specific devices
3. **`/api/attendance/devices`** - New unified devices (recently added)

All three manage the same concept (biometric devices) with different schemas.

### Student Routes Redundancy

- `/api/students/[id]/fingerprint` vs `/api/fingerprints` 
- Multiple fingerprint capture/verify endpoints

---

## POOR REST STRUCTURE ISSUES

### 1. Duplicated Functionality
- Multiple routes handling attendance CRUD
- Three device management APIs

### 2. Inconsistent Naming
- Some use kebab-case: `bulk-mark`, `sign-in`
- Some use camelCase: `bulkAssign`

### 3. Routes Doing Too Much
- `/api/attendance` handles GET, POST, multiple filters
- Should be split into `/api/attendance/list` and `/api/attendance/mark`

### 4. Missing Proper Nesting
- Devices should be nested: `/api/devices/[id]/logs` not `/api/attendance/devices/logs`

---

## CURL EXAMPLES & EXPECTED BEHAVIORS

### Attendance Routes

```bash
# Get attendance list
curl -X GET "http://localhost:3000/api/attendance?date=2024-01-15&class_id=1"

# Mark attendance
curl -X POST "http://localhost:3000/api/attendance" \
  -H "Content-Type: application/json" \
  -d '{"student_id": 1, "date": "2024-01-15", "status": "present"}'

# Get sessions
curl -X GET "http://localhost:3000/api/attendance/sessions"

# Biometric sign-in
curl -X POST "http://localhost:3000/api/attendance/signin" \
  -H "Content-Type: application/json" \
  -d '{"student_id": 1, "timestamp": "2024-01-15T07:30:00Z"}'
```

### Device Routes

```bash
# Get all devices (NEW unified)
curl -X GET "http://localhost:3000/api/attendance/devices"

# Test connection
curl -X POST "http://localhost:3000/api/attendance/devices/test-connection" \
  -H "Content-Type: application/json" \
  -d '{"device_type": "dahua", "ip_address": "192.168.1.100", "port": 80}'

# Get device logs
curl -X GET "http://localhost:3000/api/attendance/devices/logs?start_date=2024-01-15&end_date=2024-01-15"

# Trigger Dahua sync (OLD)
curl -X POST "http://localhost:3000/api/attendance/dahua/1/sync"
```

---

## BROKEN/EMPTY ROUTES IDENTIFIED

| Route | File | Status |
|-------|------|--------|
| `/api/attendance/schema-update.sql` | route.ts | Empty file (0 bytes) |
| `/api/staff/attendance.ts` | route.ts | Empty file |
| `/api/staff/list.ts` | route.ts | Empty file |

---

## RECOMMENDATIONS

1. **Consolidate device APIs**: Merge `biometric-devices`, `dahua`, and `devices` into single API with `device_type` field

2. **Clean up attendance routes**: 
   - Keep only `/api/attendance` (GET list, POST mark)
   - Move signin/signout to sub-resources or merge into main

3. **Fix empty routes**: Delete or implement the empty route files

4. **Consistent naming**: Standardize on kebab-case for all routes

5. **Proper nesting**: 
   - `/api/devices/[id]/logs` instead of `/api/attendance/devices/logs`
   - `/api/attendance/[id]/sessions` for session management
