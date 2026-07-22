/**
 * Device-user identity reconciliation — orchestration.
 *
 * Reusable per school/device (every school has different naming chaos):
 *
 *   runDeviceUserMatching()  TCP-pull the device directory (name, card,
 *                            privilege) → match unmapped PINs against
 *                            unenrolled DRAIS people via the pure engine
 *                            (matching.ts) → persist tiered suggestions
 *   confirmMatch()           admin confirmation → canonical enrollment
 *                            (upsertEnrollment) with 1:1 guards both ways
 *   rejectPin()              admin rejection, kept for audit
 *
 * Protections (mission §9):
 *   - never two PINs → one person: contested autos are downgraded by the
 *     engine; confirmMatch re-checks enrollment state at confirm time
 *   - never auto-overwrite an existing confirmed mapping: already-enrolled
 *     PINs are excluded from matching entirely and reported as such
 *   - every run / confirm / reject lands in device_directory_audit
 *   - the DEVICE is never modified — DRAIS is the identity authority,
 *     the device remains the capture authority.
 */
import { query } from '@/lib/db';
import { runTcpInventory } from '@/lib/biometric/inventory-service';
import { auditDirectoryAction } from '@/lib/biometric/reconciliation-service';
import { upsertEnrollment } from '@/lib/biometric/enrollment-service';
import {
  matchDeviceUsers,
  type DeviceUserForMatch, type MatchCandidate, type DeviceUserMatch,
} from './matching';

let ensured: Promise<void> | null = null;
function ensureSuggestionsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS biometric_match_suggestions (
         id                BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id         BIGINT NOT NULL,
         device_sn         VARCHAR(64) NOT NULL,
         device_pin        VARCHAR(32) NOT NULL,
         device_name       VARCHAR(191) DEFAULT NULL,
         device_priv       INT DEFAULT NULL,
         device_card       VARCHAR(64) DEFAULT NULL,
         has_fingerprint   BOOLEAN DEFAULT NULL,
         candidate_role    VARCHAR(10) DEFAULT NULL,
         candidate_ref_id  BIGINT DEFAULT NULL,
         candidate_person_id BIGINT DEFAULT NULL,
         candidate_name    VARCHAR(191) DEFAULT NULL,
         candidate_position VARCHAR(120) DEFAULT NULL,
         confidence        INT NOT NULL DEFAULT 0,
         tier              ENUM('auto','review','unmatched') NOT NULL,
         contested         BOOLEAN NOT NULL DEFAULT FALSE,
         match_rank        INT NOT NULL DEFAULT 0,
         status            ENUM('pending','confirmed','rejected','superseded') NOT NULL DEFAULT 'pending',
         decided_by        BIGINT DEFAULT NULL,
         decided_at        DATETIME DEFAULT NULL,
         created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         KEY idx_school_device (school_id, device_sn, status),
         KEY idx_pin (school_id, device_sn, device_pin)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
  })();
  return ensured;
}

export interface MatchRunReport {
  deviceSn: string;
  usersOnDevice: number;
  alreadyMapped: number;
  auto: number;
  review: number;
  unmatched: number;
  contested: number;
  items: DeviceUserMatch[];
  mappedPins: Array<{ pin: string; name: string | null; mappedTo: string | null }>;
  source: 'tcp' | 'directory_cache';
  warnings: string[];
}

/** Load staff candidates who do NOT yet hold an enrollment (1:1 guard). */
async function loadFreeStaffCandidates(schoolId: number): Promise<MatchCandidate[]> {
  const rows = (await query(
    `SELECT st.id AS ref_id, st.person_id, st.position,
            TRIM(CONCAT_WS(' ', p.first_name, p.other_name, p.last_name)) AS name
       FROM staff st
       JOIN people p ON p.id = st.person_id
      WHERE st.school_id = ?
        AND st.deleted_at IS NULL AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM biometric_enrollments be
           WHERE be.school_id = st.school_id
             AND be.role_type = 'staff' AND be.role_ref_id = st.id
             AND be.status IN ('active','pending_capture')
        )`,
    [schoolId],
  )) as Array<{ ref_id: number; person_id: number; position: string | null; name: string }>;
  return rows
    .filter(r => r.name)
    .map(r => ({ refId: Number(r.ref_id), roleType: 'staff' as const, personId: Number(r.person_id), name: r.name, position: r.position }));
}

