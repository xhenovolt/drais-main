/**
 * @drais/repo-contract — shared domain types.
 *
 * DRAIS V2, Phase 3 (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §8,
 * §25 Phase 3): the repository-abstraction layer the SQLite decision (§5)
 * requires. This module and its siblings under src/lib/repo/ are NEW files
 * only — nothing here is imported by any existing route or page yet, and
 * nothing in src/lib/db.ts, src/lib/db/pools.ts, or src/lib/db/db-mode.ts
 * is touched by this layer (§8.1 "API isolation" — non-negotiable).
 *
 * Pure types only. Zero I/O, zero DB driver imports — safe to import from
 * anywhere, including a future UI layer, without pulling in mysql2 or
 * better-sqlite3.
 */

/** ISO-8601 datetime string ("2026-08-19T06:41:51.000Z"), UTC. */
export type IsoDateTime = string;

/** Calendar date string ("YYYY-MM-DD"), no time component, no timezone. */
export type IsoDate = string;

export type SchoolStatus = 'active' | 'inactive' | 'suspended';

export interface SchoolRecord {
  id: number;
  name: string;
  legalName: string | null;
  shortCode: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  address: string | null;
  logoUrl: string | null;
  status: SchoolStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface NewSchoolInput {
  name: string;
  legalName?: string | null;
  shortCode?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  address?: string | null;
  logoUrl?: string | null;
  status?: SchoolStatus;
}

export interface StudentRecord {
  id: number;
  schoolId: number;
  personId: number;
  admissionNo: string | null;
  villageId: number | null;
  admissionDate: IsoDate | null;
  status: string;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface NewStudentInput {
  schoolId: number;
  personId: number;
  admissionNo?: string | null;
  villageId?: number | null;
  admissionDate?: IsoDate | null;
  status?: string;
  notes?: string | null;
}

export interface ListOptions {
  limit?: number;
  includeDeleted?: boolean;
}

/** Thrown by a repo implementation for a caller-fixable input problem
 *  (not found, duplicate key, etc.) — distinguishes expected outcomes from
 *  genuine driver/connection failures, which propagate as-is. */
export class RepoError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'DUPLICATE' | 'INVALID_INPUT') {
    super(message);
    this.name = 'RepoError';
  }
}
