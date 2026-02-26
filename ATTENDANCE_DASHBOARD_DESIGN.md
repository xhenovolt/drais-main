# DRACE Attendance Dashboard - UI/UX Design

## Dashboard Architecture

The dashboard supports three primary user roles with role-specific views:

**Admin**: Full system visibility, manual entries, rules management
**Director**: School-wide reports, analytics
**Teacher**: Class-level attendance management

---

## 1. Main Attendance Dashboard

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  ATTENDANCE DASHBOARD                        [Date Picker] [...]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 📊 TODAY'S ATTENDANCE SUMMARY (Feb 20, 2026)            │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                                                            │  │
│  │  Total Strength     Present      Late        Absent       │  │
│  │      523            510          8           5            │  │
│  │     [100%]         [97.5%]      [1.5%]     [1%]          │  │
│  │                                                            │  │
│  │  Excused: 0 | On Leave: 0 | Pending: 0                  │  │
│  │                                                            │  │
│  │  📈 Attendance Rate: 98.5%                               │  │
│  │  ████████████████████████░░ (98.5%)                      │  │
│  │                                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🚪 REAL-TIME ARRIVALS (Live Feed)           [Auto-refresh]  │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  10:35 | Ahmed Ali (Gr-1A) | Main Entrance      ✓       │   │
│  │  10:32 | Fatima Hassan (Gr-1B) | Side Gate      ✓       │   │
│  │  10:28 | Hassan Mohamed (Gr-2A) | Main Entrance ✓       │   │
│  │  10:22 | Noor Abdullah (Gr-1C) | Main Entrance  ⚠ Late  │   │
│  │                                                           │   │
│  │  [Refresh] [Show More]                                   │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│                                                                   │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ ⚠️ LATE STUDENTS (8) │  │ ❌ ABSENT (5)        │             │
│  ├──────────────────────┤  ├──────────────────────┤             │
│  │ 1. Noor Abdullah     │  │ 1. Zainab Ali       │             │
│  │    08:15 (+15 min)   │  │    No scan recorded  │             │
│  │ 2. Samir Hassan      │  │ 2. Karim Mohammed   │             │
│  │    08:12 (+12 min)   │  │    No scan recorded  │             │
│  │ [View All]           │  │ [Take Action]        │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                   │
│  [Filters] [Export] [Print]                                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Top Summary Cards

```typescript
interface SummaryCard {
  id: string;
  title: string;
  value: number | string;
  percentage?: number;
  icon: string;
  color: 'success' | 'danger' | 'warning' | 'info';
  trend?: {
    direction: 'up' | 'down';
    percentage: number;
  };
  onClick?: () => void;
}

const summaryCards = [
  {
    id: 'total-strength',
    title: 'Total Strength',
    value: 523,
    icon: '👥',
    color: 'info'
  },
  {
    id: 'present',
    title: 'Present',
    value: 510,
    percentage: 97.5,
    icon: '✅',
    color: 'success'
  },
  {
    id: 'late',
    title: 'Late',
    value: 8,
    percentage: 1.5,
    icon: '⏰',
    color: 'warning'
  },
  {
    id: 'absent',
    title: 'Absent',
    value: 5,
    percentage: 1,
    icon: '❌',
    color: 'danger'
  }
];
```

#### 2. Real-time Arrivals Widget

```typescript
interface ArrivalRecord {
  id: string;
  timestamp: string;
  studentName: string;
  studentId: string;
  class: string;
  deviceLocation: string;
  status: 'on_time' | 'late';
  arrivalTime: string;
}

// WebSocket updates
ws.addEventListener('message', (event) => {
  const arrival: ArrivalRecord = JSON.parse(event.data);
  this.addToLiveArrivals(arrival);
  
  // Keep only last 20 arrivals
  if (this.arrivals.length > 20) {
    this.arrivals.shift();
  }
});
```

#### 3. Late Students Alert Panel

```typescript
interface LateAlert {
  id: string;
  studentName: string;
  studentId: string;
  class: string;
  rollNumber: number;
  arrivalTime: string;
  lateMinutes: number;
  actionable: boolean;
  actions: ['mark_excused' | 'mark_present' | 'note'];
}

// Quick actions
clickMarkExcused(alert: LateAlert) {
  this.manualAttendanceService.createEntry({
    person_id: alert.studentId,
    person_type: 'student',
    attendance_date: this.selectedDate,
    status: 'late',
    arrival_time: alert.arrivalTime,
    reason: '[User selects reason]'
  });
}
```

