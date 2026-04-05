import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/db";
import { getSessionSchoolId } from '@/lib/auth';
import AfricasTalking from "africastalking";

const africasTalkingClient = AfricasTalking({
  apiKey: 'atsk_3baf21e161cca165c4f5ccb67bc38f5a50a192e3208fafc3b575014f35793d9a1994a774',
  username: 'xhenovolt',
});

const sms = africasTalkingClient.SMS;

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

async function sendSMS(to: string, message: string) {
  const options = {
    to: [to],
    message,
    from: 'XHENVOLT UG', // Replace with your sender ID or short code
  };

  try {
    const response = await sms.send(options);
    const recipients = response.SMSMessageData?.Recipients || [];
    if (recipients.length > 0 && recipients[0].status === 'Success') {
      return {
        success: true,
        status: recipients[0].status,
        messageId: recipients[0].messageId,
        cost: recipients[0].cost,
      };
    } else {
      throw new Error(`SMS failed with status: ${recipients[0]?.status || 'Unknown'}`);
    }
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error('Failed to send SMS. Please try again later.');
  }
}

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    connection = await getConnection();
    const [rows] = await connection.execute('SELECT * FROM reminders WHERE school_id = ? ORDER BY due_date DESC', [schoolId]);
    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch reminders' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.memberCode && body.message) {
    // Logic for sending SMS to a member
    try {
      const connection = await getConnection();
      const [rows] = await connection.execute('SELECT contact FROM members WHERE member_code = ?', [body.memberCode]);
      await connection.end();

      const rowsArray = rows as unknown[];
      if (!rowsArray || rowsArray.length === 0 || !(rowsArray[0] as { contact?: string }).contact) {
        return NextResponse.json({ error: 'Member contact not found' }, { status: 404 });
      }

      const contact = (rowsArray[0] as { contact: string }).contact;
      const formattedContact = await formatPhoneNumber(contact);

      const smsResponse = await sendSMS(formattedContact, body.message);

      return NextResponse.json({
        success: true,
        message: 'SMS sent successfully',
        smsResponse,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error processing request:', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else if (body.title && body.dueDate) {
    // Logic for creating a reminder
    try {
      const connection = await getConnection();
      const session = await getSessionSchoolId(req);
      if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
      const schoolId = session.schoolId;

      await connection.execute(
        'INSERT INTO reminders (school_id, title, description, target_role, due_date, is_recurring, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [schoolId, body.title, body.description || null, body.targetRole || null, body.dueDate, body.isRecurring || false, session.userId]
      );
      const [result] = await connection.query('SELECT LAST_INSERT_ID() as id');
      await connection.end();

      // Send SMS notification to the specified number
      const message = `Reminder: ${body.title} is due on ${new Date(body.dueDate).toLocaleString()}`;
      await sendSMS('+256741341483', message);

      return NextResponse.json({ success: true, id: (result as unknown as { id: number }[])[0].id }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error creating reminder:', message);
      return NextResponse.json({ error: 'Failed to create reminder. Please try again later.' }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid request. Provide either memberCode and message, or title and dueDate.' }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.id || !body.title || !body.dueDate) {
      return NextResponse.json({ success: false, error: 'id, title, and dueDate are required' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.execute(
      'UPDATE reminders SET title=?, description=?, target_role=?, due_date=?, is_recurring=? WHERE id=? AND school_id=?',
      [body.title, body.description || null, body.targetRole || null, body.dueDate, body.isRecurring || false, body.id, schoolId]
    );
    return NextResponse.json({ success: true, message: 'Reminder updated' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating reminder:', message);
    return NextResponse.json({ success: false, error: 'Failed to update reminder' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.execute('DELETE FROM reminders WHERE id=? AND school_id=?', [body.id, schoolId]);
    return NextResponse.json({ success: true, message: 'Reminder deleted' });
  } catch (error: any) {
    console.error('Error deleting reminder:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to delete reminder' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
