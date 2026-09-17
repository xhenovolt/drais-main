import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/db";
import { getSessionSchoolId } from "@/lib/auth";
import { sendSMS, normalizePhoneNumber } from '@/lib/africastalking';

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
    const formattedContacts = (await Promise.all(contacts.map(formatPhoneNumber))).map(normalizePhoneNumber).filter((phone): phone is string => !!phone);
    const results = await Promise.all(formattedContacts.map((phone) => sendSMS(phone, message)));
    const successful = results.filter((result) => result.success).length;
    return NextResponse.json({ success: successful > 0, message: `SMS accepted for ${successful}/${formattedContacts.length} teachers.`, results });
  } catch (error: any) {
    console.error('Error sending reminders:', error.message);
    return NextResponse.json({ error: 'Failed to send reminders. Please try again later.' }, { status: 500 });
  }
}
