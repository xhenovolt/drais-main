/**
 * IngestionPipelineRunner — the single execution path for every importer
 * that opts into the unified system.
 *
 * Stages, in order:
 *   1. PARSE       — caller-supplied (we accept already-parsed RawRow[]
 *                    because parsers vary too much — CSV/XLSX/JSON each
 *                    have their own lib). The pipeline does NOT touch
 *                    parsing.
 *   2. INFER       — apply schema inference using the importer's
 *                    canonical-field catalog + per-school memory.
 *   3. MAP         — for each row, produce a canonical-keyed record.
 *   4. VALIDATE    — per-importer validator coerces + checks each row.
 *   5. IDENTIFY    — resolve identity via the central resolver.
 *   6. CONFLICT    — compare with existing person row when there's a
 *                    match; build the conflict decision.
 *   7. COMMIT      — caller's commit fn writes the row.
 *   8. REPORT      — aggregate per-row outcomes into a single report
 *                    that is BOTH returned AND persisted to the audit log.
 *
 * Determinism + safety:
 *   - Each row is processed independently. A failure on row N doesn't
 *     stop row N+1.
 *   - The pipeline NEVER throws on per-row failures — it captures and
 *     reports them.
 *   - The pipeline throws ONLY when the schema inference fails to
 *     resolve a required field AND the caller did not supply an
 *     override map. That's an early-exit guard, not a row-level bug.
 *   - All decisions are timestamped and recorded. No silent skips.
 */

import { randomUUID } from 'node:crypto';
import type {
  CanonicalField,
  ConflictDecision,
  ConflictPolicySet,
  IdentityClaim,
  IngestionPipeline,
  IngestionReport,
  ParsedSource,
  ResolvedIdentity,
  RowOutcome,
  RawCellValue,
} from './types';
import { applyMapping, inferSchema } from './schema-inference';
import { resolveFieldConflicts, toConflictDecision } from './conflict';
import type { PersonLookup } from './identity';
import { resolveIdentity } from './identity';

export interface RunOptions<TRow> {
  schoolId: number;
  parsed: ParsedSource;
  /** The importer module — defines the canonical fields, validator,
   *  identity-from-row extractor, and commit fn. */
  pipeline: IngestionPipeline<TRow>;
  /** PersonLookup implementation — supplied by the route. */
  lookup: PersonLookup;
  /** Per-school mapping memory — header → canonical field name. */
  mappingMemory?: Record<string, string>;
  /** Caller-supplied overrides (from the review UI). Each entry says
   *  "I know better than the inference engine — map THIS header to THAT
   *  canonical field." Wins over fuzzy results. */
  mappingOverrides?: Record<string, string>;
  /** School's conflict policy. Defaults to a sensible safe choice
   *  (prefer-existing). */
  conflictPolicy?: ConflictPolicySet;
  /** When the importer has special merge behaviour (e.g. results
   *  marks-migration mode), it can describe the rule here so the audit
   *  log shows the merge decision. */
  mergeRuleDescription?: string;
  /** For each (already-identified) personId, supplier of the row's
   *  current DB values keyed by canonical field. Lets conflict
   *  resolution compare incoming against existing. Return {} when
   *  there is no existing row (i.e. this is a pure insert path). */
  fetchExisting?: (personId: number) => Promise<Record<string, RawCellValue>>;
  /**
   * Readiness-audit Phase A: run every stage — mapping, validation,
   * identity resolution, conflict decision — WITHOUT calling
   * pipeline.commit(). Produces the exact same IngestionReport shape a
   * real run would, so a caller can show a school "here is what would
   * happen" before anything is written, the same guarantee
   * src/lib/finance/import.ts's preview→commit split already gives
   * fee/payment imports but the generic pipeline never had.
   *
   * Scope note: this makes the PIPELINE capable of a dry run. It does
   * NOT yet persist a re-runnable staged batch the way
   * finance_import_batches/finance_import_rows do — a caller that wants
   * "preview now, commit later without re-uploading" still needs to
   * store the file/rows itself and call the pipeline twice. Adding a
   * generic staged-batch table is a Phase B decision, made once an
   * actual route needs it.
   */
  dryRun?: boolean;
}