#### 4. Absent Students Alert Panel

```typescript
interface AbsentAlert {
  id: string;
  studentName: string;
  studentId: string;
  class: string;
  rollNumber: number;
  noShowTime: string;
  actionable: boolean;
  actions: ['mark_present' | 'mark_excused' | 'contact_parent'];
}

// Bulk actions
selectMultiple(alerts: AbsentAlert[]) {
  this.selectedAbsents = alerts;
  this.showBulkActionPanel = true;
}

bulkAction(action: 'mark_excused' | 'mark_absent_with_reason') {
  // Process all selected absentees
}
```

---

## 2. Class-Level Attendance View

### Class Attendance Card Component

```
┌──────────────────────────────────────────────────────────┐
│  CLASS: Grade 1 - Section A                  [Date: 20-2] │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Total Strength: 45                                      │
│  Present: 43 (95.6%) | Late: 1 (2.2%) | Absent: 1 (2.2%)│
│  ████████████████████░░░░░░░░░░░░░░ (95.6%)             │
│                                                           │
│  Class Teacher: Ahmed Ali                                │
│  Last Updated: 10:35 AM                                  │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ Roll | Name              | Status    | Arrival | Remarks│
│ ────────────────────────────────────────────────────────│
│  1   | Ahmed Ali         | ✓ Present | 07:45   | -      │
│  2   | Fatima Hassan     | ✓ Present | 07:50   | -      │
│  3   | Hassan Mohamed    | ⚠ Late    | 08:15   | +15min │
│  4   | Noor Abdullah     | ✓ Present | 07:55   | -      │
│  5   | Zainab Ali        | ❌ Absent | -       | -      │
│  ... | ...               | ...       | ...     | ...    │
│                                                           │
│  [Mark All Present] [View Details] [Open Seating]        │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Class Attendance Table Features

```typescript
interface ClassAttendanceRow {
  rollNumber: number;
  studentId: string;
  studentName: string;
  class: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  arrivalTime?: string;
  departureTime?: string;
  remarks?: string;
  
  // Real-time update capability
  isLiveUpdate?: boolean;
  deviceLocation?: string;
}

// Interactive features
- Click student row → View detailed attendance history
- Status indicator → Quick action menu (mark present/late/absent)
- Edit icon → Open manual entry dialog
- Right-click → Context menu (edit, view history, contact parent)

// Filters
filters = {
  status: ['present', 'late', 'absent', 'excused'],
  searchBy: 'name | roll_number | student_id',
  sortBy: ['status', 'arrival_time', 'name'],
  liveUpdate: true // Enable WebSocket updates
};
```

---

## 3. Student Attendance History View

### Individual Student Profile

```
┌─────────────────────────────────────────────────────────────────┐
│ STUDENT DETAILS                                    [Edit] [...]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Avatar]  Ahmed Ali                                             │
│            Student ID: STU-001                                   │
│            Admission #: 2023-0451                                │
│            Class: Grade 1 - Section A, Roll #: 1                │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ ATTENDANCE SUMMARY (February 2026)                               │
│                                                                   │
│  School Days: 20  │  Present: 19  │  Late: 1  │  Absent: 0     │
│  Attendance Rate: 95%                                            │
│  ██████████████████░░ (95%)                                     │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ ATTENDANCE CALENDAR (Feb 2026)                                   │
│                                                                   │
│  Mo | Tu | We | Th | Fr | Sa | Su                               │
│  ── | ── | ── | ── | ── | 1  |    ✓ Present                    │
│  2  | 3  | 4  | 5  | 6  | 7  | 8   ⚠ Late                       │
│  ✓  | ✓  | ✓  | ✓  | ✓  | ✓  | ✓   ❌ Absent                   │
│  9  | 10 | 11 | 12 | 13 | 14 | 15  ? Pending                    │
│  ✓  | ✓  | ✓  | ✓  | ✓  | ✓  | ✓   🔄 Excused                 │
│  16 | 17 | 18 | 19 | 20 | 21 | 22  📍 On Leave                 │
│  ✓  | ✓  | ✓  | ✓  | ⚠  | ✓  | -                               │
│     |    |    |    |    |    |                                   │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ DETAILED RECORDS (February 2026)                                 │
│                                                                   │
│ Date | Status    | Arrival | Departure | Device   | Notes       │
│ ──────────────────────────────────────────────────────────────  │
│ 2/1  | ✓ Present | 07:45   | 15:20     | Gate 1   | -           │
│ 2/2  | ✓ Present | 07:50   | 15:25     | Gate 1   | -           │
│ 2/3  | ⚠ Late    | 08:15   | 15:20     | Gate 1   | +15 minutes │
│ 2/4  | ✓ Present | 07:48   | 15:18     | Gate 1   | -           │
│ ...                                                               │
│                                                                   │
│ [Edit] [Mark As...] [Add Note] [Print Report]                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Manual Attendance Entry Modal

