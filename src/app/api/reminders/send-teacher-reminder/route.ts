import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/db";
import { getSessionSchoolId } from "@/lib/auth";
import AfricasTalking from "africastalking";

function getAfricasTalkingClient() {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME;
  if (!apiKey || !username) {
    throw new Error('Africa\'s Talking credentials not configured in environment');
  }
  return AfricasTalking({ apiKey, username });
}

async function formatPhoneNumber(contact: string): Promise<string> {
  if (/^0\d{9}$/.test(contact)) {
    return '+256' + contact.substring(1);
  } else if (/^256\d{9}$/.test(contact)) {
    return '+' + contact;
  } else if (contact.startsWith('+256') && contact.length === 13) {
    return contact;
  } else {
    return contact.startsWith('+') ? contact : '+' + contact;
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  const body = await req.json();
  const message = body.message;

  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  try {
    const client = getAfricasTalkingClient();
    const sms = client.SMS;

    const connection = await getConnection();
    const [rows] = await connection.execute(
      'SELECT p.phone FROM staff s JOIN people p ON s.person_id = p.id WHERE s.school_id = ? AND s.status = "active" AND p.phone IS NOT NULL',
      [schoolId]
    );
    await connection.end();

    const contacts = (rows as any[]).map((row: any) => row.phone);
    if (contacts.length === 0) {
      return NextResponse.json({ success: false, message: 'No active teachers with phone numbers found.' }, { status: 404 });
    }

    // Send SMS to all teacher contacts
    const formattedContacts = await Promise.all(contacts.map(formatPhoneNumber));
    const response = await sms.send({ to: formattedContacts, message });
    return NextResponse.json({ success: true, message: 'SMS sent to all teachers.', response });
  } catch (error: any) {
    console.error('Error sending reminders:', error.message);
    return NextResponse.json({ error: 'Failed to send reminders. Please try again later.' }, { status: 500 });
  }
}
