import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
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
    const from = searchParams.get('from') || new Date().toISOString().split('T')[0];
    const to = searchParams.get('to') || new Date().toISOString().split('T')[0];

    // Get today's date for current metrics
    const today = new Date().toISOString().split('T')[0];

    // Use direct database connection for complex queries with better performance
    connection = await getConnection();

    // Execute all queries in parallel for better performance
    const [
      totalClasses,
      totalStudents,
      genderCounts,
      totalStaff,
      totalParents,
      admissions,
      paymentStats,
      learnerPerformance,
      bestLearner,
      worstLearner,
      termProgress,
      todayAttendance,
      activeDevices,
      todayBiometricPunches
    ] = await Promise.all([
      // Total classes
      connection.execute('SELECT COUNT(*) AS total_classes FROM classes WHERE school_id = ?', [schoolId]),

      // Total active students
      connection.execute('SELECT COUNT(*) AS total_learners FROM students WHERE status = "active" AND school_id = ?', [schoolId]),

      // Gender distribution
      connection.execute(`
        SELECT 
          SUM(CASE WHEN p.gender = 'M' THEN 1 ELSE 0 END) AS boys,
          SUM(CASE WHEN p.gender = 'F' THEN 1 ELSE 0 END) AS girls
        FROM students s
        JOIN people p ON s.person_id = p.id
        WHERE s.status = "active" AND s.school_id = ?
      `, [schoolId]),

      // Total staff
      connection.execute('SELECT COUNT(*) AS total_staff FROM staff WHERE status = "active" AND school_id = ?', [schoolId]),

      // Total parents/contacts
      connection.execute('SELECT COUNT(DISTINCT student_id) AS total_parents FROM student_contacts sc JOIN students s ON sc.student_id = s.id WHERE s.school_id = ?', [schoolId]),

      // Admissions timeline
      connection.execute(`
        SELECT
          SUM(CASE WHEN DATE(admission_date) = CURDATE() THEN 1 ELSE 0 END) AS today,
          SUM(CASE WHEN DATE(admission_date) = CURDATE() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS yesterday,
          SUM(CASE WHEN DATE(admission_date) >= CURDATE() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_week,
          SUM(CASE WHEN DATE(admission_date) >= CURDATE() - INTERVAL 1 MONTH THEN 1 ELSE 0 END) AS last_month,
          SUM(CASE WHEN DATE(admission_date) >= CURDATE() - INTERVAL 3 MONTH THEN 1 ELSE 0 END) AS last_3_months,
          SUM(CASE WHEN YEAR(admission_date) = YEAR(CURDATE()) THEN 1 ELSE 0 END) AS this_year,
          SUM(CASE WHEN YEAR(admission_date) = YEAR(CURDATE()) - 1 THEN 1 ELSE 0 END) AS last_year
        FROM students
        WHERE school_id = ?
      `, [schoolId]),

      // Payment statistics - using actual fee balance calculations
      connection.execute(`
        SELECT
          SUM(CASE WHEN sfi.status = 'paid' THEN 1 ELSE 0 END) AS fully_paid,
          SUM(CASE WHEN sfi.status = 'partial' THEN 1 ELSE 0 END) AS partially_paid,
          SUM(CASE WHEN sfi.status IN ('pending', 'overdue') THEN 1 ELSE 0 END) AS not_paid,
          SUM(CASE WHEN sfi.balance > 0 THEN sfi.balance ELSE 0 END) AS total_outstanding,
          SUM(CASE WHEN sfi.status = 'paid' THEN sfi.paid ELSE 0 END) AS total_paid
        FROM student_fee_items sfi
        JOIN students s ON sfi.student_id = s.id
        WHERE s.school_id = ?
      `, [schoolId]),

      // Performance statistics
      connection.execute(`
        SELECT
          SUM(CASE WHEN cr.score > 75 THEN 1 ELSE 0 END) AS improving_learners,
          SUM(CASE WHEN cr.score < 40 THEN 1 ELSE 0 END) AS declining_learners,
          AVG(cr.score) AS average_score,
          COUNT(DISTINCT cr.student_id) AS students_with_results
        FROM class_results cr
        JOIN students s ON cr.student_id = s.id
        WHERE s.school_id = ?
      `, [schoolId]),

      // Best performing student
      connection.execute(`
        SELECT p.first_name, p.last_name, AVG(cr.score) AS best_score
        FROM class_results cr
        JOIN students s ON cr.student_id = s.id
        JOIN people p ON s.person_id = p.id
        WHERE s.school_id = ?
        GROUP BY cr.student_id, p.first_name, p.last_name
        ORDER BY best_score DESC
        LIMIT 1
      `, [schoolId]),

      // Worst performing student
      connection.execute(`
        SELECT p.first_name, p.last_name, AVG(cr.score) AS worst_score
        FROM class_results cr
        JOIN students s ON cr.student_id = s.id
        JOIN people p ON s.person_id = p.id
        WHERE s.school_id = ? AND cr.score > 0
        GROUP BY cr.student_id, p.first_name, p.last_name
        ORDER BY worst_score ASC
        LIMIT 1
      `, [schoolId]),

      // Term progress - Get current active term
      connection.execute(`
        SELECT
          t.name AS term_name,
          CASE 
            WHEN t.end_date IS NOT NULL THEN DATEDIFF(t.end_date, CURDATE())
            ELSE 0
          END AS remaining_days,
          CASE 
            WHEN t.start_date IS NOT NULL THEN DATEDIFF(CURDATE(), t.start_date)
            ELSE 0
          END AS days_covered
        FROM terms t
        WHERE t.status = 'active' AND t.school_id = ?
        ORDER BY t.id DESC
        LIMIT 1
      `, [schoolId]),

      // Today's attendance (using direct query for performance)
      connection.execute(`
        SELECT 
          COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_count,
          COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_count,
          COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as late_count,
          COUNT(CASE WHEN sa.status = 'not_marked' OR sa.status IS NULL THEN 1 END) as not_marked_count,
          COUNT(s.id) as total_students
        FROM students s
        JOIN enrollments e ON s.id = e.student_id
        LEFT JOIN student_attendance sa ON s.id = sa.student_id AND sa.date = ?
        WHERE s.school_id = ? AND s.status = 'active' AND e.status = 'active'
      `, [today, schoolId]),

      // Active biometric devices (last heartbeat <= 2 min)
      connection.execute(`
        SELECT
          COUNT(*) AS total_devices,
          SUM(CASE WHEN TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= 120 THEN 1 ELSE 0 END) AS online_devices
        FROM devices
        WHERE deleted_at IS NULL
      `, []),

      // Today biometric punches from ZKTeco devices
      connection.execute(`
        SELECT COUNT(*) AS today_punches, SUM(matched) AS matched_punches
        FROM zk_attendance_logs
        WHERE school_id = ? AND DATE(check_time) = CURDATE()
      `, [schoolId])
    ]);

    // Extract results from arrays
    const classCount = Array.isArray(totalClasses[0]) ? totalClasses[0][0] : totalClasses[0];
    const studentCount = Array.isArray(totalStudents[0]) ? totalStudents[0][0] : totalStudents[0];
    const genderData = Array.isArray(genderCounts[0]) ? genderCounts[0][0] : genderCounts[0];
    const staffCount = Array.isArray(totalStaff[0]) ? totalStaff[0][0] : totalStaff[0];
    const parentCount = Array.isArray(totalParents[0]) ? totalParents[0][0] : totalParents[0];
    const admissionData = Array.isArray(admissions[0]) ? admissions[0][0] : admissions[0];
    const paymentData = Array.isArray(paymentStats[0]) ? paymentStats[0][0] : paymentStats[0];
    const performanceData = Array.isArray(learnerPerformance[0]) ? learnerPerformance[0][0] : learnerPerformance[0];
    const bestStudentData = Array.isArray(bestLearner[0]) ? bestLearner[0][0] : bestLearner[0];
    const worstStudentData = Array.isArray(worstLearner[0]) ? worstLearner[0][0] : worstLearner[0];
    const termData = Array.isArray(termProgress[0]) ? termProgress[0][0] : termProgress[0];
    const attendanceData = Array.isArray(todayAttendance[0]) ? todayAttendance[0][0] : todayAttendance[0];
    const deviceData = Array.isArray(activeDevices[0]) ? activeDevices[0][0] : activeDevices[0];
    const biometricData = Array.isArray(todayBiometricPunches[0]) ? todayBiometricPunches[0][0] : todayBiometricPunches[0];

    // Calculate attendance percentage
    const totalStudentsToday = attendanceData?.total_students || 0;
    const presentToday = attendanceData?.present_count || 0;
    const attendancePercentage = totalStudentsToday > 0 ? Math.round((presentToday / totalStudentsToday) * 100) : 0;

    const overview = {
      kpis: {
        totalStudents: studentCount?.total_learners || 0,
        presentToday: presentToday,
        absentToday: attendanceData?.absent_count || 0,
        attendancePercentage: attendancePercentage,
        enrollmentGrowth: admissionData?.last_month || 0,
        feesCollectedToday: 0, // Will be calculated from recent payments
        defaultersCount: (paymentData?.not_paid || 0) + (paymentData?.partially_paid || 0)
      },
      schoolStats: {
        total_classes: classCount?.total_classes || 0,
        total_learners: studentCount?.total_learners || 0,
        boys: genderData?.boys || 0,
        girls: genderData?.girls || 0,
        total_staff: staffCount?.total_staff || 0,
        total_parents: parentCount?.total_parents || 0,
        total_devices: Number(deviceData?.total_devices ?? 0),
        online_devices: Number(deviceData?.online_devices ?? 0)
      },
      biometrics: {
        today_punches: Number(biometricData?.today_punches ?? 0),
        matched_punches: Number(biometricData?.matched_punches ?? 0),
        total_devices: Number(deviceData?.total_devices ?? 0),
        online_devices: Number(deviceData?.online_devices ?? 0)
      },
      admissions: admissionData || {},
      paymentStats: {
        fully_paid: paymentData?.fully_paid || 0,
        partially_paid: paymentData?.partially_paid || 0,
        not_paid: paymentData?.not_paid || 0,
        total_outstanding: paymentData?.total_outstanding || 0
      },
      performance: {
        improving_learners: performanceData?.improving_learners || 0,
        declining_learners: performanceData?.declining_learners || 0,
        average_score: performanceData?.average_score || 0,
        students_with_results: performanceData?.students_with_results || 0
      },
      topPerformers: bestStudentData ? [{
        id: 1,
        name: `${bestStudentData.first_name} ${bestStudentData.last_name}`,
        className: 'N/A',
        average: bestStudentData.best_score,
        rank: 1,
        trend: 'improving',
        photoUrl: null
      }] : [],
      worstPerformers: worstStudentData ? [{
        id: 2,
        name: `${worstStudentData.first_name} ${worstStudentData.last_name}`,
        className: 'N/A',
        average: worstStudentData.worst_score,
        rank: 1,
        isAtRisk: true,
        photoUrl: null
      }] : [],
      fees: {
        totalExpected: Number(paymentData?.total_outstanding || 0) + Number(paymentData?.total_paid || 0),
        totalCollected: Number(paymentData?.total_paid || 0),
        collectionPercentage: (() => {
          const expected = Number(paymentData?.total_outstanding || 0) + Number(paymentData?.total_paid || 0);
          const collected = Number(paymentData?.total_paid || 0);
          return expected > 0 ? Math.round((collected / expected) * 100) : 0;
        })(),
        defaultersCount: (paymentData?.not_paid || 0) + (paymentData?.partially_paid || 0)
      },
      subjects: [], // Requires results data — shown as empty when no term is active
      termProgress: termData || {
        term_name: "No Active Term",
        remaining_days: 0,
        days_covered: 0,
        weekends_covered: 0,
        public_days: 0,
      }
    };

    return NextResponse.json({
      success: true,
      data: overview
    });

  } catch (error: any) {
    console.error('Dashboard overview error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dashboard overview',
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
