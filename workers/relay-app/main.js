'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const cp    = require('child_process');
const os    = require('os');

// ─── Paths ────────────────────────────────────────────────────────────────────
const IS_WIN     = process.platform === 'win32';
const IS_PACKAGED = app.isPackaged;

// Relay binary bundled as extraResource when packaged, otherwise sibling in dist/
function getRelayBinary() {
  if (IS_PACKAGED) {
    const name = IS_WIN ? 'drais-relay.exe' : 'drais-relay';
    return path.join(process.resourcesPath, name);
  }
  const name = IS_WIN ? 'drais-relay-win-x64.exe' : 'drais-relay-linux-x64';
  return path.join(__dirname, '..', 'dist', name);
}

// Config stored in user data dir (persists across updates)
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
  drais_url:   'https://sims.drais.pro',
  device_ip:   '192.168.1.197',
  device_sn:   'GED7254601154',
  relay_key:   'DRAIS-355DF9C35EB60899009C01DD948EAD14',
  device_port: 4370,
  poll_ms:     2000,
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Relay Process State ──────────────────────────────────────────────────────
let relayProc    = null;
let relayRunning = false;
let deviceOk     = false;
let logBuffer    = [];  // last 200 lines
let mainWindow   = null;
let tray         = null;

function pushLog(line) {
  logBuffer.push({ ts: Date.now(), line });
  if (logBuffer.length > 200) logBuffer.shift();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-line', line);
  }
}

function parseStatusFromLine(line) {
  if (/Connected to ZK device/i.test(line))    { deviceOk = true;  updateTray(); }
  if (/socket (closed|error)/i.test(line))      { deviceOk = false; updateTray(); }
  if (/Failed to connect/i.test(line))          { deviceOk = false; updateTray(); }
  if (/Starting poll loop/i.test(line))         { relayRunning = true; updateTray(); }
}

function pushStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', {
      running:   relayRunning,
      deviceOk,
      pid:       relayProc?.pid ?? null,
    });
  }
}

// ─── Relay Start / Stop ───────────────────────────────────────────────────────
function startRelay() {
  if (relayProc) return;

  const bin = getRelayBinary();
  if (!fs.existsSync(bin)) {
    pushLog(`[ERROR] Relay binary not found: ${bin}`);
    return;
  }

  // Make sure binary is executable (Linux)
  if (!IS_WIN) {
    try { fs.chmodSync(bin, 0o755); } catch {}
  }

  const cfg = loadConfig();
  const env = {
    ...process.env,
    DRAIS_URL:   cfg.drais_url,
    DEVICE_IP:   cfg.device_ip,
    DEVICE_SN:   cfg.device_sn,
    RELAY_KEY:   cfg.relay_key,
    DEVICE_PORT: String(cfg.device_port || 4370),
    POLL_MS:     String(cfg.poll_ms || 2000),
  };

  pushLog(`[RELAY] Starting: ${bin}`);
  pushLog(`[RELAY] Device: ${cfg.device_ip}  Server: ${cfg.drais_url}`);

  relayProc = cp.spawn(bin, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  relayRunning = true;
  deviceOk     = false;
  pushStatus();
  updateTray();

  relayProc.stdout.on('data', d => {
    d.toString().split('\n').filter(Boolean).forEach(line => {
      pushLog(line);
      parseStatusFromLine(line);
    });
    pushStatus();
  });

  relayProc.stderr.on('data', d => {
    d.toString().split('\n').filter(Boolean).forEach(line => pushLog('[ERR] ' + line));
  });

  relayProc.on('exit', (code, signal) => {
    pushLog(`[RELAY] Exited (code=${code} signal=${signal})`);
    relayProc    = null;
    relayRunning = false;
    deviceOk     = false;
    pushStatus();
    updateTray();
  });
}

function stopRelay() {
  if (!relayProc) return;
  pushLog('[RELAY] Stopping...');
  relayProc.kill('SIGTERM');
  setTimeout(() => { if (relayProc) relayProc.kill('SIGKILL'); }, 3000);
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function getTrayIcon(active) {
  // 16x16 circle: green when active, gray when not
  const size = 16;
  const buf  = Buffer.alloc(size * size * 4);
  const r    = active ? 0   : 100;
  const g    = active ? 212 : 100;
  const b    = active ? 170 : 100;
  const cx   = size / 2, cy = size / 2, rad = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const a = d < rad ? 255 : 0;
      const i = (y * size + x) * 4;
      buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const active = relayRunning && deviceOk;
  tray.setImage(getTrayIcon(active));
  const statusText = !relayRunning ? 'Stopped'
    : !deviceOk     ? 'Running – connecting…'
    :                  'Running – device OK';
  tray.setToolTip(`DRAIS Relay: ${statusText}`);

  const menu = Menu.buildFromTemplate([
    { label: 'DRAIS Relay',           enabled: false },
    { label: `Status: ${statusText}`, enabled: false },
    { type: 'separator' },
    { label: relayRunning ? 'Stop Relay' : 'Start Relay',
      click: () => { relayRunning ? stopRelay() : startRelay(); } },
    { type: 'separator' },
    { label: 'Open Control Panel', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { stopRelay(); app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:        480,
    height:       720,
    minWidth:     420,
    minHeight:    600,
    title:        'DRAIS Relay',
    icon:         path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0a0a12',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    show: false,
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Send current state immediately
    pushStatus();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-history', logBuffer.map(e => e.line));
    }
  });

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    mainWindow.hide();
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ─── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle('relay:start',  () => { startRelay(); return { ok: true }; });
ipcMain.handle('relay:stop',   () => { stopRelay();  return { ok: true }; });
ipcMain.handle('relay:status', () => ({
  running:  relayRunning,
  deviceOk,
  pid:      relayProc?.pid ?? null,
}));

ipcMain.handle('config:get',  () => loadConfig());
ipcMain.handle('config:save', (_, cfg) => {
  saveConfig(cfg);
  // If relay running, restart with new config
  if (relayRunning) {
    stopRelay();
    setTimeout(() => startRelay(), 1500);
  }
  return { ok: true };
});

ipcMain.handle('autostart:get', () => {
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('autostart:set', (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return { ok: true };
});

ipcMain.handle('open-config-dir', () => {
  shell.openPath(path.dirname(CONFIG_PATH));
});

// ─── App Bootstrap ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Ensure config exists
  if (!fs.existsSync(CONFIG_PATH)) saveConfig(DEFAULT_CONFIG);

  // Tray
  tray = new Tray(getTrayIcon(false));
  updateTray();
  tray.on('activate', () => showWindow());          // macOS
  tray.on('click',    () => showWindow());          // Windows/Linux

  // Window
  createWindow();

  // Auto-start relay if configured
  const cfg = loadConfig();
  if (cfg.auto_start !== false) {
    setTimeout(() => startRelay(), 1500);
  }
});

// Keep app alive (tray)
app.on('window-all-closed', () => { /* do nothing — tray keeps it alive */ });

// Graceful shutdown
app.on('before-quit', () => {
  stopRelay();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
  }
});
