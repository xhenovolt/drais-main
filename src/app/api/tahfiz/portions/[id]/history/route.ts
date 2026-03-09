import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const studentId = resolvedParams.id;
    const { searchParams } = new URL(request.url);    // schoolId now from session auth (above)
    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Get student basic info
    const [studentRows] = await connection.execute(`
      SELECT 
        s.id,
        CONCAT(p.first_name, ' ', p.last_name) as name,
        s.admission_no,
        p.photo_url as avatar,
        tg.name as group_name,
        CONCAT(tp.first_name, ' ', tp.last_name) as teacher_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN tahfiz_group_members tgm ON s.id = tgm.student_id
      LEFT JOIN tahfiz_groups tg ON tgm.group_id = tg.id
      LEFT JOIN people tp ON tg.teacher_id = tp.id
      WHERE s.id = ? AND s.school_id = ?
    `, [studentId, schoolId]);

    if ((studentRows as any[]).length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Student not found'
      }, { status: 404 });
    }

    const student = (studentRows as any[])[0];

    // Get summary statistics
    const [summaryRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total_portions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_portions,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_portions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_portions,
        AVG(CASE WHEN tr.mark IS NOT NULL THEN tr.mark END) as average_mark,
        AVG(CASE WHEN tr.retention_score IS NOT NULL THEN tr.retention_score END) as average_retention,
        MAX(tp.completed_at) as last_activity
      FROM tahfiz_portions tp
      LEFT JOIN tahfiz_records tr ON tp.id = tr.plan_id
      WHERE tp.student_id = ?
    `, [studentId]);

    const summary = (summaryRows as any[])[0];

    // Get portions with their records
    const [portionRows] = await connection.execute(`
      SELECT 
        tp.id,
        tp.portion_name,
        tp.surah_name,
        tp.ayah_from,
        tp.ayah_to,
        tp.status,
        tp.difficulty_level,
        tp.estimated_days,
        tp.assigned_at,
        tp.started_at,
        tp.completed_at,
        tr.id as record_id,
        tr.recorded_at as record_date,
        tr.presented,
        tr.presented_length,
        tr.mark,
        tr.retention_score,
        tr.notes as record_notes
      FROM tahfiz_portions tp
      LEFT JOIN tahfiz_records tr ON tp.id = tr.plan_id
      WHERE tp.student_id = ?
      ORDER BY tp.assigned_at DESC, tr.recorded_at DESC
    `, [studentId]);

    // Group records by portion
    const portionsMap = new Map();
    
    (portionRows as any[]).forEach(row => {
      if (!portionsMap.has(row.id)) {
        portionsMap.set(row.id, {
          id: row.id,
          portion_name: row.portion_name,
          surah_name: row.surah_name,
          ayah_from: row.ayah_from,
          ayah_to: row.ayah_to,
          status: row.status,
          difficulty_level: row.difficulty_level,
          estimated_days: row.estimated_days,
          assigned_at: row.assigned_at,
          started_at: row.started_at,
          completed_at: row.completed_at,
          records: []
        });
      }
      
      if (row.record_id) {
        portionsMap.get(row.id).records.push({
          id: row.record_id,
          date: row.record_date,
          presented: row.presented,
          presented_length: row.presented_length,
          mark: row.mark,
          retention_score: row.retention_score,
          notes: row.record_notes
        });
      }
    });

    const portions = Array.from(portionsMap.values());

    const historyData = {
      student: {
        id: student.id,
        name: student.name,
        admission_no: student.admission_no,
        avatar: student.avatar,
        group_name: student.group_name,
        teacher_name: student.teacher_name
      },
      summary: {
        total_portions: summary.total_portions || 0,
        completed_portions: summary.completed_portions || 0,
        in_progress_portions: summary.in_progress_portions || 0,
        pending_portions: summary.pending_portions || 0,
        average_mark: summary.average_mark ? parseFloat(summary.average_mark) : 0,
        average_retention: summary.average_retention ? parseFloat(summary.average_retention) : 0,
        total_verses: 0, // Can be calculated based on completed portions
        last_activity: summary.last_activity
      },
      portions
    };

    return NextResponse.json({
      success: true,
      data: historyData
    });

  } catch (error: any) {
    console.error('Error fetching student history:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch student history',
      details: error.message
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
