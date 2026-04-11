import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * ZKTeco ADMS (Push Protocol) Handler
 * ────────────────────────────────────
 * All device traffic arrives via rewrite:
 *   /iclock/* → /api/zk-handler
 *
 * Protocol rules:
 *   - Always respond 200 text/plain
 *   - Even on errors → return "OK" (device disconnects permanently otherwise)
 *   - One command per GET response max
 */

export const runtime = 'nodejs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Always return text/plain. Device expects this format — NEVER return JSON. */
function textResponse(body: string = 'OK', status: number = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Parse ZKTeco ADMS body.
 * Format varies by firmware but commonly:
 *   - Tab-separated key=value pairs on a single line
 *   - Or newline-separated rows of tab-separated key=value
 *
 * OPERLOG lines start with "OPLOG" — must be detected and tagged.
 *
 * Examples:
 *   USERID=101\tCHECKTIME=2026-03-30 10:00:00\tLOGID=1
 *   101\t2026-03-30 10:00:00\t0\t1\t\t0\t0\t0\t0
 *   OPLOG 4\t0\t2026-04-02 16:54:02\t1\t0\t0\t0
 */
function parseZKBody(raw: string, tableName: string): { records: Record<string, string>[]; lines: string[] } {
  const records: Record<string, string>[] = [];
  const lines: string[] = [];
  if (!raw || !raw.trim()) return { records, lines };

  const rawLines = raw.trim().split('\n');

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lines.push(trimmed);

    // ── Skip OPERLOG lines when we're expecting ATTLOG ────────────────────
    // OPERLOG lines start with "OPLOG" — they have a different schema
    if (/^OPLOG\s/i.test(trimmed)) {
      records.push({ _TYPE: 'OPERLOG', _RAW: trimmed });
      continue;
    }

    // Key=Value format (standard ADMS)
    if (trimmed.includes('=')) {
      const record: Record<string, string> = {};
      const parts = trimmed.split('\t');
      for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx > 0) {
          const key = part.substring(0, eqIdx).trim().toUpperCase();
          const value = part.substring(eqIdx + 1).trim();
          record[key] = value;
        }
      }
      if (Object.keys(record).length > 0) records.push(record);
    } else {
      // Positional format: userid \t timestamp \t status \t verify \t workcode \t ...
      const cols = trimmed.split('\t');
      if (cols.length >= 2) {
        records.push({
          USERID: cols[0]?.trim() || '',
          CHECKTIME: cols[1]?.trim() || '',
          VERIFYTYPE: cols[2]?.trim() || '',
          INOUTMODE: cols[3]?.trim() || '',
          WORKCODE: cols[4]?.trim() || '',
          LOGID: cols[5]?.trim() || '',
        });
      }
    }
  }

  return { records, lines };
}

/** Extract device serial number from request. */
function getSerialNumber(req: NextRequest): string | null {
  const url = new URL(req.url);
  return url.searchParams.get('SN') || url.searchParams.get('sn') || null;
}

/** Get client IP for logging. */
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Structured log to stdout (JSON for Vercel log drain). */
function zkLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  data: Record<string, unknown>,
) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    type: 'ZK_ADMS',
    event,
    ...data,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Normalize CHECKTIME to MySQL DATETIME format (YYYY-MM-DD HH:mm:ss).
 * ZKTeco devices may send: "2026-03-30 10:00:00", "2026/03/30 10:00:00",
 * "20260330100000", or other variants.
 */
function normalizeCheckTime(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.trim();

  // Already correct format
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clean)) return clean;

  // Slash format → dash
  if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(clean)) {
    return clean.replace(/\//g, '-');
  }

  // Compact format: 20260330100000
  if (/^\d{14}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }

  // Date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return `${clean} 00:00:00`;

  // Let DB handle it; return as-is
  return clean;
}

// ─── Database Operations (all wrapped in try/catch — NEVER crash) ─────────

/** Write a structured event to system_logs. Fire-and-forget. */
async function logSystemEvent(
  deviceSn: string | null,
  eventType: 'HEARTBEAT' | 'PUNCH' | 'COMMAND_SENT' | 'COMMAND_ACK' | 'USERINFO' | 'ERROR' | 'SYSTEM',
  direction: 'INCOMING' | 'OUTGOING',
  rawData: string | null,
  ip: string,
  ua: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO system_logs (device_sn, event_type, direction, raw_data, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [deviceSn, eventType, direction, rawData, ip, ua],
    );
  } catch (err) {
    // Never crash — this is a best-effort log
    zkLog('warn', 'SYSTEM_LOG_WRITE_FAILED', { eventType, error: String(err) });
  }
}

/**
 * Save raw HTTP traffic to zk_raw_logs.
 * THIS IS MANDATORY — if this fails, the caller must handle it.
 * Raw data is the forensic source of truth. Nothing else matters if this doesn't write.
 */
