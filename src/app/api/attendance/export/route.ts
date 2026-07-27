import { NextRequest, NextResponse } from 'next/server';
import { schoolLocalToday } from '@/lib/datetime/local-date';
import { executeQuery } from '@/utils/database';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { AttendanceFormatter } from '@/lib/attendance/export/AttendanceFormatter';
import { logAudit, AuditAction } from '@/lib/audit';

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  // Module gate: attendance must be enabled for this school (opt-out policy).
  const moduleDenied = await checkModule(schoolId, 'attendance');
  if (moduleDenied) return moduleDenied;

  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('class_id');
    const date = searchParams.get('date') || schoolLocalToday();

    if (!classId) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });
    }

    const formatter = await AttendanceFormatter.forSchool(schoolId);

    // Get attendance data for export
    const query = `
      SELECT 
        COALESCE(s.admission_no, CONCAT('XHN/', LPAD(s.id, 4, '0'), '/2025')) as admission_no,
        p.first_name,
        p.last_name,
        c.name as class_name,
        st.name as stream_name,
        CASE 
          WHEN sa.status = 'present' OR sa.time_in IS NOT NULL THEN 'Present'
          ELSE 'Absent'
        END as attendance_status,
        sa.time_in,
        sa.time_out,
        sa.notes
      FROM students s
      JOIN people p ON s.person_id = p.id
      JOIN enrollments e ON s.id = e.student_id
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id 
        AND sa.date = ? 
        AND sa.class_id = ?
      WHERE e.class_id = ?
        AND e.status = 'active'
        AND s.status IN ('active', 'suspended', 'on_leave')
      ORDER BY p.first_name, p.last_name
    `;

    const data = await executeQuery(query, [date, classId, classId]) as any[];

    // Convert to CSV
    const headers = [
      'Admission No',
      'Name',
      'Class',
      'Stream',
      'Status',
      'Time In',
      'Time Out',
      'Notes'
    ];

    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.admission_no,
        [row.first_name, row.last_name].filter(Boolean).join(' '),
        row.class_name,
        formatter.formatNullable(row.stream_name),
        formatter.formatNullable(row.attendance_status),
        formatter.formatTime(row.time_in),
        formatter.formatTime(row.time_out),
        formatter.formatNullable(row.notes),
      ].map((value) => escapeCsv(String(value))).join(','))
    ].join('\n');

    // Accountability (P2): record the class-CSV export.
    void logAudit({
      schoolId, userId: (session as any).userId ?? null,
      action: AuditAction.EXPORTED_ATTENDANCE, entityType: 'attendance',
      details: { format: 'csv', scope: 'class', class_id: classId, date, rows: data.length },
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
      userAgent: request.headers.get('user-agent'),
    });

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=attendance-${classId}-${date}.csv`
      }
    });

  } catch (error) {
    console.error('Error exporting attendance:', error);
    return NextResponse.json(
      { error: 'Failed to export attendance data' },
      { status: 500 }
    );
  }
}
