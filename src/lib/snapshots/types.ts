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
  /** Western numeric only (null if absent). */
  score:          number | null;
  /** Pre-computed display string (Arabic numerals for theology, Western otherwise). */
  displayScore:   string;
  grade:          string;
  remarks:        string;
  initials:       string;
  teacherName?:   string;
  enteredAt?:     string;          // ISO
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
}

export interface SnapshotConfig {
  gradingScale: Array<{ min: number; max: number; grade: string; remark: string }>;
  teacherMappings: Array<{ subjectPattern: string; classPattern: string; initials: string }>;
  nextTermBegins: string;
}

export interface ReportSnapshot {
  meta:    SnapshotMeta;
  classes: SnapshotClass[];
  config:  SnapshotConfig;
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
