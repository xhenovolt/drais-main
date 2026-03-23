import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * POST /api/attendance/reports
 * Generate attendance reports
 */
export async function POST(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { report_type = 'daily_summary',
      date_from,
      date_to,
      class_id,
      stream_id,
      academic_year_id,
      generated_by } = body;

    if (!date_from || !date_to) {
      return NextResponse.json({
        success: false,
        error: 'date_from and date_to are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    let reportData: any = {};

    switch (report_type) {
      case 'daily_summary':
        reportData = await generateDailySummary(connection, schoolId, date_from, date_to, class_id);
        break;
      case 'weekly_trend':
        reportData = await generateWeeklyTrend(connection, schoolId, date_from, date_to, class_id);
        break;
      case 'monthly_summary':
        reportData = await generateMonthlySummary(connection, schoolId, date_from, date_to, class_id);
        break;
      case 'class_analysis':
        reportData = await generateClassAnalysis(connection, schoolId, class_id, date_from, date_to);
        break;
      case 'student_profile':
        reportData = await generateStudentProfile(connection, schoolId, date_from, date_to);
        break;
      case 'period_comparison':
        reportData = await generatePeriodComparison(connection, schoolId, date_from, date_to);
        break;
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid report_type'
        }, { status: 400 });
    }

    // Cache report
    const [result] = await connection.execute(
      `INSERT INTO attendance_reports (
        school_id, report_type, date_from, date_to, class_id, stream_id,
        academic_year_id, report_data, generated_by, generated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [
        schoolId, report_type, date_from, date_to, class_id, stream_id,
        academic_year_id, JSON.stringify(reportData), generated_by
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Report generated successfully',
      data: {
        report_id: (result as any).insertId,
        report_type,
        generated_at: new Date().toISOString(),
        ...reportData
      }
    });

  } catch (error: any) {
    console.error('Report generation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate report'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * GET /api/attendance/reports
 * Retrieve cached reports
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const reportId = searchParams.get('report_id');
    const reportType = searchParams.get('report_type');

    connection = await getConnection();

    let query = `
      SELECT 
        id, report_type, date_from, date_to, class_id, stream_id,
        report_data, generated_at, expires_at
      FROM attendance_reports
      WHERE school_id = ? AND expires_at > NOW()
    `;

    const params: any[] = [schoolId];

    if (reportId) {
      query += ` AND id = ?`;
      params.push(reportId);
    }

    if (reportType) {
      query += ` AND report_type = ?`;
      params.push(reportType);
    }

    query += ` ORDER BY generated_at DESC LIMIT 100`;

    const [rows] = await connection.execute(query, params);

    return NextResponse.json({
      success: true,
      data: rows || []
    });

  } catch (error: any) {
    console.error('Report fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch reports'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// Report generation helper functions

async function generateDailySummary(
  connection: any,
  schoolId: number,
  dateFrom: string,
  dateTo: string,
  classId?: string
) {
  let query = `
    SELECT 
      DATE(sa.date) as attendance_date,
      c.name as class_name,
      COUNT(DISTINCT sa.student_id) as total_students,
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
      COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as late,
      COUNT(CASE WHEN sa.status = 'excused' THEN 1 END) as excused,
      COUNT(CASE WHEN sa.status = 'not_marked' THEN 1 END) as not_marked,
      COUNT(CASE WHEN sa.method = 'biometric' THEN 1 END) as biometric_count,
      COUNT(CASE WHEN sa.method = 'manual' THEN 1 END) as manual_count,
      ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / 
            NULLIF(COUNT(DISTINCT sa.student_id), 0) * 100, 2) as attendance_rate
    FROM student_attendance sa
    JOIN students s ON sa.student_id = s.id
    LEFT JOIN classes c ON sa.class_id = c.id
    WHERE s.school_id = ? AND sa.date BETWEEN ? AND ?
  `;

  const params: any[] = [schoolId, dateFrom, dateTo];

  if (classId) {
    query += ` AND sa.class_id = ?`;
    params.push(classId);
  }

  query += ` GROUP BY DATE(sa.date), c.id ORDER BY DATE(sa.date) DESC`;

  const [rows] = await connection.execute(query, params);

  return {
    type: 'daily_summary',
    period: { from: dateFrom, to: dateTo },
    data: rows || []
  };
}

async function generateWeeklyTrend(
  connection: any,
  schoolId: number,
  dateFrom: string,
  dateTo: string,
  classId?: string
) {
  let query = `
    SELECT 
      YEARWEEK(sa.date) as week,
      DATE(DATE_SUB(sa.date, INTERVAL DAYOFWEEK(sa.date)-2 DAY)) as week_start,
      COUNT(DISTINCT sa.student_id) as total_students,
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
      ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / 
            NULLIF(COUNT(DISTINCT sa.student_id), 0) * 100, 2) as attendance_rate
    FROM student_attendance sa
    JOIN students s ON sa.student_id = s.id
    WHERE s.school_id = ? AND sa.date BETWEEN ? AND ?
  `;

  const params: any[] = [schoolId, dateFrom, dateTo];

  if (classId) {
    query += ` AND sa.class_id = ?`;
    params.push(classId);
  }

  query += ` GROUP BY YEARWEEK(sa.date) ORDER BY YEARWEEK(sa.date) DESC`;

  const [rows] = await connection.execute(query, params);

  return {
    type: 'weekly_trend',
    period: { from: dateFrom, to: dateTo },
    data: rows || []
  };
}

async function generateMonthlySummary(
  connection: any,
  schoolId: number,
  dateFrom: string,
  dateTo: string,
  classId?: string
) {
  let query = `
    SELECT 
      DATE_FORMAT(sa.date, '%Y-%m') as month,
      COUNT(DISTINCT sa.student_id) as total_students,
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
      COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as late,
      ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / 
            NULLIF(COUNT(DISTINCT sa.student_id), 0) * 100, 2) as attendance_rate
    FROM student_attendance sa
    JOIN students s ON sa.student_id = s.id
    WHERE s.school_id = ? AND sa.date BETWEEN ? AND ?
  `;

  const params: any[] = [schoolId, dateFrom, dateTo];

  if (classId) {
    query += ` AND sa.class_id = ?`;
    params.push(classId);
  }

  query += ` GROUP BY DATE_FORMAT(sa.date, '%Y-%m') ORDER BY month DESC`;

  const [rows] = await connection.execute(query, params);

  return {
    type: 'monthly_summary',
    period: { from: dateFrom, to: dateTo },
    data: rows || []
  };
}

async function generateClassAnalysis(
  connection: any,
  schoolId: number,
  classId: string,
  dateFrom: string,
  dateTo: string
) {
  const [classData] = await connection.execute(
    'SELECT name, level FROM classes WHERE id = ?',
    [classId]
  );

  const [attendanceStats] = await connection.execute(
    `SELECT 
      COUNT(DISTINCT sa.student_id) as total_students,
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as total_present,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as total_absent,
      COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as total_late,
      ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / 
            NULLIF(COUNT(DISTINCT sa.student_id), 0) * 100, 2) as overall_rate
    FROM student_attendance sa
    WHERE sa.class_id = ? AND sa.date BETWEEN ? AND ?`,
    [classId, dateFrom, dateTo]
  );

  return {
    type: 'class_analysis',
    class: classData?.[0] || {},
    period: { from: dateFrom, to: dateTo },
    statistics: (attendanceStats as any[])[0] || {}
  };
}

async function generateStudentProfile(
  connection: any,
  schoolId: number,
  dateFrom: string,
  dateTo: string
) {
  const [topAttenders] = await connection.execute(
    `SELECT 
      s.id,
      CONCAT(p.first_name, ' ', p.last_name) as name,
      c.name as class_name,
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_days,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_days,
      ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / 
            NULLIF(COUNT(sa.id), 0) * 100, 2) as attendance_rate
    FROM students s
    JOIN people p ON s.person_id = p.id
    JOIN enrollments e ON s.id = e.student_id
    JOIN classes c ON e.class_id = c.id
    LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date BETWEEN ? AND ?
    WHERE s.school_id = ?
    GROUP BY s.id
    ORDER BY attendance_rate DESC
    LIMIT 20`,
    [dateFrom, dateTo, schoolId]
  );

  const [chronicAbsentees] = await connection.execute(
    `SELECT 
      s.id,
      CONCAT(p.first_name, ' ', p.last_name) as name,
      c.name as class_name,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_days,
      COUNT(sa.id) as total_records,
      ROUND(COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) / 
            NULLIF(COUNT(sa.id), 0) * 100, 2) as absence_rate
    FROM students s
    JOIN people p ON s.person_id = p.id
    JOIN enrollments e ON s.id = e.student_id
    JOIN classes c ON e.class_id = c.id
    LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date BETWEEN ? AND ?
    WHERE s.school_id = ? AND sa.status = 'absent'
    GROUP BY s.id
    ORDER BY absent_days DESC
    LIMIT 20`,
    [dateFrom, dateTo, schoolId]
  );

  return {
    type: 'student_profile',
    period: { from: dateFrom, to: dateTo },
    top_attenders: topAttenders || [],
    chronic_absentees: chronicAbsentees || []
  };
}

async function generatePeriodComparison(
  connection: any,
  schoolId: number,
  dateFrom: string,
  dateTo: string
) {
  // Compare two periods
  const midDate = new Date(dateFrom);
  const endDate = new Date(dateTo);
  const diffDays = Math.floor((endDate.getTime() - midDate.getTime()) / (1000 * 60 * 60 * 24));
  const midPointDate = new Date(midDate.getTime() + (diffDays / 2) * (1000 * 60 * 60 * 24)).toISOString().split('T')[0];

  const [period1Data] = await connection.execute(
    `SELECT 
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_count,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_count,
      COUNT(DISTINCT sa.student_id) as total_students
    FROM student_attendance sa
    WHERE sa.school_id = ? AND sa.date BETWEEN ? AND ?`,
    [schoolId, dateFrom, midPointDate]
  );

  const [period2Data] = await connection.execute(
    `SELECT 
      COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_count,
      COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_count,
      COUNT(DISTINCT sa.student_id) as total_students
    FROM student_attendance sa
    WHERE sa.school_id = ? AND sa.date BETWEEN ? AND ?`,
    [schoolId, midPointDate, dateTo]
  );

  return {
    type: 'period_comparison',
    period_1: { from: dateFrom, to: midPointDate, data: (period1Data as any[])[0] || {} },
    period_2: { from: midPointDate, to: dateTo, data: (period2Data as any[])[0] || {} }
  };
}
