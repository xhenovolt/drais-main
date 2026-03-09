import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  let connection;
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'excel';

    connection = await getConnection();

    // Fetch all students with their class and stream information
    const [students] = await connection.execute(`
      SELECT 
        s.id,
        s.first_name,
        s.last_name,
        s.other_name,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.address,
        s.status,
        s.admission_date,
        s.created_at,
        c.name as class_name,
        st.name as stream_name,
        d.name as district_name,
        v.name as village_name,
        s.admission_no
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN streams st ON s.stream_id = st.id
      LEFT JOIN districts d ON s.district_id = d.id
      LEFT JOIN villages v ON s.village_id = v.id
      ORDER BY s.created_at DESC
    `);

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
        'District': student.district_name || '',
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
        { wch: 15 }, // District
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
        district_name: student.district_name || '',
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
