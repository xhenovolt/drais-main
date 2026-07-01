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

export type ReportType = 'out_today' | 'overdue' | 'by_reason' | 'by_officer' | 'denied' | 'visitation' | 'unknown_cards';

/** Report datasets (Phase 10). Each returns { columns, rows } for table + export. */
export async function passoutReport(schoolId: number, type: ReportType): Promise<{ columns: string[]; rows: any[] }> {
  const nameJoin = `JOIN students s ON s.id = pr.student_id LEFT JOIN people p ON p.id = s.person_id
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.status='active' LEFT JOIN classes c ON c.id = e.class_id`;
  const learner = `TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS learner, s.admission_no, c.name AS class`;
  switch (type) {
    case 'out_today':
      return { columns: ['learner', 'admission_no', 'class', 'reason', 'destination', 'actual_exit_at', 'expected_return_at'],
        rows: (await query(`SELECT ${learner}, pr.reason, pr.destination, pr.actual_exit_at, pr.expected_return_at FROM passout_requests pr ${nameJoin} WHERE pr.school_id=? AND pr.status='used' ORDER BY pr.actual_exit_at DESC`, [schoolId])) as any[] };
    case 'overdue':
      return { columns: ['learner', 'admission_no', 'class', 'reason', 'actual_exit_at', 'expected_return_at'],
        rows: (await query(`SELECT ${learner}, pr.reason, pr.actual_exit_at, pr.expected_return_at FROM passout_requests pr ${nameJoin} WHERE pr.school_id=? AND pr.status='overdue' ORDER BY pr.expected_return_at ASC`, [schoolId])) as any[] };
    case 'by_reason':
      return { columns: ['reason', 'count'],
        rows: (await query(`SELECT COALESCE(NULLIF(reason,''),'(none)') AS reason, COUNT(*) AS count FROM passout_requests WHERE school_id=? AND deleted_at IS NULL GROUP BY reason ORDER BY count DESC`, [schoolId])) as any[] };
    case 'by_officer':
      return { columns: ['officer', 'approved'],
        rows: (await query(`SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),''), u.username, u.email, CONCAT('#',pr.approved_by)) AS officer, COUNT(*) AS approved FROM passout_requests pr LEFT JOIN users u ON u.id=pr.approved_by WHERE pr.school_id=? AND pr.approved_by IS NOT NULL GROUP BY pr.approved_by, officer ORDER BY approved DESC`, [schoolId])) as any[] };
    case 'denied':
      return { columns: ['learner', 'admission_no', 'reason', 'device_sn', 'created_at'],
        rows: (await query(`SELECT TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,''))) AS learner, s.admission_no, pe.reason, pe.device_sn, pe.created_at FROM passout_events pe LEFT JOIN students s ON s.id=pe.student_id LEFT JOIN people p ON p.id=s.person_id WHERE pe.school_id=? AND pe.decision='denied' ORDER BY pe.id DESC LIMIT 500`, [schoolId])) as any[] };
    case 'visitation':
      return { columns: ['card_uid', 'event_type', 'decision', 'reason', 'device_sn', 'created_at'],
        rows: (await query(`SELECT card_uid, event_type, decision, reason, device_sn, created_at FROM visitation_events WHERE school_id=? ORDER BY id DESC LIMIT 500`, [schoolId])) as any[] };
    case 'unknown_cards':
      return { columns: ['card_uid', 'device_sn', 'created_at'],
        rows: (await query(`SELECT card_uid, device_sn, created_at FROM visitation_events WHERE school_id=? AND card_id IS NULL ORDER BY id DESC LIMIT 500`, [schoolId])) as any[] };
    default:
      return { columns: [], rows: [] };
  }
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
