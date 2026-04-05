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

// ─── Configuration (env > CLI args > config file > defaults) ──────────────────

// Load optional config file
let fileConfig = {};
const configPath = path.join(__dirname, 'drais-relay.config.json');
if (fs.existsSync(configPath)) {
  try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
}

// CLI args: --key=value or positional DRAIS_URL DEVICE_IP DEVICE_SN RELAY_KEY
const args = {};
process.argv.slice(2).forEach(a => {
  const m = a.match(/^--([\w_]+)=(.+)$/);
  if (m) args[m[1].toLowerCase()] = m[2];
});

function cfg(envKey, argKey, fileKey, def) {
  return process.env[envKey] || args[argKey] || fileConfig[fileKey] || def;
}

const DRAIS_URL   = cfg('DRAIS_URL',   'url',        'drais_url',   'http://localhost:3000');
const DEVICE_IP   = cfg('DEVICE_IP',   'device_ip',  'device_ip',   '192.168.1.197');
const DEVICE_PORT = parseInt(cfg('DEVICE_PORT', 'device_port', 'device_port', '4370'), 10);
const RELAY_KEY   = cfg('RELAY_KEY',   'relay_key',  'relay_key',   'drais-relay-default-key');
const DEVICE_SN   = cfg('DEVICE_SN',   'device_sn',  'device_sn',   'GED7254601154');
const POLL_MS     = parseInt(cfg('POLL_MS', 'poll_ms', 'poll_ms', '2000'), 10);

// ─── Keep-alive HTTP agents (prevents ECONNRESET on idle connections) ─────────
const httpAgent  = new http.Agent({ keepAlive: true, maxSockets: 2 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 2 });

// ─── Globals ──────────────────────────────────────────────────────────────────

let zk = null;
let connected = false;
let realTimeActive = false;

function log(level, msg, data = null) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = { info: '✓', warn: '⚠', error: '✗', event: '→' }[level] || '·';
  console.log(`[${ts}] ${prefix} ${msg}${data ? ' ' + JSON.stringify(data) : ''}`);
}

// ─── ZK Device Connection ─────────────────────────────────────────────────────

async function connectDevice() {
  if (connected) return;

  log('info', `Connecting to ZK device at ${DEVICE_IP}:${DEVICE_PORT}...`);
  zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 10000, 5200);

  try {
    await zk.createSocket(
      (err) => {
        log('error', 'ZK socket error', err.message);
        connected = false;
      },
      () => {
        log('warn', 'ZK socket closed');
        connected = false;
      },
    );
    connected = true;
    log('info', 'Connected to ZK device via TCP');

    // Get device info
    try {
      const info = await zk.getInfo();
      log('info', 'Device info', info);
    } catch {}

    return true;
  } catch (err) {
    log('error', `Failed to connect to device: ${err.message}`);
    connected = false;
    return false;
  }
}

async function ensureConnection() {
  if (!connected) {
    await connectDevice();
  }
  if (!connected) {
    throw new Error('Device not connected');
  }
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
  if (realTimeActive) return;
  await ensureConnection();

  try {
    await zk.getRealTimeLogs((data) => {
      log('event', 'Real-time event', data);
      // Report real-time event to DRAIS
      httpRequest('POST', '/api/relay-status', {
        relay_key: RELAY_KEY,
        results: [{
          id: 0,
          success: true,
          data: { type: 'realtime_event', event: data },
        }],
      }).catch(() => {});
    });
    realTimeActive = true;
    log('info', 'Real-time event listener active');
  } catch (err) {
    log('error', `Real-time init failed: ${err.message}`);
  }
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleCommand(msg) {
  const { action, params } = msg;
  await ensureConnection();

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
      const uid = parseInt(params?.uid, 10);
      const finger = parseInt(params?.finger ?? '0', 10);

      if (isNaN(uid) || uid < 1 || uid > 65535) {
        throw new Error(`Invalid uid: ${params?.uid}`);
      }

      // Cancel any in-progress capture, then disable to prevent punch collisions
      try { await zk.executeCmd(COMMANDS.CMD_CANCELCAPTURE, ''); } catch {}
      try { await zk.disableDevice(); } catch {}

      const enrollData = Buffer.alloc(3);
      enrollData.writeUInt16LE(uid, 0);
      enrollData.writeUInt8(Math.max(0, Math.min(9, finger)), 2);

      const reply = await zk.executeCmd(COMMANDS.CMD_STARTENROLL, enrollData);

      // Re-enable so device can still collect attendance while waiting for finger scan
      try { await zk.enableDevice(); } catch {}

      log('info', `Enrollment started uid=${uid} finger=${finger} reply=${reply?.readUInt16LE?.(0)}`);
      return { message: `Enrollment started for UID=${uid}, finger=${finger}`, reply: reply?.readUInt16LE?.(0) };
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

// ─── Poll Loop — Fetch & Execute Commands from DRAIS ──────────────────────────

async function pollAndExecute() {
  try {
    const resp = await httpRequest(
      'GET',
      `/api/relay-status?poll=1&device_sn=${encodeURIComponent(DEVICE_SN)}&relay_key=${encodeURIComponent(RELAY_KEY)}`,
    );

    const commands = resp.commands || [];
    if (commands.length === 0) return;

    log('info', `Received ${commands.length} command(s)`);

    const results = [];
    for (const cmd of commands) {
      try {
        const result = await handleCommand({ id: cmd.id, action: cmd.action, params: cmd.params });
        results.push({ id: cmd.id, success: true, data: result });
        log('info', `CMD ${cmd.action} → OK`);
      } catch (err) {
        results.push({ id: cmd.id, success: false, error: err.message || String(err) });
        log('error', `CMD ${cmd.action} → FAIL: ${err.message}`);
      }
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
    // Suppress transient errors (server may be down temporarily or connection reset)
    const silent = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'HTTP timeout'];
    if (!silent.some(s => err.message.includes(s))) {
      log('warn', `Poll error: ${err.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DRAIS ZK Relay Agent v1.0');
  console.log(`  Device:  ${DEVICE_IP}:${DEVICE_PORT} (SN: ${DEVICE_SN})`);
  console.log(`  Server:  ${DRAIS_URL}`);
  console.log(`  Poll:    every ${POLL_MS}ms`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // Step 1: Connect to device
  const deviceOk = await connectDevice();
  if (deviceOk) {
    await startRealTimeLogs();
  }

  // Step 2: Start polling loop
  log('info', 'Starting poll loop...');
  setInterval(async () => {
    await pollAndExecute();
  }, POLL_MS);

  // Step 3: Device health check every 30s
  setInterval(async () => {
    if (!connected) {
      log('info', 'Attempting device reconnect...');
      const ok = await connectDevice().catch(() => false);
      if (ok && !realTimeActive) {
        await startRealTimeLogs().catch(() => {});
      }
    }
  }, 30000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
