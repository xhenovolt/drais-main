#!/usr/bin/env node
/**
 * DRAIS Local Bridge — ZKTeco Direct Socket Server
 * ═══════════════════════════════════════════════════
 * Runs on the school's local machine. Exposes a small HTTP server that
 * accepts enrollment commands from DRAIS (cloud or remote) and executes them
 * directly on the ZKTeco device via TCP socket.
 *
 * USE THIS ONLY when the DRAIS API server is NOT on the same LAN as the device.
 * If DRAIS runs locally (same machine or same network), use the built-in
 * POST /api/device/local-enroll endpoint instead — it does the same thing.
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 *   1. Copy this file to the school machine.
 *   2. Set the DR_BRIDGE_SECRET environment variable (same value in .env.local).
 *   3. Run: node bridge.mjs
 *      Or build a standalone binary: npm install -g pkg && pkg bridge.mjs
 *
 * ── Endpoints ────────────────────────────────────────────────────────────────
 *   GET  /health              → { ok: true, version }
 *   POST /enroll              → trigger CMD_STARTENROLL on device
 *   POST /cancel              → cancel in-progress capture
 *   POST /beep                → test voice/beep
 *   GET  /users?ip=...        → list users from device
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 *   Every request must include header: Authorization: Bearer <DR_BRIDGE_SECRET>
 *   Requests without a valid token are rejected with 401.
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *   DR_BRIDGE_SECRET  — shared secret (required, min 16 chars)
 *   BRIDGE_PORT       — HTTP port to listen on (default 7430)
 *   BRIDGE_HOST       — bind address (default 127.0.0.1 — loopback only!)
 *                       Set to 0.0.0.0 only if on a trusted network.
 */

import http from 'http';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// ─── Load .env.local if present (dev convenience) ────────────────────────────
const envFile = path.resolve(__dirname, '..', '.env.local');
if (existsSync(envFile)) {
  readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const i = t.indexOf('=');
    if (i < 0) return;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  });
}

const SECRET      = process.env.DR_BRIDGE_SECRET || '';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '7430', 10);
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const VERSION     = '1.1.0';

if (SECRET.length < 16) {
  console.error(
    '[BRIDGE] FATAL: DR_BRIDGE_SECRET must be set to at least 16 characters.\n' +
    '  Set it in .env.local or export DR_BRIDGE_SECRET=your_secret_here',
  );
  process.exit(1);
}

// ─── ZK Library ──────────────────────────────────────────────────────────────
let ZKLib, COMMANDS;
try {
  ZKLib    = require('node-zklib');
  COMMANDS = require('node-zklib/constants').COMMANDS;
} catch {
  console.error('[BRIDGE] FATAL: node-zklib not found. Run: npm install node-zklib');
  process.exit(1);
}

// ─── IP Validator ─────────────────────────────────────────────────────────────
function isValidIP(ip) {
  const match = ip?.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const o = [+match[1], +match[2], +match[3], +match[4]];
  if (o.some(n => n < 0 || n > 255)) return false;
  if (o[0] === 127 || o[0] === 0) return false;
  return true;
}

