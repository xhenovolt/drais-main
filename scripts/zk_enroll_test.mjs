/**
 * ZKTeco K40 Pro — Hands-Free Remote Enrollment Test
 * ─────────────────────────────────────────────────────
 * Target device: 192.168.1.197:4370
 * Subject: Jeilane Twaha (JIPRA school_id=12004)
 *
 * Steps:
 *   1. Connect to device via TCP
 *   2. GET device info (confirms comms)
 *   3. Beep / testVoice (audible proof)
 *   4. Pull user list from device
 *   5. Determine Twaha's PIN from DB (zk_user_mapping)
 *   6. Send CMD_STARTENROLL → device shows Fingerprint Enrollment screen
 *   7. Wait for scan completion (3 presses)
 *   8. Pull user list again → confirm template stored
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.resolve(__dirname, '..');
const require   = createRequire(import.meta.url);

// ─── Load .env.local ─────────────────────────────────────────────────────────
const envRaw = readFileSync(path.join(rootDir, '.env.local'), 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

// ─── ZK Library ──────────────────────────────────────────────────────────────
const ZKLib    = require(path.join(rootDir, 'node_modules/node-zklib'));
const { COMMANDS } = require(path.join(rootDir, 'node_modules/node-zklib/constants'));

const DEVICE_IP   = '192.168.1.197';
const DEVICE_PORT = 4370;
const TIMEOUT     = 10000;

// ─── DB client ───────────────────────────────────────────────────────────────
const mysql = require(path.join(rootDir, 'node_modules/mysql2/promise'));

async function dbConnect() {
  return mysql.createConnection({
    host:     env.TIDB_HOST,
    port:     +env.TIDB_PORT,
    user:     env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    database: 'drais',
    ssl:      { rejectUnauthorized: false },
    connectTimeout: 15000,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const log  = (msg)        => console.log(`\n[${new Date().toISOString().slice(11,19)}] ${msg}`);
const pass = (msg)        => console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
const fail = (msg)        => console.log(`\x1b[31m  ✗ ${msg}\x1b[0m`);
const info = (msg)        => console.log(`\x1b[36m  → ${msg}\x1b[0m`);
const wait = (ms)         => new Promise(r => setTimeout(r, ms));

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ZKTeco K40 Pro — Hands-Free Enrollment Test');
  console.log(`  Device: ${DEVICE_IP}:${DEVICE_PORT}`);
  console.log('══════════════════════════════════════════════════════════\n');

  // ── STEP 1: DB lookup ─────────────────────────────────────────────────────
  log('STEP 1 — Querying Drais DB for Twaha Jeilane...');
  let twahaPin = null;
  let twahaName = 'Twaha Jeilane';
  try {
    const db = await dbConnect();
    const [rows] = await db.execute(
      `SELECT s.id, s.name, z.user_id
       FROM students s
       LEFT JOIN zk_user_mapping z ON z.student_id = s.id
       WHERE s.school_id = 12004
       ORDER BY s.id`
    );
    pass(`DB connected — ${rows.length} JIPRA student(s) found`);
    for (const r of rows) {
      info(`  id=${r.id}  name="${r.name}"  biometric_id=${r.user_id ?? 'none'}`);
      if (r.name && r.name.toLowerCase().includes('twaha')) {
        twahaPin  = r.user_id;
        twahaName = r.name;
      }
    }
    if (twahaPin == null) {
      // Twaha has no zk_user_mapping yet — use his student ID as the PIN
      // (ZKTeco PIN just needs to be a unique integer 1–65535)
      const twaha = rows.find(r => r.name && r.name.toLowerCase().includes('twaha'));
      if (twaha) {
        twahaPin  = twaha.id % 65535; // keep within ZK PIN range
        twahaName = twaha.name;
        info(`No biometric_id in DB — will use derived PIN ${twahaPin} for this test`);
      } else {
        fail('Twaha not found in DB — using fallback PIN 2');
        twahaPin = 2;
      }
    }
    await db.end();
  } catch (e) {
    fail(`DB error: ${e.message}`);
    info('Falling back to PIN=2 for test');
    twahaPin = 2;
  }
  pass(`Subject: ${twahaName}  →  PIN = ${twahaPin}`);

  // ── STEP 2: TCP Connection ────────────────────────────────────────────────
  log('STEP 2 — Connecting to K40 Pro via TCP...');
  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, TIMEOUT, 5200);
  try {
    await zk.createSocket();
    pass('Connection established');
  } catch (e) {
    fail(`Cannot connect: ${e.message}`);
    process.exit(1);
  }

  // ── STEP 3: Device Info ───────────────────────────────────────────────────
  log('STEP 3 — Reading device info...');
  try {
    const devInfo = await zk.getInfo();
    pass('Device responded');
    if (devInfo) {
      info(`Serial: ${devInfo.serialNumber ?? 'N/A'}`);
      info(`Firmware: ${devInfo.fwVersion ?? 'N/A'}`);
      info(`Users stored: ${devInfo.users ?? 'N/A'}  |  Fingerprints: ${devInfo.fingerprints ?? 'N/A'}`);
    }
  } catch (e) {
    fail(`getInfo failed: ${e.message}`);
  }

  // ── STEP 4: Beep (testVoice) ──────────────────────────────────────────────
  log('STEP 4 — Sending beep command (CMD_TESTVOICE)...');
  try {
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_TESTVOICE, '');
    pass('Beep sent — you should hear the device beep');
    await wait(1500);
  } catch (e) {
    fail(`TESTVOICE error: ${e.message}`);
  }

  // ── STEP 5: Pull user list BEFORE enrollment ──────────────────────────────
  log('STEP 5 — Pulling current user list from device...');
  let usersBefore = [];
  try {
    const result = await zk.getUsers();
    usersBefore = result?.data ?? [];
    pass(`${usersBefore.length} user(s) currently on device`);
    for (const u of usersBefore) {
      info(`  uid=${u.uid}  userId="${u.userId}"  name="${u.name}"  privilege=${u.privilege}`);
    }

    const alreadyHasTemplate = usersBefore.some(
      u => String(u.userId) === String(twahaPin)
    );
    if (alreadyHasTemplate) {
      info(`Twaha (PIN ${twahaPin}) is already in the device user list`);
    }
  } catch (e) {
    fail(`getUsers error: ${e.message}`);
  }

  // ── STEP 6: Disable device UI, send CMD_STARTENROLL ───────────────────────
  log(`STEP 6 — Sending CMD_STARTENROLL for PIN=${twahaPin} (${twahaName})...`);
  console.log('\n  \x1b[33m>>> THE K40 SCREEN SHOULD NOW SHOW FINGERPRINT ENROLLMENT <<<\x1b[0m\n');

  let enrollTriggered = false;
  try {
    await zk.zklibTcp.disableDevice();
    info('Device UI disabled (prevents interference)');
    await wait(300);

    // CMD_STARTENROLL payload: PIN as little-endian 32-bit + 3 finger index slots
    // Protocol: 4 bytes UID + 1 byte finger_index + 1 byte flag
    const pinBuf = Buffer.alloc(4);
    pinBuf.writeUInt32LE(Number(twahaPin), 0);

    // Try high-level via executeCmd with PIN buffer
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, pinBuf);
    pass(`CMD_STARTENROLL sent for PIN ${twahaPin}`);
    enrollTriggered = true;
  } catch (e) {
    fail(`CMD_STARTENROLL error: ${e.message}`);
    info('Trying alternative: re-enable device and use ADMS C:ENROLL format...');

    // Fallback: write an ADMS-style enroll trigger via LCD message
    try {
      const msg = `ENROLL PIN=${twahaPin}`;
      await zk.zklibTcp.executeCmd(COMMANDS.CMD_WRITE_LCD, msg);
      info(`LCD message sent: ${msg}`);
    } catch (e2) {
      fail(`LCD fallback also failed: ${e2.message}`);
    }
  }

  // ── STEP 7: Re-enable + wait for scan ────────────────────────────────────
  if (enrollTriggered) {
    log('STEP 7 — Waiting for fingerprint scan (press finger 3 times on device)...');
    info('You have 30 seconds. Place finger 3 times when prompted on screen.');
    await wait(30000);
  } else {
    await wait(2000);
  }

  // Re-enable device regardless
  try {
    await zk.zklibTcp.enableDevice();
    pass('Device UI re-enabled');
  } catch {}

  // ── STEP 8: Pull user list AFTER enrollment ───────────────────────────────
  log('STEP 8 — Pulling updated user list to verify template stored...');
  try {
    const result = await zk.getUsers();
    const usersAfter = result?.data ?? [];
    pass(`${usersAfter.length} user(s) on device after enrollment`);

    const twahaUser = usersAfter.find(u => String(u.userId) === String(twahaPin));
    if (twahaUser) {
      pass(`✅ VERIFIED: ${twahaName} (PIN ${twahaPin}) IS registered in device`);
      info(JSON.stringify(twahaUser));
    } else {
      fail(`${twahaName} (PIN ${twahaPin}) NOT found in device — scan may not have completed`);
    }

    const added = usersAfter.length - usersBefore.length;
    if (added > 0) info(`${added} new user(s) added during this session`);
  } catch (e) {
    fail(`Final getUsers error: ${e.message}`);
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  log('Disconnecting...');
  try { await zk.disconnect(); } catch {}
  pass('Done.');
  console.log('\n══════════════════════════════════════════════════════════\n');
})().catch(e => {
  console.error('\n\x1b[31mFATAL:\x1b[0m', e.message);
  process.exit(1);
});
