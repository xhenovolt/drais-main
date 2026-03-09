import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/utils/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('class_id');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!classId) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });
    }

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

    const data = await executeQuery(query, [date, classId, classId]);

    // Convert to CSV
    const headers = [
      'Admission No',
      'First Name', 
      'Last Name',
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
        row.first_name,
        row.last_name,
        row.class_name,
        row.stream_name || '',
        row.attendance_status,
        row.time_in || '',
        row.time_out || '',
        (row.notes || '').replace(/,/g, ';') // Replace commas to avoid CSV issues
      ].join(','))
    ].join('\n');

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
