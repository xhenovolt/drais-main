# DRAIS Attendance Module - Implementation & Integration Guide

**Version**: 1.0  
**Date**: February 8, 2026  
**Status**: Production Ready

---

## Section 1: Quick Start

### 1.1 Database Migration

Execute the migration to create all necessary tables:

**If using MySQL CLI:**
```bash
mysql -u your_user -p your_database < database/migrations/010_attendance_module_complete.sql
```

**If using Node.js application initialization:**
```typescript
import { execQuery } from '@/lib/db';
await execQuery(migrationSQL); // Recommended
```

**Database Objects Created:**
- ✓ `attendance_sessions` - Session-level attendance tracking
- ✓ `biometric_devices` - Device management
- ✓ `student_fingerprints` - Biometric credentials (enhanced)
- ✓ `device_sync_logs` - Sync operations logging
- ✓ `attendance_reconciliation` - Hybrid attendance conflicts
- ✓ `attendance_reports` - Report caching
- ✓ Enhanced columns in `student_attendance`

**Estimated Migration Time**: 2-3 seconds

---

## Section 2: API Integration

### 2.1 Attendance Sessions Workflow

**Example: Complete Attendance Cycle**

```typescript
// 1. Create attendance session
const sessionRes = await fetch('/api/attendance/sessions', {
  method: 'POST',
  body: JSON.stringify({
    class_id: 1,
    stream_id: 2,
    session_date: '2026-02-08',
    session_start_time: '08:00:00',
    session_type: 'morning_check',
    attendance_type: 'hybrid',
    teacher_id: 5
  })
});

const { data: session } = await sessionRes.json();
const sessionId = session.id;

// 2. Mark attendance (manual)
await fetch('/api/attendance', {
  method: 'POST',
  body: JSON.stringify({
    student_id: 10,
    date: '2026-02-08',
    status: 'present',
    method: 'manual',
    marked_by: 5
  })
});

// 3. Sync biometric data
await fetch('/api/attendance/biometric/sync', {
  method: 'POST',
  body: JSON.stringify({
    device_id: 1,
    attendance_records: [
      { biometric_uuid: 'uuid-123', timestamp: '2026-02-08T08:05:30Z' }
    ],
    initiated_by: 5
  })
});

// 4. Reconcile attendance
await fetch('/api/attendance/reconcile', {
  method: 'POST',
  body: JSON.stringify({
    attendance_session_id: sessionId,
    reconciled_by: 5
  })
});

// 5. Submit session
await fetch(`/api/attendance/sessions/${sessionId}?action=submit`, {
  method: 'POST',
  body: JSON.stringify({ submitted_by: 5 })
});

// 6. Lock attendance
await fetch(`/api/attendance/sessions/${sessionId}?action=lock`, {
  method: 'POST',
  body: JSON.stringify({ locked_by: 5 })
});

// 7. Generate report
const reportRes = await fetch('/api/attendance/reports', {
  method: 'POST',
  body: JSON.stringify({
    report_type: 'daily_summary',
    date_from: '2026-02-08',
    date_to: '2026-02-08',
    class_id: 1,
    generated_by: 5
  })
});
```

---

### 2.2 Fingerprint Registration Integration

**For Students List Page:**