export async function runIngestionPipeline<TRow>(
  options: RunOptions<TRow>,
): Promise<IngestionReport> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();

  // ─── Stage 2: INFER ──────────────────────────────────────────────────────
  const memory = mergeMemoryWithOverrides(options.mappingMemory, options.mappingOverrides);
  const schemaInference = inferSchema(
    options.parsed.headers,
    options.pipeline.schema,
    { memory },
  );

  if (schemaInference.unresolvedRequired.length > 0) {
    // Block — caller must surface the unresolved fields to the user
    // and re-run with an override map.
    return {
      pipelineName: options.pipeline.name,
      schoolId: options.schoolId,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      dryRun: options.dryRun === true,
      schemaInference,
      outcomes: [],
      counts: zeroCounts(),
      errorSummary: {
        unresolvedRequiredFields: schemaInference.unresolvedRequired.length,
      },
    };
  }

  // ─── Stages 3-7: per-row loop ────────────────────────────────────────────
  const outcomes: RowOutcome[] = [];
  const counts = zeroCounts();
  const errorSummary: Record<string, number> = {};

  const policy: ConflictPolicySet =
    options.conflictPolicy ?? { perField: {}, default: 'prefer-existing' };

  for (const rowWithProv of options.parsed.rows) {
    const t0 = Date.now();
    const { __provenance, ...raw } = rowWithProv;
    let outcome: RowOutcome = {
      provenance: __provenance,
      raw: raw as Record<string, RawCellValue>,
      decision: { action: 'fail', error: 'unreached' },
      durationMs: 0,
    };

    try {
      // 3. MAP
      const mapped = applyMapping(raw, schemaInference.mappings) as Record<string, RawCellValue>;
      outcome.mapped = mapped;

      // 4. VALIDATE
      const validation = options.pipeline.validateRow(mapped, __provenance);
      if (validation.ok === false) {
        outcome.decision = { action: 'fail', error: `validation: ${validation.error}` };
        bump(errorSummary, 'validation');
        counts.failed++;
        outcome.durationMs = Date.now() - t0;
        outcomes.push(outcome);
        continue;
      }
      outcome.validated = validation.value;

      // 5. IDENTIFY
      const claim: IdentityClaim = options.pipeline.identityFromRow(validation.value);
      const identity: ResolvedIdentity = await resolveIdentity(
        claim, options.schoolId, options.lookup,
      );
      outcome.identity = identity;

      // 6. CONFLICT + 7. COMMIT
      let decision: ConflictDecision;
      if (identity.matchType === 'no-match') {
        // Pipeline doesn't INSERT on its own — that's the importer's
        // commit fn's job. The pipeline only signals "no existing row".
        decision = { action: 'insert', newId: 0 };  // newId set by commit
      } else if (identity.matchType === 'fuzzy-ambiguous') {
        decision = {
          action: 'orphan',
          orphanId: 0,
          reason: `ambiguous identity — ${identity.candidates.length} candidates`,
        };
        bump(errorSummary, 'ambiguousIdentity');
        counts.orphaned++;
        outcome.decision = decision;
        outcome.durationMs = Date.now() - t0;
        outcomes.push(outcome);
        continue;
      } else {
        // Confident match → compare with existing if caller supplied a fetcher.
        if (options.fetchExisting && identity.personId != null) {
          const existing = await options.fetchExisting(identity.personId);
          const conflict = resolveFieldConflicts({
            existing,
            incoming: validation.value as unknown as Record<string, RawCellValue>,
            policy,
          });
          decision = toConflictDecision(
            conflict,
            identity.personId,
            options.mergeRuleDescription,
          );
        } else {
          // No existing fetcher → treat as straight update.
          decision = {
            action: 'update',
            targetId: identity.personId ?? 0,
            changedFields: Object.keys(validation.value as object),
          };
        }
      }

      // 7. COMMIT — caller does the actual DB write. Skipped entirely in
      // dry-run mode: the decision above is still the real, fully-resolved
      // decision the pipeline WOULD act on, just never applied.
      if (!options.dryRun) {
        await options.pipeline.commit(validation.value, identity, decision);
      }

      // Tally per the FINAL decision.
      switch (decision.action) {
        case 'insert': counts.inserted++; break;
        case 'update': counts.updated++; break;
        case 'merge':  counts.merged++; break;
        case 'skip':   counts.skipped++; break;
        case 'orphan': counts.orphaned++; break;
        case 'fail':
          counts.failed++;
          bump(errorSummary, 'conflictFailLoud');
          break;
      }

      outcome.decision = decision;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      outcome.decision = { action: 'fail', error: `unexpected: ${msg}` };
      bump(errorSummary, 'unexpectedError');
      counts.failed++;
    }

    outcome.durationMs = Date.now() - t0;
    outcomes.push(outcome);
    counts.parsed++;
  }

  return {
    pipelineName: options.pipeline.name,
    schoolId: options.schoolId,
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: options.dryRun === true,
    schemaInference,
    outcomes,
    counts,
    errorSummary,
  };
}

function mergeMemoryWithOverrides(
  memory?: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> {
  return { ...(memory ?? {}), ...(overrides ?? {}) };
}

function zeroCounts(): IngestionReport['counts'] {
  return {
    parsed: 0, inserted: 0, updated: 0, merged: 0,
    skipped: 0, orphaned: 0, failed: 0,
  };
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}
