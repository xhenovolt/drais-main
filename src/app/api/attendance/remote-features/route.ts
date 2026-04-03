import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * ADMS Protocol Feature Reference
 *
 * Every command tested against ZKTeco K40 Pro (firmware 8.0.4.3, push 2.4.1).
 * status: 'supported' | 'partial' | 'unsupported' | 'untested'
 */
const PROTOCOL_FEATURES = [
  // ── Device Control ─────────────────────────────────────────
  {
    category: 'Device Control',
    commands: [
      {
        name: 'REBOOT',
        command: 'REBOOT',
        description: 'Restart the device remotely',
        status: 'supported',
        returnCode: null,
        notes: 'Device restarts immediately. No acknowledgment returned — confirmed by heartbeat gap.',
      },
      {
        name: 'INFO',
        command: 'INFO',
        description: 'Request device specs (firmware, user/FP/record counts, IP)',
        status: 'supported',
        returnCode: null,
        notes: 'Device responds with INFO= in next GET heartbeat, not via devicecmd. Format: Ver,UserCount,FPCount,AttCount,IP,...',
      },
      {
        name: 'CHECK',
        command: 'CHECK',
        description: 'Ping/health check',
        status: 'unsupported',
        returnCode: -1007,
        notes: 'Returns -1007 (data not exist). Not implemented on K40 Pro firmware.',
      },
      {
        name: 'Sync Time',
        command: 'SET OPTION ServerTimeSync=1',
        description: 'Force server time synchronization',
        status: 'supported',
        returnCode: 0,
        notes: 'Device syncs clock to server time.',
      },
    ],
  },
  // ── Data Management ────────────────────────────────────────
  {
    category: 'Data Management',
    commands: [
      {
        name: 'Sync User Identity',
        command: 'DATA UPDATE USERINFO PIN={id}\\tName={name}\\tPri=0\\tPasswd=\\tCard=\\tGrp=0\\tTZ=0000000100000000',
        description: 'Push or update a user on the device',
        status: 'supported',
        returnCode: 0,
        notes: 'Tab-separated parameters. PIN is the device user ID. Returns 0 on success.',
      },
      {
        name: 'Query Users',
        command: 'DATA QUERY USERINFO',
        description: 'Request list of all enrolled users from device',
        status: 'supported',
        returnCode: null,
        notes: 'Device responds with table=USERINFO POST containing all user records.',
      },
      {
        name: 'Clear Logs',
        command: 'CLEAR LOG',
        description: 'Delete attendance logs from device memory',
        status: 'supported',
        returnCode: 0,
        notes: 'Clears attendance records. Use with caution.',
      },
      {
        name: 'Clear All Data',
        command: 'CLEAR DATA',
        description: 'Delete ALL data from device (users, FPs, logs)',
        status: 'supported',
        returnCode: 0,
        notes: '⚠️ DESTRUCTIVE — Removes all users, fingerprints, and logs.',
      },
    ],
  },
  // ── Biometric Enrollment ───────────────────────────────────
  {
    category: 'Biometric Enrollment',
    commands: [
      {
        name: 'ENROLL',
        command: 'ENROLL PIN={id}\\tName={name}\\tFinger=0',
        description: 'Legacy enrollment command',
        status: 'unsupported',
        returnCode: -1002,
        notes: 'Returns -1002 (unsupported command). Not available on K40 Pro.',
      },
      {
        name: 'ENROLL_FP',
        command: 'ENROLL_FP PIN={id}&FID=0',
        description: 'Fingerprint enrollment (push v2.x)',
        status: 'unsupported',
        returnCode: 6,
        notes: 'Returns 6 (DATA_NOT_EXIST). Command recognized but not functional.',
      },
      {
        name: 'ENROLL_BIO',
        command: 'ENROLL_BIO PIN={id} TYPE=1 FID=0',
        description: 'Biometric enrollment (push v3.x)',
        status: 'partial',
        returnCode: -1003,
        notes: 'Returns -1003 (parameter error). Command IS recognized (not -1002) but no parameter format accepted. Tested 17 variants including: space/tab/ampersand separators, with/without FID/TYPE/RETRY/OVERWRITE/NAME/MESSION, zero-padded PIN, positional args, bare command. Push version 2.4.1 likely lacks full ENROLL_BIO implementation — requires firmware upgrade to push v3.x+.',
      },
    ],
  },
  // ── Template Transfer ──────────────────────────────────────
  {
    category: 'Template Transfer',
    commands: [
      {
        name: 'FP via OPERLOG',
        command: '(automatic — device POSTs table=OPERLOG)',
        description: 'Device pushes fingerprint templates after local enrollment',
        status: 'supported',
        returnCode: null,
        notes: 'After enrolling a finger locally on the device, it pushes FP PIN={id}\\tFID={n}\\tSize={s}\\tValid=1\\tTMP={base64} via OPERLOG. DRAIS captures and stores these automatically.',
      },
      {
        name: 'templatev10 POST',
        command: '(automatic — device POSTs table=templatev10)',
        description: 'Biometric template upload (push v3.x format)',
        status: 'partial',
        returnCode: null,
        notes: 'Handler ready in DRAIS to capture templates from table=templatev10 POST. Not yet triggered — depends on successful ENROLL_BIO.',
      },
      {
        name: 'biodata POST',
        command: '(automatic — device POSTs table=biodata)',
        description: 'Biometric data upload (alternative format)',
        status: 'partial',
        returnCode: null,
        notes: 'Handler ready in DRAIS to capture templates from table=biodata POST. Not yet triggered — depends on successful remote enrollment.',
      },
    ],
  },
];

