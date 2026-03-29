import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/lib/NotificationService';

import { getSessionSchoolId } from '@/lib/auth';
export async function POST(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { template_code, recipients, variables = {} } = body;

    if (!template_code || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Template code and recipients are required'
      }, { status: 400 });
    }

    const notificationService = NotificationService.getInstance();
    const result = await notificationService.createFromTemplate(
      template_code,
      variables,
      recipients,
      { schoolId }
    );

    return NextResponse.json({
      success: true,
      message: 'Test notification sent',
      ...result
    });
  } catch (error: any) {
    console.error('Test notification error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to send test notification'
    }, { status: 500 });
  }
}
