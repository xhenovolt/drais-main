/**
 * Shared helpers for the DB export / local-init / local-verify scripts.
 * Loads .env.local (if present) and builds the online (TiDB) + local (MySQL)
 * connection configs — mirroring src/lib/db/pools.ts so the CLI and the app
 * agree on what "online" and "local" mean. Credentials are never printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function onlineConfig() {
  return {
    host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB || 'drais',
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  };
}

/** Local config WITHOUT a database (for CREATE DATABASE) when withDb=false. */
export function localConfig(withDb = true) {
  const cfg = {
    host: process.env.LOCAL_MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.LOCAL_MYSQL_PORT || '3306', 10),
    user: process.env.LOCAL_MYSQL_USER || 'root',
    password: process.env.LOCAL_MYSQL_PASSWORD || '',
    multipleStatements: true,
  };
  if (withDb) cfg.database = process.env.LOCAL_MYSQL_DATABASE || 'drais_local';
  return cfg;
}

export function pkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const EXPORTS_DIR = path.join(ROOT, 'database', 'exports');
export const ROOT_DIR = ROOT;

/** Tables whose rows are SAFE to ship in a local seed (no private learner/payment data). */
export const SAFE_SEED_TABLES = [
  'permissions',
  'roles',
  'role_permissions',
  'feature_flags',
  'districts',
];