/**
 * GET /api/attendance/remote-features?device_sn=xxx
 *
 * Returns:
 *   - protocolFeatures: full command reference with test results
 *   - deviceInfo: current device metadata
 *   - commandStats: counts of commands by status
 *   - recentTests: last 20 test commands for the device
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const deviceSn = new URL(req.url).searchParams.get('device_sn') || null;

  try {
    // Device info
    let deviceInfo = null;
    if (deviceSn) {
      const deviceRows = await query(
        `SELECT sn, device_name, model_name, location, last_seen, ip_address,
                firmware_version, push_version, status,
                TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago
         FROM devices WHERE sn = ? LIMIT 1`,
        [deviceSn],
      );
      deviceInfo = deviceRows?.[0] || null;
    }

    // Command stats for this device
    let commandStats = { total: 0, acknowledged: 0, failed: 0, pending: 0, sent: 0 };
    if (deviceSn) {
      const statsRows = await query(
        `SELECT status, COUNT(*) AS cnt
         FROM zk_device_commands
         WHERE device_sn = ? AND school_id = ?
         GROUP BY status`,
        [deviceSn, session.schoolId],
      );
      for (const row of statsRows || []) {
        const s = row.status as keyof typeof commandStats;
        if (s in commandStats) commandStats[s] = Number(row.cnt);
        commandStats.total += Number(row.cnt);
      }
    }

    // Recent test commands
    let recentTests: any[] = [];
    if (deviceSn) {
      recentTests = await query(
        `SELECT id, command, status, error_message, priority,
                sent_at, ack_at, created_at
         FROM zk_device_commands
         WHERE device_sn = ? AND school_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [deviceSn, session.schoolId],
      ) || [];
    }

    return NextResponse.json({
      success: true,
      protocolFeatures: PROTOCOL_FEATURES,
      deviceInfo,
      commandStats,
      recentTests,
    });
  } catch (err) {
    console.error('[Remote Features GET] Error:', err);
    return NextResponse.json({ error: 'Failed to load features' }, { status: 500 });
  }
}

/**
 * POST /api/attendance/remote-features
 *
 * Quick-test a command from the features page.
 * Body: { device_sn, command, priority? }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { device_sn, command, priority } = body;

    if (!device_sn || typeof device_sn !== 'string' || !command || typeof command !== 'string') {
      return NextResponse.json({ error: 'device_sn and command are required' }, { status: 400 });
    }

    if (command.length > 2000) {
      return NextResponse.json({ error: 'Command too long (max 2000 chars)' }, { status: 400 });
    }

    // Verify device belongs to school
    const deviceRows = await query(
      'SELECT id FROM devices WHERE sn = ? AND school_id = ? LIMIT 1',
      [device_sn, session.schoolId],
    );
    if (!deviceRows?.length) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const result = await query(
      `INSERT INTO zk_device_commands (school_id, device_sn, command, status, priority, expires_at)
       VALUES (?, ?, ?, 'pending', ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [session.schoolId, device_sn, command, Math.max(0, Math.min(100, priority || 10))],
    );

    return NextResponse.json({
      success: true,
      commandId: (result as any)?.insertId,
      message: 'Command queued',
    });
  } catch (err) {
    console.error('[Remote Features POST] Error:', err);
    return NextResponse.json({ error: 'Failed to queue command' }, { status: 500 });
  }
}
