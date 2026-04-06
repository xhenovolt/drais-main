#!/usr/bin/env node

/**
 * DRAIS ZK Relay Agent
 * ══════════════════════════════════════════════════════════════
 * Run this script on ANY machine on the same WiFi as the ZKTeco device.
 * It polls the DRAIS server for commands and executes them on the device.
 *
 * How it works:
 *   1. Connects to ZK device via TCP SDK (port 4370) on the LAN
 *   2. Polls DRAIS REST API every 2 seconds for pending commands
 *   3. Executes commands on device, reports results back via REST
 *   4. Forwards real-time events (attendance, enrollment) to DRAIS
 *
 * Usage:
 *   DRAIS_URL=https://your-server.com DEVICE_IP=192.168.1.197 RELAY_KEY=secret node zk-relay-agent.js
 *
 * Environment Variables:
 *   DRAIS_URL    — Base URL of the DRAIS server (e.g. https://sims.drais.pro)
 *   DEVICE_IP    — IP address of the ZKTeco device on the LAN (e.g. 192.168.1.197)
 *   DEVICE_PORT  — TCP port (default: 4370)
 *   RELAY_KEY    — Authentication key (must match server's RELAY_KEY env var)
 *   DEVICE_SN    — Device serial number (e.g. GED7254601154)
 *   POLL_MS      — Polling interval in ms (default: 2000)
 *
 * Quick start (run on school LAN machine):
 *   cd workers
 *   npm install node-zklib
 *   DRAIS_URL=https://sims.drais.pro \
 *     DEVICE_IP=192.168.1.197 \
 *     DEVICE_SN=GED7254601154 \
 *     RELAY_KEY=drais-relay-default-key \
 *     node zk-relay-agent.js
 * ══════════════════════════════════════════════════════════════
 */

const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─── Config file path — next to executable (works both as pkg binary or script)
const CONFIG_DIR  = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_FILE = path.join(CONFIG_DIR, 'drais-relay.config.json');

// ─── Interactive first-run setup wizard ───────────────────────────────────────
async function runSetupWizard() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise(resolve => rl.question(prompt, a => resolve(a.trim())));

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        DRAIS Relay Agent — First-Time Setup          ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Answer the questions below. Press Enter to keep the default.');
  console.log('');

  const url  = await ask('  DRAIS server URL      [https://sims.drais.pro]  : ') || 'https://sims.drais.pro';
  const ip   = await ask('  Fingerprint device IP  [192.168.1.197]           : ') || '192.168.1.197';
  const sn   = await ask('  Device serial number   [GED7254601154]           : ') || 'GED7254601154';
  const key  = await ask('  Relay key              [drais-relay-default-key] : ') || 'drais-relay-default-key';
  rl.close();

  const cfg = { drais_url: url, device_ip: ip, device_sn: sn, relay_key: key, device_port: 4370, poll_ms: 2000 };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  console.log('');
  console.log(`  Config saved to: ${CONFIG_FILE}`);
  console.log('  (Edit this file anytime to change settings)');
  console.log('');
  return cfg;
}

// ─── Load configuration (config file > env vars > CLI --key=value) ───────────
async function loadConfig() {
  // CLI args
  const args = {};
  process.argv.slice(2).forEach(a => {
    const m = a.match(/^--([\w_]+)=(.+)$/);
    if (m) args[m[1].toLowerCase()] = m[2];
  });

  // Config file (created by setup wizard or hand-crafted)
  let fileCfg = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  }

  const get = (envKey, argKey, fileKey) =>
    process.env[envKey] || args[argKey] || fileCfg[fileKey];

  const drais_url  = get('DRAIS_URL',  'url',        'drais_url');
  const device_ip  = get('DEVICE_IP',  'device_ip',  'device_ip');
  const device_sn  = get('DEVICE_SN',  'device_sn',  'device_sn');
  const relay_key  = get('RELAY_KEY',  'relay_key',  'relay_key');
  const device_port = parseInt(get('DEVICE_PORT', 'device_port', 'device_port') || '4370', 10);
  const poll_ms    = parseInt(get('POLL_MS', 'poll_ms', 'poll_ms') || '2000', 10);

  // Run wizard if required fields are missing
  if (!drais_url || !device_ip || !device_sn || !relay_key) {
    const wizard = await runSetupWizard();
    return { ...wizard, device_port, poll_ms };
  }

  return { drais_url, device_ip, device_sn, relay_key, device_port, poll_ms };
}

// ─── Config placeholder (filled by loadConfig() before main() runs) ──────────
let DRAIS_URL, DEVICE_IP, DEVICE_PORT, RELAY_KEY, DEVICE_SN, POLL_MS;

