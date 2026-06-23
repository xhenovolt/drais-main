/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Safe configuration loader for the packaged DRAIS desktop app.
 *
 * The installed executable must NOT depend on a developer `.env` in a project
 * folder. Config is resolved with this precedence (highest wins):
 *
 *   1. Process/system environment variables (already set before launch)
 *   2. userData/drais.env        — admin-editable, per-machine (KEY=VALUE lines)
 *   3. bundled resources/.env.production — shipped default (gitignored at build)
 *
 * Resolved values are written back into process.env BEFORE the Next standalone
 * server is require()d, so db.ts and the rest of the app pick them up exactly as
 * they would on a Linux deploy. Secrets are masked in any log output.
 */
const fs = require('fs');
const path = require('path');

// Keys DRAIS actually reads at runtime (online/TiDB build).
const KNOWN_KEYS = [
  'TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DB',
  // Hybrid online/local DB mode (Track A) — required for the desktop app to
  // offer + connect to a local MySQL (XAMPP) database.
  'DRAIS_ALLOW_LOCAL', 'DRAIS_DB_MODE',
  'LOCAL_MYSQL_HOST', 'LOCAL_MYSQL_PORT', 'LOCAL_MYSQL_USER', 'LOCAL_MYSQL_PASSWORD', 'LOCAL_MYSQL_DATABASE',
  'DEVICE_CLAIM_SECRET',
  'DATABASE_MODE', 'APP_MODE', 'DRAIS_PORT', 'NODE_ENV',
  // tolerated extras some routes read:
  'AFRICASTALKING_USERNAME', 'AFRICASTALKING_API_KEY',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
];
const SECRET_RE = /(PASSWORD|API_KEY|SECRET|TOKEN)/i;

function parseEnvFile(file) {
  const out = {};
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch { /* file may not exist */ }
  return out;
}

function mask(key, val) {
  if (val == null) return '(unset)';
  if (SECRET_RE.test(key)) return val ? '***set***' : '(empty)';
  return val;
}

/**
 * @param {{ userDataDir: string, resourcesPath: string|null, isPackaged: boolean }} ctx
 * @returns {{ applied: Record<string,string>, source: string, userEnvPath: string, summary: string[] }}
 */
function loadConfig(ctx) {
  const userEnvPath = path.join(ctx.userDataDir, 'drais.env');
  const bundledEnvPath = ctx.resourcesPath ? path.join(ctx.resourcesPath, '.env.production') : null;

  const bundled = bundledEnvPath && fs.existsSync(bundledEnvPath) ? parseEnvFile(bundledEnvPath) : {};
  const user = fs.existsSync(userEnvPath) ? parseEnvFile(userEnvPath) : {};

  const sources = [];
  if (Object.keys(bundled).length) sources.push('bundled .env.production');
  if (Object.keys(user).length) sources.push('userData/drais.env');

  // Apply precedence: bundled < user < existing process.env.
  const applied = {};
  for (const k of KNOWN_KEYS) {
    const v = process.env[k] != null && process.env[k] !== '' ? process.env[k]
            : (user[k] != null ? user[k]
            : (bundled[k] != null ? bundled[k] : undefined));
    if (v !== undefined) { process.env[k] = v; applied[k] = v; }
  }

  const hasDbCreds = !!(process.env.TIDB_USER && process.env.TIDB_PASSWORD);
  const source = sources.length ? sources.join(' + ') : (hasDbCreds ? 'system env' : 'none');
  process.env.DRAIS_CONFIG_SOURCE = source;
  // Expose the writable config file so the in-app DB-credentials UI can persist
  // changes to the same file the loader reads at next boot.
  process.env.DRAIS_CONFIG_FILE = userEnvPath;

  const summary = KNOWN_KEYS
    .filter(k => applied[k] !== undefined)
    .map(k => `${k}=${mask(k, applied[k])}`);

  return { applied, source, userEnvPath, bundledEnvPath, hasDbCreds, summary };
}

module.exports = { loadConfig, mask, KNOWN_KEYS };
