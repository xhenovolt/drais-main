import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/NotificationService';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid notification IDs'
      }, { status: 400 });
    }

    const notificationService = NotificationService.getInstance();
    await notificationService.archive(ids, session.userId);

    return NextResponse.json({
      success: true,
      message: 'Notifications archived'
    });
  } catch (error: any) {
    console.error('Archive error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to archive notifications'
    }, { status: 500 });
  }
}
