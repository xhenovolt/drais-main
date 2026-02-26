# DRACE Attendance System - Role-Based Permissions & RBAC

## Overview

The DRACE attendance system implements a comprehensive Role-Based Access Control (RBAC) system with 6 user roles supporting multi-tenant SaaS architecture.

---

## 1. Role Hierarchy

```
┌─────────────────────────────────────────────────┐
│            SYSTEM ADMIN (Platform)              │
│  • Manages all schools                          │
│  • System configuration & maintenance           │
│  • Billing & subscriptions                      │
└──────────────────────┬──────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌────▼────────┐
│ ADMIN        │ │ DIRECTOR │ │ HR MANAGER  │
│ (School)     │ │ (School) │ │ (School)    │
└──────────────┘ └──────────┘ └─────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌────▼────────┐
│ TEACHER      │ │ PARENT   │ │ STAFF       │
│ (Class)      │ │ (Student)│ │ (Department)│
└──────────────┘ └──────────┘ └─────────────┘
```

---

## 2. Detailed Permissions Matrix

### 2.1 SYSTEM ADMIN
**Scope**: All schools & data

```typescript
const SystemAdminPermissions = {
  schools: {
    create: true,
    read: true,
    update: true,
    delete: true,
    list_all: true,
    billing: true,
    subscription_management: true
  },
  
  attendance: {
    view: {
      all_schools_data: true,
      raw_device_logs: true,
      system_logs: true,
      audit_trail: true,
      analytics_all_schools: true,
      processing_queue: true,
      error_logs: true
    },
    
    edit: {
      configure_rules: true, // Override school rules
      manual_attendance: true,
      modify_raw_logs: true, // Should be restricted, needs audit
      system_configuration: true
    },
    
    delete: {
      schools_attendance_data: false, // Never unless with confirmation
      raw_logs: false, // Archive instead
      rules: true
    },
    
    export: {
      all_formats: true,
      raw_data: true,
      system_reports: true
    },
    
    admin_only: {
      manage_api_keys: true,
      configure_device_adapters: true,
      manage_webhooks: true,
      system_maintenance: true,
      audit_log_retention: true,
      performance_tuning: true
    }
  },
  
  users: {
    create: true,
    read: true,
    update: true,
    delete: true,
    manage_permissions: true,
    reset_passwords: true,
    view_all_activity: true
  },
  
  integration: {
    create_device_adapters: true,
    manage_webhooks: true,
    configure_polling: true,
    manage_api_keys: true
  }
};
```

### 2.2 ADMIN (School-Level)
**Scope**: Their school only

```typescript
const AdminPermissions = {
  attendance: {
    view: {
      school_data: true,
      class_data: true,
      student_data: true,
      teacher_data: true,
      raw_device_logs: true, // Their school only
      audit_trail: true,
      processing_status: true,
      device_sync_status: true
    },
    
    edit: {
      manual_attendance_entries: true,
      bulk_manual_entries: true, // Class or school level
      attendance_rules: true,
      device_mappings: true,
      device_configuration: true,
      device_users: true,
      excuse_management: true,
      manual_mark_override: true
    },
    
    delete: {
      manual_entries: true,
      device_users: false, // Archive instead
      logs: false, // Cannot delete
      rules: true
    },
    
    export: {
      all_formats: true,
      detailed_reports: true,
      student_reports: true,
      teacher_reports: true,
      class_reports: true,
      analytics: true
    },
    
    admin_only: {
      manage_devices: true,
      register_devices: true,
      sync_device_logs: true,
      configure_rules: true,
      manage_staff_accounts: true,
      view_billing: true,
      manage_integration_keys: true
    }
  },
  
  students_teachers: {
    create: true,
    read: true,
    update: true,
    delete: false, // Mark inactive instead
    bulk_import: true,
    bulk_export: true
  }
};
```

### 2.3 DIRECTOR (School-Level)
**Scope**: School-level reporting only

