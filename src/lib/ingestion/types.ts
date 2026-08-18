/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAIS Unified Ingestion — Canonical Types
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file is the contract.
 *
 * Every existing importer (students, results, attendance, finance) and every
 * NEW importer must eventually produce/consume the types here. By centralising
 * the shape, we make the Phase 0 problems impossible:
 *
 *   - No two importers can disagree on what a "row" or an "identity" or a
 *     "conflict" looks like.
 *   - Every parsing path eventually produces RawRow[].
 *   - Every identity question goes through CanonicalIdentity.
 *   - Every write decision goes through ConflictDecision.
 *   - Every attendance scan, regardless of vendor, produces AttendanceEvent.
 *
 * No DB access here. No I/O. No side effects. Just shapes.
 *
 * Phase 0 audit findings this file directly addresses:
 *   - "No `IngestionPipeline` type or interface" — see IngestionPipeline below
 *   - "No `AttendanceEvent` canonical type" — see AttendanceEvent below
 *   - "No `ConflictResolver`" — see ConflictDecision / ConflictPolicy
 *   - "No `SchemaMapper`" — see FieldMapping / SchemaInference
 *   - Canonical identity gap (ZKTeco userID vs Dahua CardNo vs admission_no
 *     vs WebAuthn credential_id) — see CanonicalIdentity
 *
 * Backwards-compatibility rule: this module is ADDITIVE. Existing importers
 * keep working unchanged until they are migrated one at a time onto the
 * pipeline. Nothing here mutates legacy types.
 */

// ─── Generic row + parsed source ─────────────────────────────────────────────

/**
 * A single row from any tabular source — CSV, XLSX, JSON array of objects,
 * a paste of "rows: [...]" text — collapses to this. Keys are the SOURCE
 * header strings, NOT canonical field names. Mapping happens later.
 */
export type RawRow = Record<string, RawCellValue>;

export type RawCellValue = string | number | boolean | null | undefined;

/** Where a row came from. Drives error reporting + audit trail. */
export interface RowProvenance {
  /** 1-based row index as it appears in the source file. */
  sourceRowIndex: number;
  /** Original filename, or 'inline' for paste inputs, or 'api' for JSON bodies. */
  sourceFile: string;
  /** Sheet name for XLSX; undefined for CSV/JSON. */
  sourceSheet?: string;
}

export interface ParsedSource {
  rows: Array<RawRow & { __provenance: RowProvenance }>;
  /** Source file headers in original order (case + spacing preserved). */
  headers: string[];
  /** What the parser detected the format as. */
  detectedFormat: 'csv' | 'xlsx' | 'json' | 'manual';
}

// ─── Schema inference ────────────────────────────────────────────────────────

/**
 * A canonical field the ingestion target accepts. Each importer module
 * defines its own set (e.g. students-importer accepts admission_no,
 * first_name, last_name, …). The schema inference engine maps source
 * headers ONTO these names.
 */
export interface CanonicalField {
  /** Internal name — what the upsert code expects (e.g. 'admission_no'). */
  name: string;
  /** Human-readable label for the import-review UI. */
  label: string;
  /** Synonyms that should match this field. Case-insensitive substring match
   *  is added on top. */
  synonyms: string[];
  /** Type hint — drives coercion + validation. */
  type: 'string' | 'integer' | 'float' | 'date' | 'boolean' | 'enum';
  /** For enum types: the legal values. */
  enumValues?: string[];
  /** If true, the importer fails when no source header maps to this field
   *  AND no school-memory mapping exists. */
  required?: boolean;
}

/** Per-field mapping result. */
export interface FieldMapping {
  /** Source header string (verbatim from the file). */
  sourceHeader: string;
  /** Canonical field name we mapped it onto. Null = unmapped. */
  canonicalField: string | null;
  /** Confidence in this mapping. */
  confidence: number; // 0..1
  /** Why this mapping was chosen — drives the review UI + audit log. */
  reason: 'exact' | 'normalized' | 'synonym' | 'fuzzy' | 'memory' | 'manual-override' | 'unmapped';
}

export interface SchemaInferenceResult {
  /** One entry per source header. Unmapped headers stay in the list so the
   *  review UI can surface them and the user can override. */
  mappings: FieldMapping[];
  /** Canonical fields that were marked required but have no mapping. The
   *  pipeline blocks here unless the caller resolves them. */
  unresolvedRequired: string[];
  /** Overall confidence — lowest of mapped-required-field confidences. */
  overallConfidence: number;
}

