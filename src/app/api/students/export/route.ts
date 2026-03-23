import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  let connection;
  try {
    // Enforce authentication and school isolation
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'excel';

    connection = await getConnection();

    // Fetch all students — person data from people, class from enrollment
    const [students] = await connection.execute(`
      SELECT
        s.id,
        s.admission_no,
        s.status,
        s.admission_date,
        s.created_at,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.date_of_birth,
        p.phone,
        p.email,
        p.address,
        c.name  AS class_name,
        st.name AS stream_name,
        v.name  AS village_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN villages v ON s.village_id = v.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC
    `, [schoolId]);

    if (!Array.isArray(students)) {
      throw new Error('Failed to fetch students data');
    }

    if (format === 'excel') {
      // Create Excel file
      const workbook = XLSX.utils.book_new();
      
      // Prepare data for Excel
      const excelData = students.map((student: any) => ({
        'Admission No': student.admission_no,
        'First Name': student.first_name || '',
        'Last Name': student.last_name || '',
        'Other Name': student.other_name || '',
        'Gender': student.gender || '',
        'Date of Birth': student.date_of_birth || '',
        'Phone': student.phone || '',
        'Email': student.email || '',
        'Address': student.address || '',
        'Class': student.class_name || '',
        'Stream': student.stream_name || '',
        'Village': student.village_name || '',
        'Status': student.status || '',
        'Admission Date': student.admission_date || '',
        'Registration Date': student.created_at ? new Date(student.created_at).toLocaleDateString() : ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Set column widths
      const columnWidths = [
        { wch: 15 }, // Admission No
        { wch: 15 }, // First Name
        { wch: 15 }, // Last Name
        { wch: 15 }, // Other Name
        { wch: 10 }, // Gender
        { wch: 12 }, // Date of Birth
        { wch: 15 }, // Phone
        { wch: 20 }, // Email
        { wch: 25 }, // Address
        { wch: 15 }, // Class
        { wch: 15 }, // Stream
        { wch: 15 }, // Village
        { wch: 12 }, // Status
        { wch: 15 }, // Admission Date
        { wch: 18 }  // Registration Date
      ];
      worksheet['!cols'] = columnWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
      
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      
      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="students_export_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      });
    } else {
      // Return CSV format
      const csvData = students.map((student: any) => ({
        admission_no: student.admission_no,
        first_name: student.first_name || '',
        last_name: student.last_name || '',
        other_name: student.other_name || '',
        gender: student.gender || '',
        date_of_birth: student.date_of_birth || '',
        phone: student.phone || '',
        email: student.email || '',
        address: student.address || '',
        class_name: student.class_name || '',
        stream_name: student.stream_name || '',
        village_name: student.village_name || '',
        status: student.status || '',
        admission_date: student.admission_date || '',
        created_at: student.created_at || ''
      }));

      const headers = Object.keys(csvData[0] || {});
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => headers.map(header => `"${(row as any)[header]}"`).join(','))
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="students_export_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to export students data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}
