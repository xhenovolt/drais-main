# Attendance UI & API Analysis — DRAIS
_Generated: April 17, 2026_

## Current API Surface (`/api/attendance/*`)

| Route | What it does | Data source | Gap |
|---|---|---|---|
| `GET /api/attendance/stats` | Today's present/absent/late counts | `student_attendance` (EMPTY) | Returns all zeros |
| `GET /api/attendance/list` | Students + status for a date/class | `student_attendance` (EMPTY) | Shows all as unmarked |
| `GET /api/attendance/summary` | Period summary (daily/weekly/monthly) | `student_attendance` (EMPTY) | Returns zeros |
| `GET /api/attendance/reports` | Report generation | `student_attendance` (EMPTY) | No real data |
| `GET /api/attendance/zk/logs` | Raw ZK device logs | `zk_attendance_logs` (LIVE) | No student intelligence |
| `GET /api/attendance/zk/reports` | ZK-specific reports | `zk_attendance_logs` | Basic counts only |
| `GET /api/attendance/zk/dashboard` | ZK dashboard overview | `zk_attendance_logs` | Device-centric, not student-centric |
| `POST /api/attendance/mark` | Manual mark attendance | `student_attendance` | Works but no data yet |
| `POST /api/attendance/bulk-mark` | Bulk mark for class | `student_attendance` | Works but no data yet |
| `GET /api/attendance/devices/*` | Device management | ZK device connection | Operational only |
| `GET /api/analytics/attendance` | Analytics endpoint | `student_attendance` (EMPTY) | Returns zeros |

---

## Current Frontend Pages

### `/attendance/page.tsx`
- Main attendance dashboard
- Shows class selector + date picker
- Calls `/api/attendance/list` → all students show "not marked" (table empty)
- **Gap:** Static view, no trends

### `/attendance/logs/page.tsx`
- ZK scan logs viewer
- Shows raw biometric scans from `zk_attendance_logs`
- **Gap:** Device-level view, no student intelligence

### `/attendance/devices/page.tsx`
- Device management (ZK devices)
- Connection status, sync controls
- **Gap:** Operational only, no analytics

### `/attendance/settings/page.tsx`
- Attendance rules configuration
- **Gap:** Rules defined but not enforced (processing pipeline not running)

---

## Current Calculation Method

```typescript
// /api/attendance/stats/route.ts
const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
// Joins students → enrollments LEFT JOIN student_attendance
// Since student_attendance is EMPTY, present = 0 always
```

**Result:** All attendance % values show as 0% or "not marked" across the entire frontend.

---

## What's Missing

### ❌ No Trend Analysis
- No week-over-week comparison
- No monthly aggregation with direction
- No "attendance is declining" signal anywhere

### ❌ No Historical Comparison  
- No term-to-term attendance comparison
- No "was attendance better last term?" view
- No longitudinal student attendance profile

### ❌ No Performance Correlation
- No linkage between attendance % and exam scores
- No "students who attend more score higher" insight
- No "high attender but low performer" detection (hidden issue signal)

### ❌ No Risk Detection
- No consecutive absence detection
- No "student hasn't been scanned for 5 days" alert
- No irregular pattern flagging

### ❌ Purely Static Reporting
- Date-picker shows a single day snapshot
- No rolling averages or trend lines
- No predictive signal ("at this attendance rate, this student is at risk")

### ❌ ZK Data Not Converted to Attendance
- 592 biometric scans in `zk_attendance_logs` NOT processed into `student_attendance`
- All attendance UIs show 0% because they read the wrong (empty) table
- The ZK dashboard exists but is device-centric, not student-centric

---

## Existing Components

### `src/components/attendance/AttendanceDashboard.tsx`
- Large component with tabs: Overview, Sessions, Reports
- Reads from `student_attendance` (empty) → shows no data
- Has chart skeleton but no real charting

### `src/components/analytics/AttendanceAnalytics.tsx`
- Reads from `/api/analytics/attendance`
- Source: `student_attendance` (empty) → no data

### `src/components/dashboard/AttendanceToday.tsx`
- Shows today's attendance on dashboard
- Reads from `/api/attendance/stats` → always 0

---

## Intelligence Gaps Summary

| Capability | Current Status | Priority |
|---|---|---|
| Daily presence count (per school day) | ❌ Missing | High |
| Week-over-week trend | ❌ Missing | High |
| At-risk student list | ❌ Missing | Critical |
| Consecutive absence detection | ❌ Missing | Critical |
| Attendance-performance correlation | ❌ Missing | Critical |
| Class-level attendance ranking | ❌ Missing | High |
| Biometric match rate | ❌ Missing | Medium |
| Historical term comparison | ❌ Missing | Medium |

---

## Proposed Intelligence Layer

Build on `zk_attendance_logs` directly (bypassing empty canonical tables):

```
/api/intelligence/attendance-overview    → school-wide summary from ZK logs
/api/intelligence/attendance-trends      → daily/weekly breakdown + direction
/api/intelligence/attendance-risk        → per-student risk flags
/api/intelligence/attendance-performance-correlation → score vs attendance quartiles
```

This makes DRAIS an **early warning system** rather than a register.