async function saveRawLog(
  deviceSn: string | null,
  method: string,
  queryString: string,
  body: string | null,
  parsedData: unknown,
  sourceIp: string,
  userAgent: string,
  headers: Record<string, string> | null,
  endpoint: string,
  schoolId: number,
): Promise<number> {
  const result = await query(
    `INSERT INTO zk_raw_logs
       (device_sn, http_method, query_string, raw_body, parsed_data, source_ip, user_agent, headers, endpoint, school_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deviceSn ?? 'UNKNOWN',
      method,
      queryString,
      body,
      parsedData != null ? JSON.stringify(parsedData) : null,
      sourceIp,
      userAgent,
      headers ? JSON.stringify(headers) : null,
      endpoint,
      schoolId,
    ],
  );
  const insertId = (result as any)?.insertId;
  if (!insertId) {
    throw new Error('RAW_LOG_INSERT_RETURNED_NO_ID');
  }
  return insertId;
}

/**
 * Save a single parsed record to zk_parsed_logs.
 * Links back to the raw log via raw_log_id.
 * On failure, saves with status='failed' + error_message.
 */
async function saveParsedLog(opts: {
  rawLogId: number;
  deviceSn: string;
  schoolId: number;
  tableName: string;
  rawLine: string;
  userId?: string | null;
  checkTime?: string | null;
  verifyType?: string | null;
  inoutMode?: string | null;
  workCode?: string | null;
  logId?: string | null;
  matched?: boolean;
  studentId?: number | null;
  staffId?: number | null;
  status: 'success' | 'failed';
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO zk_parsed_logs
         (raw_log_id, device_sn, school_id, table_name, raw_line,
          user_id, check_time, verify_type, inout_mode, work_code, log_id,
          matched, student_id, staff_id, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.rawLogId,
        opts.deviceSn,
        opts.schoolId,
        opts.tableName,
        opts.rawLine?.substring(0, 65000) ?? null,
        opts.userId ?? null,
        opts.checkTime ?? null,
        opts.verifyType ?? null,
        opts.inoutMode ?? null,
        opts.workCode ?? null,
        opts.logId ?? null,
        opts.matched ? 1 : 0,
        opts.studentId ?? null,
        opts.staffId ?? null,
        opts.status,
        opts.errorMessage ?? null,
      ],
    );
  } catch (err) {
    // If even the parsed log INSERT fails, log to stdout as last resort
    zkLog('error', 'PARSED_LOG_SAVE_FAILED', { rawLogId: opts.rawLogId, error: String(err) });
  }
}

// ─── zk_device_logs — Unified Observability (NEVER remove) ───────────────────

type ZkEventType = 'HEARTBEAT' | 'DATA_RECEIVED' | 'DATA_PARSED' | 'PUNCH_SAVED' | 'ERROR';

interface ZkDeviceLogEntry {
  deviceSn:     string | null;
  ipAddress?:   string;
  eventType:    ZkEventType;
  tableName?:   string;
  rawPayload?:  string;
  parsedJson?:  unknown;
  recordCount?: number;
  userId?:      string;
  checkTime?:   string | null;
  matched?:     boolean;
  studentId?:   number | null;
  staffId?:     number | null;
  status?:      'success' | 'failed';
  errorMessage?: string;
  schoolId:     number;
}

/**
 * Write one row to zk_device_logs.
 * Fire-and-forget: NEVER throws, NEVER crashes the request.
 * This is the core observability write — every interaction lands here.
 */
async function logDeviceEvent(entry: ZkDeviceLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO zk_device_logs
         (device_sn, ip_address, event_type, table_name, raw_payload, parsed_json,
          record_count, user_id, check_time, matched, student_id, staff_id,
          status, error_message, school_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.deviceSn ?? null,
        entry.ipAddress ?? null,
        entry.eventType,
        entry.tableName ?? null,
        entry.rawPayload ?? null,
        entry.parsedJson != null ? JSON.stringify(entry.parsedJson) : null,
        entry.recordCount ?? 0,
        entry.userId ?? null,
        entry.checkTime ?? null,
        entry.matched ? 1 : 0,
        entry.studentId ?? null,
        entry.staffId ?? null,
        entry.status ?? 'success',
        entry.errorMessage ?? null,
        entry.schoolId,
      ],
    );
  } catch (err) {
    // Best-effort — log to stdout but NEVER propagate the error
    zkLog('warn', 'ZK_DEVICE_LOG_WRITE_FAILED', { event: entry.eventType, error: String(err) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** Get the school_id for a device from the devices table. */
async function getDeviceSchoolId(sn: string): Promise<number | null> {
  try {
    const rows = await query(
      'SELECT school_id FROM devices WHERE sn = ? LIMIT 1',
      [sn],
    );
    return rows?.[0]?.school_id ?? null;
  } catch {
    return null; // unknown — will show to all admins via OR school_id IS NULL
  }
}

/**
 * Update device_sync_state on every heartbeat.
 * Compares expected user count (zk_user_mapping) vs acknowledged commands.
 * Sets sync_status = 'out_of_sync' when they diverge.
 * Fire-and-forget — NEVER throws.
 */
async function updateDeviceSyncState(sn: string, schoolId: number | null): Promise<void> {
  try {
    // Expected = users mapped to this device in DB
    const expectedRow = await query(
      `SELECT COUNT(*) AS cnt FROM zk_user_mapping WHERE device_sn = ? OR device_sn IS NULL`,
      [sn],
    );
    const expectedCount = Number(expectedRow?.[0]?.cnt ?? 0);

    // Known = how many DATA UPDATE USERINFO commands were acknowledged (proxy for "on device")
    const ackedRow = await query(
      `SELECT COUNT(*) AS cnt FROM zk_device_commands
       WHERE device_sn = ? AND status = 'acknowledged' AND command LIKE 'DATA UPDATE USERINFO%'`,
      [sn],
    );
    const ackedCount = Number(ackedRow?.[0]?.cnt ?? 0);

    const syncStatus =
      expectedCount === 0 ? 'unknown'
      : ackedCount === expectedCount ? 'synced'
      : 'out_of_sync';

    await query(
      `INSERT INTO device_sync_state
         (id, device_sn, school_id, expected_user_count, last_known_device_user_count, sync_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         expected_user_count = VALUES(expected_user_count),
         last_known_device_user_count = VALUES(last_known_device_user_count),
         sync_status = VALUES(sync_status),
         updated_at = NOW()`,
      [sn, sn, schoolId, expectedCount, ackedCount, syncStatus],
    );
  } catch (err) {
    zkLog('warn', 'SYNC_STATE_UPDATE_FAILED', { sn, error: String(err) });
  }
}

/**
 * Register device or update heartbeat on first/every GET.
 * SELF-HEALING: If a device was soft-deleted, auto-recover it on next heartbeat.
 * Also logs every heartbeat to device_heartbeats for forensics.
 */
async function upsertDevice(
  sn: string,
  ip: string,
  options: string | null,
  pushVer: string | null,
  schoolId: number | null,
): Promise<void> {
  try {
    // Log heartbeat for forensics / debugging (fire-and-forget)
    query(
      `INSERT INTO device_heartbeats (sn, ip, push_version, options, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [sn, ip, pushVer, options],
    ).catch(() => {});

    // Single atomic upsert — handles insert, update, AND resurrection
    await query(
      `INSERT INTO devices (sn, ip_address, options, push_version, last_seen, is_online, status, school_id)
       VALUES (?, ?, ?, ?, NOW(), TRUE, 'active', ?)
       ON DUPLICATE KEY UPDATE
         ip_address = VALUES(ip_address),
         options = COALESCE(VALUES(options), options),
         push_version = COALESCE(VALUES(push_version), push_version),
         last_seen = NOW(),
         is_online = TRUE,
         status = 'active',
         deleted_at = NULL,
         school_id = COALESCE(school_id, VALUES(school_id)),
         updated_at = CURRENT_TIMESTAMP`,
      [sn, ip, options, pushVer, schoolId],
    );

    zkLog('info', 'DEVICE_UPSERT', { sn, ip, schoolId });
  } catch (err) {
    zkLog('error', 'DEVICE_UPSERT_FAILED', { sn, error: String(err) });
  }
}

/**
 * Fetch pending command(s) for a device.
 *
 * BATCHING: When the highest-priority pending command is DATA UPDATE USERINFO,
 * we grab ALL pending USERINFO commands and combine them into a single
 * multi-record payload. ZKTeco devices accept multiple records per push:
 *
 *   DATA UPDATE USERINFO PIN=1\tName=John\t…
 *   PIN=2\tName=Jane\t…
 *   PIN=3\tName=Bob\t…
 *
 * This turns 500+ individual commands (one per heartbeat = 8+ hours) into
 * a single delivery on one heartbeat.
 *
 * Returns { id (primary), batchIds (all IDs), command (combined) }.
 */
async function getPendingCommand(
  sn: string,
): Promise<{ id: number; command: string; batchIds?: number[] } | null> {
  try {
    const rows = await query(
      `SELECT id, command FROM zk_device_commands
       WHERE device_sn = ? AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         AND retry_count < max_retries
       ORDER BY priority DESC, id ASC
       LIMIT 1`,
      [sn],
    );
    if (!rows || rows.length === 0) return null;

    const first = rows[0];

    // If this is a USERINFO push, batch ALL pending USERINFO commands together
    if (first.command.startsWith('DATA UPDATE USERINFO PIN=')) {
      try {
        const allRows = await query(
          `SELECT id, command FROM zk_device_commands
           WHERE device_sn = ? AND status = 'pending'
             AND command LIKE 'DATA UPDATE USERINFO PIN=%'
             AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
             AND retry_count < max_retries
           ORDER BY id ASC`,
          [sn],
        );

        if (allRows && allRows.length > 1) {
          // First record keeps the full header, the rest are just the PIN= lines
          const lines: string[] = [];
          const batchIds: number[] = [];
          for (const row of allRows) {
            // Each command is: "DATA UPDATE USERINFO PIN=X\tName=Y\t..."
            // Strip the "DATA UPDATE USERINFO " prefix from records after the first
            const payload = row.command.replace(/^DATA UPDATE USERINFO /, '');
            lines.push(payload);
            batchIds.push(row.id);
          }

          const batchedCommand = 'DATA UPDATE USERINFO ' + lines.join('\n');

          zkLog('info', 'USERINFO_BATCH', {
            sn,
            batchSize: batchIds.length,
            primaryId: first.id,
          });

          return { id: first.id, command: batchedCommand, batchIds };
        }
      } catch (err) {
        zkLog('warn', 'BATCH_FETCH_FAILED', { sn, error: String(err) });
        // Fall through to single-command delivery
      }
    }

    return { id: first.id, command: first.command };
  } catch (err) {
    zkLog('error', 'COMMAND_FETCH_FAILED', { sn, error: String(err) });
    return null;
  }
}

/** Mark command(s) as sent after delivery. Handles both single and batch. */
async function markCommandSent(commandId: number, batchIds?: number[]): Promise<void> {
  try {
    if (batchIds && batchIds.length > 1) {
      // Batch: mark ALL commands as sent in one UPDATE
      const placeholders = batchIds.map(() => '?').join(',');
      await query(
        `UPDATE zk_device_commands
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})`,
        batchIds,
      );
      zkLog('info', 'BATCH_MARKED_SENT', { primaryId: commandId, count: batchIds.length });
    } else {
      await query(
        `UPDATE zk_device_commands
         SET status = 'sent', sent_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [commandId],
      );
    }
  } catch (err) {
    zkLog('error', 'COMMAND_MARK_SENT_FAILED', { commandId, error: String(err) });
  }
}

/**
 * Match a device USERID to a student or staff record.
 * Matching chain:
 *   1. zk_user_mapping (ZK-specific mapping, per-device or global)
 *   2. device_users (general biometric device mapping by device_user_id)
 *   3. Unmatched — still saved for later manual mapping
 */
async function resolveUser(
  deviceUserId: string,
  deviceSn: string,
  schoolId: number,
): Promise<{ studentId: number | null; staffId: number | null; matched: boolean }> {
  // 1. Check ZK user mapping (ZK-specific)
  // NOTE: school_id intentionally NOT enforced — device may serve students
  // from a different school than the device's registered school.
  try {
    const mapping = await query(
      `SELECT user_type, student_id, staff_id FROM zk_user_mapping
       WHERE device_user_id = ? AND (device_sn = ? OR device_sn IS NULL)
       LIMIT 1`,
      [deviceUserId, deviceSn],
    );
    if (mapping && mapping.length > 0) {
      return {
        studentId: mapping[0].student_id ?? null,
        staffId: mapping[0].staff_id ?? null,
        matched: true,
      };
    }
  } catch (err) {
    zkLog('warn', 'ZK_MAPPING_QUERY_FAILED', { deviceUserId, error: String(err) });
  }

  // 2. Check device_users table (general biometric mapping)
  // NOTE: school_id intentionally NOT enforced — same reasoning as above.
  try {
    const deviceUser = await query(
      `SELECT du.person_type, du.person_id
       FROM device_users du
       WHERE du.device_user_id = ? AND du.is_enrolled = 1
       LIMIT 1`,
      [deviceUserId],
    );
    if (deviceUser && deviceUser.length > 0) {
      const row = deviceUser[0];
      return {
        studentId: row.person_type === 'student' ? row.person_id : null,
        staffId: row.person_type === 'teacher' ? row.person_id : null,
        matched: true,
      };
    }
  } catch (err) {
    zkLog('warn', 'DEVICE_USERS_QUERY_FAILED', { deviceUserId, error: String(err) });
  }

  // 3. Check device_user_mappings table (ADMS device-level mapping)
  try {
    const dum = await query(
      `SELECT dum.student_id, dum.staff_id
       FROM device_user_mappings dum
       WHERE dum.device_user_id = ? AND dum.device_sn = ?
       LIMIT 1`,
      [deviceUserId, deviceSn],
    );
    if (dum && dum.length > 0) {
      return {
        studentId: dum[0].student_id ?? null,
        staffId: dum[0].staff_id ?? null,
        matched: true,
      };
    }
  } catch (err) {
    zkLog('warn', 'DEVICE_USER_MAPPINGS_QUERY_FAILED', { deviceUserId, error: String(err) });
  }

  // 4. No match found
  return { studentId: null, staffId: null, matched: false };
}

/** Save a parsed attendance punch with full matching chain. */
async function saveAttendancePunch(
  deviceSn: string,
  record: Record<string, string>,
  rawLogId: number | null,
  schoolId: number,
): Promise<void> {
  const userId = record.USERID;
  const rawCheckTime = record.CHECKTIME;
  if (!userId || !rawCheckTime) return;

  const checkTime = normalizeCheckTime(rawCheckTime);
  if (!checkTime) return;

  try {
    const { studentId, staffId, matched } = await resolveUser(userId, deviceSn, schoolId);

    await query(
      `INSERT INTO zk_attendance_logs
         (school_id, device_sn, device_user_id, student_id, staff_id, check_time,
          verify_type, io_mode, log_id, work_code, matched, raw_log_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolId,
        deviceSn,
        userId,
        studentId,
        staffId,
        checkTime,
        record.VERIFYTYPE ? parseInt(record.VERIFYTYPE, 10) || null : null,
        record.INOUTMODE ? parseInt(record.INOUTMODE, 10) || null : null,
        record.LOGID || null,
        record.WORKCODE || null,
        matched ? 1 : 0,
        rawLogId,
      ],
    );

    // ── Observability: PUNCH_SAVED (truth record) ──────────────────────────
    await logDeviceEvent({
      deviceSn,
      eventType:  'PUNCH_SAVED',
      tableName:  'ATTLOG',
      userId,
      checkTime,
      matched,
      studentId,
      staffId,
      status:     'success',
      schoolId,
    });

    zkLog('info', 'PUNCH_SAVED', {
      deviceSn,
      userId,
      checkTime,
      matched,
      studentId,
      staffId,
      schoolId,
    });
  } catch (err) {
    // ── Observability: ERROR on punch failure ──────────────────────────────
    logDeviceEvent({
      deviceSn,
      eventType:    'ERROR',
      tableName:    'ATTLOG',
      userId,
      checkTime,
      status:       'failed',
      errorMessage: String(err),
      schoolId,
    }).catch(() => {});

    zkLog('error', 'PUNCH_SAVE_FAILED', {
      deviceSn,
      userId,
      checkTime: rawCheckTime,
      error: String(err),
    });
  }
}

/**
 * Process USERINFO data pushed by device after a DATA QUERY USERINFO command.
 * Creates zk_user_mapping entries AND actual people + students records
 * so learners appear immediately in the DRAIS system.
 */
async function processUserInfo(
  deviceSn: string,
  records: Record<string, string>[],
  schoolId: number,
): Promise<void> {
  let created = 0;
  let skipped = 0;
  let learnersCreated = 0;

  for (const record of records) {
    const userId = record.USERID || record.PIN;
    if (!userId) continue;

    const name = (record.NAME || record.USERNAME || '').trim();
    const cardNo = record.CARDNO || record.CARD || '';
    const deviceUserId = String(userId).trim();

    // Skip unnamed / admin accounts
    if (!name || name.toLowerCase() === 'admin') {
      skipped++;
      continue;
    }

    try {
      // Check if this device user already has a student record linked
      const existingMapping = await query(
        `SELECT student_id FROM zk_user_mapping
         WHERE device_user_id = ? AND school_id = ? AND student_id IS NOT NULL LIMIT 1`,
        [deviceUserId, schoolId],
      );

      if (existingMapping?.[0]?.student_id) {
        // Already linked — just update card number if changed
        await query(
          `UPDATE zk_user_mapping SET
             card_number = COALESCE(NULLIF(?, ''), card_number),
             device_sn = COALESCE(?, device_sn),
             updated_at = CURRENT_TIMESTAMP
           WHERE device_user_id = ? AND school_id = ?`,
          [cardNo || null, deviceSn, deviceUserId, schoolId],
        );
        created++;
        continue;
      }

      // Split name intelligently
      const nameParts = name.split(/\s+/);
      const firstName = nameParts[0] || name;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      // ── Try to match existing student by name before creating new records ──
      let studentId: number | null = null;
      let personId: number | null = null;

      const existingStudent = await query(
        `SELECT s.id AS student_id, s.person_id
         FROM students s
         JOIN people p ON s.person_id = p.id
         WHERE s.school_id = ?
           AND LOWER(TRIM(p.first_name)) = LOWER(?)
           AND LOWER(TRIM(p.last_name)) = LOWER(?)
           AND s.status = 'active'
         LIMIT 1`,
        [schoolId, firstName, lastName],
      );

      if (existingStudent && existingStudent.length > 0) {
        studentId = existingStudent[0].student_id;
        personId = existingStudent[0].person_id;
        zkLog('info', 'USERINFO_NAME_MATCHED', { userId, name, studentId, personId });
      } else {
        // No name match — create new person + student records
        const personResult: any = await query(
          `INSERT INTO people (school_id, first_name, last_name, created_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [schoolId, firstName, lastName],
        );
        personId = personResult?.insertId;

        if (!personId) {
          skipped++;
          zkLog('warn', 'USERINFO_PERSON_CREATE_FAILED', { userId, name });
          continue;
        }

        const studentResult: any = await query(
          `INSERT INTO students (school_id, person_id, status, admission_date, created_at)
           VALUES (?, ?, 'active', CURDATE(), CURRENT_TIMESTAMP)`,
          [schoolId, personId],
        );
        studentId = studentResult?.insertId;

        if (!studentId) {
          skipped++;
          zkLog('warn', 'USERINFO_STUDENT_CREATE_FAILED', { userId, name, personId });
          continue;
        }
      }

      // Upsert into zk_user_mapping with the matched/new student_id
      await query(
        `INSERT INTO zk_user_mapping (school_id, device_user_id, user_type, student_id, device_sn, card_number)
         VALUES (?, ?, 'student', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           student_id = VALUES(student_id),
           card_number = COALESCE(VALUES(card_number), card_number),
           updated_at = CURRENT_TIMESTAMP`,
        [schoolId, deviceUserId, studentId, deviceSn, cardNo || null],
      );

      created++;
      learnersCreated++;
      zkLog('info', 'USERINFO_LEARNER_LINKED', { userId, name, studentId, personId, schoolId });
    } catch (err) {
      skipped++;
      zkLog('warn', 'USERINFO_UPSERT_SKIP', { userId, error: String(err) });
    }
  }

  // Mark any pending DATA QUERY USERINFO commands as acknowledged
  try {
    await query(
      `UPDATE zk_device_commands
       SET status = 'acknowledged', ack_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE device_sn = ? AND command LIKE '%USERINFO%' AND status = 'sent'`,
      [deviceSn],
    );
  } catch { /* non-critical */ }

  zkLog('info', 'USERINFO_PROCESSED', { deviceSn, created, skipped, learnersCreated, total: records.length });

  // ── Backfill: retroactively match any unmatched attendance logs ──
  if (created > 0) {
    try {
      const backfillResult: any = await query(
        `UPDATE zk_attendance_logs al
         JOIN zk_user_mapping m
           ON m.device_user_id = al.device_user_id
          AND (m.device_sn = al.device_sn OR m.device_sn IS NULL)
         SET al.student_id = m.student_id,
             al.staff_id  = m.staff_id,
             al.matched    = 1
         WHERE al.device_sn = ?
           AND al.matched = 0
           AND m.student_id IS NOT NULL`,
        [deviceSn],
      );
      const backfilled = backfillResult?.affectedRows || 0;
      if (backfilled > 0) {
        zkLog('info', 'ATTENDANCE_BACKFILL', { deviceSn, backfilled });
      }
    } catch (err) {
      zkLog('warn', 'ATTENDANCE_BACKFILL_FAILED', { deviceSn, error: String(err) });
    }
  }
}

/**
 * Process a fingerprint template received from the device via OPERLOG.
 * Format: FP PIN={pin}\tFID={fid}\tSize={size}\tValid={v}\tTMP={base64data}
 *
 * This is sent when someone enrolls their fingerprint locally on the K40 device.
 * We store it in student_fingerprints (if the PIN maps to a student).
 */
async function processFingerprint(
  deviceSn: string,
  pin: string,
  fid: string,
  size: string,
  valid: string,
  templateData: string,
  schoolId: number,
): Promise<void> {
  // Look up who this PIN belongs to
  const mapping = await query(
    `SELECT student_id, staff_id FROM zk_user_mapping
     WHERE device_user_id = ? AND (device_sn = ? OR device_sn IS NULL)
     LIMIT 1`,
    [pin, deviceSn],
  );

  const studentId = mapping?.[0]?.student_id || null;
  const staffId = mapping?.[0]?.staff_id || null;

  if (studentId) {
    // Map ZK FID (0-9) to finger_position enum
    // ZK convention: 0-4 = right hand (thumb→pinky), 5-9 = left hand (thumb→pinky)
    const fidNum = parseInt(fid, 10) || 0;
    const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    const fingerPosition = fingerNames[fidNum % 5] || 'unknown';
    const hand = fidNum < 5 ? 'right' : 'left';

    // Resolve device_id from sn
    const deviceRow = await query('SELECT id FROM devices WHERE sn = ? LIMIT 1', [deviceSn]);
    const deviceId = deviceRow?.[0]?.id || null;

    // Upsert into student_fingerprints
    await query(
      `INSERT INTO student_fingerprints
         (school_id, student_id, device_id, finger_position, hand, template_data,
          template_format, quality_score, enrollment_timestamp, is_active, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ZK_ADMS', ?, CURRENT_TIMESTAMP, 1, 'active')
       ON DUPLICATE KEY UPDATE
         template_data = VALUES(template_data),
         quality_score = VALUES(quality_score),
         enrollment_timestamp = CURRENT_TIMESTAMP,
         is_active = 1,
         status = 'active'`,
      [
        schoolId,
        studentId,
        deviceId,
        fingerPosition,
        hand,
        templateData,
        parseInt(size, 10) || 0,
      ],
    );
    zkLog('info', 'FP_CAPTURED', { deviceSn, pin, fid, size, studentId, fingerPosition, hand, valid });
  } else {
    // Store raw even without student mapping — can be linked later
    zkLog('info', 'FP_CAPTURED_UNMAPPED', { deviceSn, pin, fid, size, staffId, valid });
  }
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

/**
 * GET /iclock/cdata  (or /iclock/getrequest)
 *
 * Purpose: Device handshake + heartbeat + command delivery
 *
 * The device sends GET periodically (configurable interval, typically 60s).
 * Query params include: SN, options, pushver, language, ...
 *
 * Response:
 *   - "OK"        → no commands pending
 *   - "C:id:cmd"  → deliver one command
 */
export async function GET(req: NextRequest) {
  const sn = getSerialNumber(req);
  const url = new URL(req.url);
  const qs = url.search;
  const ip = getClientIP(req);
  const ua = req.headers.get('user-agent') || '';
  const options = url.searchParams.get('options');
  const pushVer = url.searchParams.get('pushver');

  try {
    zkLog('info', 'HEARTBEAT', { sn, ip, qs });

    if (!sn) {
      zkLog('warn', 'NO_SERIAL_NUMBER', { ip, qs });
      // Still save raw even without SN — evidence is evidence
      saveRawLog(null, 'GET', qs, null, null, ip, ua, null, '/iclock/cdata', 1).catch(() => {});
      return textResponse('OK');
    }

    const schoolId = await getDeviceSchoolId(sn);

    // Fire-and-forget: log raw traffic + upsert device + system log + observability + sync state
    const rawLogPromise = saveRawLog(sn, 'GET', qs, null, null, ip, ua, null, '/iclock/cdata', schoolId).catch(() => {});
    const upsertPromise = upsertDevice(sn, ip, options, pushVer, schoolId);
    const sysLogPromise = logSystemEvent(sn, 'HEARTBEAT', 'INCOMING', qs, ip, ua);
    const heartbeatLogPromise = logDeviceEvent({
      deviceSn:   sn,
      ipAddress:  ip,
      eventType:  'HEARTBEAT',
      status:     'success',
      schoolId,
    });
    const syncStatePromise = updateDeviceSyncState(sn, schoolId);

    // Check command queue
    const pending = await getPendingCommand(sn);

    // Await background writes (don't block response but ensure they complete)
    await Promise.allSettled([rawLogPromise, upsertPromise, sysLogPromise, heartbeatLogPromise, syncStatePromise]);

    if (pending) {
      zkLog('info', 'COMMAND_DELIVERED', {
        sn,
        commandId: pending.id,
        command: pending.command.substring(0, 200),
        batchSize: pending.batchIds?.length || 1,
      });
      await markCommandSent(pending.id, pending.batchIds);
      // Log outgoing command to system_logs
      await logSystemEvent(sn, 'COMMAND_SENT', 'OUTGOING',
        JSON.stringify({
          commandId: pending.id,
          command: pending.command.substring(0, 200),
          batchSize: pending.batchIds?.length || 1,
        }), ip, ua);
      return textResponse(`C:${pending.id}:${pending.command}`);
    }

    return textResponse('OK');
  } catch (err) {
    zkLog('error', 'GET_HANDLER_ERROR', { sn, error: String(err) });
    // Capture in observability table (best-effort, schoolId defaults to 1)
    logDeviceEvent({
      deviceSn:     sn,
      ipAddress:    ip,
      eventType:    'ERROR',
      status:       'failed',
      errorMessage: String(err),
      schoolId:     1,
    }).catch(() => {});
    return textResponse('OK'); // NEVER break protocol
  }
}

/**
 * POST /iclock/cdata
 *
 * RAW-FIRST PIPELINE:
 *   1. Read body
 *   2. MANDATORY: Save raw to zk_raw_logs (if this fails → error, but still return OK)
 *   3. Parse
 *   4. Per-record: Save to zk_parsed_logs + zk_attendance_logs + match
 *   5. Every record gets a row in zk_parsed_logs (success OR failure)
 *
 * The `table` query param tells us what kind of data:
 *   - ATTLOG   → attendance punches (default)
 *   - OPERLOG  → operation log (stored raw, not processed as punches)
 *   - USERINFO → user list (response to DATA QUERY USERINFO command)
 */
export async function POST(req: NextRequest) {
  const sn = getSerialNumber(req);
  const url = new URL(req.url);
  const qs = url.search;
  const ip = getClientIP(req);
  const ua = req.headers.get('user-agent') || '';
  const table = (url.searchParams.get('table') || 'ATTLOG').toUpperCase();
  const path = (url.searchParams.get('path') || '').toLowerCase();

  // Capture select headers (avoid leaking auth tokens — only device-relevant ones)
  const headerObj: Record<string, string> = {};
  for (const key of ['content-type', 'content-length', 'user-agent', 'x-forwarded-for', 'x-real-ip']) {
    const val = req.headers.get(key);
    if (val) headerObj[key] = val;
  }

  let rawBody = '';
  let rawLogId: number | null = null;
  let schoolId: number | null = null; // resolved from device record

  try {
    // ════════════════════════════════════════════════════════════════════════
    // STEP 1: Read body
    // ════════════════════════════════════════════════════════════════════════
    rawBody = await req.text();

    zkLog('info', 'DATA_RECEIVED', {
      sn, ip, table,
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 200),
    });

    // Resolve school ASAP (needed for raw log)
    if (sn) {
      schoolId = await getDeviceSchoolId(sn);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2: MANDATORY — Save raw to zk_raw_logs BEFORE any processing
    //         Even if SN is missing, we still store the raw payload.
    // ════════════════════════════════════════════════════════════════════════
    try {
      rawLogId = await saveRawLog(
        sn, 'POST', qs, rawBody, null, ip, ua,
        headerObj, '/iclock/cdata', schoolId,
      );
    } catch (rawErr) {
      // Raw save failed — log loudly, but don't crash the device connection
      zkLog('error', 'RAW_SAVE_CRITICAL_FAILURE', { sn, error: String(rawErr), bodyLength: rawBody.length });
      // Best-effort: try observability table
      logDeviceEvent({
        deviceSn: sn, ipAddress: ip, eventType: 'ERROR',
        rawPayload: rawBody.substring(0, 1000),
        status: 'failed', errorMessage: `RAW_SAVE_FAILED: ${String(rawErr)}`, schoolId,
      }).catch(() => {});
      // Still return OK — we must not break the device
      return textResponse('OK');
    }

    // If no SN, raw is saved (above), but we can't process further
    if (!sn) {
      zkLog('warn', 'POST_NO_SERIAL', { ip, rawLogId, bodyPreview: rawBody.substring(0, 100) });
      return textResponse('OK');
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 2b: Handle command acknowledgments (path=devicecmd)
    //
    // When a device receives C:{id}:{command}, it POSTs back:
    //   path=devicecmd  body: "ID={id}&Return={code}&CMD={type}\n"
    //   Return=0 → success, Return=-1002 → unsupported, etc.
    // ════════════════════════════════════════════════════════════════════════
    if (path === 'devicecmd') {
      try {
        const params = new URLSearchParams(rawBody.replace(/\n$/, ''));
        const cmdId = params.get('ID');
        const returnCode = parseInt(params.get('Return') || '', 10);

        if (cmdId) {
          if (returnCode === 0) {
            // Mark the primary command as acknowledged
            await query(
              `UPDATE zk_device_commands
               SET status = 'acknowledged', ack_at = CURRENT_TIMESTAMP,
                   error_message = NULL, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND status = 'sent'`,
              [cmdId],
            );

            // BATCH ACK: If this was a batched USERINFO delivery,
            // all individual commands were marked 'sent' together.
            // Mark ALL sent USERINFO commands for this device as acknowledged.
            const batchAck = await query(
              `UPDATE zk_device_commands
               SET status = 'acknowledged', ack_at = CURRENT_TIMESTAMP,
                   error_message = NULL, updated_at = CURRENT_TIMESTAMP
               WHERE device_sn = ? AND status = 'sent'
                 AND command LIKE 'DATA UPDATE USERINFO PIN=%'`,
              [sn],
            );
            const batchCount = (batchAck as any)?.affectedRows || 0;

            zkLog('info', 'COMMAND_ACK', {
              sn, commandId: cmdId, returnCode, newStatus: 'acknowledged',
              cmd: params.get('CMD') || '',
              batchAcknowledged: batchCount,
            });
          } else {
            // Non-zero return code — check whether to retry or permanently fail.
            // markCommandSent() already incremented retry_count when the command
            // was delivered, so retry_count reflects how many deliveries have
            // been attempted so far.
            const cmdRows = await query(
              `SELECT retry_count, max_retries FROM zk_device_commands WHERE id = ?`,
              [cmdId],
            ).catch(() => null);

            const retryCount = Number(cmdRows?.[0]?.retry_count ?? 0);
            const maxRetries = Number(cmdRows?.[0]?.max_retries ?? 0);

            if (retryCount < maxRetries) {
              // Still have retries left — reset to pending so the device
              // gets another chance on its next heartbeat.
              // Also reset any batched USERINFO commands back to pending.
              await query(
                `UPDATE zk_device_commands
                 SET status = 'pending', error_message = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND status = 'sent'`,
                [`Retrying (code ${returnCode}, attempt ${retryCount}/${maxRetries})`, cmdId],
              );
              // Reset batched USERINFO commands too
              await query(
                `UPDATE zk_device_commands
                 SET status = 'pending', error_message = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE device_sn = ? AND status = 'sent'
                   AND command LIKE 'DATA UPDATE USERINFO PIN=%'`,
                [`Batch retry (code ${returnCode})`, sn],
              );
              zkLog('info', 'COMMAND_RETRY', {
                sn, commandId: cmdId, returnCode,
                retryCount, maxRetries, cmd: params.get('CMD') || '',
              });
            } else {
              // Max retries exhausted — permanently failed.
              // Also fail any batched USERINFO commands.
              await query(
                `UPDATE zk_device_commands
                 SET status = 'failed', ack_at = CURRENT_TIMESTAMP,
                     error_message = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND status = 'sent'`,
                [`Device returned code ${returnCode}`, cmdId],
              );
              await query(
                `UPDATE zk_device_commands
                 SET status = 'failed', ack_at = CURRENT_TIMESTAMP,
                     error_message = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE device_sn = ? AND status = 'sent'
                   AND command LIKE 'DATA UPDATE USERINFO PIN=%'`,
                [`Batch failed (code ${returnCode})`, sn],
              );
              zkLog('info', 'COMMAND_FAILED', {
                sn, commandId: cmdId, returnCode,
                retryCount, maxRetries, cmd: params.get('CMD') || '',
              });
            }
          }
        }
      } catch (err) {
        zkLog('warn', 'DEVICECMD_PARSE_ERROR', { sn, error: String(err), body: rawBody.substring(0, 200) });
      }
      return textResponse('OK');
    }

    // ════════════════════════════════════════════════════════════════════════
    // STEP 3: Parse body
    // ════════════════════════════════════════════════════════════════════════
    const { records, lines } = parseZKBody(rawBody, table);

    zkLog('info', 'DATA_PARSED', {
      sn, table, recordCount: records.length,
      records: records.slice(0, 3),
    });

    // ── Observability ─────────────────────────────────────────────────────
    logDeviceEvent({
      deviceSn: sn, ipAddress: ip, eventType: 'DATA_RECEIVED',
      tableName: table, rawPayload: rawBody.substring(0, 65000),
      recordCount: records.length, status: 'success', schoolId,
    }).catch(() => {});

    logDeviceEvent({
      deviceSn: sn, eventType: 'DATA_PARSED', tableName: table,
      parsedJson: records.slice(0, 50), recordCount: records.length,
      status: 'success', schoolId,
    }).catch(() => {});

    // ════════════════════════════════════════════════════════════════════════
    // STEP 4: Per-record processing
    // ════════════════════════════════════════════════════════════════════════
    // ── Biometric template tables (TEMPLATEV10 / BIODATA) ──────────────
    // After a successful ENROLL_BIO, the device POSTs fingerprint templates
    // via table=templatev10 or table=biodata. The payload may contain:
    //   PIN, FID, SIZE, VALID, TMP (same fields as FP lines in OPERLOG)
    if (table === 'TEMPLATEV10' || table === 'BIODATA') {
      await logSystemEvent(sn, 'SYSTEM', 'INCOMING', rawBody.substring(0, 2000), ip, ua);

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const rawLine = lines[i] || '';
        const pin = rec.PIN || rec.No || '';
        const fid = rec.FID || rec.Idx || '0';
        const size = rec.SIZE || rec.Size || '0';
        const valid = rec.VALID || rec.Valid || '1';
        const tmp = rec.TMP || rec.Template || '';

        if (pin && tmp) {
          try {
            await processFingerprint(sn, pin, fid, size, valid, tmp, schoolId);
          } catch (err) {
            zkLog('warn', `${table}_FP_ERROR`, { sn, pin, fid, error: String(err) });
          }
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: table, rawLine: rawLine.substring(0, 2000),
            userId: pin, status: 'success',
          });
        } else {
          // Record without template — save for reference
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: table, rawLine: rawLine.substring(0, 2000),
            userId: pin || null, status: pin && !tmp ? 'failed' : 'success',
            errorMessage: pin && !tmp ? 'No template data in record' : undefined,
          });
        }
      }
    } else if (table === 'USERINFO') {
      await logSystemEvent(sn, 'USERINFO', 'INCOMING', rawBody.substring(0, 2000), ip, ua);
      await processUserInfo(sn, records, schoolId);

      // Save each USERINFO record to zk_parsed_logs
      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const userId = rec.USERID || rec.PIN || '';
        await saveParsedLog({
          rawLogId: rawLogId!, deviceSn: sn, schoolId,
          tableName: 'USERINFO', rawLine: lines[i] || '',
          userId, status: 'success',
        });
      }
    } else if (table === 'OPERLOG') {
      // OPERLOG contains mixed data: OPLOG lines, FP templates, USER records
      await logSystemEvent(sn, 'SYSTEM', 'INCOMING', rawBody.substring(0, 2000), ip, ua);

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const rawLine = lines[i] || '';

        // ── FP template: device sends after local fingerprint enrollment ──
        // Format: FP PIN=4\tFID=6\tSize=816\tValid=1\tTMP=<base64data>
        const fpPin = rec['FP PIN'] || rec.PIN;
        if (fpPin && rec.FID && rec.TMP) {
          try {
            await processFingerprint(sn, fpPin, rec.FID, rec.SIZE || '0', rec.VALID || '1', rec.TMP, schoolId);
          } catch (err) {
            zkLog('warn', 'FP_PROCESS_ERROR', { sn, pin: fpPin, fid: rec.FID, error: String(err) });
          }
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: 'OPERLOG', rawLine: rawLine.substring(0, 2000),
            userId: fpPin, status: 'success',
          });
          continue;
        }

        // ── USER record: device confirms user info ──
        // Format: USER PIN=4\tName=...\tPri=0\tPasswd=\tCard=\tGrp=1\t...
        const userPin = rec['USER PIN'];
        if (userPin) {
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: 'OPERLOG', rawLine: rawLine.substring(0, 2000),
            userId: userPin, status: 'success',
          });
          continue;
        }

        // ── OPLOG or other OPERLOG record ──
        await saveParsedLog({
          rawLogId: rawLogId!, deviceSn: sn, schoolId,
          tableName: 'OPERLOG', rawLine: rawLine.substring(0, 2000),
          status: 'success',
        });
      }
    } else {
      // ATTLOG (or OPERLOG mixed in) — process each record individually
      await logSystemEvent(sn, 'PUNCH', 'INCOMING',
        JSON.stringify({ recordCount: records.length, first: records[0] || null }), ip, ua);

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const rawLine = lines[i] || '';

        // ── Skip OPERLOG records (stored raw but not processed as attendance) ──
        if (record._TYPE === 'OPERLOG') {
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: 'OPERLOG', rawLine,
            status: 'success',
          });
          continue;
        }

        const userId = record.USERID;
        const rawCheckTime = record.CHECKTIME;

        // ── Validate minimum fields ──────────────────────────────────────
        if (!userId || !rawCheckTime) {
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: table, rawLine,
            userId: userId || null, checkTime: null,
            status: 'failed', errorMessage: `Missing required fields: USERID=${userId || 'EMPTY'}, CHECKTIME=${rawCheckTime || 'EMPTY'}`,
          });
          continue;
        }

        const checkTime = normalizeCheckTime(rawCheckTime);
        if (!checkTime) {
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: table, rawLine, userId,
            status: 'failed', errorMessage: `CHECKTIME normalization failed for: ${rawCheckTime}`,
          });
          continue;
        }

        // ── Match + Save attendance ──────────────────────────────────────
        try {
          const { studentId, staffId, matched } = await resolveUser(userId, sn, schoolId);

          // Save to zk_attendance_logs (existing system)
          await query(
            `INSERT INTO zk_attendance_logs
               (school_id, device_sn, device_user_id, student_id, staff_id, check_time,
                verify_type, io_mode, log_id, work_code, matched, raw_log_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              schoolId, sn, userId, studentId, staffId, checkTime,
              record.VERIFYTYPE ? parseInt(record.VERIFYTYPE, 10) || null : null,
              record.INOUTMODE ? parseInt(record.INOUTMODE, 10) || null : null,
              record.LOGID || null,
              record.WORKCODE || null,
              matched ? 1 : 0,
              rawLogId,
            ],
          );

          // Save to zk_parsed_logs (per-record truth)
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: table, rawLine, userId, checkTime,
            verifyType: record.VERIFYTYPE || null,
            inoutMode: record.INOUTMODE || null,
            workCode: record.WORKCODE || null,
            logId: record.LOGID || null,
            matched, studentId, staffId,
            status: 'success',
          });

          // Observability: PUNCH_SAVED
          logDeviceEvent({
            deviceSn: sn, eventType: 'PUNCH_SAVED', tableName: 'ATTLOG',
            userId, checkTime, matched, studentId, staffId,
            status: 'success', schoolId,
          }).catch(() => {});

          zkLog('info', 'PUNCH_SAVED', { deviceSn: sn, userId, checkTime, matched, studentId, staffId, schoolId });

        } catch (err) {
          // ── Record-level failure: save to zk_parsed_logs with error ────
          await saveParsedLog({
            rawLogId: rawLogId!, deviceSn: sn, schoolId,
            tableName: table, rawLine, userId, checkTime,
            verifyType: record.VERIFYTYPE || null,
            inoutMode: record.INOUTMODE || null,
            status: 'failed', errorMessage: String(err),
          });

          logDeviceEvent({
            deviceSn: sn, eventType: 'ERROR', tableName: 'ATTLOG',
            userId, checkTime, status: 'failed', errorMessage: String(err), schoolId,
          }).catch(() => {});

          zkLog('error', 'PUNCH_SAVE_FAILED', { deviceSn: sn, userId, checkTime: rawCheckTime, error: String(err) });
        }
      }
    }

    // Update device last_activity
    try {
      await query(
        `UPDATE devices SET last_activity = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE sn = ?`,
        [sn],
      );
    } catch { /* non-critical */ }

    zkLog('info', 'DATA_PROCESSED', { sn, table, recordCount: records.length, rawLogId });
    return textResponse('OK');

  } catch (err) {
    zkLog('error', 'POST_HANDLER_ERROR', { sn, error: String(err), bodyLength: rawBody.length, rawLogId });

    // Best-effort: if raw wasn't saved yet, try now
    if (!rawLogId && rawBody) {
      saveRawLog(sn, 'POST', qs, rawBody, null, ip, ua, headerObj, '/iclock/cdata', schoolId).catch(() => {});
    }

    logSystemEvent(sn, 'ERROR', 'INCOMING',
      JSON.stringify({ error: String(err), bodyLength: rawBody.length }), ip, ua).catch(() => {});
    logDeviceEvent({
      deviceSn: sn, ipAddress: ip, eventType: 'ERROR',
      rawPayload: rawBody.substring(0, 1000),
      status: 'failed', errorMessage: String(err), schoolId,
    }).catch(() => {});

    return textResponse('OK'); // NEVER break protocol
  }
}
