/**
 * CAFE — Configurable Assessment Framework Engine.
 *
 * Phase 1 type contracts. Pure types — no behaviour.
 *
 * Naming convention: external (UI / API) types are camelCase; SQL row
 * shapes use snake_case and live next to the service that reads them.
 */

export type AcademicMode    = 'traditional' | 'competency' | 'hybrid';
export type FrameworkMode   = 'numeric' | 'rubric' | 'descriptor' | 'mixed';
export type ScoringKind     = 'numeric' | 'scale' | 'letter' | 'descriptor';

// ─── Scoring model ──────────────────────────────────────────────────────────

export interface ScoringModelConfigNumeric {
  min:  number;
  max:  number;
  step?: number;
}
export interface ScoringModelConfigScale {
  min:  number;
  max:  number;
  step?: number;
  labels?: Array<{ value: number; label: string }>;
}
export interface ScoringModelConfigLetter {
  letters: string[];
}
export interface ScoringModelConfigDescriptor {
  /** Optional ordered list of descriptor codes the entry UI offers; empty
   *  means free text. */
  choices?: Array<{ value: string; label: string; color?: string }>;
}
export type ScoringModelConfig =
  | ScoringModelConfigNumeric
  | ScoringModelConfigScale
  | ScoringModelConfigLetter
  | ScoringModelConfigDescriptor;

export interface ScoringModel {
  id:          number;
  schoolId:    number | null;        // NULL = global built-in
  code:        string;
  name:        string;
  description: string | null;
  kind:        ScoringKind;
  config:      ScoringModelConfig | null;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
  /** Hydrated by getScoringModel; not stored on the model row. */
  grades?:     GradeMapping[];
}

export interface GradeMapping {
  id:               number;
  scoringModelId:   number;
  lowerBound:       number | null;
  upperBound:       number | null;
  code:             string;
  label:            string;
  descriptor:       string | null;
  color:            string | null;
  points:           number | null;
  promotes:         boolean;
  sortOrder:        number;
}

// ─── Framework + components ─────────────────────────────────────────────────

export interface AssessmentFramework {
  id:          number;
  schoolId:    number;
  code:        string;
  name:        string;
  description: string | null;
  mode:        FrameworkMode;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
  /** Hydrated by getFramework. */
  components?: AssessmentComponent[];
}

export interface AssessmentComponent {
  id:              number;
  frameworkId:     number;
  code:            string;
  name:            string;
  description:     string | null;
  scoringModelId:  number;
  /** Hydrated by getFramework for convenience. */
  scoringModel?:   ScoringModel;
  weight:          number;
  minScore:        number | null;
  maxScore:        number | null;
  isRequired:      boolean;
  sequenceLocked:  boolean;
  sortOrder:       number;
}

// ─── School-level settings ──────────────────────────────────────────────────

export interface SchoolAcademicSettings {
  schoolId:                 number;
  academicMode:             AcademicMode;
  defaultFrameworkId:       number | null;
  promotionRuleJson:        Record<string, unknown> | null;
  defaultTranscriptTemplateId: number | null;
  notes:                    string | null;
  updatedAt:                string;
}

// ─── Class assignment ──────────────────────────────────────────────────────

export interface ClassFrameworkAssignment {
  id:           number;
  schoolId:     number;
  classId:      number;
  frameworkId:  number;
  termId:       number;
  /** NULL today — reserved for future per-subject override. */
  subjectId:    number | null;
  createdAt:    string;
  createdBy:    number | null;
}

// ─── Input shapes (POST/PATCH payloads) ─────────────────────────────────────

export interface FrameworkInput {
  code:        string;
  name:        string;
  description?: string | null;
  mode?:       FrameworkMode;
  isActive?:   boolean;
}

export interface ComponentInput {
  code:           string;
  name:           string;
  description?:   string | null;
  scoringModelId: number;
  weight?:        number;
  minScore?:      number | null;
  maxScore?:      number | null;
  isRequired?:    boolean;
  sequenceLocked?: boolean;
  sortOrder?:     number;
}

export interface ScoringModelInput {
  code:        string;
  name:        string;
  description?: string | null;
  kind:        ScoringKind;
  config?:     ScoringModelConfig | null;
  isActive?:   boolean;
}

export interface GradeMappingInput {
  lowerBound?: number | null;
  upperBound?: number | null;
  code:        string;
  label:       string;
  descriptor?: string | null;
  color?:      string | null;
  points?:     number | null;
  promotes?:   boolean;
  sortOrder?:  number;
}

export interface SchoolSettingsInput {
  academicMode?:         AcademicMode;
  defaultFrameworkId?:   number | null;
  defaultTranscriptTemplateId?: number | null;
  notes?:                string | null;
}