```typescript
const DirectorPermissions = {
  attendance: {
    view: {
      school_data: true,
      class_data: true,
      analytics: true,
      trends: true,
      reports: true,
      audit_trail: true,
      raw_logs: false // Directors don't see raw logs
    },
    
    edit: {
      manual_attendance_entries: true,
      bulk_manual_entries: false, // Admin only
      attendance_rules: false, // Admin only
      device_configuration: false, // Admin only
      excuse_management: true
    },
    
    delete: {
      manual_entries: false // Cannot delete
    },
    
    export: {
      pdf_reports: true,
      excel_summaries: true,
      csv_export: false,
      raw_data: false
    },
    
    approvals: {
      approve_excuses: true,
      approve_manual_entries: false, // Auto-approved
      generate_reports: true
    }
  },
  
  view_only: {
    raw_logs: false,
    system_configuration: false,
    device_management: false,
    api_keys: false
  }
};
```

### 2.4 TEACHER
**Scope**: Assigned classes only

```typescript
const TeacherPermissions = {
  attendance: {
    view: {
      assigned_classes: true,
      student_names_and_ids: true,
      attendance_status: true,
      arrival_times: true,
      notes: true,
      
      // Cannot view
      raw_device_logs: false,
      other_classes: false,
      student_personal_data: false,
      raw_biometric_data: false,
      audit_trail: false
    },
    
    edit: {
      manual_attendance: false, // Teachers cannot change attendance
      add_notes: true, // But can add remarks
      excuse_requests: true // Can request excuses
    },
    
    delete: {} // No delete permissions
    
    },
    
    export: {
      class_report_pdf: true,
      class_report_excel: true,
      personal_pdf: true,
      
      // Cannot export
      student_personal_data: false,
      raw_logs: false,
      system_data: false
    },
    
    view_only: {
      device_management: false,
      configuration: false,
      other_classes: false,
      student_personal_info: false
    }
  }
};
```

### 2.5 PARENT
**Scope**: Own child only

```typescript
const ParentPermissions = {
  attendance: {
    view: {
      own_child_attendance: true,
      attendance_history: true,
      attendance_summary: true,
      arrival_departure_times: true,
      excuses_and_notes: true,
      
      // Cannot view
      other_children: false, // Unless authorized
      class_data: false,
      other_students: false,
      raw_logs: false
    },
    
    edit: {
      request_excuse: true,
      
      // Cannot edit
      attendance_status: false,
      other_data: false
    },
    
    export: {
      child_report: true,
      monthly_summary: true,
      
      // Cannot export
      class_data: false,
      other_student_data: false
    },
    
    notifications: {
      receive_attendance_alerts: true,
      receive_late_alerts: true,
      receive_absence_alerts: true,
      receive_excuse_updates: true
    }
  }
};
```

### 2.6 HR MANAGER / ADMIN STAFF
**Scope**: School-level data management

```typescript
const HRManagerPermissions = {
  students_teachers: {
    create: true,
    read: true,
    update: true,
    delete: false, // Mark inactive instead
    bulk_import: true,
    bulk_export: true,
    manage_leaves: true,
    manage_enrollment: true
  },
  
  attendance: {
    view: {
      school_data: true,
      absence_records: true,
      leave_management: true,
      summary_reports: true,
      
      raw_logs: false,
      device_management: false,
      system_config: false
    },
    
    edit: {
      manage_leaves: true,
      approve_leave: true,
      mark_absence: true,
      update_excuses: true,
      
      device_configuration: false,
      rules: false
    },
    
    export: {
      absence_reports: true,
      leave_reports: true,
      summary_excel: true
    }
  }
};
```

---

## 3. Access Control Implementation

### 3.1 Data-Level Access Control

