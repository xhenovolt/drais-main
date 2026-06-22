/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * DRAIS — Electron main process.
 *
 * Boots the Next.js standalone server in-process and opens a kiosk-style
 * BrowserWindow at http://127.0.0.1:<port>. The server binds 0.0.0.0 so ZKTeco
 * devices + other LAN operators can reach it.
 *
 * Boot model (Model A): load config → start server → wait reachable →
 * check /api/health (DB) → open app, or a DIAGNOSTIC screen if the DB is down.
 * Never a blank white window.
 *
 * Config: loaded by electron/config.cjs from system env / userData/drais.env /
 * bundled .env.production — the installed app never needs a developer .env.
 * Database: TiDB cloud (internet required).
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { loadConfig } = require('./config.cjs');

app.setAppUserModelId('ug.drais.desktop');

const isDev = !app.isPackaged;
const PORT = Number(process.env.DRAIS_PORT) || 3210;

const standaloneDir = isDev
  ? path.join(__dirname, '..', '.next', 'standalone')
  : path.join(process.resourcesPath, 'standalone');
const iconPath = isDev
  ? path.join(__dirname, '..', 'build', 'icon.ico')
  : path.join(process.resourcesPath, 'icon.ico');
const windowIcon = fs.existsSync(iconPath) ? iconPath : undefined;

let mainWindow = null;
let serverReady = false;
let cfg = null;

function logDir() { return app.getPath('userData'); }
function logPath() { return path.join(logDir(), 'drais.log'); }
function logToFile(line) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(logPath(), `[${new Date().toISOString()}] ${line}\n`);
  } catch { /* best-effort */ }
}

/** Mirror the in-process Next server's console output into drais.log. */
function captureConsole() {
  for (const level of ['log', 'info', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try { logToFile(`[server:${level}] ` + args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); } catch { /* ignore */ }
      orig(...args);
    };
  }
}

function startNextServer() {
  const serverEntry = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    const msg = `DRAIS server bundle not found at:\n  ${serverEntry}\n\nRun "npm run build:electron" before launching, or "npm run dist:win".`;
    logToFile('FATAL: ' + msg.replace(/\n/g, ' '));
    showFatal('Missing server bundle', msg);
    return false;
  }
  process.env.PORT = String(PORT);
  process.env.HOSTNAME = '0.0.0.0';
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.chdir(standaloneDir);
  try {
    logToFile(`Starting Next standalone server on 0.0.0.0:${PORT} (config: ${cfg ? cfg.source : 'n/a'})`);
    captureConsole();
    require(serverEntry);
    return true;
  } catch (err) {
    const msg = `Failed to start Next.js server:\n${err && err.stack ? err.stack : err}`;
    logToFile('FATAL: ' + msg.replace(/\n/g, ' '));
    showFatal('Server crashed on startup', msg);
    return false;
  }
}

/** Poll until the server answers on /api/health (any HTTP response = up). */
function waitForServer(cb, attempts = 0) {
  const req = http.get({ hostname: '127.0.0.1', port: PORT, path: '/api/health', timeout: 1500 }, (res) => {
    res.resume();
    serverReady = true; cb();
  });
  req.on('error', retry);
  req.on('timeout', () => { req.destroy(); retry(); });
  function retry() {
    if (attempts >= 60) {
      logToFile('FATAL: server never reachable');
      showDiagnostic({ ok: false, server: false, db: { connected: false, error: 'Server did not start within ~90s.' } });
      return;
    }
    setTimeout(() => waitForServer(cb, attempts + 1), 500);
  }
}

/** GET /api/health → parsed JSON (or a server-down shape). */
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: '/api/health', timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ ok: false, server: true, db: { connected: false, error: 'health endpoint returned non-JSON' } }); } });
    });
    req.on('error', (e) => resolve({ ok: false, server: false, db: { connected: false, error: String(e) } }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, server: true, db: { connected: false, error: 'health check timed out' } }); });
  });
}

