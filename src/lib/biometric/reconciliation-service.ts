/**
 * Phase 3C — device ⇄ DRAIS reconciliation engine.
 *
 * Replaces the vague "data mismatch" with specific, actionable
 * categories. Compares what a device says it holds (device_user_directory
 * + fingerprint_orphans + biometric_templates captured from it) against
 * what DRAIS knows (canonical biometric_enrollments + students/staff).
 *
 * The compute is on-demand and deterministic; runDeviceReconciliation
 * persists a device_reconciliation_runs row + device_reconciliation_items
 * rows so the result is auditable and individual items carry a
 * resolution lifecycle (open → resolved/ignored/quarantined).
 *
 * Mismatch categories (MismatchType) follow the Phase 3 spec.
 *
 * SAFETY: this service never mutates identity. It only reads + records
 * findings. All mapping/creation goes through enrollment-service so the
 * Phase 1E safety rules (PIN-conflict refusal, school scope, canonical
 * write, deterministic-only name auto-map) are enforced in one place.
 */
import { query } from '@/lib/db';
import {
  loadSchoolRoster, fuzzyCandidatesFromRoster, type NameCandidate,
} from '@/lib/biometric/name-fuzzy';
import { decideNameMatchAction } from '@/lib/biometric/name-match-policy';

export type MismatchType =
  | 'MAPPED_OK'
  | 'DEVICE_ONLY_USER'
  | 'DRAIS_ONLY_PERSON'
  | 'DEVICE_ONLY_TEMPLATE'
  | 'DRAIS_TEMPLATE_NOT_ON_DEVICE'
  | 'NAME_DRIFT'
  | 'PIN_CONFLICT'
  | 'ROLE_CONFLICT'
  | 'STAFF_STUDENT_AMBIGUOUS'
  | 'ORPHAN_TEMPLATE'
  | 'STALE_MAPPING'
  | 'DELETED_PERSON_MAPPING'   // mapping points at an archived/soft-deleted learner or staff
  | 'INACTIVE_MAPPING'         // enrollment suspended for another reason (not recognised)
  | 'IGNORED_OR_QUARANTINED';

export interface ReconItem {
  devicePin: string | null;
  deviceName: string | null;
  matchedPersonId: number | null;
  matchedRoleType: 'student' | 'staff' | null;
  matchedRoleRefId: number | null;
  canonicalEnrollmentId: number | null;
  mismatchType: MismatchType;
  confidence: number | null;
  candidates: NameCandidate[] | null;
  lastSeenOnDeviceAt: string | null;
  hasFingerprintEvidence: boolean;
  notes?: string;
}

export interface ReconReport {
  schoolId: number;
  deviceSn: string;
  directoryIsPartial: boolean;
  deviceUserCount: number;
  draisExpectedCount: number;
  counts: Record<MismatchType, number>;
  items: ReconItem[];
}

const STALE_DAYS = 14;

/**
 * Compute (without persisting) the full reconciliation report for a
 * device. Pure-ish: only reads.
 */
