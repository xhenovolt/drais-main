/**
 * Type contracts for the universal issuance engine.
 *
 * Reuses src/lib/drce/visibility.ts as the rule language for eligibility
 * — there is exactly one rule engine in DRAIS, not two.
 */
import type { VisibilityRule } from '@/lib/drce/visibility';

export type IssuanceStatus =
  | 'draft' | 'previewed' | 'generating' | 'generated'
  | 'printed' | 'failed' | 'archived';

export type ItemStatus =
  | 'eligible' | 'issued' | 'skipped' | 'errored' | 'reprinted';

export interface IssuanceScope {
  classIds?:    number[];
  streamIds?:   number[];
  termId?:      number;
  yearId?:      number;
  /** Hard-coded list of students; bypasses other scope hints. */
  studentIds?:  number[];
}

export interface IssuanceCounts {
  candidates: number;
  eligible:   number;
  issued:     number;
  skipped:    number;
  errored:    number;
}

export interface IssuanceBatch {
  id:             number;
  schoolId:       number;
  templateId:     number;
  documentKind:   string;
  name:           string;
  description:    string | null;
  eligibility:    VisibilityRule | null;
  scope:          IssuanceScope | null;
  issuedRunKey:   string;
  status:         IssuanceStatus;
  counts:         IssuanceCounts | null;
  generatedAt:    string | null;
  printedAt:      string | null;
  failedReason:   string | null;
  createdAt:      string;
  updatedAt:      string;
  createdBy:      number | null;
}

export interface IssuanceItem {
  id:             number;
  batchId:        number;
  recipientKind:  'student' | 'staff';
  recipientId:    number;
  recipientSnapshot: Record<string, unknown> | null;
  /** Rendered HTML — present for issued + reprinted items. */
  renderedHtml:   string | null;
  status:         ItemStatus;
  skipReason:     string | null;
  errorMessage:   string | null;
  issuedAt:       string | null;
  issuedBy:       number | null;
  reprintCount:   number;
  lastReprintedAt: string | null;
}

/** What the editor sends to create a batch. */
export interface CreateBatchInput {
  templateId:    number;
  name:          string;
  description?:  string | null;
  documentKind?: string;
  eligibility?:  VisibilityRule | null;
  scope?:        IssuanceScope | null;
  issuedRunKey?: string;
}
