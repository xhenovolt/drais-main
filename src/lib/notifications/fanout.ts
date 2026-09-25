/**
 * Phase 5 — notification fanout.
 *
 * Subscribes to the typed event bus, matches incoming events against
 * active notification_policies, and enqueues notification_outbox rows
 * per recipient.
 *
 * Pipeline
 * --------
 *   bus → fanoutAttendanceRecord(event)
 *           │
 *           ├─ load active policies for (school_id, event_type)
 *           ├─ for each policy:
 *           │    │ evaluate conditions vs event payload
 *           │    │ if match → resolve recipient(s)
 *           │    │              ├─ guardian: student_contacts JOIN contacts JOIN people
 *           │    │              ├─ self:     people.phone for the subject
 *           │    │              ├─ staff_room: comm_settings.staff_room_phones
 *           │    │              └─ admin:    school_settings.admin_phones
 *           │    │ for each recipient → render template → INSERT IGNORE
 *           │    │   notification_outbox with dedup_key
 *           └─ END
 *
 * Idempotency
 * -----------
 * dedup_key = "${policy_id}:${subject_person_id}:${event_type}:${date}".
 * The engine re-evaluates a day multiple times as new punches arrive;
 * dedup_key collapses re-enqueues to one outbox row. If the verdict
 * status CHANGES (late → present once a backdated punch lands), the
 * new dedup_key carries the new status so the new state IS notified —
 * we just don't double-send the same one.
 *
 * Resilience
 * ----------
 *   - Every error is logged and swallowed. A misconfigured policy
 *     does not break the engine's emit.
 *   - Missing recipient contacts result in zero outbox rows for that
 *     policy + subject. The fact is logged so ops can see why.
 *   - Daily cap is enforced by counting today's outbox rows for the
 *     policy BEFORE enqueueing. A runaway condition can write at most
 *     daily_cap rows per (policy, day).
 */
import { query } from '@/lib/db';
import { getEventBus, type AttendanceRecordUpsertedEvent } from '@/lib/events/eventbus';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';
import {
  evaluateAttendanceSmsEligibility, loadBiometricEvidence, schoolLocalDate, isPunchBackedStatus, NO_EVIDENCE,
} from '@/lib/notifications/attendance-sms-eligibility';
import { decideAttendanceNotification, type Decision } from '@/lib/attendance/notification-decision';
import { getBoardingPolicy } from '@/lib/attendance/boarding-policy';

/** Punch-backed verdicts carry their own evidence; skip the enrolment read. */
const needsEvidence = (event: AttendanceRecordUpsertedEvent): boolean => !isPunchBackedStatus(event.status);

// ── Public subscriber registration ────────────────────────────────────

let installed = false;

/**
 * Idempotent subscriber registration. Called once on module load by
 * the engine's import so the listener is live before any event flows.
 */
export function installNotificationFanout(): void {
  if (installed) return;
  installed = true;
  const bus = getEventBus();
  bus.subscribe('attendance.record.upserted', (event) => {
    return fanoutAttendanceRecord(event).catch(err => {
      console.warn('[notifications/fanout] dispatch failed:', err);
    });
  });
}

// ── Implementation ────────────────────────────────────────────────────

interface PolicyRow {
  id: number;
  school_id: number;
  name: string;
  event_type: string;
  target_role: 'guardian' | 'self' | 'staff_room' | 'admin';
  channel: 'sms' | 'email' | 'push';
  conditions: string | null;
  template_body: string | null;
  daily_cap: number;
}

interface RecipientResolution {
  phone: string | null;
  email: string | null;
  name: string;
}