```typescript
// Example: Attendance query with user context
interface AccessContext {
  userId: string;
  role: UserRole;
  schoolId?: string;
  classIds?: string[];
  studentId?: string; // For parent
}

async function getAttendanceRecords(
  context: AccessContext,
  filters: AttendanceFilters
): Promise<AttendanceRecord[]> {
  
  // 1. Verify user is authenticated
  if (!context.userId) {
    throw new AuthenticationError('User not authenticated');
  }
  
  // 2. Apply role-based filters
  const baseQuery = db.query('daily_attendance');
  
  switch (context.role) {
    case 'system_admin':
      // No additional filter - can see all
      break;
    
    case 'admin':
      // Filter to school only
      baseQuery.where('school_id', context.schoolId);
      break;
    
    case 'director':
      // Filter to school only
      baseQuery.where('school_id', context.schoolId);
      break;
    
    case 'teacher':
      // Filter to assigned classes only
      baseQuery
        .where('school_id', context.schoolId)
        .whereIn('person_id', [
          // Get teacher's class enrollments
          // Only students in assigned classes
        ]);
      break;
    
    case 'parent':
      // Filter to own child only
      baseQuery
        .where('person_id', context.studentId)
        .where('person_type', 'student');
      break;
    
    default:
      throw new AuthorizationError('Invalid role');
  }
  
  // 3. Apply additional filters from request
  if (filters.dateRange) {
    baseQuery
      .where('attendance_date', '>=', filters.dateRange.from)
      .where('attendance_date', '<=', filters.dateRange.to);
  }
  
  // 4. Mask sensitive fields based on role
  const records = await baseQuery.execute();
  return maskSensitiveFields(records, context.role);
}

// Field masking
function maskSensitiveFields(
  records: AttendanceRecord[],
  role: UserRole
): AttendanceRecord[] {
  
  if (role === 'teacher') {
    // Teachers should not see biometric quality
    records.forEach(r => {
      delete r.biometric_quality;
      delete r.device_id;
    });
  }
  
  if (role === 'parent') {
    // Parents should not see device information
    records.forEach(r => {
      delete r.device_id;
      delete r.biometric_quality;
      delete r.arrival_device_id;
    });
  }
  
  return records;
}
```

### 3.2 API-Level Authorization Middleware

```typescript
// Express/Fastify middleware
interface AuthRequest extends Request {
  user: {
    id: string;
    role: UserRole;
    schoolId: string;
    permissions: Permission[];
  };
}

// Middleware: Check permission
const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Role-to-permission mapping
    const rolePermissions = permissionMap[req.user.role];
    
    if (!hasPermission(rolePermissions, permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required_permission: permission 
      });
    }
    
    next();
  };
};

// Usage in routes
router.post(
  '/schools/:schoolId/attendance',
  requirePermission('attendance:create_manual_entry'),
  async (req, res) => {
    // Handle manual attendance creation
  }
);

router.delete(
  '/schools/:schoolId/manual-attendance/:entryId',
  requirePermission('attendance:delete_manual_entry'),
  async (req, res) => {
    // Handle deletion
  }
);

// School isolation middleware
const requireSchoolAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  const requestedSchoolId = req.params.schoolId;
  
  if (req.user.role === 'system_admin') {
    // System admin can access any school
    return next();
  }
  
  if (req.user.schoolId !== parseInt(requestedSchoolId)) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'You do not have access to this school' 
    });
  }
  
  next();
};

// Class isolation middleware (for teachers)
const requireClassAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  const classId = req.query.class_id || req.params.classId;
  
  if (req.user.role === 'teacher') {
    // Check if teacher is assigned to this class
    db.query('class_teachers')
      .where('teacher_id', req.user.id)
      .where('class_id', classId)
      .first()
      .then(assignment => {
        if (!assignment) {
          return res.status(403).json({ 
            error: 'Access denied',
            message: 'You are not assigned to this class' 
          });
        }
        next();
      });
  } else {
    next();
  }
};
```

### 3.3 Database Row-Level Security (RLS)

