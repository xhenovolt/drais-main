/**
 * Visitation card engine. Verify a parent/guardian card at the gate and record
 * the event. VISIT ALLOWED / VISIT DENIED / UNKNOWN VISITATION CARD.
 */
import { query } from '@/lib/db';

export type VisitDecision = 'allowed' | 'denied' | 'review';
export interface VisitResult {
  decision: VisitDecision;
  title: string;
  reason: string;
  card?: {
    id: number; card_uid: string; status: string; expires_at: string | null;
    guardian_name: string | null; student_name: string | null; class_name: string | null;
  } | null;
  unknown?: boolean;
}

async function findCard(schoolId: number, cardUid: string): Promise<any | null> {
  const rows = (await query(
    `SELECT vc.*,
            TRIM(CONCAT(COALESCE(gp.first_name,''),' ',COALESCE(gp.last_name,''))) AS guardian_name,
            TRIM(CONCAT(COALESCE(sp.first_name,''),' ',COALESCE(sp.last_name,''))) AS student_name,
            c.name AS class_name
       FROM visitation_cards vc
       LEFT JOIN contacts con ON con.id = vc.guardian_contact_id
       LEFT JOIN people gp ON gp.id = con.person_id
       LEFT JOIN students s ON s.id = vc.student_id
       LEFT JOIN people sp ON sp.id = s.person_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status='active'
       LEFT JOIN classes c ON c.id = e.class_id
      WHERE vc.school_id = ? AND vc.card_uid = ?
      ORDER BY vc.id DESC LIMIT 1`,
    [schoolId, cardUid],
  )) as any[];
  return rows[0] ?? null;
}

function shape(v: any): VisitResult['card'] {
  return {
    id: Number(v.id), card_uid: v.card_uid, status: v.status, expires_at: v.expires_at ?? null,
    guardian_name: v.guardian_name || null, student_name: v.student_name || null, class_name: v.class_name || null,
  };
}

/** PURE: given a card row (or null) + now, the visitation verdict. */
export function decideVisit(card: any | null, nowMs: number = Date.now()): VisitResult {
  if (!card) return { decision: 'review', title: 'UNKNOWN VISITATION CARD', reason: 'Card is not registered', card: null, unknown: true };
  if (card.status !== 'active') return { decision: 'denied', title: 'VISIT DENIED', reason: `Card ${card.status}`, card: shape(card) };
  if (card.expires_at && new Date(card.expires_at).getTime() < nowMs) return { decision: 'denied', title: 'VISIT DENIED', reason: 'Card expired', card: shape(card) };
  return { decision: 'allowed', title: 'VISIT ALLOWED', reason: card.student_name ? `Visiting ${card.student_name}` : 'Verified guardian', card: shape(card) };
}

/** Decide + record a visitation card scan. */
export async function verifyCard(schoolId: number, cardUid: string, deviceSn?: string | null, eventType = 'visit'): Promise<VisitResult> {
  const card = await findCard(schoolId, cardUid);
  const result = decideVisit(card);

  const et = result.decision === 'allowed' ? `${eventType}_allowed` : result.decision === 'denied' ? `${eventType}_denied` : `${eventType}_attempt`;
  await query(
    `INSERT INTO visitation_events (school_id, card_id, card_uid, guardian_contact_id, student_id, device_sn, event_type, decision, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, card?.id ?? null, cardUid, card?.guardian_contact_id ?? null, card?.student_id ?? null, deviceSn ?? null, et, result.decision, result.reason],
  );
  return result;
}

// ── Card CRUD ──
export async function issueCard(schoolId: number, b: any, userId?: number | null): Promise<number> {
  const res = (await query(
    `INSERT INTO visitation_cards (school_id, card_uid, card_type, guardian_contact_id, student_id, status, issued_by, issued_at, expires_at, notes)
     VALUES (?, ?, ?, ?, ?, 'active', ?, NOW(), ?, ?)`,
    [schoolId, String(b.card_uid).trim(), b.card_type || 'zkteco_rfid', b.guardian_contact_id ?? null, b.student_id ?? null, userId ?? null, b.expires_at ?? null, b.notes ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function listCards(schoolId: number) {
  return query(
    `SELECT vc.*,
            TRIM(CONCAT(COALESCE(gp.first_name,''),' ',COALESCE(gp.last_name,''))) AS guardian_name,
            TRIM(CONCAT(COALESCE(sp.first_name,''),' ',COALESCE(sp.last_name,''))) AS student_name
       FROM visitation_cards vc
       LEFT JOIN contacts con ON con.id = vc.guardian_contact_id
       LEFT JOIN people gp ON gp.id = con.person_id
       LEFT JOIN students s ON s.id = vc.student_id
       LEFT JOIN people sp ON sp.id = s.person_id
      WHERE vc.school_id = ? ORDER BY vc.id DESC LIMIT 500`,
    [schoolId],
  ) as Promise<any[]>;
}

export async function setCardStatus(schoolId: number, id: number, status: 'active' | 'suspended' | 'lost' | 'expired'): Promise<void> {
  await query(`UPDATE visitation_cards SET status = ? WHERE id = ? AND school_id = ?`, [status, id, schoolId]);
}
