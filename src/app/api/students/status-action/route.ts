import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSchoolFromDB } from '@/lib/schoolDB';
import { getSessionSchoolId } from '@/lib/auth';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { student_id, action, details } = body;

    if (!student_id || !action) {
      return NextResponse.json({ success: false, error: 'student_id and action are required' }, { status: 400 });
    }

    const allowedActions = ['suspended', 'expelled'];
    if (!allowedActions.includes(action)) {
      return NextResponse.json({ success: false, error: 'action must be suspended or expelled' }, { status: 400 });
    }

    connection = await getConnection();

    // fetch student + person details + active enrollment for letter
    const [rows] = await connection.execute(
      `SELECT s.id AS student_id, s.admission_no, s.status AS current_status,
              p.first_name, p.last_name, p.photo_url,
              c.name AS class_name
       FROM students s
       LEFT JOIN people p ON s.person_id = p.id
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN classes c ON e.class_id = c.id
       WHERE s.id = ? AND s.school_id = ?`,
      [student_id, schoolId]
    ) as any[];

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }

    const student = rows[0];

    // build letter HTML (simple professional template)
    const dateStr = new Date().toLocaleDateString();
    let bodyHtml = '';
    if (action === 'suspended') {
      const start = details?.start_date || '';
      const ret = details?.return_date || '';
      const reason = details?.reason || '';
      bodyHtml = `
        <h2 style="text-align:center">Notice of Suspension</h2>
        <p>Dear Parent/Guardian,</p>
        <p>This is to inform you that <strong>${student.first_name} ${student.last_name}</strong> (Admission No: ${student.admission_no || '—'}) has been suspended effective <strong>${start}</strong> and is due to return on <strong>${ret}</strong>.</p>
        <p><strong>Reason:</strong> ${reason}</p>
      `;
    } else {
      const eff = details?.effective_date || '';
      const reason = details?.reason || '';
      const perm = details?.permanent ? true : false;
      bodyHtml = `
        <h2 style="text-align:center">Notice of Expulsion</h2>
        <p>Dear Parent/Guardian,</p>
        <p>This is to inform you that <strong>${student.first_name} ${student.last_name}</strong> (Admission No: ${student.admission_no || '—'}) has been expelled effective <strong>${eff}</strong>.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        ${perm ? '<p><strong>This expulsion is permanent; the learner is barred from returning.</strong></p>' : ''}
      `;
    }

    // Get school info from database (single source of truth)
    const schoolInfoDB = await getSchoolFromDB(schoolId);
    const schoolName = schoolInfoDB.name;
    const schoolAddress = schoolInfoDB.address;
    const logoUrl = schoolInfoDB.logo_url || '/uploads/logo.png';
    const principalName = schoolInfoDB.principal_name || 'Principal / Headteacher';

    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"/><title>Letter</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;padding:40px">
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
    ${logoUrl ? `<img src="${logoUrl}" style="width:72px;height:72px;object-fit:contain" alt="logo" />` : ''}
    <div>
      <div style="font-weight:700">${schoolName}</div>
      <div style="font-size:12px;color:#555">${schoolAddress}</div>
    </div>
    <div style="flex:1"></div>
    <div style="text-align:right">${dateStr}</div>
  </div>
  <div>
    <p>To: <strong>${student.first_name} ${student.last_name}</strong></p>
    ${bodyHtml}
    <div style="margin-top:40px">
      <div style="border-top:1px solid #999;width:220px;padding-top:8px;color:#444">${principalName}</div>
    </div>
  </div>
</body>
</html>`;

    // ensure uploads dir
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'letters');
    await mkdir(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const safeName = `letter_student_${student_id}_${action}_${timestamp}.html`;
    const destPath = path.join(uploadsDir, safeName);
    await writeFile(destPath, html, 'utf8');

    const publicUrl = `/uploads/letters/${safeName}`;

    // Update student's status in DB (students.status)
    await connection.execute(
      'UPDATE students SET status = ?, updated_at = NOW() WHERE id = ?',
      [action, student_id]
    );

    // record audit_log as status history
    const actor_user_id = session.userId;
    const changes = {
      action,
      details: details || null,
      letter: publicUrl,
      timestamp: new Date().toISOString()
    };
    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actor_user_id,
        `status_${action}`,
        'student_status',
        student_id,
        JSON.stringify(changes),
        null,
        null
      ]
    );

    return NextResponse.json({
      success: true,
      letterUrl: publicUrl,
      message: 'Status updated and letter generated'
    });

  } catch (err: any) {
    console.error('status-action error', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.end(); } catch { }
    }
  }
}
