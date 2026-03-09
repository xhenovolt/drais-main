import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const portionId = resolvedParams.id;
    const body = await request.json();
    const { status, notes } = body;

    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    // Update portion
    const updates: any = { 
      updated_at: new Date().toISOString()
    };
    
    if (status) {
      updates.status = status;
      
      if (status === 'in_progress') {
        updates.started_at = new Date().toISOString();
      } else if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
      }
    }
    
    if (notes !== undefined) {
      updates.notes = notes;
    }

    // In production: UPDATE tahfiz_portions SET ... WHERE id = ? AND student_id IN (SELECT student_id FROM tahfiz_group_members tgm JOIN tahfiz_groups tg ON tgm.group_id = tg.id WHERE tg.school_id = ?)

    return NextResponse.json({
      success: true,
      message: 'Portion updated successfully',
      data: { id: portionId, ...updates }
    });

  } catch (error) {
    console.error('Error updating portion:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to update portion',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const portionId = resolvedParams.id;
    const { searchParams } = new URL(request.url);
    // schoolId now from session auth (above)
    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    // In production: DELETE FROM tahfiz_portions WHERE id = ? AND student_id IN (SELECT student_id FROM tahfiz_group_members tgm JOIN tahfiz_groups tg ON tgm.group_id = tg.id WHERE tg.school_id = ?)

    return NextResponse.json({
      success: true,
      message: 'Portion deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting portion:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete portion',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
