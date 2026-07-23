/** Pass-out request CRUD, approval workflow, audit events + dashboard intelligence. */
import { query } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { ensurePassoutSchema } from './schema';
import { getPassoutSettings, nextApprovalState } from './settings';

/** Domain audit event → passout_events (who/when/school/ip/action). */
export async function logPassoutEvent(args: {
  schoolId: number; passoutId?: number | null; studentId?: number | null;
  eventType: string; decision?: string | null; reason?: string | null;
  userId?: number | null; ip?: string | null; deviceSn?: string | null;
  verifyMethod?: string | null; rawEventId?: number | null;
}): Promise<void> {
  try {
    await ensurePassoutSchema();
    await query(
      `INSERT INTO passout_events
         (school_id, passout_id, student_id, attendance_raw_event_id, device_sn,
          event_type, decision, reason, created_by, ip, verify_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [args.schoolId, args.passoutId ?? null, args.studentId ?? null, args.rawEventId ?? null,
        args.deviceSn ?? null, args.eventType, args.decision ?? null, args.reason ?? null,
        args.userId ?? null, args.ip ?? null, args.verifyMethod ?? null],
    );
  } catch { /* audit is best-effort, never blocks the operation */ }
}

/** Guardian phone via the real relationship chain:
 *  student_contacts → contacts → people.phone. (The old snapshot read
 *  nonexistent columns off student_contacts, so SMS silently never sent.) */
async function resolveGuardian(studentId: number): Promise<{ phone: string | null; name: string | null }> {
  const rows = (await query(
    `SELECT p.phone, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name
       FROM student_contacts sc
       JOIN contacts c ON c.id = sc.contact_id AND c.deleted_at IS NULL
       JOIN people p ON p.id = c.person_id
      WHERE sc.student_id = ? AND p.phone IS NOT NULL AND p.phone <> ''
      ORDER BY sc.is_primary DESC, sc.contact_id ASC LIMIT 1`,
    [studentId],
  ).catch(() => [])) as any[];
  return { phone: rows[0]?.phone || null, name: rows[0]?.name || null };
}

export interface CreatePassoutInput {
  student_id: number;
  reason?: string | null;
  destination?: string | null;
  approved_from?: string | null;
  approved_until?: string | null;
  expected_return_at?: string | null;
  accompanied_by?: string | null;
  transport_method?: string | null;
  is_emergency?: boolean;
  is_medical?: boolean;
  notes?: string | null;
  guardian_phone_snapshot?: string | null;   // manual override
  verify_method?: 'fingerprint' | 'card' | 'manual' | null;
}

export async function createPassout(
  schoolId: number, b: CreatePassoutInput, userId?: number | null, autoApprove = false, ip?: string | null,
): Promise<{ id: number; passout_no: string; status: string }> {
  await ensurePassoutSchema();

  let guardianPhone: string | null = b.guardian_phone_snapshot ?? null;
  if (!guardianPhone) guardianPhone = (await resolveGuardian(b.student_id)).phone;

  const status = autoApprove ? 'approved' : 'pending';
  const res = (await query(
    `INSERT INTO passout_requests
       (external_id, school_id, student_id, requested_by, approved_by, approved_at, status, reason, destination,
        guardian_phone_snapshot, approved_from, approved_until, expected_return_at, notes,
        is_emergency, is_medical, accompanied_by, transport_method, verify_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID().slice(0, 36), schoolId, b.student_id, userId ?? null,
      autoApprove ? (userId ?? null) : null, autoApprove ? new Date() : null, status,
      b.reason ?? null, b.destination ?? null, guardianPhone,
      b.approved_from ?? null, b.approved_until ?? null, b.expected_return_at ?? null, b.notes ?? null,
      b.is_emergency ? 1 : 0, b.is_medical ? 1 : 0,
      b.accompanied_by ?? null, b.transport_method ?? null, b.verify_method ?? null],
  )) as unknown as { insertId: number };

  // Human-readable pass number: PO-YYMMDD-<id> — unique (id) and datable.
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const passoutNo = `PO-${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${res.insertId}`;
  await query(`UPDATE passout_requests SET passout_no = ? WHERE id = ?`, [passoutNo, res.insertId]).catch(() => {});

  await logPassoutEvent({
    schoolId, passoutId: res.insertId, studentId: b.student_id, eventType: 'created',
    reason: b.reason ?? null, userId, ip, verifyMethod: b.verify_method ?? null,
  });
  if (autoApprove) {
    await logPassoutEvent({ schoolId, passoutId: res.insertId, studentId: b.student_id, eventType: 'approved', userId, ip });
  }
  return { id: res.insertId, passout_no: passoutNo, status };
}