// ─── Keep-alive HTTP agents (prevents ECONNRESET on idle connections) ─────────
const httpAgent  = new http.Agent({ keepAlive: true, maxSockets: 2 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 2 });

// ─── Globals ──────────────────────────────────────────────────────────────────
// Two separate TCP connections prevent real-time event packets from
// swallowing command reply frames (ZKLib uses socket.once('data') for cmds).
let zkCmd = null;       // used for all executeCmd calls
let zkRt  = null;       // used only for getRealTimeLogs
let connected = false;
let realTimeActive = false;
let consecutivePollFails = 0; // track server unreachable

function log(level, msg, data = null) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = { info: '✓', warn: '⚠', error: '✗', event: '→' }[level] || '·';
  console.log(`[${ts}] ${prefix} ${msg}${data ? ' ' + JSON.stringify(data) : ''}`);
}

// ─── ZK Device Connection ─────────────────────────────────────────────────────

function teardownCmd() {
  connected = false;
  if (zkCmd) { try { zkCmd.disconnect(); } catch {} }
  zkCmd = null;
}

function teardownRealtime() {
  realTimeActive = false;
  if (zkRt) { try { zkRt.disconnect(); } catch {} }
  zkRt = null;
}

async function connectCmd() {
  if (connected) return true;

  // Always start fresh — destroy any stale socket
  teardownCmd();

  log('info', `Connecting to ZK device at ${DEVICE_IP}:${DEVICE_PORT}...`);
  zkCmd = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 5200);

  try {
    await zkCmd.createSocket(
      (err) => { log('error', 'ZK cmd socket error', err.message); teardownCmd(); },
      ()    => { log('warn',  'ZK cmd socket closed'); teardownCmd(); },
    );
    connected = true;
    log('info', 'Connected to ZK device via TCP (cmd)');
    try { const info = await zkCmd.getInfo(); log('info', 'Device info', info); } catch {}
    return true;
  } catch (err) {
    log('error', `Failed to connect (cmd): ${err.message}`);
    teardownCmd();
    return false;
  }
}

async function connectRealtime() {
  if (realTimeActive) return;

  // Always start fresh — destroy any stale RT socket
  teardownRealtime();

  log('info', 'Opening real-time event connection...');
  zkRt = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 5200);
  try {
    await zkRt.createSocket(
      () => { teardownRealtime(); },
      () => { teardownRealtime(); },
    );
    await zkRt.getRealTimeLogs((data) => {
      log('event', 'Real-time event', data);
      httpRequest('POST', '/api/relay-status', {
        relay_key: RELAY_KEY,
        results: [{ id: 0, success: true, data: { type: 'realtime_event', event: data } }],
      }).catch(() => {});
    });
    realTimeActive = true;
    log('info', 'Real-time event listener active');
  } catch (err) {
    log('error', `Real-time init failed: ${err.message}`);
    teardownRealtime();
  }
}

async function ensureConnection() {
  // Check if the socket is actually alive — the 'connected' flag can be stale
  // if WiFi dropped or device silently closed the connection.
  if (zkCmd) {
    const tcp = zkCmd.zklibTcp || {};
    const sock = tcp.socket;
    if (!sock || sock.destroyed || !sock.writable) {
      log('warn', 'ZK cmd socket is dead — forcing reconnect');
      teardownCmd();
    }
  }

  if (!connected) await connectCmd();
  if (!connected) {
    await new Promise(r => setTimeout(r, 1000));
    await connectCmd();
  }
  if (!connected) throw new Error('Device not connected');
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, DRAIS_URL);
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : http;

    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
      agent: isHttps ? httpsAgent : httpAgent,
      timeout: 15000,
    };

    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HTTP timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Real-time Events ─────────────────────────────────────────────────────────

async function startRealTimeLogs() {
  await connectRealtime();
}

// ─── Command Handlers ────────────────────────────────────────────────────────

