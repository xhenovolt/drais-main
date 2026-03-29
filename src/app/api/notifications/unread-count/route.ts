import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/NotificationService';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const userId = session.userId; // From authenticated session
    // schoolId from session auth (above)

    const notificationService = NotificationService.getInstance();
    const unread = await notificationService.getUnreadCount(userId, schoolId);

    return NextResponse.json({
      success: true,
      unread
    });
  } catch (error: any) {
    console.error('Unread count error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get unread count'
    }, { status: 500 });
  }
}
