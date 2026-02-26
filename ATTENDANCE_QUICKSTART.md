# Attendance Management System - Quick Start Guide

## Overview

The Attendance Management System in DRAIS is a comprehensive solution for tracking student and staff attendance using both manual entry and biometric devices. It provides real-time tracking, detailed analytics, and reporting capabilities.

## Accessing the Attendance Module

### From Sidebar Navigation
1. Look for **"Attendance"** in the main sidebar (left menu)
2. You'll see the Attendance icon (📊) with a dropdown containing:
   - **Daily Attendance** - Mark attendance for the current day
   - **Sessions** - Create and manage attendance sessions/periods
   - **Reports** - View detailed attendance analytics
   - **Biometric Devices** - Configure and manage biometric devices
   - **Reconciliation** - Resolve attendance conflicts and discrepancies

### Direct Links
- Main Dashboard: `http://localhost:3000/attendance`
- Daily Attendance: `/attendance`
- Sessions: `/attendance/sessions`
- Reports: `/attendance/reports`
- Biometric: `/attendance/biometric`
- Reconciliation: `/attendance/reconcile`

## Features Overview

### 1. Daily Attendance Marking

**Purpose:** Mark student attendance for the current or specific day

**How to Use:**
1. Navigate to **Attendance → Daily Attendance**
2. Select the **Date** from the date picker
3. (Optional) Filter by **Class** to narrow down students
4. Search for specific students using the search box
5. For each student, click on their card to:
   - Mark as **Present**
   - Mark as **Absent**
   - Mark as **Late** (with optional time)
   - Excused Absence (with reason)
6. Alternatively, click the **Biometric** icon to use fingerprint enrollment

**Status Options:**
- ✅ **Present** - Student is present
- ❌ **Absent** - Student is absent without excuse
- ⏰ **Late** - Student arrived after start time
- 📋 **Excused** - Absence has valid reason (medical, official, etc.)
- ⏳ **Not Marked** - Attendance not yet recorded

### 2. Attendance Sessions

**Purpose:** Organize attendance into sessions (morning, afternoon, etc.)

**How to Use:**
1. Navigate to **Attendance → Sessions**
2. Click **"New Session"** button
3. Enter session details:
   - Session Name (e.g., "Morning Class")
   - Time range (Start and End times)
   - Description (optional)
4. Click **Create**

**Managing Sessions:**
- **View:** Click on a session name to see details
- **Edit:** Click the edit icon (✏️)
- **Delete:** Click the delete icon (🗑️)
- **Lock:** Once attendance is finalized, lock the session
- **Export:** Download session data

### 3. Attendance Reports

**Purpose:** Generate comprehensive attendance reports and analytics

**How to Use:**
1. Navigate to **Attendance → Reports**
2. Select report type:
   - **Daily Summary** - Today's attendance overview
   - **Class-wise Report** - Breakdown by class
   - **Student-wise Report** - Individual student history
   - **Monthly Overview** - Month-long trends
   - **Trend Analysis** - Attendance patterns
   - **Perfect Attendance** - Students with no absences
3. (Optional) Filter by date or class
4. Click **Generate Report**
5. View results in table or chart format
6. Click **Download** to export as CSV/Excel

**Report Features:**
- Visual charts and graphs
- Attendance percentages
- Trend analysis
- Export functionality
- Printed reports

### 4. Biometric Device Management

**Purpose:** Configure and manage biometric devices for automatic attendance

**How to Use:**
1. Navigate to **Attendance → Biometric Devices**
2. Click **"Add Device"** to register a new device
3. Enter device details:
   - Device Name (e.g., "Main Gate Scanner")
   - Device Code (unique identifier)
   - Device Type (ZKTeco, Hikvision, etc.)
   - Location (where the device is installed)
   - IP Address
   - MAC Address
4. Click **Register**

**Device Management:**
- **View Status** - See device online/offline status
- **Test Connection** - Test communication with device
- **Sync Data** - Manually sync attendance data
- **Last Sync** - Check last synchronization time
- **Configure** - Edit device settings

**Using Biometric Attendance:**
1. From Daily Attendance page, click **Fingerprint icon**
2. Have student place finger on the device
3. System automatically verifies and marks as present
4. Biometric record created for audit trail

### 5. Attendance Reconciliation

**Purpose:** Resolve conflicts and discrepancies in attendance records

**How to Use:**
1. Navigate to **Attendance → Reconciliation**
2. Review flagged cases:
   - Duplicate entries
   - Missing records
   - Data conflicts
   - Device sync errors
3. For each case:
   - Review the details
   - Select action: **Approve**, **Reject**, or **Manual Entry**
   - Add notes for audit trail
4. Click **Resolve**

**Common Issues Resolved:**
- Duplicate biometric entries
- Missing manual entries
- Time conflicts
- Device sync failures
- Data inconsistencies

## Dashboard Features

The attendance dashboard displays:

### Statistics Cards
- **Total Students** - Total enrolled students
- **Present** - Students marked present (with percentage)
- **Absent** - Students marked absent
- **Late** - Students who arrived late
- **Excused** - Excused absences
- **Attendance Rate** - Overall percentage

