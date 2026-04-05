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
    const cursor = searchParams.get('cursor') || undefined;
    const limit = parseInt(searchParams.get('limit', 10) || '25');
    const filter = searchParams.get('filter') as 'unread' | 'archived' | 'all' || 'all';
    // schoolId from session auth (above)

    const notificationService = NotificationService.getInstance();
    const result = await notificationService.list(userId, {
      cursor,
      limit,
      filter,
      schoolId
    });

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    console.error('Notifications list error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get notifications'
    }, { status: 500 });
  }
}
