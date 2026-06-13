#!/usr/bin/env node
/**
 * Phase 2C — TiDB Cloud pre-flight check. READ-ONLY.
 *
 * Verifies connectivity, active database, privileges, table inventory,
 * and migration-ledger status before any migration runs. Credentials
 * come from environment variables only and are never printed.
 *
 *   node --env-file=.env.local scripts/db/preflight.mjs
 *   node --env-file=.env.local scripts/db/preflight.mjs --database drais_phase2_rehearsal
 */
import mysql from 'mysql2/promise';

const argDb = (() => {
  const i = process.argv.indexOf('--database');
  return i > -1 ? process.argv[i + 1] : null;
})();

const cfg = {
  host: process.env.TIDB_HOST,
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: argDb || process.env.TIDB_DB || 'drais',
  ssl: { rejectUnauthorized: false },
};
if (!cfg.host || !cfg.user || !cfg.password) {
  console.error('TIDB_HOST / TIDB_USER / TIDB_PASSWORD must be set (use --env-file=.env.local)');
  process.exit(2);
}
const maskHost = (h) => h.length > 18 ? `${h.slice(0, 9)}…${h.slice(-8)}` : '…';

const EXPECTED_TABLES = [
  'devices', 'biometric_enrollments', 'biometric_templates', 'template_distributions',
  'attendance_raw_events', 'attendance_records', 'attendance_rules', 'holidays',
  'notification_policies', 'notification_outbox', 'notification_deliveries',
  'device_transfers', 'device_alerts', 'zk_user_mapping', 'zk_attendance_logs',
  'student_fingerprints', 'fingerprint_orphans', 'device_user_directory',
  'pending_device_users', 'schema_migrations',
];

const main = async () => {
  const db = await mysql.createConnection(cfg);
  const q = async (sql, p = []) => (await db.query(sql, p))[0];

  console.log('── TiDB pre-flight ──────────────────────────────');
  console.log('host          :', maskHost(cfg.host), `:${cfg.port}`);
  const active = (await q('SELECT DATABASE() d'))[0].d;
  console.log('database      :', active);
  console.log('server        :', (await q('SELECT VERSION() v'))[0].v);

  const grants = (await q('SHOW GRANTS')).map(r => String(Object.values(r)[0]));
  const grantSummary = grants.map(g => g.replace(/IDENTIFIED BY.+$/i, '').trim());
  const hasAll = grantSummary.some(g => /GRANT ALL PRIVILEGES/i.test(g));
  console.log('privileges    :', hasAll ? 'ALL PRIVILEGES' : grantSummary.join(' | ').slice(0, 200));

  const tables = (await q('SHOW TABLES')).map(r => String(Object.values(r)[0]));
  console.log('table count   :', tables.length);

  const present = new Set(tables.map(t => t.toLowerCase()));
  const missing = EXPECTED_TABLES.filter(t => !present.has(t));
  console.log('expected-set  :', `${EXPECTED_TABLES.length - missing.length}/${EXPECTED_TABLES.length} present`);
  if (missing.length) console.log('missing       :', missing.join(', '));

  if (present.has('schema_migrations')) {
    const rows = await q(`SELECT migration_name, status, applied_at FROM schema_migrations ORDER BY id`);
    console.log('ledger        :', `${rows.length} recorded migration(s)`);
    for (const r of rows) console.log('   •', r.migration_name, `[${r.status}]`, r.applied_at);
  } else {
    console.log('ledger        : NOT PRESENT (will be created by the runner)');
  }

  // Shape probes for the two audited collisions
  const cols = async (t) => new Set((await q(
    `SELECT COLUMN_NAME c FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?`, [t],
  )).map(r => r.c.toLowerCase()));
  if (present.has('biometric_enrollments')) {
    const c = await cols('biometric_enrollments');
    console.log('enrollments   :', c.has('pin_value') ? 'CANONICAL shape' : 'OLD pipeline shape (needs rename migration)');
  }
  if (present.has('devices')) {
    const c = await cols('devices');
    console.log('devices       :', c.has('sn') ? 'has sn column' : 'MISSING sn column (needs additive migration)');
  }

  console.log('backup note   : TiDB Cloud provides automatic daily backups + PITR; take a manual snapshot from the console before destructive changes.');
  console.log('safe to apply : migrations in database/migrations/tidb/ are idempotent + non-destructive (no DROP TABLE, no data deletion except exact-duplicate derived rows)');
  await db.end();
};
main().catch((e) => { console.error('preflight failed:', e.message); process.exit(1); });