```
┌────────────────────────────────────────────────────┐
│ MARK ATTENDANCE MANUALLY                       [×]  │
├────────────────────────────────────────────────────┤
│                                                    │
│ Student: Ahmed Ali (STU-001)                       │
│ Class: Grade 1 - Section A                         │
│ Date: Feb 20, 2025                                 │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │ Status *                                       │ │
│ │ ┌────────────────────────────────────────────┐ │ │
│ │ │ ○ Present                                  │ │ │
│ │ │ ○ Late                                     │ │ │
│ │ │ ● Absent                                   │ │ │
│ │ │ ○ Excused                                  │ │ │
│ │ │ ○ On Leave                                 │ │ │
│ │ └────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ Override Type *                                    │
│ [Status Change ▼]                                 │
│                                                    │
│ ┌────────────────────────────────────────────────┐ │
│ │ Reason *                                       │ │
│ │ ┌────────────────────────────────────────────┐ │ │
│ │ │ [Medical appointment                      ] │ │ │
│ │ │ [Sick Leave                               ] │ │ │
│ │ │ [Family Emergency                         ] │ │ │
│ │ │ [Official Absence                         ] │ │ │
│ │ │ [Other ▼]                                  │ │ │
│ │ └────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ Arrival Time:  [08:30 ▼]  (optional)              │
│ Departure Time: [15:00 ▼] (optional)              │
│                                                    │
│ Notes:                                             │
│ ┌────────────────────────────────────────────────┐ │
│ │ Mother accompanied, had doctor's letter       │ │
│ │                                                │ │
│ └────────────────────────────────────────────────┘ │
│                                                    │
│ ☑ Notify Parent via SMS                            │
│                                                    │
│ ┌──────────────────┐  ┌─────────────────────────┐│
│ │    [Cancel]      │  │    ✓ Save Entry        ││
│ └──────────────────┘  └─────────────────────────┘│
│                                                    │
│ Previous status: Present (07:45 arriVal)           │
│ Changed by: Admin at 2026-02-20 11:15:00          │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Form Logic

```typescript
interface ManualAttendanceForm {
  studentId: string;
  studentName: string;
  attendanceDate: Date;
  
  // Form fields
  status: 'present' | 'late' | 'absent' | 'excused' | 'on_leave';
  overrideType: 'status_change' | 'new_entry' | 'excuse_update' | 'time_correction';
  reason: string;
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;
  notifyParent?: boolean;
  
  // Validation
  validation = {
    statusRequired: true,
    reasonRequired: true,
    if_late_then_arrivalTimeRequired: true,
    if_present_then_timesOptional: true
  };
  
  // On submit
  onSubmit() {
    if (this.validate()) {
      this.api.createManualEntry(this.toPayload()).then(() => {
        this.showSuccess('Attendance marked successfully');
        this.auditLog.record('Manual attendance entry created');
        if (this.notifyParent) {
          this.smsService.notifyParent(this.studentId);
        }
        this.closeModal();
      });
    }
  }
}
```

---

## 5. Filters & Search Panel

### Left Sidebar Filters

```
┌─────────────────────────────────┐
│ FILTERS                    [×]   │
├─────────────────────────────────┤
│                                 │
│ Date Range                      │
│ ┌───────────────────────────┐   │
│ │ From: [Feb 1, 2026   ▼]   │   │
│ │ To:   [Feb 20, 2026  ▼]   │   │
│ └───────────────────────────┘   │
│                                 │
│ Class                           │
│ ☑ Grade 1 - Section A           │
│ ☑ Grade 1 - Section B           │
│ ☐ Grade 1 - Section C           │
│ ☐ Grade 2 - Section A           │
│ [Show More]                     │
│                                 │
│ Status                          │
│ ☑ Present      (510)            │
│ ☑ Late         (8)              │
│ ☑ Absent       (5)              │
│ ☐ Excused      (0)              │
│ ☐ On Leave     (0)              │
│ ☐ Pending      (0)              │
│                                 │
│ Person Type                     │
│ ☑ Students     (523)            │
│ ☐ Teachers     (32)             │
│                                 │
│ Device Location                 │
│ ☑ Main Entrance (480)           │
│ ☑ Side Gate     (30)            │
│ ☐ Classroom Doors (3)           │
│                                 │
│ Manual Entry                    │
│ ☐ Show only manual entries     │
│ ☐ Show exclusions              │
│                                 │
│ ┌──────────┐  ┌──────────────┐ │
│ │[Reset]   │  │[Apply Filter]│ │
│ └──────────┘  └──────────────┘ │
│                                 │
│ [Search: Type name...]          │
│                                 │
└─────────────────────────────────┘
```

### Filter State

```typescript
interface AttendanceFilters {
  dateRange: {
    from: Date;
    to: Date;
  };
  