async function handleCommand(msg) {
  const { action, params } = msg;
  await ensureConnection();

  const zk = zkCmd; // dedicated cmd socket, no real-time listener attached

  switch (action) {
    case 'info': {
      const info = await zk.getInfo();
      return info;
    }

    case 'users': {
      const users = await zk.getUsers();
      return { users: users.data, error: users.err ? String(users.err) : null };
    }

    case 'attendance': {
      const att = await zk.getAttendances();
      const records = (att.data || []).slice(-100);
      return { records, total: (att.data || []).length };
    }

    case 'status': {
      const info = await zk.getInfo();
      return { reachable: true, ...info };
    }

    case 'restart': {
      await zk.executeCmd(COMMANDS.CMD_RESTART, '');
      connected = false;
      realTimeActive = false;
      return { message: 'Device restarting' };
    }

    case 'disable': {
      await zk.disableDevice();
      return { message: 'Device disabled' };
    }

    case 'enable': {
      await zk.enableDevice();
      return { message: 'Device enabled' };
    }

    case 'unlock': {
      await zk.executeCmd(COMMANDS.CMD_UNLOCK, '');
      return { message: 'Door unlocked' };
    }

    case 'enroll': {
      const finger = parseInt(params?.finger ?? '0', 10);
      const name = String(params?.name || '').replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim();
      // student_id is the DRAIS student ID — used as the userId/PIN on the ZK device
      // It MUST be different from the device's internal slot uid (which can differ)
      const studentId = String(params?.student_id || params?.uid || '').replace(/[^\x20-\x7E]/g, '').slice(0, 8).trim();

      // ── HARD BLOCK — identity binding is non-negotiable ─────────────────────
      if (!name) {
        throw new Error('BLOCKED: Enrollment requires student name. Identity must be bound before biometric capture.');
      }
      if (!studentId || isNaN(Number(studentId)) || Number(studentId) < 1) {
        throw new Error(`BLOCKED: Enrollment requires a valid student_id — got "${params?.student_id}"`);
      }

      // Use a fresh short-lived connection for enrollment.
      const enrollZk = new ZKLib(DEVICE_IP, DEVICE_PORT, 8000, 5200);
      try {
        await enrollZk.createSocket();

        // ── Resolve device slot ───────────────────────────────────────────────
        // params.uid = device_user_id from DB mapping = our small sequential slot.
        // PIN written to device (bytes 48-55) = String(deviceUid) = the slot number.
        // Must NOT be studentId (the SQL PK) — it can be millions, silently overflows
        // writeUInt16LE (2 bytes), and causes phantom slots on the device.
        const preferredUid = parseInt(params?.uid, 10);
        let deviceUid = null;
        let takenUids = [];
        try {
          await enrollZk.zklibTcp.enableDevice();
          const existing = await enrollZk.getUsers();
          const users = (existing?.data || [])
            .map(u => ({ uid: parseInt(String(u.uid), 10), name: (u.name || '').trim(), userId: (u.userId || '').trim() }))
            .filter(u => !isNaN(u.uid) && u.uid >= 1 && u.uid <= 65535);
          takenUids = users.map(u => u.uid);

          // Priority 1: DB-mapped slot (device_user_id) — match by uid directly
          if (!isNaN(preferredUid) && preferredUid >= 1 && preferredUid <= 65535) {
            const byUid = users.find(u => u.uid === preferredUid);
            if (byUid) {
              deviceUid = byUid.uid;
              log('info', `[ENROLL] Slot match: uid=${deviceUid} name="${byUid.name}"`);
            }
          }

          // Priority 2: Name match (physically-enrolled students not yet in DB mapping)
          if (deviceUid === null && name) {
            const upper = name.toUpperCase();
            const byName = users.find(u => u.name.toUpperCase() === upper);
            if (byName) {
              deviceUid = byName.uid;
              log('info', `[ENROLL] Name match: "${name}" → slot ${deviceUid}`);
            }
          }
        } catch (e) {
          log('warn', `[ENROLL] getUsers failed (non-fatal): ${e.message}`);
        }

        // Priority 3: Preferred slot is free, or find first free slot from 1
        if (deviceUid === null) {
          if (!isNaN(preferredUid) && preferredUid >= 1 && preferredUid <= 65535 && !takenUids.includes(preferredUid)) {
            deviceUid = preferredUid;
          } else {
            let next = 1;
            while (takenUids.includes(next) && next <= 65535) next++;
            deviceUid = next;
          }
          log('info', `[ENROLL] New slot for "${name}" → uid=${deviceUid}`);
        }

        try { await enrollZk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, ''); } catch {}
        await enrollZk.zklibTcp.disableDevice();

        // ── Step 1: User Pre-Registration ────────────────────────────────────
        // ZK 72-byte: [uid=slot(2)] [role(1)] [pwd(8)] [name(24)] [cardno(4)] [pad(9)] [userId PIN(9)]
        // PIN (bytes 48-55) = String(deviceUid) — same small slot number, NOT the SQL student_id PK
        const userBuf = Buffer.alloc(72, 0);
        userBuf.writeUInt16LE(deviceUid, 0);
        Buffer.from(name, 'ascii').copy(userBuf, 11, 0, 23);
        Buffer.from(String(deviceUid), 'ascii').copy(userBuf, 48, 0, 8); // PIN = slot number

        log('info', `[ENROLL] Step 1 — Registering "${name}" slot=${deviceUid}…`);
        await enrollZk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf); // throws → aborts
        log('info', `[ENROLL] Registering "${name}"… Success.`);

        // ── Step 2: Trigger Enrollment ────────────────────────────────────────
        const payload = Buffer.alloc(3);
        payload.writeUInt16LE(deviceUid, 0);
        payload.writeUInt8(Math.max(0, Math.min(9, finger)), 2);

        log('info', `[ENROLL] Step 2 — Triggering Scan slot=${deviceUid} finger=${finger}…`);
        await enrollZk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, payload);
        await enrollZk.zklibTcp.enableDevice();
        log('info', `[ENROLL] Triggering Scan… Success. K40 screen now shows "${name}".`);

        // Post-enrollment name re-confirmation: some devices reset the name when
        // finalising the fingerprint template — write it again to lock it in.
        try {
          await enrollZk.zklibTcp.disableDevice();
          await enrollZk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf);
          await enrollZk.zklibTcp.enableDevice();
          log('info', `[ENROLL] Post-enroll name re-confirmed: "${name}" slot=${deviceUid}`);
        } catch (e) {
          log('warn', `[ENROLL] Post-enroll name re-confirm failed (non-fatal): ${e.message}`);
        }
      } finally {
        try { await enrollZk.disconnect(); } catch {}
      }

      log('info', `[ENROLL] COMPLETE name="${name}" slot=${params?.uid} finger=${finger}`);
      return { message: `Enrollment started for "${name}" (slot ${params?.uid}), finger=${finger}` };
    }

    case 'cancel_enroll': {
      await zk.executeCmd(COMMANDS.CMD_CANCELCAPTURE, '');
      return { message: 'Enrollment cancelled' };
    }

    case 'read_template': {
      const uid = parseInt(params?.uid, 10);
      const finger = parseInt(params?.finger ?? '0', 10);

      const reqBuf = Buffer.alloc(3);
      reqBuf.writeUInt16LE(uid, 0);
      reqBuf.writeUInt8(finger, 2);

      const tpl = await zk.executeCmd(COMMANDS.CMD_USERTEMP_RRQ, reqBuf);
      return {
        uid, finger,
        templateSize: tpl?.length || 0,
        templateData: tpl ? tpl.toString('base64') : null,
      };
    }

    case 'capture_finger': {
      const reply = await zk.executeCmd(COMMANDS.CMD_CAPTUREFINGER, '');
      return { message: 'Capture mode active', reply: reply?.readUInt16LE?.(0) };
    }

    case 'write_lcd': {
      const text = params?.text || '';
      await zk.executeCmd(COMMANDS.CMD_WRITE_LCD, Buffer.from(text + '\0'));
      return { message: `LCD: "${text}"` };
    }

    case 'clear_lcd': {
      await zk.executeCmd(COMMANDS.CMD_CLEAR_LCD, '');
      return { message: 'LCD cleared' };
    }

    case 'exec': {
      const command = parseInt(params?.command, 10);
      const data = params?.data ? Buffer.from(params.data, 'hex') : '';
      const reply = await zk.executeCmd(command, data);
      return {
        command,
        resultLength: reply?.length,
        resultHex: reply ? reply.toString('hex').substring(0, 200) : null,
      };
    }

    case 'start_realtime': {
      await startRealTimeLogs();
      return { message: 'Real-time event listener active' };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── User Sync — report live device users to server to remove phantom mappings ─

async function syncUsersToServer() {
  try {
    const users = await zkCmd.getUsers();
    const userList = (users?.data || [])
      .map(u => ({ uid: parseInt(String(u.uid), 10), name: u.name || '', userId: u.userId || '' }))
      .filter(u => !isNaN(u.uid) && u.uid > 0);

    const resp = await httpRequest('POST', '/api/relay-status', {
      relay_key: RELAY_KEY,
      device_sn: DEVICE_SN,
      user_sync: userList,
    });
    const deleted = resp?.deleted ?? 0;
    log('info', `User sync: ${userList.length} device users reported, ${deleted} phantom mapping(s) removed`);

    // ── Log broken users (empty name or unmapped) ────────────────────────────
    const broken = resp?.broken || [];
    if (broken.length > 0) {
      log('warn', `[BROKEN USERS] ${broken.length} user(s) on device have no identity binding:`);
      for (const u of broken) {
        log('warn', `  uid=${u.uid} reason=${u.reason} — fingerprint was enrolled anonymously`);
      }
    }
  } catch (err) {
    log('warn', `User sync failed: ${err.message}`);
  }
}



async function pollAndExecute() {
  try {
    const resp = await httpRequest(
      'GET',
      `/api/relay-status?poll=1&device_sn=${encodeURIComponent(DEVICE_SN)}&relay_key=${encodeURIComponent(RELAY_KEY)}`,
    );

    // Server reachable — reset failure counter
    consecutivePollFails = 0;

    const commands = resp.commands || [];
    if (commands.length === 0) return;

    log('info', `Received ${commands.length} command(s)`);

    const results = [];
    for (const cmd of commands) {
      let result;
      try {
        result = await handleCommand({ id: cmd.id, action: cmd.action, params: cmd.params });
      } catch (err) {
        // On a dead-socket error, force reconnect and retry once
        const retriable = ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'Device not connected'];
        if (retriable.some(s => (err.message || '').includes(s))) {
          log('warn', `CMD ${cmd.action} socket error — reconnecting and retrying...`);
          connected = false;
          try { zkCmd?.disconnect(); } catch {}
          zkCmd = null;
          await new Promise(r => setTimeout(r, 800));
          try {
            result = await handleCommand({ id: cmd.id, action: cmd.action, params: cmd.params });
          } catch (retryErr) {
            results.push({ id: cmd.id, success: false, error: retryErr.message || String(retryErr) });
            log('error', `CMD ${cmd.action} → FAIL after retry: ${retryErr.message}`);
            continue;
          }
        } else {
          results.push({ id: cmd.id, success: false, error: err.message || String(err) });
          log('error', `CMD ${cmd.action} → FAIL: ${err.message}`);
          continue;
        }
      }
      results.push({ id: cmd.id, success: true, data: result });
      log('info', `CMD ${cmd.action} → OK`);
    }

    // Report results back
    if (results.length > 0) {
      await httpRequest('POST', '/api/relay-status', {
        relay_key: RELAY_KEY,
        device_sn: DEVICE_SN,
        results,
      });
    }
  } catch (err) {
    consecutivePollFails++;
    const msg = err.message || '';
    const networkDead = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'ENOTFOUND', 'HTTP timeout'];
    const isNetworkErr = networkDead.some(s => msg.includes(s));

    if (isNetworkErr && consecutivePollFails === 3) {
      log('warn', `Network appears down (${consecutivePollFails} consecutive failures) — will auto-recover when back`);
    } else if (!isNetworkErr) {
      log('warn', `Poll error: ${msg}`);
    }

    // After several failures, tear down device sockets too — they're likely dead
    if (consecutivePollFails >= 5 && connected) {
      log('warn', 'Tearing down stale device connections after network loss');
      teardownCmd();
      teardownRealtime();
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load config (runs setup wizard on first launch if no config exists)
  const cfg = await loadConfig();
  DRAIS_URL   = cfg.drais_url;
  DEVICE_IP   = cfg.device_ip;
  DEVICE_PORT = cfg.device_port;
  RELAY_KEY   = cfg.relay_key;
  DEVICE_SN   = cfg.device_sn;
  POLL_MS     = cfg.poll_ms;

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DRAIS ZK Relay Agent v1.0');
  console.log(`  Device:  ${DEVICE_IP}:${DEVICE_PORT} (SN: ${DEVICE_SN})`);
  console.log(`  Server:  ${DRAIS_URL}`);
  console.log(`  Poll:    every ${POLL_MS}ms`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Step 1: Connect to device — two separate sockets (cmd + realtime)
  const deviceOk = await connectCmd();
  if (deviceOk) {
    await connectRealtime().catch(() => {});
    // Sync users to server on startup — clears phantom zk_user_mapping entries
    setTimeout(() => syncUsersToServer().catch(() => {}), 6000);
  }

  // Step 2: Start polling loop
  log('info', 'Starting poll loop...');
  setInterval(async () => {
    await pollAndExecute();
  }, POLL_MS);

  // Step 3: Device health check every 10s — recovers quickly after WiFi drop
  setInterval(async () => {
    if (!connected) {
      log('info', 'Attempting device reconnect (cmd)...');
      const ok = await connectCmd().catch(() => false);
      if (ok) {
        await connectRealtime().catch(() => {});
        log('info', 'Device reconnected successfully');
        // Re-sync after reconnect to catch any changes during downtime
        setTimeout(() => syncUsersToServer().catch(() => {}), 3000);
      }
    } else if (!realTimeActive) {
      await connectRealtime().catch(() => {});
    }
  }, 10000);

  // Step 4: Periodic user sync every 30 minutes (catches manual device deletions)
  setInterval(() => syncUsersToServer().catch(() => {}), 30 * 60 * 1000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