export async function computeReconciliation(
  schoolId: number,
  deviceSn: string,
): Promise<ReconReport> {
  // ── 1. Device side: directory rows for this device ──────────────────
  // When a completed inventory poll exists, trust ONLY the rows it
  // confirmed (has_recent_echo = 1) — that is the device's current
  // truth. Rows from older snapshots (has_recent_echo = 0) are excluded
  // so a fresh poll doesn't leave stale "device-only" ghosts. Devices
  // never polled keep the default has_recent_echo = 1, so they still
  // surface everything captured to date.
  const directory = (await query(
    `SELECT device_user_id AS pin, device_name, device_card,
            last_seen, has_recent_echo, directory_status
       FROM device_user_directory
      WHERE device_sn = ? AND (school_id = ? OR school_id IS NULL)
        AND has_recent_echo = 1`,
    [deviceSn, schoolId],
  )) as Array<{
    pin: string; device_name: string | null; device_card: string | null;
    last_seen: string | null; has_recent_echo: number; directory_status: string;
  }>;

  // ── 2. DRAIS side: canonical enrollments for this school ────────────
  const enrollments = (await query(
    `SELECT be.id, be.pin_value, be.person_id, be.role_type, be.role_ref_id,
            be.status, be.capture_status, be.last_seen_on_device_at,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS person_name,
            (SELECT COUNT(*) FROM biometric_templates bt WHERE bt.enrollment_id = be.id) AS template_count
       FROM biometric_enrollments be
       LEFT JOIN people p ON p.id = be.person_id
      WHERE be.school_id = ?
        AND be.status IN ('active','pending_capture')`,
    [schoolId],
  )) as Array<{
    id: number; pin_value: number; person_id: number;
    role_type: 'student' | 'staff'; role_ref_id: number;
    status: string; capture_status: string; last_seen_on_device_at: string | null;
    person_name: string | null; template_count: number;
  }>;
  const enrollByPin = new Map<number, typeof enrollments[number]>();
  for (const e of enrollments) enrollByPin.set(Number(e.pin_value), e);

  // ── 2b. Identity-integrity issues (Phase 7) ────────────────────────
  // Enrollments that point at a soft-deleted learner/staff, or that are
  // suspended. These must surface as their own categories so a deleted
  // person can never masquerade as a normal mapping.
  const integrityRows = (await query(
    `SELECT be.id, be.pin_value, be.person_id, be.role_type, be.role_ref_id,
            be.status, be.revoked_reason, be.last_seen_on_device_at,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS person_name,
            st.deleted_at AS student_deleted, sf.deleted_at AS staff_deleted
       FROM biometric_enrollments be
       LEFT JOIN people   p  ON p.id  = be.person_id
       LEFT JOIN students st ON be.role_type = 'student' AND st.id = be.role_ref_id
       LEFT JOIN staff    sf ON be.role_type = 'staff'   AND sf.id = be.role_ref_id
      WHERE be.school_id = ?
        AND (
          be.status = 'suspended'
          OR (be.status IN ('active','pending_capture')
              AND (st.deleted_at IS NOT NULL OR sf.deleted_at IS NOT NULL))
        )`,
    [schoolId],
  )) as Array<{
    id: number; pin_value: number; person_id: number;
    role_type: 'student' | 'staff'; role_ref_id: number;
    status: string; revoked_reason: string | null; last_seen_on_device_at: string | null;
    person_name: string | null; student_deleted: string | null; staff_deleted: string | null;
  }>;
  const integrityByPin = new Map<number, {
    type: 'DELETED_PERSON_MAPPING' | 'INACTIVE_MAPPING';
    row: typeof integrityRows[number];
  }>();
  const integrityEnrollmentIds = new Set<number>();
  for (const r of integrityRows) {
    const personDeleted = r.student_deleted != null || r.staff_deleted != null
      || (r.status === 'suspended' && r.revoked_reason === 'person_archived');
    integrityByPin.set(Number(r.pin_value), {
      type: personDeleted ? 'DELETED_PERSON_MAPPING' : 'INACTIVE_MAPPING',
      row: r,
    });
    integrityEnrollmentIds.add(r.id);
  }

  function integrityItem(pin: number, lastSeen: string | null): ReconItem | null {
    const hit = integrityByPin.get(pin);
    if (!hit) return null;
    const r = hit.row;
    return {
      devicePin: String(pin),
      deviceName: r.person_name,
      matchedPersonId: r.person_id,
      matchedRoleType: r.role_type,
      matchedRoleRefId: r.role_ref_id,
      canonicalEnrollmentId: r.id,
      mismatchType: hit.type,
      confidence: 1,
      candidates: null,
      lastSeenOnDeviceAt: lastSeen ?? r.last_seen_on_device_at,
      hasFingerprintEvidence: false,
      notes: hit.type === 'DELETED_PERSON_MAPPING'
        ? `Mapped to an archived ${r.role_type} — unmap or reassign, and remove from device`
        : `Enrollment suspended (${r.revoked_reason || 'inactive'}) — not recognised`,
    };
  }

  // ── 3. Orphan templates on this device (unclaimed) ──────────────────
  const orphans = (await query(
    `SELECT device_user_id AS pin, finger_id, captured_at
       FROM fingerprint_orphans
      WHERE device_sn = ? AND claimed_at IS NULL`,
    [deviceSn],
  )) as Array<{ pin: string; finger_id: string; captured_at: string }>;
  const orphanPins = new Set(orphans.map(o => String(o.pin)));

  // ── 4. Ignored/quarantined device users (latest items) ──────────────
  const triaged = (await query(
    `SELECT device_user_pin AS pin, action_status
       FROM device_reconciliation_items
      WHERE device_sn = ? AND action_status IN ('ignored','quarantined')
      GROUP BY device_user_pin, action_status`,
    [deviceSn],
  )) as Array<{ pin: string; action_status: string }>;
  const triagedPins = new Map(triaged.map(t => [String(t.pin), t.action_status]));
  // pending_device_users carrying a quarantine/ignore decision too
  const pdu = (await query(
    `SELECT device_user_pin AS pin, status
       FROM pending_device_users
      WHERE device_sn = ? AND school_id = ? AND status IN ('ignored','quarantined')`,
    [deviceSn, schoolId],
  )) as Array<{ pin: string; status: string }>;
  for (const p of pdu) triagedPins.set(String(p.pin), p.status);

  // Load the school roster ONCE for in-memory fuzzy matching. Calling
  // the DB per device user times out on TiDB for large directories
  // (one LIKE query each). Two queries + CPU scoring instead.
  const roster = await loadSchoolRoster(schoolId);

  const items: ReconItem[] = [];
  const seenEnrollmentIds = new Set<number>();

  // ── Pass A: walk the device directory ───────────────────────────────
  for (const d of directory) {
    const pinNum = Number(d.pin);
    const enrollment = Number.isFinite(pinNum) ? enrollByPin.get(pinNum) : undefined;
    const hasFpEvidence = orphanPins.has(String(d.pin));
    const triageState = triagedPins.get(String(d.pin));

    if (triageState) {
      items.push(baseItem(d, null, 'IGNORED_OR_QUARANTINED', null, null, hasFpEvidence,
        triageState === 'quarantined' ? 'Quarantined by operator' : 'Ignored by operator'));
      continue;
    }

    // Identity-integrity issues take precedence over MAPPED_OK so a
    // deleted/suspended person never renders as a healthy mapping.
    const integ = Number.isFinite(pinNum) ? integrityItem(pinNum, d.last_seen) : null;
    if (integ) {
      if (integ.canonicalEnrollmentId) seenEnrollmentIds.add(integ.canonicalEnrollmentId);
      items.push(integ);
      continue;
    }

    if (enrollment) {
      seenEnrollmentIds.add(enrollment.id);
      // Name drift check
      const drift = nameDrift(d.device_name, enrollment.person_name);
      if (drift) {
        items.push(baseItem(d, enrollment, 'NAME_DRIFT', enrollment.id, 1, hasFpEvidence,
          `Device "${d.device_name}" vs DRAIS "${enrollment.person_name}"`));
      } else {
        items.push(baseItem(d, enrollment, 'MAPPED_OK', enrollment.id, 1, hasFpEvidence));
      }
      continue;
    }

    // No canonical enrollment at this PIN → device-only.
    // Distinguish template-bearing from plain user, and attach fuzzy
    // candidates (deterministic-or-pending policy decides safety).
    const candidates = d.device_name ? fuzzyCandidatesFromRoster(d.device_name, roster) : [];
    const decision = decideNameMatchAction(candidates);
    let confidence: number | null = candidates[0]?.score ?? null;
    let mismatch: MismatchType = hasFpEvidence ? 'DEVICE_ONLY_TEMPLATE' : 'DEVICE_ONLY_USER';
    let note: string | undefined;
    if (decision.action === 'ambiguous') {
      // Both a learner and a staff member, or two learners
      const hasStudent = decision.candidates.some(c => c.type === 'student');
      const hasStaff = decision.candidates.some(c => c.type === 'staff');
      mismatch = hasStudent && hasStaff ? 'STAFF_STUDENT_AMBIGUOUS' : mismatch;
      note = `${decision.candidates.length} plausible matches — operator must confirm`;
    } else if (decision.action === 'map') {
      note = `Strong suggested match: ${decision.candidate.name} (not auto-applied)`;
      confidence = decision.candidate.score;
    } else {
      note = candidates.length ? 'Weak name match — confirm before mapping' : 'No DRAIS person matches this name';
    }
    items.push(baseItem(d, null, mismatch, null, confidence, hasFpEvidence, note, candidates.slice(0, 5)));
  }

  // ── Pass B: orphan templates whose PIN is NOT in the directory ──────
  const directoryPins = new Set(directory.map(d => String(d.pin)));
  for (const o of orphans) {
    if (directoryPins.has(String(o.pin))) continue; // already handled above
    if (enrollByPin.has(Number(o.pin))) continue;   // claimed-ish; handled in Pass A if in dir
    const candidates: NameCandidate[] = [];
    items.push({
      devicePin: String(o.pin), deviceName: null,
      matchedPersonId: null, matchedRoleType: null, matchedRoleRefId: null,
      canonicalEnrollmentId: null, mismatchType: 'ORPHAN_TEMPLATE',
      confidence: null, candidates, lastSeenOnDeviceAt: o.captured_at,
      hasFingerprintEvidence: true,
      notes: 'Fingerprint template on device with no DRAIS identity',
    });
  }

  // ── Pass C: DRAIS enrollments not echoed by the device ──────────────
  for (const e of enrollments) {
    if (seenEnrollmentIds.has(e.id)) continue;
    if (integrityEnrollmentIds.has(e.id)) continue; // surfaced as an integrity item instead
    const inDirectory = directory.some(d => Number(d.pin) === Number(e.pin_value));
    if (inDirectory) continue;
    // DRAIS knows this person at this PIN, device hasn't echoed it.
    const stale = e.last_seen_on_device_at
      ? (Date.now() - new Date(e.last_seen_on_device_at).getTime()) > STALE_DAYS * 86400_000
      : true;
    const hasTemplate = Number(e.template_count) > 0;
    const mismatch: MismatchType = hasTemplate ? 'DRAIS_TEMPLATE_NOT_ON_DEVICE'
      : stale ? 'STALE_MAPPING' : 'DRAIS_ONLY_PERSON';
    items.push({
      devicePin: String(e.pin_value),
      deviceName: e.person_name,
      matchedPersonId: e.person_id,
      matchedRoleType: e.role_type,
      matchedRoleRefId: e.role_ref_id,
      canonicalEnrollmentId: e.id,
      mismatchType: mismatch,
      confidence: 1,
      candidates: null,
      lastSeenOnDeviceAt: e.last_seen_on_device_at,
      hasFingerprintEvidence: hasTemplate,
      notes: hasTemplate
        ? 'DRAIS holds a template; device has not confirmed this PIN'
        : (mismatch === 'STALE_MAPPING' ? `Not echoed by device in ${STALE_DAYS}+ days` : 'Enrolled in DRAIS, not seen on device'),
    });
  }

  // ── Pass D: integrity issues whose PIN the device didn't echo ───────
  // A deleted/suspended person's mapping must show even when the device
  // never echoed the PIN (e.g. K40 partial directory).
  for (const [pin, hit] of integrityByPin) {
    if (directoryPins.has(String(pin))) continue;   // handled in Pass A
    if (seenEnrollmentIds.has(hit.row.id)) continue;
    const it = integrityItem(pin, null);
    if (it) { seenEnrollmentIds.add(hit.row.id); items.push(it); }
  }

  const counts = emptyCounts();
  for (const it of items) counts[it.mismatchType]++;

  return {
    schoolId, deviceSn,
    directoryIsPartial: true, // K40 ADMS only echoes pushed/updated users — never claim full inventory
    deviceUserCount: directory.length,
    draisExpectedCount: enrollments.length,
    counts,
    items,
  };
}

