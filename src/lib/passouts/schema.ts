/**
 * Pass-out schema upgrades — runtime ensure, promise-gated (same pattern as
 * the attendance engine). The base tables (passout_requests, passout_events)
 * already exist; this adds the movement-management columns:
 *
 *   passout_requests: passout_no (human-readable), is_emergency, is_medical,
 *     accompanied_by, transport_method, verify_method (how identity was
 *     verified at creation), returned_late, first_approved_by/_at (two-step
 *     approval), approved_at.
 *   passout_events: ip (audit), verify_method.
 *
 * ALTERs are best-effort: "duplicate column" on re-run is expected and ignored.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensurePassoutSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const alters = [
      `ALTER TABLE passout_requests ADD COLUMN passout_no VARCHAR(24) DEFAULT NULL`,
      `ALTER TABLE passout_requests ADD COLUMN is_emergency TINYINT NOT NULL DEFAULT 0`,
      `ALTER TABLE passout_requests ADD COLUMN is_medical TINYINT NOT NULL DEFAULT 0`,
      `ALTER TABLE passout_requests ADD COLUMN accompanied_by VARCHAR(160) DEFAULT NULL`,
      `ALTER TABLE passout_requests ADD COLUMN transport_method VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE passout_requests ADD COLUMN verify_method VARCHAR(20) DEFAULT NULL`,
      `ALTER TABLE passout_requests ADD COLUMN returned_late TINYINT NOT NULL DEFAULT 0`,
      `ALTER TABLE passout_requests ADD COLUMN first_approved_by BIGINT DEFAULT NULL`,
      `ALTER TABLE passout_requests ADD COLUMN first_approved_at DATETIME DEFAULT NULL`,
      `ALTER TABLE passout_requests ADD COLUMN approved_at DATETIME DEFAULT NULL`,
      `ALTER TABLE passout_events ADD COLUMN ip VARCHAR(64) DEFAULT NULL`,
      `ALTER TABLE passout_events ADD COLUMN verify_method VARCHAR(20) DEFAULT NULL`,
    ];
    for (const sql of alters) {
      try { await query(sql, []); } catch { /* column exists — fine */ }
    }
  })();
  return ensured;
}