```sql
-- PostgreSQL RLS example

-- Create policy: Teachers can only see their assigned classes
CREATE POLICY teacher_class_isolation ON daily_attendance
  USING (
    -- If user is not a teacher, apply no restriction
    CASE 
      WHEN current_setting('app.user_role') != 'teacher' THEN TRUE
      
      -- If teacher, only show their classes
      ELSE EXISTS (
        SELECT 1 FROM class_teachers CT
        WHERE CT.class_id = (
          SELECT class_id FROM students 
          WHERE id = daily_attendance.person_id 
          AND person_type = 'student'
        )
        AND CT.teacher_id = current_setting('app.user_id')::bigint
      )
    END
  );

-- Create policy: Parent can only see own child
CREATE POLICY parent_own_child ON daily_attendance
  USING (
    CASE
      WHEN current_setting('app.user_role') != 'parent' THEN TRUE
      ELSE person_id = current_setting('app.parent_student_id')::bigint
    END
  );

-- Create policy: School isolation
CREATE POLICY school_isolation ON daily_attendance
  USING (
    CASE
      WHEN current_setting('app.user_role') = 'system_admin' THEN TRUE
      ELSE school_id = current_setting('app.user_school_id')::bigint
    END
  );

-- Enable RLS
ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;
```

---

## 4. Audit Trail for Permission Changes

```typescript
interface PermissionAuditLog {
  id: string;
  user_id: string;
  action: 'create' | 'update' | 'delete' | 'view' | 'export';
  entity_type: 'attendance' | 'rule' | 'device' | 'user';
  entity_id: string;
  school_id: string;
  
  user_role: string;
  required_permission: string;
  permission_granted: boolean;
  
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  
  request_details: {
    method: string;
    url: string;
    query_params: object;
    body_summary: string; // Don't log passwords!
  };
}

// Log all permission checks
async function logPermissionCheck(
  user: User,
  action: string,
  entity: string,
  allowed: boolean,
  req: Request
) {
  await db.insert('permission_audit_logs', {
    user_id: user.id,
    action,
    entity_type: entity,
    school_id: user.schoolId,
    user_role: user.role,
    permission_granted: allowed,
    ipAddress: getClientIp(req),
    userAgent: req.get('user-agent'),
    timestamp: new Date(),
    request_details: {
      method: req.method,
      url: req.originalUrl,
      query_params: req.query
    }
  });
  
  // Alert admins on suspicious activity
  if (!allowed) {
    // Multiple failed attempts?
    const recentFailures = await db.query('permission_audit_logs')
      .where('user_id', user.id)
      .where('permission_granted', false)
      .where('timestamp', '>', new Date(Date.now() - 15 * 60 * 1000)) // Last 15 min
      .count();
    
    if (recentFailures > 5) {
      await sendSecurityAlert({
        type: 'suspicious_activity',
        user_id: user.id,
        count: recentFailures,
        school_id: user.schoolId
      });
    }
  }
}
```

---

## 5. Permission Management UI

### Admin Panel for Permission Management

```
┌────────────────────────────────────────────────────┐
│ USER ROLE & PERMISSIONS MANAGEMENT                 │
├────────────────────────────────────────────────────┤
│                                                    │
│ User: Admin User                                   │
│ School: Example School                             │
│ Role: [ADMIN ▼]                                    │
│                                                    │
│ Change Role:                                       │
│ ☐ System Admin (Manage all schools)               │
│ ☑ School Admin (Full school access)               │
│ ☐ Director (Reporting only)                       │
│ ☐ Teacher (Class access)                          │
│ ☐ Admin Staff                                      │
│                                                    │
├────────────────────────────────────────────────────┤
│ FINE-GRAINED PERMISSIONS                           │
│                                                    │
│ ATTENDANCE                                         │
│ ☑ View all attendance data                         │
│ ☑ Create manual attendance entries                 │
│ ☑ Delete manual attendance entries                 │
│ ☑ Configure attendance rules                       │
│ ☑ View raw device logs                             │
│ ☑ Export attendance data                           │
│ ☐ Modify raw device logs                           │
│                                                    │
│ DEVICES                                            │
│ ☑ Register devices                                 │
│ ☑ Configure devices                                │
│ ☑ Sync device logs                                 │
│ ☐ Delete devices                                   │
│                                                    │
│ USERS                                              │
│ ☑ Create user accounts                             │
│ ☑ Update user roles                                │
│ ☑ Reset passwords                                  │
│ ☐ Delete user accounts                             │
│                                                    │
│ AUDIT & COMPLIANCE                                 │
│ ☑ View audit logs                                  │
│ ☑ Export audit logs                                │
│ ☐ Delete audit logs                                │
│                                                    │
│ [Save Changes]  [Reset to Default]  [Cancel]      │
│                                                    │
│ Change History:                                    │
│ • Jan 15, 2026 - Role changed from Teacher        │
│ • Jan 10, 2026 - Manual entry permission added    │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## 6. Permission Definition File

```yaml
# permissions.yaml - Central permission definitions