export async function listPassouts(schoolId: number, opts: { status?: string; student_id?: number } = {}) {
  const where = ['pr.school_id = ?', 'pr.deleted_at IS NULL'];
  const params: any[] = [schoolId];
  if (opts.status) { where.push('pr.status = ?'); params.push(opts.status); }
  if (opts.student_id) { where.push('pr.student_id = ?'); params.push(opts.student_id); }
  return query(
    `SELECT pr.*, CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) AS student_name,
            s.admission_no, c.name AS class_name,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', au.first_name, au.last_name)), ''), au.username, au.email) AS approved_by_name
       FROM passout_requests pr
       JOIN students s ON s.id = pr.student_id
       LEFT JOIN people p ON p.id = s.person_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status='active'
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN users au ON au.id = pr.approved_by
      WHERE ${where.join(' AND ')}
      GROUP BY pr.id
      ORDER BY pr.id DESC LIMIT 500`,
    params,
  ) as Promise<any[]>;
}

export async function getPassout(schoolId: number, id: number) {
  const rows = (await query(
    `SELECT * FROM passout_requests WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, schoolId],
  )) as any[];
  return rows[0] ?? null;
}

/** Approve with the school's configured workflow (single | two_step). */
export async function approvePassout(
  schoolId: number, id: number, userId: number, ip?: string | null,
): Promise<{ ok: boolean; final: boolean; reason?: string }> {
  await ensurePassoutSchema();
  const po = await getPassout(schoolId, id);
  if (!po) return { ok: false, final: false, reason: 'Pass-out not found' };
  const settings = await getPassoutSettings(schoolId);
  const next = nextApprovalState(po, settings.approval_mode, userId);
  if (!next.ok) return next;

  if (next.final) {
    await query(
      `UPDATE passout_requests SET status='approved', approved_by=?, approved_at=NOW()
        WHERE id=? AND school_id=? AND status='pending'`,
      [userId, id, schoolId],
    );
    await logPassoutEvent({ schoolId, passoutId: id, studentId: po.student_id, eventType: 'approved', userId, ip });
  } else {
    await query(
      `UPDATE passout_requests SET first_approved_by=?, first_approved_at=NOW()
        WHERE id=? AND school_id=? AND status='pending' AND first_approved_by IS NULL`,
      [userId, id, schoolId],
    );
    await logPassoutEvent({ schoolId, passoutId: id, studentId: po.student_id, eventType: 'first_approved', userId, ip });
  }
  return next;
}

export async function setPassoutStatus(
  schoolId: number, id: number, status: 'rejected' | 'cancelled', userId?: number | null, ip?: string | null,
): Promise<void> {
  const po = await getPassout(schoolId, id);
  await query(
    `UPDATE passout_requests SET status=? WHERE id=? AND school_id=? AND status IN ('draft','pending','approved')`,
    [status, id, schoolId],
  );
  await logPassoutEvent({ schoolId, passoutId: id, studentId: po?.student_id ?? null, eventType: status, userId, ip });
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

/** Pass-out intelligence (Phase 11) — counts + operational lists. */
export async function passoutDashboard(schoolId: number) {
  await ensurePassoutSchema();
  await sweepPassouts(schoolId);
  const rows = (await query(
    `SELECT status, COUNT(*) n FROM passout_requests WHERE school_id=? AND deleted_at IS NULL GROUP BY status`,
    [schoolId],
  )) as any[];
  const by: Record<string, number> = {};
  for (const r of rows) by[r.status] = Number(r.n);

  const one = async (sql: string, params: any[] = [schoolId]) => {
    const r = (await query(sql, params).catch(() => [{ n: 0 }])) as any[];
    return Number(r[0]?.n || 0);
  };
  const list = (sql: string, params: any[] = [schoolId]) => query(sql, params).catch(() => []) as Promise<any[]>;

  const learnerCols = `TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name, s.admission_no, c.name AS class_name`;
  const learnerJoin = `JOIN students s ON s.id = pr.student_id LEFT JOIN people p ON p.id = s.person_id
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.status='active' LEFT JOIN classes c ON c.id = e.class_id`;

  const [outsideNow, expectedToday, frequent, recent] = await Promise.all([
    list(`SELECT pr.id, pr.passout_no, ${learnerCols}, pr.reason, pr.destination, pr.actual_exit_at, pr.expected_return_at, pr.is_emergency, pr.is_medical, pr.status
            FROM passout_requests pr ${learnerJoin}
           WHERE pr.school_id=? AND pr.status IN ('used','overdue') ORDER BY pr.actual_exit_at DESC LIMIT 50`),
    list(`SELECT pr.id, ${learnerCols}, pr.expected_return_at, pr.status
            FROM passout_requests pr ${learnerJoin}
           WHERE pr.school_id=? AND pr.status IN ('used','overdue') AND DATE(pr.expected_return_at)=CURDATE()
           ORDER BY pr.expected_return_at ASC LIMIT 20`),
    list(`SELECT ${learnerCols}, COUNT(*) AS passes
            FROM passout_requests pr ${learnerJoin}
           WHERE pr.school_id=? AND pr.deleted_at IS NULL AND pr.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           GROUP BY pr.student_id, name, s.admission_no, class_name
          HAVING passes >= 2 ORDER BY passes DESC LIMIT 10`),
    list(`SELECT pe.event_type, pe.decision, pe.reason, pe.created_at,
                 TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name
            FROM passout_events pe
            LEFT JOIN students s ON s.id = pe.student_id LEFT JOIN people p ON p.id = s.person_id
           WHERE pe.school_id=? ORDER BY pe.id DESC LIMIT 20`),
  ]);

  return {
    approved: by.approved || 0, pending: by.pending || 0, currently_out: (by.used || 0) + (by.overdue || 0),
    overdue: by.overdue || 0, returned: by.returned || 0,
    denied_today: await one(`SELECT COUNT(*) n FROM passout_events WHERE school_id=? AND decision='denied' AND DATE(created_at)=CURDATE()`),
    exits_today: await one(`SELECT COUNT(*) n FROM passout_requests WHERE school_id=? AND DATE(actual_exit_at)=CURDATE()`),
    returns_today: await one(`SELECT COUNT(*) n FROM passout_requests WHERE school_id=? AND DATE(actual_return_at)=CURDATE()`),
    late_returns_today: await one(`SELECT COUNT(*) n FROM passout_requests WHERE school_id=? AND DATE(actual_return_at)=CURDATE() AND returned_late=1`),
    emergency_open: await one(`SELECT COUNT(*) n FROM passout_requests WHERE school_id=? AND is_emergency=1 AND status IN ('pending','approved','used','overdue')`),
    medical_open: await one(`SELECT COUNT(*) n FROM passout_requests WHERE school_id=? AND is_medical=1 AND status IN ('pending','approved','used','overdue')`),
    outside_now: outsideNow, expected_back_today: expectedToday,
    frequent_leavers: frequent, recent_activity: recent,
  };
}