// ─── Request Helpers ──────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) reject(new Error('Body too large')); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function checkAuth(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== SECRET) {
    json(res, 401, { error: 'Unauthorized — invalid DR_BRIDGE_SECRET' });
    return false;
  }
  return true;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const method = req.method.toUpperCase();
  const path_ = url.pathname;

  // CORS (allow DRAIS frontend/backend to call this)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── Health ──────────────────────────────────────────────────────────────────
  if (method === 'GET' && path_ === '/health') {
    return json(res, 200, { ok: true, version: VERSION, service: 'drais-local-bridge' });
  }

  // ── All other endpoints require auth ────────────────────────────────────────
  if (!checkAuth(req, res)) return;

  // ── GET /users?ip=X&port=Y ──────────────────────────────────────────────────
  if (method === 'GET' && path_ === '/users') {
    const deviceIp   = url.searchParams.get('ip');
    const devicePort = parseInt(url.searchParams.get('port') || '4370', 10);
    if (!deviceIp || !isValidIP(deviceIp)) return json(res, 400, { error: 'Invalid ip param' });

    const zk = new ZKLib(deviceIp, devicePort, 8000, 5200);
    try {
      await zk.createSocket();
      const result = await zk.getUsers();
      await zk.disconnect();
      return json(res, 200, { ok: true, users: result?.data ?? [] });
    } catch (e) {
      try { await zk.disconnect(); } catch {}
      return json(res, 502, { error: e.message });
    }
  }

  // ── GET /templates?ip=X&port=Y ─────────────────────────────────────────────
  if (method === 'GET' && path_ === '/templates') {
    const deviceIp   = url.searchParams.get('ip');
    const devicePort = parseInt(url.searchParams.get('port') || '4370', 10);
    if (!deviceIp || !isValidIP(deviceIp)) return json(res, 400, { error: 'Invalid ip param' });

    const zk = new ZKLib(deviceIp, devicePort, 8000, 5200);
    try {
      await zk.createSocket();
      const result = await zk.getTemplates();
      await zk.disconnect();
      return json(res, 200, { ok: true, templates: result?.data ?? [] });
    } catch (e) {
      try { await zk.disconnect(); } catch {}
      return json(res, 502, { error: e.message });
    }
  }

  // ── POST endpoints — parse body ─────────────────────────────────────────────
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }

  const deviceIp   = body.deviceIp   || body.device_ip;
  const devicePort = parseInt(String(body.devicePort || body.device_port || '4370'), 10);

  if ((path_ === '/enroll' || path_ === '/cancel' || path_ === '/beep') && (!deviceIp || !isValidIP(deviceIp))) {
    return json(res, 400, { error: 'deviceIp is required and must be a valid IPv4 address' });
  }

  // ── POST /beep ──────────────────────────────────────────────────────────────
  if (method === 'POST' && path_ === '/beep') {
    const zk = new ZKLib(deviceIp, devicePort, 8000, 5200);
    try {
      await zk.createSocket();
      await zk.zklibTcp.executeCmd(COMMANDS.CMD_TESTVOICE, '');
      await zk.disconnect();
      return json(res, 200, { ok: true, message: 'Beep sent' });
    } catch (e) {
      try { await zk.disconnect(); } catch {}
      return json(res, 502, { error: e.message });
    }
  }

  // ── POST /cancel ────────────────────────────────────────────────────────────
  if (method === 'POST' && path_ === '/cancel') {
    const zk = new ZKLib(deviceIp, devicePort, 8000, 5200);
    try {
      await zk.createSocket();
      await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, '');
      await zk.zklibTcp.enableDevice();
      await zk.disconnect();
      return json(res, 200, { ok: true, message: 'Capture cancelled' });
    } catch (e) {
      try { await zk.disconnect(); } catch {}
      return json(res, 502, { error: e.message });
    }
  }

  // ── POST /enroll ─────────────────────────────────────────────────────────────
  if (method === 'POST' && path_ === '/enroll') {
    const uid    = parseInt(String(body.userId || body.uid), 10);
    const finger = Math.max(0, Math.min(9, parseInt(String(body.finger ?? '0'), 10)));

    if (isNaN(uid) || uid < 1 || uid > 65535) {
      return json(res, 400, { error: 'userId must be an integer 1–65535' });
    }

    const zk = new ZKLib(deviceIp, devicePort, 8000, 5200);
    try {
      await zk.createSocket();

      // Cancel any ongoing capture
      try { await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, ''); } catch {}
      await zk.zklibTcp.disableDevice();

      const payload = Buffer.alloc(3);
      payload.writeUInt16LE(uid, 0);
      payload.writeUInt8(finger, 2);
      await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, payload);

      await zk.zklibTcp.enableDevice();
      await zk.disconnect();

      console.log(`[BRIDGE] ${new Date().toISOString()} ENROLL uid=${uid} finger=${finger} device=${deviceIp}`);
      return json(res, 200, {
        ok: true,
        uid,
        message: `CMD_STARTENROLL sent for UID ${uid}, finger ${finger}. Device is awaiting fingerprint.`,
      });
    } catch (e) {
      try { await zk.zklibTcp.enableDevice(); } catch {}
      try { await zk.disconnect(); } catch {}
      console.error(`[BRIDGE] ENROLL failed:`, e.message);
      return json(res, 502, { error: e.message });
    }
  }

  // ── POST /sync ──────────────────────────────────────────────────────────────
  // Pull ALL users + templates from device and POST to DRAIS cloud for merging.
  // Body: { deviceIp, devicePort?, cloudUrl }
  // The bridge injects its own secret via Authorization header automatically.
  if (method === 'POST' && path_ === '/sync') {
    if (!deviceIp || !isValidIP(deviceIp)) {
      return json(res, 400, { error: 'deviceIp is required and must be a valid IPv4 address' });
    }
    const cloudUrl = body.cloudUrl || body.cloud_url;
    if (!cloudUrl || typeof cloudUrl !== 'string') {
      return json(res, 400, { error: 'cloudUrl is required' });
    }

    const zk = new ZKLib(deviceIp, devicePort, 10000, 5200);
    let users = [], templates = [];
    try {
      await zk.createSocket();
      const [usersResult, templatesResult] = await Promise.allSettled([
        zk.getUsers(),
        zk.getTemplates(),
      ]);
      await zk.disconnect();

      if (usersResult.status === 'fulfilled') users = usersResult.value?.data ?? [];
      if (templatesResult.status === 'fulfilled') templates = templatesResult.value?.data ?? [];
    } catch (e) {
      try { await zk.disconnect(); } catch {}
      console.error(`[BRIDGE] /sync device pull failed:`, e.message);
      return json(res, 502, { error: `Device connection failed: ${e.message}` });
    }

    // POST to cloud manual-upload
    const uploadUrl = `${cloudUrl.replace(/\/$/, '')}/api/sync/manual-upload`;

    try {
      const cloudRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Secret': SECRET,
        },
        body: JSON.stringify({
          users,
          templates,
          device_ip: deviceIp,
          device_port: devicePort,
        }),
      });
      const cloudBody = await cloudRes.json().catch(() => null);

      console.log(`[BRIDGE] ${new Date().toISOString()} SYNC device=${deviceIp} users=${users.length} templates=${templates.length} cloud_status=${cloudRes.status}`);
      return json(res, cloudRes.ok ? 200 : 502, {
        ok: cloudRes.ok,
        users_pulled: users.length,
        templates_pulled: templates.length,
        cloud_response: cloudBody,
      });
    } catch (e) {
      console.error(`[BRIDGE] /sync cloud upload failed:`, e.message);
      return json(res, 502, { error: `Cloud upload failed: ${e.message}`, users_pulled: users.length, templates_pulled: templates.length });
    }
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  console.log(`\n  DRAIS Local Bridge v${VERSION}`);
  console.log(`  Listening on http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  console.log(`  Auth: DR_BRIDGE_SECRET (${SECRET.length} chars)\n`);
  console.log(`  Endpoints:`);
  console.log(`    GET  /health`);
  console.log(`    POST /enroll  { deviceIp, userId, finger? }`);
  console.log(`    POST /cancel  { deviceIp }`);
  console.log(`    POST /beep    { deviceIp }`);
  console.log(`    GET  /users?ip=...`);
  console.log(`    GET  /templates?ip=...`);
  console.log(`    POST /sync    { deviceIp, cloudUrl }`);
  console.log(`\n  TIP: Run as a background service with pm2 start bridge.mjs`);
});
