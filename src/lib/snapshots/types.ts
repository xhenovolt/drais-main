/**
 * Canonical snapshot schema.
 *
 * A snapshot is the immutable, deterministic input to every report-card render
 * path. Generation reads the live DB once; rendering reads only the snapshot.
 *
 * The schema is a superset of the three emergency JSON variants in `backup/`
 * (theology, secular, northgate). All scores are stored as Western numbers
 * (number | null) for aggregation; pre-computed display strings carry the
 * language-specific representation (Arabic numerals for theology).
 */

export type SnapshotType   = 'theology' | 'secular' | 'mixed';
export type SnapshotStatus =
  | 'generating'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'stale';
export type SnapshotNumerals = 'arabic' | 'western';
export type SnapshotLanguage = 'en' | 'ar';

/**
 * Frozen tenant branding captured at snapshot generation time.
 *
 * All report templates (emergency HTML + DRCE) read from this block — never
 * from constants and never from the live `schools` row at render time. That
 * guarantees a snapshot reproduces exactly the same way regardless of which
 * school is logged in when it is previewed, and prevents tenant leakage
 * across schools sharing a deployment.
 */
export interface SnapshotBranding {
  schoolName:          string;
  legalName:           string;
  shortCode:           string;
  motto:               string;
  address:             string;
  poBox:               string;
  district:            string;
  region:              string;
  country:             string;
  phone:               string;
  email:               string;
  website:             string;
  principalName:       string;
  principalPhone:      string;
  registrationNumber:  string;
  centerNo:            string;
  logoUrl:             string;
  schoolType:          string;
  // Arabic mirrors. Empty string when unset; templates can fall back to the
  // primary fields. Used by theology / RTL reports.
  arabicName:          string;
  arabicAddress:       string;
  arabicMotto:         string;
  arabicPhone:         string;
  arabicCenterNo:      string;
  arabicRegistrationNo:string;
  arabicPoBox:         string;
}

export interface SnapshotMeta {
  snapshotId:           string;          // uuid v4
  schemaVersion:        2;
  type:                 SnapshotType;
  schoolId:             number;
  schoolSlug:           string;          // slugify(schools.name)
  schoolName:           string;
  /**
   * Full tenant branding. Added in schemaVersion 2. v1 snapshots load with
   * this field absent; rendering code must fall back to `schoolName` only.
   */
  branding?:            SnapshotBranding;
  termId:               number;
  termName:             string;
  yearId:               number;
  yearName:             string;
  resultTypeId:         number | null;
  resultTypeName:       string;
  numerals:             SnapshotNumerals;
  language:             SnapshotLanguage;
  generatedAt:          string;          // ISO timestamp
  generatedBy:          number;          // user id
  generationDurationMs: number;
  sourceCounts: {
    classes:  number;
    students: number;
    results:  number;
    subjects: number;
  };
  /** sha256 of canonical (key-sorted) JSON of `classes`. */
  dataHash: string;
}

export interface SnapshotSubject {
  id:          number;
  name:        string;
  displayName: string;
  totalMarks:  number;
  subjectType: 'primary' | 'secondary';
}

export interface SnapshotResult {
  subjectId:      number;
  subjectName:    string;
  displaySubject: string;
  /** Western numeric only (null if absent). For CAFE-mode results this is
   *  the weighted rollup of `components[].score` so legacy bindings keep
   *  working unchanged. */
  score:          number | null;
  /** Pre-computed display string (Arabic numerals for theology, Western otherwise). */
  displayScore:   string;
  grade:          string;
  remarks:        string;
  initials:       string;
  teacherName?:   string;
  enteredAt?:     string;          // ISO
  /**
   * CAFE Phase 2 — per-component breakdown. Present ONLY when the snapshot
   * was generated against a class with a CAFE framework assignment for the
   * term. Absent on every traditional / legacy snapshot — the absence is
   * what preserves byte-equivalent dataHash for pre-CAFE snapshots.
   *
   * Each component carries its own raw score (for numeric/scale kinds),
   * its descriptor (for descriptor kinds), its grade code (looked up from
   * the configured scoring model's grade_mappings), and its weight.
   */
  components?: SnapshotResultComponent[];
}

