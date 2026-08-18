/**
 * Fees pipeline — the IngestionPipeline<FeeRow> implementation for
 * /api/finance/import/v2 (import redesign Phase C).
 *
 * The whole point of this file: route every fee-import commit through
 * the ONE fee-writing path already confirmed atomic (readiness-audit
 * Phase 2 finding: recordPayment() genuinely wraps finance_payments +
 * student_ledger + receipts + reconciliation + fee-item allocation in a
 * single transaction — src/lib/services/FinanceLedger.ts). This file
 * adds NO new raw SQL for the actual money-moving write — it resolves a
 * validated FeeRow + a confirmed identity into recordPayment()'s params
 * and lets that function do what it already does correctly.
 *
 * allowInsertOnNoMatch is set to false on the pipeline this file builds
 * (see makeFeesPipeline) — a fee row with no matching student is held
 * for review (ingestion_orphans), never silently turned into a
 * "successful insert" that created nothing.
 */
import type { Connection } from 'mysql2/promise';
import type { ConflictDecision, IngestionPipeline, ResolvedIdentity } from '../types';
import { getConnection } from '@/lib/db';
import { recordPayment } from '@/lib/services/FinanceLedger';
import { FEE_FIELDS, type FeeRow, validateFeeRow, feeIdentityFromRow } from './fees-schema';

export { FEE_FIELDS, type FeeRow, validateFeeRow, feeIdentityFromRow };

export interface FeeCommitContext {
  schoolId: number;
  importedBy: number | null;
}

/**
 * Resolve free-text term ("Term 1", "TERM I", "Term III") to a real
 * termId, case-insensitively, for THIS school. Schools reuse term names
 * across academic years, so on multiple matches this prefers the
 * currently-active one, then the most recently created — but a payment
 * is recorded either way even if no term matches at all (termId simply
 * stays unset); an unresolvable term name must never block recording
 * money that was actually paid.
 */
async function resolveTermId(conn: Connection, schoolId: number, termText: string | null): Promise<number | null> {
  if (!termText) return null;
  const [rows] = await conn.execute(
    `SELECT id, is_active FROM terms WHERE school_id = ? AND LOWER(name) = LOWER(?)
      ORDER BY is_active DESC, id DESC LIMIT 1`,
    [schoolId, termText],
  );
  return (rows as Array<{ id: number }>)[0]?.id ?? null;
}

// No fetchExisting is supplied for fees when wiring this pipeline (there's
// no "existing FeeRow" concept to diff against — each row is a new
// payment, not a mutable record), so pipeline.ts's confident-match branch
// always produces decision.action='update', never 'insert', for fees.
// This is correct, not a bug: an admission-exact match never CREATES a
// new top-level entity here, it attaches a payment to an existing
// student, so report.counts.inserted stays 0 for fees by design while
// report.counts.updated reflects successfully-recorded payments.

export function makeFeesCommitFn(ctx: FeeCommitContext) {
  return async function commit(
    row: FeeRow,
    identity: ResolvedIdentity,
    decision: ConflictDecision,
  ): Promise<void> {
    // Only a confident, exact identity match ever reaches here for fees —
    // allowInsertOnNoMatch:false means 'no-match' became 'orphan' upstream
    // in the generic pipeline and decision.action would be 'orphan',
    // handled below as a no-op (the pipeline already recorded it).
    if (decision.action !== 'insert' && decision.action !== 'update' && decision.action !== 'merge') {
      return; // skip / orphan / fail — nothing to write, already accounted for in the report
    }
    if (identity.personId == null) return;

    const conn = await getConnection();
    try {
      const termId = await resolveTermId(conn, ctx.schoolId, row.term);
      await recordPayment({
        studentId: identity.personId,
        schoolId: ctx.schoolId,
        amount: row.amount,
        method: row.method ?? undefined,
        reference: row.reference ?? undefined,
        paidBy: row.payer_name ?? undefined,
        termId: termId ?? undefined,
        notes: row.term && termId == null ? `Imported with unresolved term "${row.term}"` : undefined,
        createdBy: ctx.importedBy ?? undefined,
      });
    } finally {
      try { await conn.end(); } catch { /* ignore */ }
    }
  };
}

export function makeFeesPipeline(ctx: FeeCommitContext): IngestionPipeline<FeeRow> {
  return {
    name: 'fees',
    schema: FEE_FIELDS,
    validateRow: validateFeeRow,
    identityFromRow: feeIdentityFromRow,
    commit: makeFeesCommitFn(ctx),
    allowInsertOnNoMatch: false,
  };
}