// ─── Canonical identity ──────────────────────────────────────────────────────

/**
 * The four signals DRAIS uses to identify a person across data sources.
 * EVERY identity question goes through this — students importer, attendance
 * ingest, fingerprint enrolment, photo upload. No more "Dahua CardNo IS
 * the identity" assumptions.
 */
export interface IdentityClaim {
  /** Most-trusted signal when present. Globally unique within (school, year). */
  admissionNo?: string;
  /** Names — used as fallback or for de-duplication. Locale-stripped + lowercased
   *  before comparison. */
  firstName?: string;
  lastName?: string;
  otherName?: string;
  /** Class/stream context disambiguates students with identical names. */
  className?: string;
  streamName?: string;
  /** Device-side identifier (ZKTeco userID, Dahua CardNo). Resolved via
   *  device_users / zk_user_mapping table — NEVER assumed to be the
   *  DRAIS person identity directly. */
  deviceUserId?: string;
  deviceSerial?: string;
  /** WebAuthn credential identifier. */
  credentialId?: string;
  /** For staff vs student disambiguation. */
  personRole?: 'student' | 'staff' | 'guardian' | 'unknown';
  /** Free-form additional signals — DOB, phone, parent name — used as
   *  tie-breakers when confidence is borderline. */
  extra?: Record<string, string | number | null>;
}

/**
 * The result of asking "who is this?". Either a confident match to a
 * known DRAIS person, OR a ranked list of candidates the human review
 * UI needs to disambiguate, OR a clean miss (caller decides: create new,
 * skip, hold in orphan queue).
 */
export interface ResolvedIdentity {
  /** PRIMARY KEY in `people` table when found. */
  personId: number | null;
  /** Type of match. Drives both downstream behaviour AND audit reporting. */
  matchType:
    | 'admission-exact'
    | 'credential-exact'
    | 'device-mapping-exact'
    | 'name-class-exact'
    | 'fuzzy-single'
    | 'fuzzy-ambiguous'  // multiple candidates → caller must disambiguate
    | 'no-match';
  /** 0..1. 1.0 = certain. Below the school's threshold → caller asks for
   *  human confirmation rather than auto-applying. */
  confidence: number;
  /** When matchType === 'fuzzy-ambiguous', the ranked list. Empty otherwise. */
  candidates: Array<{ personId: number; confidence: number; reason: string }>;
  /** Human-readable explanation for the audit log. */
  reason: string;
}

// ─── Conflict resolution ─────────────────────────────────────────────────────

/**
 * What the pipeline ACTUALLY did with a row. Every decision recorded, no
 * silent skips — Phase 0 found ~4 importers that skipped rows without
 * surfacing the fact.
 */
export type ConflictDecision =
  | { action: 'insert';   newId: number }
  | { action: 'update';   targetId: number; changedFields: string[] }
  | { action: 'merge';    targetId: number; changedFields: string[]; mergeRule: string }
  | { action: 'skip';     reason: string }
  | { action: 'orphan';   reason: string; orphanId: number }
  | { action: 'fail';     error: string };

/** A policy applied to a single canonical field when conflicts happen. */
export type FieldConflictPolicy =
  | 'prefer-new'         // overwrite existing with incoming
  | 'prefer-existing'    // keep existing, drop incoming
  | 'prefer-higher'      // numeric: max
  | 'prefer-lower'       // numeric: min
  | 'prefer-non-empty'   // overwrite only if existing is null/empty
  | 'merge-average'      // numeric: average
  | 'fail-loud';         // block the row, force human review

/** A school-configurable policy bundle. */
export interface ConflictPolicySet {
  /** Per-field overrides. Falls back to `default` if a field is missing. */
  perField: Record<string, FieldConflictPolicy>;
  /** Default policy when a field isn't listed. */
  default: FieldConflictPolicy;
}

// ─── Attendance event (canonical, vendor-agnostic) ───────────────────────────

/**
 * THE shape every attendance source — ZKTeco, Dahua, WebAuthn, manual mark,
 * future biometric vendor X — must produce. Adapters live in
 * src/lib/ingestion/attendance/adapters/. Snapshot pipeline and reports
 * consume this shape exclusively.
 */