permissions:
  attendance:
    view:
      own_attendance: "View own attendance"
      class_attendance: "View assigned class attendance"
      school_attendance: "View all school attendance"
      raw_logs: "View raw device logs"
      audit_trail: "View audit logs"
      analytics: "View analytics and reports"
    
    create:
      manual_entry: "Create manual attendance entry"
      bulk_entries: "Create multiple manual entries"
      rule: "Create attendance rule"
    
    update:
      manual_entry: "Update manual attendance entry"
      rule: "Update attendance rule"
      device_mapping: "Update device user mappings"
      excuse: "Update excuse status"
    
    delete:
      manual_entry: "Delete manual attendance entry"
      rule: "Delete attendance rule"
    
    export:
      pdf: "Export as PDF"
      excel: "Export as Excel"
      csv: "Export as CSV"
      raw_data: "Export raw data"

  devices:
    view:
      device_list: "View device list"
      device_status: "View device status"
      sync_logs: "View sync logs"
    
    create:
      device: "Register new device"
    
    update:
      device_config: "Update device configuration"
      device_user_mapping: "Update device user mappings"
    
    delete:
      device: "Delete device"
      mapping: "Delete device user mapping"

  users:
    view:
      user_list: "View all users"
      user_activity: "View user activity logs"
    
    create:
      user: "Create new user"
    
    update:
      user_profile: "Update user profile"
      user_role: "Update user role"
      permissions: "Update user permissions"
    
    delete:
      user: "Delete user account"

role_permissions:
  system_admin:
    - attendance:view:*
    - attendance:create:*
    - attendance:update:*
    - attendance:delete:*
    - attendance:export:*
    - devices:*
    - users:*

  admin:
    - attendance:view:school_attendance
    - attendance:view:raw_logs
    - attendance:view:audit_trail
    - attendance:create:manual_entry
    - attendance:create:bulk_entries
    - attendance:update:*
    - attendance:delete:manual_entry
    - attendance:export:*
    - devices:view:*
    - devices:create:device
    - devices:update:*

  director:
    - attendance:view:school_attendance
    - attendance:view:analytics
    - attendance:create:manual_entry
    - attendance:update:excuse
    - attendance:export:pdf
    - attendance:export:excel

  teacher:
    - attendance:view:class_attendance
    - attendance:create:manual_entry
    - attendance:export:pdf

  parent:
    - attendance:view:own_attendance

  hr_manager:
    - attendance:view:school_attendance
    - attendance:create:manual_entry
    - attendance:update:excuse
    - users:create:user
    - users:update:user_profile
```

---

## 7. Implementation Checklist

- [ ] Implement JWT token with role and school_id claims
- [ ] Create middleware for permission checking
- [ ] Implement school isolation at database layer
- [ ] Add RLS policies for row-level security
- [ ] Create permission audit logging
- [ ] Build admin UI for role management
- [ ] Implement field masking for sensitive data
- [ ] Add rate limiting per role
- [ ] Create permission cache (Redis) for performance
- [ ] Setup background job to verify permission consistency
- [ ] Implement permission inheritance for delegated roles
- [ ] Add two-factor authentication for admin users

---

This RBAC system ensures:
✅ Data isolation between schools
✅ Class-level access for teachers
✅ Parent-only access to their children
✅ Comprehensive audit trail
✅ Scalable permission management
✅ Compliance with data protection regulations