export async function fanoutAttendanceRecord(
  event: AttendanceRecordUpsertedEvent,
): Promise<void> {
  // Phase 4 — a policy-derived verdict (boarding continuous-presence
  // covering a punch-less day, or an authorized leave still showing as
  // 'absent' with the reason attached) is not evidence of anything
  // parents/staff need alerting about. Skip notification matching
  // entirely rather than risk a false "your child is absent today" SMS
  // for a boarding student who is on approved leave or simply didn't
  // need to re-punch. A school that explicitly wants to be notified on
  // boarding leave can be served by a future, deliberate opt-in — this is
  // the safe default.
  // (Policy-derived verdicts are now handled INSIDE the central decision below, so the reason is
  // recorded instead of silently returning.)
  await ensureNotificationSchema();

  const allPolicies = (await query(
    `SELECT id, school_id, name, event_type, target_role, channel,
            conditions, template_body, daily_cap
       FROM notification_policies
      WHERE school_id = ?
        AND event_type IN ('attendance.record.upserted', 'attendance.boarding.reported')
        AND is_active = 1`,
    [event.schoolId],
  )) as PolicyRow[];
  if (allPolicies.length === 0) return;

  // ── The single decision point (attendance/notification-decision.ts) ──────
  const residence = event.residence ?? null;
  const boardingMode = event.boardingMode ?? null;
  const bp = residence === 'boarding' ? await getBoardingPolicy(event.schoolId) : null;
  const eligibility = evaluateAttendanceSmsEligibility({
    status: event.status,
    attendanceDate: event.attendanceDate,
    todayLocal: schoolLocalDate(),
    firstInAt: event.firstInAt,
    isPolicyDerived: event.isPolicyDerived,
    evidence: needsEvidence(event) && !event.isPolicyDerived ? await loadBiometricEvidence(event.schoolId, event.personId) : NO_EVIDENCE,
  });
  const decision = decideAttendanceNotification({
    status: event.status, attendanceDate: event.attendanceDate, firstInAt: event.firstInAt,
    isPolicyDerived: !!event.isPolicyDerived, policyDerivedReason: event.policyDerivedReason ?? null,
    residence, boardingMode, boardingReport: event.boardingReport ?? null,
    reportedSmsEnabled: bp ? bp.reportedSmsEnabled : true, eligibility, ruleId: event.ruleId,
  });
  const decisionId = await recordDecision(event, decision);

  if (decision.decision === 'DO_NOT_SEND') {
    console.log(JSON.stringify({
      ts: new Date().toISOString(), type: 'ATTENDANCE_SMS_SUPPRESSED',
      schoolId: event.schoolId, notificationType: decision.notificationType, reason: decision.reasonCode,
    }));
    return;
  }

  const wantEventType = decision.notificationType === 'BOARDING_REPORTED' ? 'attendance.boarding.reported' : 'attendance.record.upserted';
  const policies = allPolicies.filter((p) => p.event_type === wantEventType);
  if (policies.length === 0) return;

  // Resolve the subject's name + school name ONCE for this event so
  // templates can address parents properly ("your child {name}…").
  const meta = await fetchSubjectMeta(event.personId, event.schoolId);

  for (const policy of policies) {
    if (!matchesConditions(policy, event)) continue;
    if (await dailyCapReached(policy)) continue;
    const recipients = await resolveRecipients(policy, event);
    if (recipients.length === 0) continue;
    const body = renderTemplate(policy.template_body, event, meta);
    let idx = 0;
    for (const r of recipients) {
      if (policy.channel === 'sms' && !r.phone) continue;
      if (policy.channel === 'email' && !r.email) continue;
      await enqueue(policy, event, r, body, decision, decisionId, idx++);
    }
  }
}

