/**
 * Lesson attendance — pure decision logic (no DB, no clock reads).
 *
 * A biometric punch is evidence of *presence at a device at an instant*. It only
 * becomes lesson attendance when ALL of these hold:
 *   1. the device is allowed to feed lessons (scope: gate never; lesson/shared yes,
 *      and a lesson-scoped device pinned to a class/room only feeds matching lessons);
 *   2. the punch falls inside the lesson's check-in window
 *      [start - checkin_before, start + late_until] (capped at the lesson end);
 *   3. the lesson belongs to the student's own class/stream (caller passes only those);
 *   4. the punch is assigned to ONE lesson: if windows overlap, the lesson whose
 *      start is nearest wins. A gate punch at 07:50 therefore never marks a 10:00
 *      lesson, and one punch never marks two lessons.
 *
 * Statuses: present | late | absent | excused | pending. `pending` is deliberate:
 * it is used while a lesson is still open, when a learner cannot punch at all
 * (not on the biometric system), and when evidence is ambiguous — never forced
 * into present/absent. `excused` only ever comes from a manual correction.
 */

export type DeviceScope = 'gate' | 'lesson' | 'shared';
export type LessonStatus = 'present' | 'late' | 'absent' | 'excused' | 'pending';
export const LESSON_STATUSES: LessonStatus[] = ['present', 'late', 'absent', 'excused', 'pending'];
export const MANUAL_STATUSES: LessonStatus[] = ['present', 'late', 'absent', 'excused'];

export interface LessonPolicy {
  enabled: boolean;
  checkinBeforeMinutes: number;
  graceMinutes: number;
  lateUntilMinutes: number;
  minPresenceMinutes: number;
  absentFinalizeDelayMinutes: number;
  unmappedDeviceScope: DeviceScope;
  autoRoster: boolean;
}

export const DEFAULT_LESSON_POLICY: LessonPolicy = {
  enabled: false,
  checkinBeforeMinutes: 10,
  graceMinutes: 5,
  lateUntilMinutes: 20,
  minPresenceMinutes: 0,
  absentFinalizeDelayMinutes: 15,
  unmappedDeviceScope: 'shared',
  autoRoster: true,
};

const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};

/** Validate/clamp an untrusted policy patch on top of a base policy. */
export function sanitizePolicy(patch: Record<string, unknown>, base: LessonPolicy = DEFAULT_LESSON_POLICY): LessonPolicy {
  const p: LessonPolicy = {
    enabled: patch.enabled === undefined ? base.enabled : !!patch.enabled,
    checkinBeforeMinutes: clampInt(patch.checkinBeforeMinutes, 0, 60, base.checkinBeforeMinutes),
    graceMinutes: clampInt(patch.graceMinutes, 0, 60, base.graceMinutes),
    lateUntilMinutes: clampInt(patch.lateUntilMinutes, 0, 180, base.lateUntilMinutes),
    minPresenceMinutes: clampInt(patch.minPresenceMinutes, 0, 180, base.minPresenceMinutes),
    absentFinalizeDelayMinutes: clampInt(patch.absentFinalizeDelayMinutes, 0, 240, base.absentFinalizeDelayMinutes),
    unmappedDeviceScope: (['gate', 'lesson', 'shared'] as const).includes(patch.unmappedDeviceScope as DeviceScope)
      ? (patch.unmappedDeviceScope as DeviceScope) : base.unmappedDeviceScope,
    autoRoster: patch.autoRoster === undefined ? base.autoRoster : !!patch.autoRoster,
  };
  // A grace period longer than the late window would make "late" unreachable.
  if (p.graceMinutes > p.lateUntilMinutes) p.lateUntilMinutes = p.graceMinutes;
  return p;
}

export interface DeviceInfo {
  scope: DeviceScope;
  classId?: number | null;
  streamId?: number | null;
  room?: string | null;
}

export interface LessonRef {
  id: number;
  startMs: number;
  endMs: number;
  classId: number;
  streamId: number | null;
  room: string | null;
}

export interface Punch { id: number; atMs: number; deviceSn: string }

const MIN = 60_000;

export function resolveDevice(row: DeviceInfo | null | undefined, policy: LessonPolicy): DeviceInfo {
  return row ?? { scope: policy.unmappedDeviceScope };
}

/** Rule 1: may this device's punches feed this lesson at all? */
export function deviceAllowsLesson(device: DeviceInfo, lesson: LessonRef): boolean {
  if (device.scope === 'gate') return false;
  if (device.scope === 'shared') return true;
  if (device.classId != null && device.classId !== lesson.classId) return false;
  if (device.streamId != null && lesson.streamId != null && device.streamId !== lesson.streamId) return false;
  if (device.room && lesson.room && device.room.trim().toLowerCase() !== lesson.room.trim().toLowerCase()) return false;
  return true;
}

/** Rule 2: check-in window for a lesson. */
export function checkinWindow(lesson: LessonRef, policy: LessonPolicy): { openMs: number; closeMs: number } {
  const openMs = lesson.startMs - policy.checkinBeforeMinutes * MIN;
  const closeMs = Math.min(lesson.startMs + policy.lateUntilMinutes * MIN, lesson.endMs);
  return { openMs, closeMs };
}