  classIds?: number[];
  statuses?: PickerValue<AttendanceStatus>[];
  personTypes?: ('student' | 'teacher')[];
  deviceLocations?: string[];
  includeManualEntries?: boolean;
  search?: string;
  
  // Sorting
  sortBy?: 'name' | 'arrival_time' | 'status';
  sortOrder?: 'asc' | 'desc';
  
  onApply() {
    this.dashboardService.applyFilters(this);
    this.refreshData();
  }
  
  onReset() {
    this.dateRange = getDefaultDateRange();
    this.classIds = [];
    this.statuses = ['present', 'late', 'absent'];
    this.apply();
  }
}
```

---

## 6. Export & Reporting

### Export Options Menu

```
┌────────────────────────────────┐
│ EXPORT                         │
├────────────────────────────────┤
│                                │
│ 📊 Export as:                 │
│                                │
│ ○ Excel (.xlsx)               │
│   - Attendance Summary         │
│   - Daily Details              │
│   - Student Records            │
│   - Late Report                │
│   - Absent Report              │
│                                │
│ ○ PDF Report                  │
│   - Auto-formatted report      │
│   - Include charts & graphs    │
│   - Include principal summary  │
│   - Watermarked               │
│                                │
│ ○ CSV (for import)             │
│   - Row format suitable for    │
│     Excel/Google Sheets        │
│                                │
│ ○ SMS Notification             │
│   - Send to parents            │
│   - Send to teachers           │
│   - Customizable message       │
│                                │
│ Include in Export:             │
│ ☑ Summary statistics           │
│ ☑ Detailed records             │
│ ☑ Student signatures           │
│ ☐ Biometric device logs        │
│ ☐ Audit trail                  │
│                                │
│ [Cancel]  [Generate] ➜         │
│                                │
└────────────────────────────────┘
```

---

## 7. Analytics Dashboard

### Attendance Trends View

```
┌─────────────────────────────────────────────────────────────┐
│ ATTENDANCE ANALYTICS                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Period: [Last 30 Days ▼]  Class: [All Classes ▼]            │
│                                                              │
│                                                              │
│  ATTENDANCE TREND (Daily)                                   │
│  100%│                                  ◆                   │
│   98%│      ◆    ◆    ◆         ◆    ◆ / \         ◆      │
│   96%│ ◆   / \  / \  / \  ◆   / \ / \ ◆   \  ◆     / \   │
│   94%│────────────────────────────────────────────────     │
│      │ 1  5  10  15  20  25  28                            │
│      └────────────────────────────────────────────────      │
│        (Days of February)                                    │
│                                                              │
│  Present ──  Late ──  Absent ──                             │
│                                                              │
│                                                              │
│  ATTENDANCE BY CLASS                                        │
│                                                              │
│  Grade 1-A: ████████████████████░░ 97.5%                   │
│  Grade 1-B: █████████████████░░░░░ 95.2%                   │
│  Grade 1-C: ██████████████████░░░░ 96.8%                   │
│  Grade 2-A: ███████████████████░░░ 96.0%                   │
│  Grade 2-B: ████████████████████░░ 97.3%                   │
│                                                              │
│                                                              │
│  TOP PERFORMERS (Attendance)                                │
│  1. Ahmed Ali (Grade 1-A)................... 100% (20/20)   │
│  2. Fatima Hassan (Grade 1-B)............... 95% (19/20)    │
│  3. Hassan Mohamed (Grade 1-C)............. 94% (18/19)     │
│                                                              │
│  NEEDS IMPROVEMENT                                           │
│  1. Zainab Ali (Grade 1-A).................. 75% (15/20)    │
│  2. Karim Mohammed (Grade 2-A)............. 80% (16/20)     │
│  3. Noor Abdullah (Grade 1-C)..............  85% (17/20)    │
│                                                              │
│ [View Detailed Report] [Export as PDF]                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. User Permissions by Role

