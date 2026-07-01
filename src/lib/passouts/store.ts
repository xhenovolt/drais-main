/** Pass-out request CRUD + dashboard counts. */
import { query } from '@/lib/db';
import { randomUUID } from 'node:crypto';

export async function createPassout(schoolId: number, b: any, userId?: number | null, autoApprove = false): Promise<number> {
  // Snapshot the guardian phone if a contact is given.
  let guardianPhone: string | null = b.guardian_phone_snapshot ?? null;
  if (!guardianPhone && b.guardian_contact_id) {
    const g = (await query(`SELECT phone, contact FROM student_contacts WHERE id = ? LIMIT 1`, [b.guardian_contact_id]).catch(() => [])) as any[];
    guardianPhone = g[0]?.phone || g[0]?.contact || null;
  }
  const res = (await query(
    `INSERT INTO passout_requests
       (external_id, school_id, student_id, requested_by, approved_by, status, reason, destination,
        guardian_contact_id, guardian_phone_snapshot, approved_from, approved_until, expected_return_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID().slice(0, 36), schoolId, b.student_id, userId ?? null,
     autoApprove ? (userId ?? null) : null, autoApprove ? 'approved' : 'pending',
     b.reason ?? null, b.destination ?? null, b.guardian_contact_id ?? null, guardianPhone,
     b.approved_from ?? null, b.approved_until ?? null, b.expected_return_at ?? null, b.notes ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function listPassouts(schoolId: number, opts: { status?: string; student_id?: number } = {}) {
  const where = ['pr.school_id = ?', 'pr.deleted_at IS NULL'];
  const params: any[] = [schoolId];
  if (opts.status) { where.push('pr.status = ?'); params.push(opts.status); }
  if (opts.student_id) { where.push('pr.student_id = ?'); params.push(opts.student_id); }
  return query(
    `SELECT pr.*, CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) AS student_name,
            s.admission_no, c.name AS class_name
       FROM passout_requests pr
       JOIN students s ON s.id = pr.student_id
       LEFT JOIN people p ON p.id = s.person_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status='active'
       LEFT JOIN classes c ON c.id = e.class_id
      WHERE ${where.join(' AND ')}
      GROUP BY pr.id
      ORDER BY pr.id DESC LIMIT 500`,
    params,
  ) as Promise<any[]>;
}

export async function getPassout(schoolId: number, id: number) {
  const rows = (await listPassouts(schoolId, {})) as any[];
  return rows.find((r) => Number(r.id) === id) ?? null;
}

export async function setPassoutStatus(
  schoolId: number, id: number, status: 'approved' | 'rejected' | 'cancelled', userId?: number | null,
): Promise<void> {
  if (status === 'approved') {
    await query(
      `UPDATE passout_requests SET status='approved', approved_by=? WHERE id=? AND school_id=? AND status IN ('draft','pending')`,
      [userId ?? null, id, schoolId],
    );
  } else {
    await query(`UPDATE passout_requests SET status=? WHERE id=? AND school_id=?`, [status, id, schoolId]);
  }
}

/** Sweep windows: approved-but-expired → expired; used-past-return → overdue. */
export async function sweepPassouts(schoolId: number): Promise<void> {
  await query(`UPDATE passout_requests SET status='expired' WHERE school_id=? AND status='approved' AND approved_until IS NOT NULL AND approved_until < NOW()`, [schoolId]);
  await query(`UPDATE passout_requests SET status='overdue' WHERE school_id=? AND status='used' AND expected_return_at IS NOT NULL AND expected_return_at < NOW()`, [schoolId]);
}

export async function passoutDashboard(schoolId: number) {
  await sweepPassouts(schoolId);
  const rows = (await query(
    `SELECT status, COUNT(*) n FROM passout_requests WHERE school_id=? AND deleted_at IS NULL GROUP BY status`,
    [schoolId],
  )) as any[];
  const by: Record<string, number> = {};
  for (const r of rows) by[r.status] = Number(r.n);
  const [[den]]: any = await query(
    `SELECT COUNT(*) n FROM passout_events WHERE school_id=? AND decision='denied' AND DATE(created_at)=CURDATE()`, [schoolId],
  );
  return {
    approved: by.approved || 0, pending: by.pending || 0, currently_out: by.used || 0,
    overdue: by.overdue || 0, returned: by.returned || 0, denied_today: Number(den?.n || 0),
  };
}