export async function runDeviceUserMatching(args: {
  schoolId: number;
  deviceSn: string;
  lanIp?: string | null;
  port?: number;
  actorUserId?: number | null;
}): Promise<MatchRunReport> {
  const { schoolId, deviceSn } = args;
  await ensureSuggestionsSchema();
  const warnings: string[] = [];

  // ── 1. Device directory: fresh TCP pull, directory cache as fallback ──
  let deviceUsers: DeviceUserForMatch[] = [];
  let source: MatchRunReport['source'] = 'tcp';
  if (args.lanIp) {
    const run = await runTcpInventory({
      schoolId, sn: deviceSn, lanIp: args.lanIp, port: args.port ?? 4370,
      triggeredBy: args.actorUserId ?? null,
    });
    if (run.ok && run.users?.length) {
      deviceUsers = run.users.map(u => ({
        pin: u.pin, name: u.name, card: u.card ?? null, privilege: u.privilege ?? null,
      }));
    } else {
      warnings.push(`TCP inventory failed (${(run as { error?: string }).error || 'no users returned'}) — using the cached directory.`);
    }
  } else {
    warnings.push('No LAN IP for this device — using the cached directory.');
  }
  if (deviceUsers.length === 0) {
    source = 'directory_cache';
    const rows = (await query(
      `SELECT device_user_id AS pin, device_name, device_card, device_priv
         FROM device_user_directory
        WHERE device_sn = ? AND (school_id = ? OR school_id IS NULL)
          AND has_recent_echo = 1`,
      [deviceSn, schoolId],
    )) as Array<{ pin: string; device_name: string | null; device_card: string | null; device_priv: number | null }>;
    deviceUsers = rows.map(r => ({
      pin: String(r.pin), name: r.device_name || '', card: r.device_card, privilege: r.device_priv,
    }));
  }
  deviceUsers = deviceUsers.filter(u => u.pin);

  // ── 2. Existing mappings: excluded from matching, reported verbatim ──
  const enrolled = (await query(
    `SELECT be.pin_value, be.role_type, be.role_ref_id,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS person_name
       FROM biometric_enrollments be
       LEFT JOIN people p ON p.id = be.person_id
      WHERE be.school_id = ? AND be.status IN ('active','pending_capture')`,
    [schoolId],
  )) as Array<{ pin_value: number; role_type: string; role_ref_id: number; person_name: string | null }>;
  const enrolledByPin = new Map(enrolled.map(e => [String(e.pin_value), e]));

  const mappedPins: MatchRunReport['mappedPins'] = [];
  const toMatch: DeviceUserForMatch[] = [];
  for (const u of deviceUsers) {
    const existing = enrolledByPin.get(u.pin);
    if (existing) mappedPins.push({ pin: u.pin, name: u.name || null, mappedTo: existing.person_name });
    else toMatch.push(u);
  }

  // ── 3. Match against free staff via the pure engine ──────────────────
  const candidates = await loadFreeStaffCandidates(schoolId);
  const items = matchDeviceUsers(toMatch.filter(u => u.name), candidates);
  // Nameless device users can never be matched — surface them as unmatched.
  for (const u of toMatch.filter(x => !x.name)) {
    items.push({ device: u, best: null, alternatives: [], tier: 'unmatched' });
  }

  // ── 4. Persist suggestions (pending rows replaced per run) ───────────
  await query(
    `DELETE FROM biometric_match_suggestions
      WHERE school_id = ? AND device_sn = ? AND status = 'pending'`,
    [schoolId, deviceSn],
  );
  for (const it of items) {
    const cands = it.best ? [it.best, ...it.alternatives] : [];
    if (!cands.length) {
      await query(
        `INSERT INTO biometric_match_suggestions
           (school_id, device_sn, device_pin, device_name, device_priv, device_card, tier, contested, match_rank, confidence)
         VALUES (?, ?, ?, ?, ?, ?, 'unmatched', 0, 0, 0)`,
        [schoolId, deviceSn, it.device.pin, it.device.name || null, it.device.privilege ?? null, it.device.card ?? null],
      );
      continue;
    }
    for (let rank = 0; rank < cands.length; rank++) {
      const c = cands[rank];
      await query(
        `INSERT INTO biometric_match_suggestions
           (school_id, device_sn, device_pin, device_name, device_priv, device_card,
            candidate_role, candidate_ref_id, candidate_person_id, candidate_name,
            candidate_position, confidence, tier, contested, match_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          schoolId, deviceSn, it.device.pin, it.device.name || null,
          it.device.privilege ?? null, it.device.card ?? null,
          c.roleType, c.refId, c.personId ?? null, c.name, c.position ?? null,
          c.confidence, it.tier, it.contested ? 1 : 0, rank,
        ],
      );
    }
  }

  const report: MatchRunReport = {
    deviceSn,
    usersOnDevice: deviceUsers.length,
    alreadyMapped: mappedPins.length,
    auto: items.filter(i => i.tier === 'auto').length,
    review: items.filter(i => i.tier === 'review').length,
    unmatched: items.filter(i => i.tier === 'unmatched').length,
    contested: items.filter(i => i.contested).length,
    items,
    mappedPins,
    source,
    warnings,
  };

  await auditDirectoryAction(schoolId, deviceSn, null, 'identity_match_run', args.actorUserId ?? null, {
    usersOnDevice: report.usersOnDevice, alreadyMapped: report.alreadyMapped,
    auto: report.auto, review: report.review, unmatched: report.unmatched, source,
  });

  return report;
}

export interface ConfirmMatchResult {
  ok: boolean;
  enrollmentId?: number;
  reason?: string;
}

/**
 * Admin confirmation → permanent canonical mapping (device PIN → person).
 * All guards re-checked at confirm time, not suggestion time.
 */
export async function confirmMatch(args: {
  schoolId: number;
  deviceSn: string;
  pin: string;
  roleType: 'staff' | 'student';
  refId: number;
  actorUserId?: number | null;
}): Promise<ConfirmMatchResult> {
  const { schoolId, deviceSn, pin, roleType, refId } = args;
  await ensureSuggestionsSchema();

  // Guard 1: PIN must not already be enrolled (never overwrite silently).
  const pinRows = (await query(
    `SELECT id FROM biometric_enrollments
      WHERE school_id = ? AND pin_value = ? AND status IN ('active','pending_capture') LIMIT 1`,
    [schoolId, parseInt(pin, 10)],
  )) as Array<{ id: number }>;
  if (pinRows.length) return { ok: false, reason: 'PIN is already mapped — unmap it first (existing confirmed mappings are never overwritten automatically).' };

  // Guard 2: the person must not hold another enrollment (one person, one PIN).
  const refRows = (await query(
    `SELECT id, pin_value FROM biometric_enrollments
      WHERE school_id = ? AND role_type = ? AND role_ref_id = ?
        AND status IN ('active','pending_capture') LIMIT 1`,
    [schoolId, roleType, refId],
  )) as Array<{ id: number; pin_value: number }>;
  if (refRows.length) return { ok: false, reason: `This person is already mapped to device PIN ${refRows[0].pin_value}.` };

  const res = await upsertEnrollment({
    schoolId, roleType, roleRefId: refId,
    pin: parseInt(pin, 10),
    deviceSn,
    source: 'identity-matching',
    enrolledBy: args.actorUserId ?? null,
  });
  if (!res.ok) return { ok: false, reason: res.detail || res.reason || 'enrollment failed' };

  await query(
    `UPDATE biometric_match_suggestions
        SET status = CASE WHEN candidate_role = ? AND candidate_ref_id = ? THEN 'confirmed' ELSE 'superseded' END,
            decided_by = ?, decided_at = UTC_TIMESTAMP()
      WHERE school_id = ? AND device_sn = ? AND device_pin = ? AND status = 'pending'`,
    [roleType, refId, args.actorUserId ?? null, schoolId, deviceSn, pin],
  );

  await auditDirectoryAction(schoolId, deviceSn, pin, 'identity_match_confirm', args.actorUserId ?? null, {
    roleType, refId, enrollmentId: res.enrollmentId,
  });

  return { ok: true, enrollmentId: res.enrollmentId };
}

export async function rejectPin(args: {
  schoolId: number; deviceSn: string; pin: string; actorUserId?: number | null;
}): Promise<void> {
  await ensureSuggestionsSchema();
  await query(
    `UPDATE biometric_match_suggestions
        SET status = 'rejected', decided_by = ?, decided_at = UTC_TIMESTAMP()
      WHERE school_id = ? AND device_sn = ? AND device_pin = ? AND status = 'pending'`,
    [args.actorUserId ?? null, args.schoolId, args.deviceSn, args.pin],
  );
  await auditDirectoryAction(args.schoolId, args.deviceSn, args.pin, 'identity_match_reject', args.actorUserId ?? null, {});
}
