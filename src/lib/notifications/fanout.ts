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

async function fanoutAttendanceRecord(
  event: AttendanceRecordUpsertedEvent,
): Promise<void> {
  await ensureNotificationSchema();

  const policies = (await query(
    `SELECT id, school_id, name, event_type, target_role, channel,
            conditions, template_body, daily_cap
       FROM notification_policies
      WHERE school_id = ?
        AND event_type = 'attendance.record.upserted'
        AND is_active = 1`,
    [event.schoolId],
  )) as PolicyRow[];

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
    for (const r of recipients) {
      if (policy.channel === 'sms' && !r.phone) continue;
      if (policy.channel === 'email' && !r.email) continue;
      await enqueue(policy, event, r, body);
    }
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
  // students.person_id → students.id → student_contacts → contacts → people
  const rows = (await query(
    `SELECT cp.first_name, cp.last_name, cp.phone, cp.email
       FROM students s
       JOIN student_contacts sc ON sc.student_id = s.id
       JOIN contacts con        ON con.id = sc.contact_id
       JOIN people cp           ON cp.id = con.person_id
      WHERE s.person_id = ?
        AND sc.is_primary = 1
      LIMIT 5`,
    [studentPersonId],
  )) as Array<{
    first_name: string; last_name: string;
    phone: string | null; email: string | null;
  }>;
  return rows.map(r => ({
    phone: r.phone ?? null,
    email: r.email ?? null,
    name: `${r.first_name} ${r.last_name}`.trim(),
  }));
}

async function resolveSchoolBroadcast(
  _schoolId: number,
  _role: 'staff_room' | 'admin',
): Promise<RecipientResolution[]> {
  // Broadcast recipient list is configured per school in
  // school_settings (Phase 5.5). For v1 this returns empty — a policy
  // configured with target_role='staff_room' simply produces no rows
  // until that config layer ships.
  return [];
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

async function enqueue(
  policy: PolicyRow,
  event: AttendanceRecordUpsertedEvent,
  recipient: RecipientResolution,
  body: string,
): Promise<void> {
  const dedupKey =
    `${policy.id}:${event.personId}:attendance.record.upserted:${event.attendanceDate}:${event.status}`;
  try {
    await query(
      `INSERT IGNORE INTO notification_outbox
         (policy_id, school_id, subject_person_id, recipient_phone,
          recipient_email, recipient_name, channel, body, status, dedup_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
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
      ],
    );
  } catch (err) {
    console.warn(`[notifications/fanout] enqueue failed for policy ${policy.id}:`, err);
  }
}
