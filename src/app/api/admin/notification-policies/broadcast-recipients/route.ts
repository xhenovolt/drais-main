/**
 * GET/PUT /api/admin/notification-policies/broadcast-recipients
 *
 * The staff_room/admin phone lists that src/lib/notifications/fanout.ts's
 * resolveSchoolBroadcast() reads. Before this route existed, a policy with
 * target_role='staff_room' or 'admin' silently resolved to zero recipients
 * — nothing to configure it with, no error either. This is that missing
 * config surface (comm_settings.staff_room_phones, school_settings'
 * admin_phones key).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { parsePhoneList } from '@/lib/notifications/fanout';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [commRows, settingRows] = await Promise.all([
    query('SELECT staff_room_phones FROM comm_settings WHERE school_id = ? LIMIT 1', [session.schoolId])
      .catch(() => []) as Promise<Array<{ staff_room_phones: string | null }>>,
    query("SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'admin_phones' LIMIT 1", [session.schoolId])
      .catch(() => []) as Promise<Array<{ value_text: string | null }>>,
  ]);

  return NextResponse.json({
    success: true,
    staff_room_phones: parsePhoneList(commRows[0]?.staff_room_phones ?? null),
    admin_phones: parsePhoneList(settingRows[0]?.value_text ?? null),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const staffRoomPhones = parsePhoneList(Array.isArray(body?.staff_room_phones) ? body.staff_room_phones.join(',') : body?.staff_room_phones);
  const adminPhones = parsePhoneList(Array.isArray(body?.admin_phones) ? body.admin_phones.join(',') : body?.admin_phones);

  const existing = await query('SELECT school_id FROM comm_settings WHERE school_id = ? LIMIT 1', [session.schoolId]) as Array<{ school_id: number }>;
  if (existing.length) {
    await query('UPDATE comm_settings SET staff_room_phones = ? WHERE school_id = ?', [staffRoomPhones.join(','), session.schoolId]);
  } else {
    await query('INSERT INTO comm_settings (school_id, staff_room_phones) VALUES (?, ?)', [session.schoolId, staffRoomPhones.join(',')]);
  }

  const settingRow = await query("SELECT id FROM school_settings WHERE school_id = ? AND key_name = 'admin_phones' LIMIT 1", [session.schoolId]) as Array<{ id: number }>;
  if (settingRow.length) {
    await query('UPDATE school_settings SET value_text = ? WHERE id = ?', [adminPhones.join(','), settingRow[0].id]);
  } else {
    await query("INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'admin_phones', ?)", [session.schoolId, adminPhones.join(',')]);
  }

  return NextResponse.json({ success: true, staff_room_phones: staffRoomPhones, admin_phones: adminPhones });
}