function ensureWindow() {
  if (mainWindow) return mainWindow;
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 640,
    backgroundColor: '#0f172a', title: 'DRAIS', icon: windowIcon, show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith(`http://localhost:${PORT}`)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function openApp() { ensureWindow().loadURL(`http://127.0.0.1:${PORT}/`); }

function esc(s) { return String(s).replace(/[<>]/g, ''); }

function showDiagnostic(health) {
  const w = ensureWindow();
  const dbErr = health?.db?.error ? esc(health.db.error) : 'unknown';
  const html = `<!doctype html><meta charset="utf-8"><title>DRAIS — Diagnostics</title>
  <style>body{font:14px/1.6 system-ui,Segoe UI,Arial;background:#0f172a;color:#e2e8f0;margin:0;padding:40px}
  .card{max-width:680px;margin:auto;background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px}
  h1{font-size:20px;margin:0 0 4px}.sub{color:#94a3b8;margin:0 0 20px}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1f2937}
  .ok{color:#34d399}.bad{color:#f87171}.k{color:#94a3b8}code{background:#0b1220;padding:2px 6px;border-radius:6px;color:#fca5a5;word-break:break-all}
  .hint{margin-top:18px;color:#94a3b8;font-size:13px}a.btn{display:inline-block;margin-top:18px;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px}</style>
  <div class="card">
    <h1>DRAIS can't reach its database</h1>
    <p class="sub">The app started, but the database connection failed. Your data is safe — this is a configuration/connectivity issue.</p>
    <div class="row"><span class="k">Local server</span><span class="${health?.server?'ok':'bad'}">${health?.server?'running':'not running'}</span></div>
    <div class="row"><span class="k">Database</span><span class="bad">not connected</span></div>
    <div class="row"><span class="k">Config source</span><span>${esc((health?.env?.config_source)||'none')}</span></div>
    <div class="row"><span class="k">TiDB host set</span><span class="${health?.env?.tidb_host_set?'ok':'bad'}">${health?.env?.tidb_host_set?'yes':'no'}</span></div>
    <div class="row"><span class="k">TiDB user set</span><span class="${health?.env?.tidb_user_set?'ok':'bad'}">${health?.env?.tidb_user_set?'yes':'no'}</span></div>
    <div class="row"><span class="k">TiDB password set</span><span class="${health?.env?.tidb_password_set?'ok':'bad'}">${health?.env?.tidb_password_set?'yes':'no'}</span></div>
    <div class="row"><span class="k">Error</span><span><code>${dbErr}</code></span></div>
    <p class="hint">Fix: put DB settings in <code>${esc(path.join(logDir(),'drais.env'))}</code> (TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DB), check internet, then <b>Help → Retry connection</b>. Logs: <code>${esc(logPath())}</code></p>
    <a class="btn" href="http://127.0.0.1:${PORT}/">Retry (reload app)</a>
  </div>`;
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function showFatal(title, msg) {
  try { dialog.showErrorBox('DRAIS — ' + title, msg); } catch { /* ignore */ }
  showDiagnostic({ ok: false, server: false, db: { connected: false, error: msg } });
}

async function boot() {
  const health = await checkHealth();
  logToFile(`health: ok=${health.ok} server=${health.server} db=${health.db && health.db.connected} ${health.db && health.db.error ? '("' + health.db.error + '")' : ''}`);
  if (health.ok) openApp(); else showDiagnostic(health);
}

function buildMenu() {
  const template = [
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forcereload' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(isDev ? [{ role: 'toggledevtools' }] : [])] },
    { label: 'Help', submenu: [
      { label: 'Open DRAIS', click: openApp },
      { label: 'Retry connection', click: () => boot() },
      { type: 'separator' },
      { label: 'Open Logs Folder', click: () => shell.openPath(logDir()) },
      { label: 'View Diagnostics', click: () => checkHealth().then(showDiagnostic) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    cfg = loadConfig({ userDataDir: app.getPath('userData'), resourcesPath: app.isPackaged ? process.resourcesPath : null, isPackaged: app.isPackaged });
    logToFile(`config source: ${cfg.source}; ${cfg.summary.join('; ')}`);
    if (!cfg.hasDbCreds) logToFile('WARN: no DB credentials resolved — diagnostic screen will show until configured.');
    buildMenu();
    if (!startNextServer()) return;
    waitForServer(() => boot());
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0 && serverReady) boot(); });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
process.on('uncaughtException', (err) => logToFile('UNCAUGHT: ' + (err && err.stack ? err.stack : String(err))));
process.on('unhandledRejection', (reason) => logToFile('UNHANDLED_REJECTION: ' + String(reason)));
