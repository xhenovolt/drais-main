import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, logSMSActivity } from '@/lib/africastalking';
import { getSessionSchoolId } from '@/lib/auth';
import { getCommSettings } from '@/lib/comm/settings';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { phone, message, recipient_name, short_code } = body;

    // Validate input
    if (!phone || !message) {
      return NextResponse.json({
        success: false,
        error: 'Phone number and message are required'
      }, { status: 400 });
    }

    // Validate message length
    if (message.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Message cannot be empty'
      }, { status: 400 });
    }

    if (message.length > 480) { // Allow up to 3 SMS
      return NextResponse.json({
        success: false,
        error: 'Message is too long (max 480 characters)'
      }, { status: 400 });
    }

    // Per-school provider credentials (settings → env fallback).
    const cs = await getCommSettings(session.schoolId).catch(() => null);
    // Sender ID is OPTIONAL and never forced: use the explicit short_code from
    // the request, else the school's configured sender_id (only if set). If
    // neither is present we pass nothing and Africa's Talking uses its default
    // sender — required for accounts without a registered alphanumeric ID.
    const effectiveSender = short_code || cs?.senderName || undefined;
    const smsResult = await sendSMS(
      phone,
      message,
      recipient_name,
      effectiveSender,
      { username: cs?.providerUsername, apiKey: cs?.providerApiKey },
    );

    // Log activity
    await logSMSActivity(
      phone,
      message,
      smsResult.success ? 'sent' : 'failed',
      recipient_name,
      smsResult.messageId
    );

    if (smsResult.success) {
      return NextResponse.json({
        success: true,
        message: `SMS sent successfully to ${recipient_name || phone}`,
        data: {
          messageId: smsResult.messageId,
          status: smsResult.status,
          cost: smsResult.cost,
          phone: smsResult.phone,
          recipientName: smsResult.recipientName,
          sentAt: smsResult.details?.sentAt
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: smsResult.error || 'Failed to send SMS'
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('SMS API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process SMS request'
    }, { status: 500 });
  }
}