/** CAFE Phase 2 — a single component score within a SnapshotResult. */
export interface SnapshotResultComponent {
  componentId:    number;
  code:           string;
  name:           string;
  /** Numeric / scale value. Null for descriptor-only entries. */
  score:          number | null;
  /** Descriptor text or selected descriptor code. */
  valueText:      string | null;
  /** Grade code from grade_mappings (e.g. 'A', '3', 'Accomplished'). */
  gradeCode:      string | null;
  /** Weight as configured in assessment_components. Used by the rollup
   *  computation; preserved on the snapshot so DRCE templates can show it. */
  weight:         number;
  /** Pre-computed display string. */
  displayScore:   string;
  remarks:        string | null;
}

export interface SnapshotStudent {
  id:               string;          // admission no or stringified db id
  studentDbId:      number;
  name:             string;
  firstName:        string;
  lastName:         string;
  gender:           string;
  admissionNumber:  string;
  photoUrl:         string | null;
  results:          SnapshotResult[];
  total:            number;
  average:          number;
  position:         number;
  totalInClass:     number;
  displayTotal:     string;
  displayAverage:   string;
  displayPosition:  string;
  comments: {
    classTeacher: string;
    dos:          string;
    headTeacher:  string;
  };
  remarks:    string;
  aggregates?: number | null;
  division?:   string | null;
}

export interface SnapshotClass {
  classId:   number;
  className: string;
  stream:    string;
  subjects:  SnapshotSubject[];
  students:  SnapshotStudent[];
  /**
   * Phase E — class teacher resolved from `class_teachers` at snapshot
   * generation time. Optional for backwards compatibility with snapshots
   * generated before this column existed; per-student
   * `comments.classTeacher` remains the legacy fallback.
   */
  classTeacher?: {
    staffId:   number | null;
    name:      string;
  };
}

/** CAFE Phase 2 — ranking mode controls how rankStudents behaves.
 *
 * - 'numeric'    — legacy: sum scores, sort desc, assign positions 1..N.
 * - 'competency' — sum points from grade_mappings, sort desc; ties keep
 *                  same rank (competency systems intentionally cluster).
 * - 'none'       — skip ranking entirely; positions left at 0; UI shows '—'.
 *
 * Default 'numeric' so every existing snapshot regenerates identically.
 * Set at generation time from school_academic_settings.academic_mode +
 * the active framework's mode.
 */
export type RankingMode = 'numeric' | 'competency' | 'none';

export interface SnapshotConfig {
  gradingScale: Array<{ min: number; max: number; grade: string; remark: string }>;
  /** CAFE Phase 2 — optional ranking mode. Absent on legacy snapshots →
   *  defaults to 'numeric' at evaluation time. */
  rankingMode?: RankingMode;
  teacherMappings: Array<{ subjectPattern: string; classPattern: string; initials: string }>;
  nextTermBegins: string;
  /**
   * Optional academic-calendar enrichment, computed at snapshot generation
   * by `src/lib/calendar/infer`. Compact, denormalised form (just what the
   * renderer needs). Absent on snapshots generated before this feature
   * landed — those fall back to the manual `nextTermBegins` field above.
   *
   * NOT included in `meta.dataHash` (which hashes the classes array only),
   * so adding this field to existing snapshots on regeneration does not
   * change their content hash.
   */
  calendar?: {
    next_term_starts_at: string | null;
    this_term_ends_at:   string | null;
    next_term_name:      string | null;
    prev_term_name:      string | null;
    year_rollover:       boolean;
  };
}

export interface ReportSnapshot {
  meta:    SnapshotMeta;
  classes: SnapshotClass[];
  config:  SnapshotConfig;
  /**
   * P1 — per-student custom field values, keyed by studentDbId then by field
   * code. Lives OUTSIDE `classes` on purpose: `meta.dataHash = hashCanonical(classes)`
   * so adding this top-level map never invalidates an existing snapshot's
   * content hash. Absent on snapshots generated before P1 — render path
   * treats missing values as null.
   */
  customValues?: Record<number, Record<string, string | number | boolean | string[] | null>>;
}

/**
 * Index row in `report_snapshots` (no `snapshot_json` column, fetched separately).
 */
export interface SnapshotRow {
  id:                 number;
  snapshotId:         string;
  schoolId:           number;
  type:               SnapshotType;
  termId:             number;
  yearId:             number;
  resultTypeId:       number | null;
  status:             SnapshotStatus;
  dataHash:           string | null;
  classCount:         number;
  studentCount:       number;
  resultCount:        number;
  generatedBy:        number;
  generatedAt:        string;
  completedAt:        string | null;
  generationMs:       number | null;
  errorMessage:       string | null;
  isLegacyFallback:   boolean;
}