```typescript
// Role-Based Access Control (RBAC)

const AttendancePermissions = {
  admin: {
    view: {
      dashboard: true,
      all_schools_data: true,
      raw_logs: true,
      audit_trail: true,
      detailed_history: true
    },
    edit: {
      manual_attendance: true,
      bulk_manual_entry: true,
      attendance_rules: true,
      device_mappings: true,
      device_configuration: true
    },
    delete: {
      manual_entries: true,
      device_users: true,
      logs: false // Never allow
    },
    export: {
      all_formats: true
    }
  },
  
  director: {
    view: {
      dashboard: true,
      school_data: true, // Only their school
      raw_logs: false,
      audit_trail: true,
      detailed_history: true
    },
    edit: {
      manual_attendance: true,
      bulk_manual_entry: true,
      attendance_rules: false, // Admin only
      device_mappings: false,
      device_configuration: false
    },
    delete: {
      manual_entries: false // Director can only view
    },
    export: {
      pdf: true,
      excel: true,
      csv: false
    }
  },
  
  teacher: {
    view: {
      dashboard: true,
      class_data_only: true,
      assigned_classes: true,
      raw_logs: false,
      audit_trail: false,
      detailed_history: false
    },
    edit: {
      manual_attendance: false, // Teachers can only view
      bulk_manual_entry: false,
      attendance_rules: false,
      device_mappings: false,
      device_configuration: false
    },
    delete: {}  // No delete permissions
    },
    export: {
      class_report: true,
      pdf: true
    }
  }
};
```

---

## 9. Mobile Responsive Design

### Mobile Dashboard Layout (Stack View)

```
Mobile (< 768px)
┌──────────────────────────┐
│ TODAY'S ATTENDANCE   [☰]  │
├──────────────────────────┤
│                          │
│ Present: 510             │
│ 97.5%                    │
│ ████████████░ (97.5%)    │
│                          │
│ Late: 8                  │
│ ⏰ [View Late Students]   │
│                          │
│ Absent: 5                │
│ ❌ [Take Action]         │
│                          │
├──────────────────────────┤
│ REAL-TIME ARRIVALS       │
│                          │
│ 10:35 | Ahmed Ali        │
│       | Gr-1A            │
│                          │
│ 10:32 | Fatima Hassan    │
│       | Gr-1B            │
│                          │
│ [Refresh]                │
│                          │
├──────────────────────────┤
│ [⚙ Filters]              │
│ [📊 Analytics]           │
│ [↓ Export]               │
│                          │
└──────────────────────────┘
```

---

## 10. Notification System

### Real-time Notifications

```typescript
interface DashboardNotification {
  id: string;
  type: 'arrival' | 'manual_entry' | 'alert' | 'system';
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  dismissible: boolean;
  
  // Optional actions
  actions?: {
    label: string;
    onClick: () => void;
  }[];
  
  // Auto-dismiss after seconds
  autoDismissAfter?: number;
}

// Examples:
{
  type: 'arrival',
  severity: 'info',
  title: 'Student Arrived',
  message: 'Ahmed Ali (Grade 1-A) arrived at 07:45',
  timestamp: now(),
  autoDismissAfter: 30
}

{
  type: 'alert',
  severity: 'warning',
  title: 'Device Offline',
  message: 'Gate 2 device has been offline for 30 minutes',
  timestamp: now(),
  dismissible: true,
  actions: [{
    label: 'View Device',
    onClick: () => this.viewDeviceStatus()
  }]
}

{
  type: 'manual_entry',
  severity: 'info',
  title: 'Attendance Updated',
  message: 'Ahmed Ali marked as late by Admin User',
  timestamp: now(),
  actions: [{
    label: 'Undo',
    onClick: () => this.undoManualEntry()
  }]
}
```

---

This dashboard design ensures:
✅ Real-time attendance visibility
✅ Quick action capabilities
✅ Role-based access control
✅ Mobile responsiveness
✅ Comprehensive reporting
✅ User-friendly interface
✅ Accessibility compliance