export interface AttendanceEvent {
  /** Canonical person identifier — already resolved via the identity system. */
  personId: number;
  /** Whether this is a student or staff event. Resolved at adapt time. */
  personRole: 'student' | 'staff';
  /** UTC ISO timestamp. Adapters MUST convert from device-local. */
  timestampUtc: string;
  /** Direction of the scan. 'unknown' is legal when the device doesn't say. */
  direction: 'in' | 'out' | 'unknown';
  /** How the scan was captured. */
  method: 'fingerprint' | 'card' | 'face' | 'password' | 'manual' | 'qr' | 'pin' | 'other';
  /** The vendor stack that produced the scan. Used for audit + debugging. */
  source: {
    vendor: 'zkteco' | 'dahua' | 'webauthn' | 'manual' | 'csv-import' | 'other';
    deviceSerial?: string;
    deviceUserId?: string;       // verbatim from device, BEFORE identity resolution
    rawPayloadRef?: string;       // pointer into raw-payload store (Phase 2)
  };
  /** Optional latitude/longitude if device emits it. */
  geo?: { lat: number; lng: number };
  /** Whether the event was flagged late by school-configured policy.
   *  Computed at ingest, not at render — eliminates the 8:30 AM hardcoded
   *  threshold from biometric/route.ts. */
  isLate: boolean;
  /** Free-form vendor data the canonical model doesn't capture. Persisted
   *  for forensic recovery; not consulted at read time. */
  vendorExtras?: Record<string, unknown>;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/**
 * The contract every importer wires up. A pipeline is:
 *
 *   parse → infer schema → resolve identities → resolve conflicts →
 *   commit → report
 *
 * Each step is overridable so a domain (students vs. results vs. attendance)
 * can specialise without rewriting the whole flow.
 */
export interface IngestionPipeline<TRow> {
  /** Human-readable name — shows up in audit logs. */
  name: string;
  /** Canonical fields this pipeline accepts. */
  schema: CanonicalField[];
  /** Per-row coercion + validation. Receives mapped row, returns clean shape
   *  OR an error to report. */
  validateRow: (
    mapped: Record<string, RawCellValue>,
    provenance: RowProvenance,
  ) => { ok: true; value: TRow } | { ok: false; error: string };
  /** How this domain identifies a person from a row. Students importer
   *  reads admission_no + first_name + last_name + class; attendance ingest
   *  reads deviceUserId + deviceSerial. */
  identityFromRow: (row: TRow) => IdentityClaim;
  /** Run the actual DB write. Pipeline supplies the identity resolution
   *  result so the implementation can branch on insert/update/skip/orphan. */
  commit: (
    row: TRow,
    identity: ResolvedIdentity,
    decision: ConflictDecision,
  ) => Promise<void>;
  /**
   * Import redesign Phase C: whether "no existing match found" means
   * "create a new record" for this domain. True (the default, and the
   * only behavior before this flag existed) for students/results — the
   * whole point of importing them is to create rows that don't exist
   * yet. False for a domain like fees, where a payment CANNOT be
   * inserted without an existing student to attach it to — a no-match
   * there is data-integrity-critical (an admission number in a fee sheet
   * that no student has) and must be held for review, never silently
   * turned into a decision that looks like a successful insert when
   * nothing meaningful was created.
   */
  allowInsertOnNoMatch?: boolean;
}

/** Per-row outcome the pipeline emits. */
export interface RowOutcome<TRow = unknown> {
  provenance: RowProvenance;
  raw: RawRow;
  mapped?: Record<string, RawCellValue>;
  validated?: TRow;
  identity?: ResolvedIdentity;
  decision: ConflictDecision;
  /** Wall-clock duration for this row, for performance audit. */
  durationMs: number;
}

/** The pipeline's full report. Returned to the caller AND persisted into
 *  the audit log. */
export interface IngestionReport {
  pipelineName: string;
  schoolId: number;
  runId: string;             // uuid v4
  startedAt: string;          // ISO
  finishedAt: string;          // ISO
  /** True when this report came from a dry run (RunOptions.dryRun) — every
   *  decision was computed but pipeline.commit() was never called. Persist
   *  this alongside the report so ingestion_runs never confuses a preview
   *  with a real, committed import. */
  dryRun: boolean;
  /** What was inferred about the source shape. Surfaced to the review UI. */
  schemaInference: SchemaInferenceResult;
  /** Per-row outcomes. Trimmed to N for the response body; full list lives
   *  in the audit row. */
  outcomes: RowOutcome[];
  counts: {
    parsed: number;
    inserted: number;
    updated: number;
    merged: number;
    skipped: number;
    orphaned: number;
    failed: number;
  };
  /** Aggregated errors by category — drives the post-run UI summary. */
  errorSummary: Record<string, number>;
}