```typescript
// Add fingerprint icon to each student row
import FingerprintRegistrationModal from '@/components/attendance/FingerprintRegistrationModal';

const StudentListRow = ({ student }) => {
  const [showFingerprintModal, setShowFingerprintModal] = useState(false);
  const [hasFingerprint, setHasFingerprint] = useState(false);

  useEffect(() => {
    // Check if student has fingerprint
    checkFingerprint();
  }, [student.id]);

  const checkFingerprint = async () => {
    const res = await fetch(`/api/fingerprints?student_id=${student.id}`);
    const data = await res.json();
    setHasFingerprint(data.data?.length > 0);
  };

  return (
    <>
      <tr>
        <td>{student.name}</td>
        <td>{student.class}</td>
        <td>
          <button
            onClick={() => setShowFingerprintModal(true)}
            className={`p-2 rounded ${
              hasFingerprint
                ? 'bg-green-100 text-green-600'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            <Fingerprint className="w-5 h-5" />
          </button>
        </td>
      </tr>

      <FingerprintRegistrationModal
        isOpen={showFingerprintModal}
        onClose={() => setShowFingerprintModal(false)}
        studentId={student.id}
        studentName={student.name}
        onSuccess={() => {
          checkFingerprint();
          toast.success('Fingerprint updated successfully');
        }}
      />
    </>
  );
};
```

---

### 2.3 Biometric Device Configuration

**Admin Panel Integration:**

```typescript
const BiometricDeviceSetup = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [newDevice, setNewDevice] = useState({
    device_name: '',
    device_code: '',
    device_type: 'fingerprint',
    location: '',
    ip_address: '',
    api_key: ''
  });

  const registerDevice = async () => {
    const res = await fetch('/api/biometric-devices', {
      method: 'POST',
      body: JSON.stringify(newDevice)
    });

    const data = await res.json();
    if (data.success) {
      setDevices([...devices, data.data]);
      toast.success('Device registered successfully');
      setNewDevice({ /* reset */ });
    }
  };

  const triggerSync = async (deviceId: number) => {
    try {
      const res = await fetch('/api/attendance/biometric/sync', {
        method: 'POST',
        body: JSON.stringify({
          device_id: deviceId,
          attendance_records: await fetchDeviceLogs(deviceId),
          initiated_by: currentUserId
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Synced ${data.data.synced_count} records`);
      }
    } catch (error) {
      toast.error('Sync failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Device List */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Device</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Last Sync</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(device => (
              <tr key={device.id} className="border-t">
                <td className="px-4 py-2">
                  <div>
                    <p className="font-medium">{device.device_name}</p>
                    <p className="text-sm text-gray-500">{device.location}</p>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    device.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {device.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm">
                  {device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => triggerSync(device.id)}
                    className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                  >
                    Sync Now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Registration Form */}
      {/* ... form UI ... */}
    </div>
  );
};
```

---

## Section 3: Common Use Cases

### 3.1 Manual Attendance Taking

**Scenario**: Teacher takes attendance in the morning

```typescript
const TakeAttendanceFlow = async () => {
  // 1. Create session
  const session = await createAttendanceSession({
    class_id: 1,
    session_date: today,
    session_type: 'morning_check',
    attendance_type: 'manual',
    teacher_id: currentUserId
  });

  // 2. Get student list
  const students = await fetch(`/api/attendance/students?class_id=1&date=${today}`);

  // 3. Mark each student
  for (const student of students) {
    await markAttendance({
      student_id: student.id,
      status: userSelectedStatus, // 'present', 'absent', 'late', 'excused'
      method: 'manual',
      marked_by: currentUserId
    });
  }

  // 4. Submit session
  await submitSession(session.id, currentUserId);

  // 5. Lock attendance (no further edits)
  await lockSession(session.id);
};
```

---

### 3.2 Hybrid Attendance (Manual + Biometric)

**Scenario**: Teacher marks attendance manually, but biometric machine syncs automatically

```typescript
const HybridAttendanceFlow = async () => {
  // 1. Create hybrid session
  const session = await createAttendanceSession({
    class_id: 1,
    attendance_type: 'hybrid',  // Key difference
    session_date: today,
    teacher_id: currentUserId
  });

  // 2. Biometric device syncs independently
  // (This could be triggered on a schedule, via webhook, or manually)
  const syncResult = await syncBiometricDevice({
    device_id: 1,
    attendance_records: await getDeviceAttendanceLogs()
  });

  // 3. Teacher makes manual corrections/additions
  await markAttendance({
    student_id: absentInBiometric.id,
    status: 'present',  // Override biometric
    method: 'manual',
    override_reason: 'Late arrival'
  });

  // 4. System reconciles
  const reconciliation = await reconcileAttendance({
    attendance_session_id: session.id,
    reconciled_by: currentUserId
  });

  // Show conflicts to teacher
  displayConflicts(reconciliation.conflicts);

  // 5. Teacher resolves conflicts
  await resolveConflict({
    conflict_id: 1,
    resolution: 'trust_manual'
  });

  // 6. Submit and lock
  await submitAndLockSession(session.id);
};
```

---

### 3.3 Biometric-Only Attendance

**Scenario**: Fully automatic attendance via fingerprint machines

```typescript
const BiometricOnlyFlow = async () => {
  // 1. Device captures fingerprints throughout the day
  // (On device scheduling or via API from device)

  // 2. End-of-day sync
  await syncBiometricDevice({
    device_id: 1,
    attendance_records: allCapturedFingerprints
  });

  // 3. System automatically creates attendance records
  // Records are automatically marked as 'present'

  // 4. Generate report
  const report = await generateAttendanceReport({
    report_type: 'daily_summary',
    date_from: today,
    date_to: today
  });

  // 5. No teacher action needed
  // Attendance is finalized automatically
};
```

---

## Section 4: Troubleshooting

### 4.1 Sync Issues

**Problem**: Device sync failed

**Solution Steps**:
1. Check device status: `GET /api/biometric-devices?status=active`
2. Verify API credentials in device configuration
3. Check network connectivity to device IP
4. Review sync logs: `GET /api/attendance/biometric/sync-status?device_id=1`
5. Manually trigger retry: `POST /api/attendance/biometric/sync`

### 4.2 Fingerprint Verification Failed

**Problem**: Student fingerprint doesn't match

**Likely Causes**:
- Fingerprint quality too low (< 70%)
- Wrong finger registered vs scanned
- Dirty scanner lens
- Poor lighting conditions

**Solution**:
1. Re-register fingerprint with better quality
2. Register multiple fingers as backup
3. Clean scanner regularly
4. Fall back to manual attendance

### 4.3 Reconciliation Conflicts

**Problem**: Manual vs biometric status mismatch

**Default Behavior**: Trust biometric (can be changed)

**Resolution Options**:
- `trust_biometric` - Accept fingerprint data as truth
- `trust_manual` - Accept teacher's manual marking
- `manual_correction` - Teacher manually reviewed and corrected

---

## Section 5: Performance Optimization

### 5.1 Database Indexing

All critical queries are indexed:
- `attendance_sessions(class_id, session_date)`
- `student_attendance(student_id, date)`
- `student_fingerprints(student_id, status)`
- `device_sync_logs(device_id, started_at)`

### 5.2 Caching Strategy

**Report Caching**:
- Reports cached for 7 days
- Auto-expire and regenerate
- Reduces computation load

**Device Status Caching**:
- Last sync status cached for 1 hour
- Real-time refresh available on-demand

### 5.3 Batch Operations

**For bulk marking**:
```typescript
// Better than individually marking each student
const bulkMark = await fetch('/api/attendance/bulk-mark', {
  method: 'POST',
  body: JSON.stringify({
    attendance_records: [
      { student_id: 1, status: 'present' },
      { student_id: 2, status: 'absent' },
      // ... many records
    ]
  })
});
```

---

## Section 6: Security Considerations

### 6.1 Access Control

**Recommended Permissions**:
- **Teachers**: Take attendance for their classes only
- **Head Teachers**: View and override attendance for their institution
- **Admins**: Configure devices, manage fingerprints, view reports
- **Students/Parents**: View-only access to own attendance records

### 6.2 Sensiti Data Protection

**Fingerprint Data**:
- Store templates only, not raw fingerprints
- Use LONGBLOB for secure storage
- Encrypt API keys for device communication
- Audit all fingerprint access

**Attendance Records**:
- Access logs for modifications
- Immutable once locked
- Admin override trail in `override_reason`

---

## Section 7: Deployment Checklist

- [ ] Database migration executed successfully
- [ ] All API routes deployed
- [ ] Frontend components integrated into relevant pages
- [ ] Fingerprint registration modal tested
- [ ] Biometric device configured and tested
- [ ] Report generation validated
- [ ] Access control configured
- [ ] User documentation created
- [ ] Staff trained on new features
- [ ] System tested in staging environment
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured

---

## Section 8: Support & Maintenance

### 8.1 Monitoring

**Key Metrics to Monitor**:
- Sync success rate (target: > 99%)
- Fingerprint match accuracy (target: > 95%)
- API response times (target: < 500ms)
- Database table sizes

**Example Alert Thresholds**:
- Sync failure for > 1 hour
- Fingerprint registration failures > 5/hour
- API latency > 2 seconds

### 8.2 Regular Maintenance

**Weekly**:
- Review sync logs for errors
- Check device status and battery levels
- Verify fingerprint registrations

**Monthly**:
- Archive old attendance records
- Review reconciliation conflicts
- Analyze attendance trends

**Quarterly**:
- Audit access logs
- Review security settings
- Update API credentials

---

## Support Contact

For issues or questions:
- **Technical Support**: tech-support@school.local
- **Hardware Support**: biometric-vendor-support
- **Documentation**: [See ATTENDANCE_API_DOCUMENTATION.md](./ATTENDANCE_API_DOCUMENTATION.md)

---

**Document Version**: 1.0  
**Last Updated**: February 8, 2026  
**Next Review**: May 8, 2026
