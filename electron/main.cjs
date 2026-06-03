/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * DRAIS — Electron main process.
 *
 * Boots the Next.js standalone server in-process (same Node event
 * loop as Electron's main process — no child fork, no ELECTRON_RUN_AS_NODE
 * dance) and opens a kiosk-style BrowserWindow at http://localhost:<port>.
 *
 * Topology: kiosk window + LAN server. The Next.js server binds to
 * 0.0.0.0 so:
 *   - the local BrowserWindow can hit it on 127.0.0.1
 *   - ZKTeco devices on the same LAN can POST to /iclock/cdata at
 *     http://<this-pc-ip>:<port>/iclock/cdata
 *   - other operators on the LAN can open the UI in their browsers
 *
 * Database: TiDB cloud — internet required. Credentials come from
 * .env.production (or system env vars) the same way they would on a
 * Linux deploy.
 *
 * Port selection: defaults to 3210 to avoid the common 3000 conflict
 * (CRA, other Next dev servers). Override with DRAIS_PORT.
 */

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Groups all DRAIS windows under one Windows taskbar slot and ensures
// our installer's icon (NSIS) matches what shows on the taskbar.
// Must match electron-builder.yml's `appId`.
app.setAppUserModelId('ug.drais.desktop');

const isDev = !app.isPackaged;
const PORT = Number(process.env.DRAIS_PORT) || 3210;

// In packaged mode resources live under process.resourcesPath; in dev
// the project root is the repo. We point at the Next standalone build
// either way — `npm run build` puts it in .next/standalone.
const standaloneDir = isDev
  ? path.join(__dirname, '..', '.next', 'standalone')
  : path.join(process.resourcesPath, 'standalone');

// Single canonical icon location. Drop your `icon.ico` (256×256
// recommended, multi-resolution preferred) at `build/icon.ico` in the
// project root. The same file feeds:
//   - the BrowserWindow + taskbar icon (loaded below)
//   - the NSIS installer + uninstaller icon (electron-builder.yml → win.icon)
//   - the installed Start-Menu / Desktop shortcut (NSIS picks it up from
//     the bundled .exe metadata)
// If the file is missing, electron-builder falls back to its default
// Electron icon and we silently omit the BrowserWindow icon.
const iconPath = isDev
  ? path.join(__dirname, '..', 'build', 'icon.ico')
  : path.join(process.resourcesPath, 'icon.ico');
const windowIcon = fs.existsSync(iconPath) ? iconPath : undefined;

let mainWindow = null;
let serverReady = false;

function logToFile(line) {
  try {
    const logDir = app.getPath('userData');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'drais.log'),
      `[${new Date().toISOString()}] ${line}\n`,
    );
  } catch {
    /* best-effort logging */
  }
}

/**
 * Start the embedded Next.js server. We require() the standalone
 * server.js after setting PORT + HOSTNAME so it picks them up.
 * Standalone's server.js calls http.createServer + listen synchronously
 * during require, so by the time the require returns the listener is
 * registered (though the socket may need a tick to bind).
 */
function startNextServer() {
  const serverEntry = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(serverEntry)) {
    const msg =
      `DRAIS server bundle not found at:\n  ${serverEntry}\n\n` +
      `Run "npm run build" before launching Electron (or "npm run dist:win" ` +
      `to produce the installer).`;
    logToFile('FATAL: ' + msg.replace(/\n/g, ' '));
    dialog.showErrorBox('DRAIS — Missing server bundle', msg);
    app.quit();
    return;
  }

  process.env.PORT = String(PORT);
  // Bind to all interfaces so ZK devices and other LAN clients can
  // reach this PC. The BrowserWindow itself uses 127.0.0.1.
  process.env.HOSTNAME = '0.0.0.0';
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';

  // The standalone bundle expects to run from its own directory
  // (relative require paths inside its included node_modules).
  process.chdir(standaloneDir);

  try {
    logToFile(`Starting Next standalone server on 0.0.0.0:${PORT}`);
    require(serverEntry);
  } catch (err) {
    const msg = `Failed to start Next.js server:\n${err && err.stack ? err.stack : err}`;
    logToFile('FATAL: ' + msg.replace(/\n/g, ' '));
    dialog.showErrorBox('DRAIS — Server crashed on startup', msg);
    app.quit();
  }
}

/** Poll the local server until it answers 2xx/3xx. Then load it. */
function waitForServer(cb, attempts = 0) {
  const req = http.get(
    { hostname: '127.0.0.1', port: PORT, path: '/', timeout: 1500 },
    (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) {
        serverReady = true;
        cb();
      } else {
        retry();
      }
    },
  );
  req.on('error', retry);
  req.on('timeout', () => { req.destroy(); retry(); });

  function retry() {
    if (attempts >= 40) {
      const msg =
        `DRAIS server did not become reachable on http://127.0.0.1:${PORT} ` +
        `within 60 seconds. Check ${path.join(app.getPath('userData'), 'drais.log')} ` +
        `for details.`;
      logToFile('FATAL: server never reachable');
      dialog.showErrorBox('DRAIS — Server timeout', msg);
      app.quit();
      return;
    }
    setTimeout(() => waitForServer(cb, attempts + 1), 500);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f172a',
    title: 'DRAIS',
    icon: windowIcon,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in the user's browser, not in the Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.startsWith(`http://localhost:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Hide the default menu in production; keep DevTools accessible in dev.
if (!isDev) Menu.setApplicationMenu(null);

// Single-instance: a second launch should focus the existing window
// instead of spinning up a second Next server (which would fail to
// bind the port anyway).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startNextServer();
    waitForServer(() => createWindow());

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverReady) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  // Standard Electron pattern: keep running on macOS, quit elsewhere.
  // The Next server lives in this process, so quitting also shuts it down.
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  logToFile('UNCAUGHT: ' + (err && err.stack ? err.stack : String(err)));
});
process.on('unhandledRejection', (reason) => {
  logToFile('UNHANDLED_REJECTION: ' + String(reason));
});
