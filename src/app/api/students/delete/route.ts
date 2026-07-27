import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { archiveEntity, TrashError } from '@/lib/trash/service';

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, reason } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Student ID is required.' }, { status: 400 });
    }

    await archiveEntity({
      entity:    'student',
      id:        Number(id),
      schoolId:  session.schoolId,
      userId:    session.userId,
      reason:    reason ?? null,
      ip:        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
    });

    return NextResponse.json({ success: true, message: 'Student archived successfully.' });
  } catch (error: unknown) {
    if (error instanceof TrashError) {
      return NextResponse.json({ success: false, message: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Error archiving student:', error);
    return NextResponse.json({ success: false, message: 'Failed to archive student.' }, { status: 500 });
  }
}