export interface Assignment {
  byLesson: Map<number, Punch[]>;
  unassigned: Array<{ punch: Punch; reason: 'device_not_lesson_capable' | 'no_lesson_window' }>;
}

/** Rule 4: assign each punch to at most one lesson. */
export function assignPunchesToLessons(
  lessons: LessonRef[],
  punches: Punch[],
  policy: LessonPolicy,
  deviceFor: (sn: string) => DeviceInfo,
): Assignment {
  const byLesson = new Map<number, Punch[]>();
  const unassigned: Assignment['unassigned'] = [];
  const sorted = [...punches].sort((a, b) => a.atMs - b.atMs || a.id - b.id);
  for (const punch of sorted) {
    const device = deviceFor(punch.deviceSn);
    const capable = lessons.filter((l) => deviceAllowsLesson(device, l));
    if (capable.length === 0) { unassigned.push({ punch, reason: 'device_not_lesson_capable' }); continue; }
    const inWindow = capable.filter((l) => {
      const w = checkinWindow(l, policy);
      return punch.atMs >= w.openMs && punch.atMs <= w.closeMs;
    });
    if (inWindow.length === 0) { unassigned.push({ punch, reason: 'no_lesson_window' }); continue; }
    inWindow.sort((a, b) => Math.abs(punch.atMs - a.startMs) - Math.abs(punch.atMs - b.startMs) || a.startMs - b.startMs || a.id - b.id);
    const chosen = inWindow[0];
    const list = byLesson.get(chosen.id) ?? [];
    list.push(punch);
    byLesson.set(chosen.id, list);
  }
  return { byLesson, unassigned };
}

export interface Derived {
  status: LessonStatus;
  minutesLate: number;
  firstMs: number | null;
  lastMs: number | null;
  punchCount: number;
  deviceSn: string | null;
  exception: string | null;
}

/**
 * Derive a lesson verdict from the punches assigned to it. `nowMs` is passed in
 * so this stays pure and historical recalculation is deterministic.
 */
export function deriveLessonStatus(p: {
  lesson: LessonRef;
  punches: Punch[];
  policy: LessonPolicy;
  nowMs: number;
  canPunch: boolean;
}): Derived {
  const { lesson, policy, nowMs } = p;
  const punches = [...p.punches].sort((a, b) => a.atMs - b.atMs);
  const finalizeAtMs = lesson.endMs + policy.absentFinalizeDelayMinutes * MIN;

  if (punches.length === 0) {
    if (!p.canPunch) {
      return { status: 'pending', minutesLate: 0, firstMs: null, lastMs: null, punchCount: 0, deviceSn: null, exception: 'not_biometrically_enrolled' };
    }
    return {
      status: nowMs >= finalizeAtMs ? 'absent' : 'pending',
      minutesLate: 0, firstMs: null, lastMs: null, punchCount: 0, deviceSn: null, exception: null,
    };
  }

  const first = punches[0];
  const last = punches[punches.length - 1];
  const base = { firstMs: first.atMs, lastMs: last.atMs, punchCount: punches.length, deviceSn: first.deviceSn };

  if (policy.minPresenceMinutes > 0) {
    const spanMin = (last.atMs - first.atMs) / MIN;
    if (spanMin < policy.minPresenceMinutes) {
      // A single check-in cannot prove "present for N minutes". Keep it open, then flag for review.
      return {
        status: 'pending', minutesLate: 0, ...base,
        exception: nowMs >= finalizeAtMs ? 'insufficient_presence_evidence' : null,
      };
    }
  }

  const graceEndMs = lesson.startMs + policy.graceMinutes * MIN;
  const minutesLate = Math.max(0, Math.floor((first.atMs - lesson.startMs) / MIN));
  return { status: first.atMs <= graceEndMs ? 'present' : 'late', minutesLate, ...base, exception: null };
}

export interface RosterCounts {
  expected: number; present: number; late: number; absent: number; excused: number;
  pending: number; unaccounted: number; exceptions: number;
}

export function summarizeRoster(rows: Array<{ status: LessonStatus; exception: string | null }>): RosterCounts {
  const c: RosterCounts = { expected: rows.length, present: 0, late: 0, absent: 0, excused: 0, pending: 0, unaccounted: 0, exceptions: 0 };
  for (const r of rows) {
    c[r.status] += 1;
    if (r.status === 'pending') c.unaccounted += 1;
    if (r.exception) c.exceptions += 1;
  }
  return c;
}

/** Local wall-clock (date + HH:MM[:SS]) → UTC epoch ms, given the school's UTC offset in minutes. */
export function localToUtcMs(localDate: string, time: string, offsetMinutes: number): number {
  const t = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return Date.parse(`${localDate}T${t}Z`) - offsetMinutes * MIN;
}

/** ISO weekday (1=Mon..7=Sun) of a local calendar date. */
export function isoWeekday(localDate: string): number {
  const d = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** School-local calendar date (YYYY-MM-DD) of an instant. */
export function localDateOf(ms: number, offsetMinutes: number): string {
  return new Date(ms + offsetMinutes * MIN).toISOString().slice(0, 10);
}