/**
 * Compute + persist a reconciliation run with its items.
 * Returns the run id and the report. Open items from prior runs for
 * this device are superseded (the latest run is the live view); their
 * ignored/quarantined decisions are preserved because computeReconciliation
 * re-reads those states.
 */
export async function runDeviceReconciliation(
  schoolId: number,
  deviceSn: string,
  opts: { triggerSource?: string; requestedBy?: number | null } = {},
): Promise<{ runId: number; report: ReconReport }> {
  const report = await computeReconciliation(schoolId, deviceSn);
  const mismatchCount = report.items.filter(i => i.mismatchType !== 'MAPPED_OK').length;
  const mappedCount = report.counts.MAPPED_OK;

  const ins = (await query(
    `INSERT INTO device_reconciliation_runs
       (school_id, device_sn, status, completed_at, trigger_source, requested_by,
        device_user_count, drais_expected_count, mapped_count, mismatch_count, directory_is_partial)
     VALUES (?, ?, 'completed', NOW(), ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, deviceSn, opts.triggerSource ?? 'manual', opts.requestedBy ?? null,
     report.deviceUserCount, report.draisExpectedCount, mappedCount, mismatchCount,
     report.directoryIsPartial ? 1 : 0],
  )) as any;
  const runId = ins.insertId;

  // Persist items (skip MAPPED_OK to keep the table focused on actionable
  // rows, but keep IGNORED/QUARANTINED so the audit trail survives).
  // BATCHED multi-row INSERT — a device with hundreds of unknown users
  // would time out on TiDB with one INSERT per item.
  const actionable = report.items.filter(it => it.mismatchType !== 'MAPPED_OK');
  const CHUNK = 100;
  for (let i = 0; i < actionable.length; i += CHUNK) {
    const slice = actionable.slice(i, i + CHUNK);
    const placeholders = slice.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const it of slice) {
      const actionStatus = it.mismatchType === 'IGNORED_OR_QUARANTINED'
        ? (it.notes?.includes('Quarantined') ? 'quarantined' : 'ignored')
        : 'open';
      params.push(
        runId, schoolId, deviceSn, it.devicePin, it.deviceName,
        it.matchedPersonId, it.matchedRoleType, it.matchedRoleRefId,
        it.canonicalEnrollmentId, it.mismatchType, it.confidence,
        it.candidates && it.candidates.length ? JSON.stringify(it.candidates.slice(0, 5)) : null,
        actionStatus, it.notes ?? null,
      );
    }
    await query(
      `INSERT INTO device_reconciliation_items
         (run_id, school_id, device_sn, device_user_pin, device_name,
          matched_person_id, matched_role_type, matched_role_ref_id,
          canonical_enrollment_id, mismatch_type, confidence, candidates_json,
          action_status, notes)
       VALUES ${placeholders}`,
      params,
    );
  }

  return { runId, report };
}

// ── helpers ───────────────────────────────────────────────────────────

function baseItem(
  d: { pin: string; device_name: string | null; last_seen: string | null },
  enrollment: { id: number; person_id: number; role_type: 'student' | 'staff'; role_ref_id: number } | null,
  mismatchType: MismatchType,
  enrollmentId: number | null,
  confidence: number | null,
  hasFp: boolean,
  notes?: string,
  candidates?: NameCandidate[],
): ReconItem {
  return {
    devicePin: String(d.pin),
    deviceName: d.device_name,
    matchedPersonId: enrollment?.person_id ?? null,
    matchedRoleType: enrollment?.role_type ?? null,
    matchedRoleRefId: enrollment?.role_ref_id ?? null,
    canonicalEnrollmentId: enrollmentId,
    mismatchType,
    confidence,
    candidates: candidates ?? null,
    lastSeenOnDeviceAt: d.last_seen,
    hasFingerprintEvidence: hasFp,
    notes,
  };
}

/** Token-set comparison: true when the names clearly differ. */
function nameDrift(deviceName: string | null, draisName: string | null): boolean {
  if (!deviceName || !draisName) return false;
  const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[^A-Z ]/g, ' ')
    .split(/\s+/).filter(t => t.length >= 3);
  const a = new Set(norm(deviceName));
  const b = new Set(norm(draisName));
  if (a.size === 0 || b.size === 0) return false;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  // No shared meaningful token → drift.
  return common === 0;
}

function emptyCounts(): Record<MismatchType, number> {
  return {
    MAPPED_OK: 0, DEVICE_ONLY_USER: 0, DRAIS_ONLY_PERSON: 0, DEVICE_ONLY_TEMPLATE: 0,
    DRAIS_TEMPLATE_NOT_ON_DEVICE: 0, NAME_DRIFT: 0, PIN_CONFLICT: 0, ROLE_CONFLICT: 0,
    STAFF_STUDENT_AMBIGUOUS: 0, ORPHAN_TEMPLATE: 0, STALE_MAPPING: 0,
    DELETED_PERSON_MAPPING: 0, INACTIVE_MAPPING: 0, IGNORED_OR_QUARANTINED: 0,
  };
}

/** Append-only audit row for a directory action. Best-effort. */
export async function auditDirectoryAction(
  schoolId: number, deviceSn: string, pin: string | null,
  action: string, actorUserId: number | null, detail: Record<string, unknown>,
): Promise<void> {
  try {
    await query(
      `INSERT INTO device_directory_audit (school_id, device_sn, device_user_pin, action, actor_user_id, detail_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [schoolId, deviceSn, pin, action.slice(0, 48), actorUserId, JSON.stringify(detail).slice(0, 60000)],
    );
  } catch (err) {
    console.warn('[reconciliation] audit write failed:', err);
  }
}