/** Persist the structured decision ("why was / wasn't this SMS sent"). Idempotent per key. */
async function recordDecision(event: AttendanceRecordUpsertedEvent, d: Decision): Promise<number | null> {
  try {
    await query(
      `INSERT IGNORE INTO attendance_sms_decisions
         (school_id, person_id, student_id, attendance_date, notification_type, decision, reason_code, decision_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.schoolId, event.personId, event.studentId ?? null, event.attendanceDate, d.notificationType, d.decision, d.reasonCode,
        JSON.stringify({ explanation: d.explanation, facts: d.facts })],
    );
    const r = (await query(
      `SELECT id FROM attendance_sms_decisions
        WHERE school_id = ? AND person_id = ? AND attendance_date = ? AND notification_type = ? AND decision = ? AND reason_code = ? LIMIT 1`,
      [event.schoolId, event.personId, event.attendanceDate, d.notificationType, d.decision, d.reasonCode],
    )) as Array<{ id: number }>;
    return r[0] ? Number(r[0].id) : null;
  } catch (err) {
    console.warn('[notifications/fanout] could not record decision:', err);
    return null;
  }
}

function matchesConditions(
  policy: PolicyRow,
  event: AttendanceRecordUpsertedEvent,
): boolean {
  if (!policy.conditions) return true;
  let conds: Record<string, unknown>;
  try {
    conds = typeof policy.conditions === 'string'
      ? JSON.parse(policy.conditions)
      : (policy.conditions as Record<string, unknown>);
  } catch {
    return false;
  }
  if (!conds || typeof conds !== 'object') return true;

  // status_in: ['late','absent']
  const statusIn = conds.status_in;
  if (Array.isArray(statusIn) && !statusIn.includes(event.status)) return false;

  // role_type: 'student' | 'staff'
  if (typeof conds.role_type === 'string' && conds.role_type !== event.roleType) return false;

  // status_changed: true — only emit when verdict transitioned
  if (conds.status_changed === true) {
    if (event.previousStatus === event.status) return false;
  }

  return true;
}

async function dailyCapReached(policy: PolicyRow): Promise<boolean> {
  try {
    const rows = (await query(
      `SELECT COUNT(*) AS n
         FROM notification_outbox
        WHERE policy_id = ?
          AND created_at >= CURDATE()`,
      [policy.id],
    )) as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0) >= policy.daily_cap;
  } catch {
    return false;
  }
}

async function resolveRecipients(
  policy: PolicyRow,
  event: AttendanceRecordUpsertedEvent,
): Promise<RecipientResolution[]> {
  if (policy.target_role === 'self') {
    return resolveSelf(event.personId);
  }
  if (policy.target_role === 'guardian') {
    // Only relevant for students.
    if (event.roleType !== 'student') return [];
    return resolveGuardian(event.personId);
  }
  if (policy.target_role === 'staff_room' || policy.target_role === 'admin') {
    return resolveSchoolBroadcast(event.schoolId, policy.target_role);
  }
  return [];
}

async function resolveSelf(personId: number): Promise<RecipientResolution[]> {
  const rows = (await query(
    `SELECT first_name, last_name, phone, email
       FROM people WHERE id = ? LIMIT 1`,
    [personId],
  )) as Array<{
    first_name: string; last_name: string;
    phone: string | null; email: string | null;
  }>;
  if (rows.length === 0) return [];
  const r = rows[0];
  return [{
    phone: r.phone ?? null,
    email: r.email ?? null,
    name: `${r.first_name} ${r.last_name}`.trim(),
  }];
}

async function resolveGuardian(studentPersonId: number): Promise<RecipientResolution[]> {
  // Prefer the PRIMARY contact, but fall back to ANY contact that has a
  // phone — requiring is_primary=1 silently dropped guardians whose
  // contact wasn't flagged primary (the common case), so no SMS was sent.
  const rows = (await query(
    `SELECT cp.first_name, cp.last_name, cp.phone, cp.email
       FROM students s
       JOIN student_contacts sc ON sc.student_id = s.id
       JOIN contacts con        ON con.id = sc.contact_id
       JOIN people cp           ON cp.id = con.person_id
      WHERE s.person_id = ?
        AND cp.phone IS NOT NULL AND cp.phone <> ''
      ORDER BY sc.is_primary DESC
      LIMIT 5`,
    [studentPersonId],
  )) as Array<{ first_name: string; last_name: string; phone: string | null; email: string | null }>;
  if (rows.length > 0) {
    return rows.map(r => ({ phone: r.phone ?? null, email: r.email ?? null, name: `${r.first_name} ${r.last_name}`.trim() }));
  }

  // Fallback: legacy parents table (student_parents → parents.phone).
  const pr = (await query(
    `SELECT pa.name, pa.phone, pa.email
       FROM students s
       JOIN student_parents sp ON sp.student_id = s.id
       JOIN parents pa         ON pa.id = sp.parent_id
      WHERE s.person_id = ?
        AND pa.phone IS NOT NULL AND pa.phone <> ''
      LIMIT 5`,
    [studentPersonId],
  ).catch(() => [] as any[])) as Array<{ name: string; phone: string | null; email: string | null }>;
  return pr.map(r => ({ phone: r.phone ?? null, email: r.email ?? null, name: r.name ?? 'Guardian' }));
}

/** PURE: parse a comma/newline/semicolon-separated phone list, ignoring
 *  blanks and duplicates — shared by both broadcast sources below. */
export function parsePhoneList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const phone = part.trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push(phone);
  }
  return out;
}

async function resolveSchoolBroadcast(
  schoolId: number,
  role: 'staff_room' | 'admin',
): Promise<RecipientResolution[]> {
  // Per this file's own architecture comment: staff_room reads
  // comm_settings.staff_room_phones, admin reads school_settings'
  // 'admin_phones' key — both a simple operator-entered phone list, no
  // per-person identity needed for a broadcast line.
  let raw: string | null = null;
  if (role === 'staff_room') {
    const rows = (await query(
      'SELECT staff_room_phones FROM comm_settings WHERE school_id = ? LIMIT 1',
      [schoolId],
    ).catch(() => [])) as Array<{ staff_room_phones: string | null }>;
    raw = rows[0]?.staff_room_phones ?? null;
  } else {
    const rows = (await query(
      "SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'admin_phones' LIMIT 1",
      [schoolId],
    ).catch(() => [])) as Array<{ value_text: string | null }>;
    raw = rows[0]?.value_text ?? null;
  }
  return parsePhoneList(raw).map((phone) => ({ phone, email: null, name: role === 'staff_room' ? 'Staff room' : 'Admin' }));
}

interface SubjectMeta { name: string; firstName: string; school: string; }

async function fetchSubjectMeta(personId: number, schoolId: number): Promise<SubjectMeta> {
  let name = '', firstName = '', school = '';
  try {
    const r = (await query('SELECT first_name, last_name FROM people WHERE id = ? LIMIT 1', [personId])) as Array<{ first_name: string; last_name: string }>;
    if (r[0]) { firstName = (r[0].first_name ?? '').trim(); name = `${r[0].first_name ?? ''} ${r[0].last_name ?? ''}`.trim(); }
  } catch { /* name optional */ }
  try {
    const r = (await query('SELECT name FROM schools WHERE id = ? LIMIT 1', [schoolId])) as Array<{ name: string }>;
    if (r[0]) school = (r[0].name ?? '').trim();
  } catch { /* school optional */ }
  return { name, firstName, school };
}

/** Friendly local HH:MM from an ISO instant (school UTC offset, default EAT +180). */
function friendlyTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const off = Number(process.env.SCHOOL_UTC_OFFSET_MINUTES ?? 180);
  const l = new Date(d.getTime() + off * 60_000);
  return `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`;
}

function renderTemplate(
  template: string | null,
  event: AttendanceRecordUpsertedEvent,
  meta: SubjectMeta,
): string {
  const body = template ?? defaultTemplate(event, meta);
  return body
    .replace(/\{name\}/g, meta.name || 'your child')
    .replace(/\{first_name\}/g, meta.firstName || meta.name || 'your child')
    .replace(/\{school\}/g, meta.school || 'the school')
    .replace(/\{time\}/g, friendlyTime(event.firstInAt))
    .replace(/\{status\}/g, event.status.replace('_', ' '))
    .replace(/\{date\}/g, event.attendanceDate)
    .replace(/\{first_in\}/g, friendlyTime(event.firstInAt))
    .replace(/\{last_out\}/g, friendlyTime(event.lastOutAt))
    .replace(/\{late_minutes\}/g, String(event.lateMinutes))
    .replace(/\{early_minutes\}/g, String(event.earlyMinutes));
}

/**
 * Professional, parent-facing default messages. Used when a policy has no
 * custom template_body. Kept warm and courteous; the school can override
 * per policy in /attendance/settings.
 */
function defaultTemplate(event: AttendanceRecordUpsertedEvent, meta: SubjectMeta): string {
  const child = meta.name ? meta.name : 'your child';
  const school = meta.school ? meta.school : 'school';
  if (event.boardingReport) {
    return `Dear Parent/Guardian, ${child} has reported to ${school} on {date}. Thank you.`;
  }
  switch (event.status) {
    case 'late':
      return `Dear Parent/Guardian, this is to notify you that ${child} arrived late to ${school} on {date} at {time} ({late_minutes} min late). Thank you.`;
    case 'absent':
      return `Dear Parent/Guardian, our records show that ${child} was absent from ${school} on {date}. Please contact the school if this is unexpected. Thank you.`;
    case 'half_day':
      return `Dear Parent/Guardian, ${child} was present for a half-day at ${school} on {date}. Thank you.`;
    case 'early_leave':
      return `Dear Parent/Guardian, ${child} left ${school} early on {date} ({early_minutes} min early). Thank you.`;
    case 'present':
      return `Dear Parent/Guardian, ${child} arrived safely at ${school} on {date} at {time}. Thank you.`;
    case 'holiday':
    case 'weekend':
      return `Dear Parent/Guardian, no school session for ${child} on {date}. Thank you.`;
  }
}

/**
 * Deterministic logical-event key. BOARDING_REPORTED is keyed by REPORTING PERIOD (never by day), so a
 * second punch, a re-evaluation or a replayed callback can never send it twice. Every other type keeps
 * the historical per-day/per-status key. Recipient #1 keeps the exact historical key (so nothing already
 * queued is re-sent on deploy); further guardians get a phone suffix — previously only the first guardian
 * of a learner was ever texted because all shared one key.
 */
export function buildDedupKey(
  policyId: number, event: Pick<AttendanceRecordUpsertedEvent, 'personId' | 'attendanceDate' | 'status' | 'boardingReport'>,
  notificationType: string, recipientIndex: number, phone: string | null,
): string {
  const base = notificationType === 'BOARDING_REPORTED'
    ? `${policyId}:${event.personId}:boarding.reported:${event.boardingReport?.periodKey ?? event.attendanceDate}`
    : `${policyId}:${event.personId}:attendance.record.upserted:${event.attendanceDate}:${event.status}`;
  return recipientIndex === 0 ? base : `${base}:r${String(phone ?? '').replace(/\D/g, '').slice(-6)}`;
}

async function enqueue(
  policy: PolicyRow,
  event: AttendanceRecordUpsertedEvent,
  recipient: RecipientResolution,
  body: string,
  decision: Decision,
  decisionId: number | null,
  recipientIndex: number,
): Promise<void> {
  const dedupKey = buildDedupKey(policy.id, event, decision.notificationType, recipientIndex, recipient.phone);
  try {
    await query(
      `INSERT IGNORE INTO notification_outbox
         (policy_id, school_id, subject_person_id, recipient_phone,
          recipient_email, recipient_name, channel, body, status, dedup_key,
          notification_type, attendance_date, subject_student_id, decision_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
      [
        policy.id,
        event.schoolId,
        event.personId,
        recipient.phone,
        recipient.email,
        recipient.name,
        policy.channel,
        body.slice(0, 480),
        dedupKey,
        decision.notificationType,
        event.attendanceDate,
        event.studentId ?? null,
        decisionId,
      ],
    );
  } catch (err) {
    console.warn(`[notifications/fanout] enqueue failed for policy ${policy.id}:`, err);
  }
}