### Quick Actions
- Fast links to Daily Attendance
- Quick access to Sessions
- View Reports
- Configure Biometric Devices

### Today's Summary Table
- Student names and admission numbers
- Class information
- Attendance status for today
- Time in/out records

## Filters & Search

### Available Filters
- **Date:** Select specific date or date range
- **Class:** Filter by class or section
- **Status:** Show only specific status (present, absent, etc.)
- **Search:** Find students by name or admission number

### Shortcuts
- **Today's Data:** Pre-selected by default
- **All Classes:** Shows all students across classes
- **Clear Filters:** Reset to default view

## Keyboard Shortcuts (if enabled)

- `P` - Mark as Present (in attendance marking)
- `A` - Mark as Absent
- `L` - Mark as Late
- `E` - Mark as Excused
- `S` - Save/Submit
- `/` - Focus search box
- `Ctrl+R` - Refresh data

## Common Tasks

### Mark Entire Class as Present
1. Go to Daily Attendance
2. Filter by class
3. Click **"Mark All Present"** (if available)
4. Confirm action

### Export Attendance Report
1. Go to Reports
2. Select report type and date range
3. Click **Generate**
4. Click **Download** button
5. Choose format (CSV or Excel)

### Create Weekly Report
1. Go to Reports
2. Select **Weekly Summary**
3. Choose week/date range
4. Generate and download

### Sync Biometric Data
1. Go to Biometric Devices
2. Click on specific device
3. Click **"Sync Now"**
4. Wait for synchronization to complete
5. Check sync status and logs

### Find Absent Students
1. Go to Daily Attendance
2. Use Status filter: **"Absent"**
3. View filtered list
4. Export for parent notification

## Tips & Best Practices

### For Accurate Attendance:
1. ✅ Mark attendance at the beginning of each session
2. ✅ Use biometric devices for better accuracy
3. ✅ Review and verify daily before finalizing
4. ✅ Use notes to record special circumstances
5. ✅ Reconcile discrepancies daily

### For Efficient Management:
1. Create attendance sessions for each class/period
2. Assign biometric devices to strategic locations
3. Train staff on proper data entry
4. Review reports weekly
5. Archive old records regularly

### For Data Security:
1. Limit access to attendance module
2. Audit trail for all changes
3. Backup data regularly
4. Use strong passwords
5. Regular reconciliation checks

## Reports Worth Monitoring

- **Daily Summary:** Check at end of each day
- **Weekly Trends:** Review for patterns
- **Monthly Analysis:** Share with management
- **Perfect Attendance:** Recognize high performers
- **At-Risk Students:** Students below 75% attendance

## Integration with Other Modules

The Attendance module integrates with:
- **Students Module** - Student enrollment data
- **Classes Module** - Class information
- **Finance Module** - Fee calculation based on attendance
- **Reports Module** - Attendance analytics
- **Notifications** - SMS/Email alerts for absent students

## Troubleshooting

### Issue: No attendance data showing
**Solution:**
1. Check if students are enrolled
2. Verify class is active
3. Check date selector
4. Refresh page (Ctrl+R or Cmd+R)
5. Check API status

### Issue: Biometric device not syncing
**Solution:**
1. Check device is online (indicator light)
2. Verify network connectivity
3. Check device IP address
4. Restart device
5. Contact IT support

### Issue: Cannot mark attendance
**Solution:**
1. Verify user permissions
2. Check if session is still open
3. Verify student enrollment
4. Check for duplicate records
5. Clear browser cache

### Issue: Discrepancies in reports
**Solution:**
1. Use Reconciliation feature
2. Review audit logs
3. Check biometric device logs
4. Verify manual entries
5. Contact system administrator

## Help & Support

- **In-App Help:** Click **"?"** icon in sidebar
- **Documentation:** Check wiki/knowledge base
- **Contact Admin:** Send message to administrator
- **Bug Report:** Use in-app bug reporting feature
- **Email Support:** admin@school.edu

## Frequently Asked Questions

**Q: Can I edit past attendance records?**
A: Yes, but changes are logged in audit trail for compliance.

**Q: What happens if a biometric device goes offline?**
A: System switches to manual marking mode automatically.

**Q: Can I mark attendance for multiple students at once?**
A: Yes, use the "Bulk Mark" feature in Daily Attendance.

**Q: How long is attendance data retained?**
A: Data is retained for 7 years per standard policy.

**Q: Can I export attendance for a whole year?**
A: Yes, use date range filters in Reports.

**Q: Are there attendance rules or policies?**
A: Yes, configurable per school in Settings.

## Next Steps

1. **Configure systems:** Set up biometric devices
2. **Register fingerprints:** Enroll students
3. **Create sessions:** Define attendance periods
4. **Start marking:** Begin daily attendance
5. **Monitor:** Review reports regularly

---

**Version:** 1.0
**Last Updated:** 2025-02-20
**Status:** Ready for Production
