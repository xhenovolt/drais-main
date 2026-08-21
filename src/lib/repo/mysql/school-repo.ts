/**
 * @drais/repo-mysql — SchoolRepo, MySQL/TiDB implementation.
 *
 * A THIN WRAPPER only. Calls src/lib/db.ts's existing exported `query`/
 * `withTransaction` as a black box — never reimplements pooling, retry,
 * or the TiDB LIMIT-placeholder workaround db.ts already handles
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §8.1). This file is
 * new; db.ts is untouched.
 */
import { query } from '@/lib/db';
import type { SchoolRepo } from '../contract/school-repo';
import type { SchoolRecord, NewSchoolInput } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoRequired, toNum, toNumOrNull } from './util';

interface SchoolRow {
  id: number | string;
  name: string;
  legal_name: string | null;
  short_code: string | null;
  email: string | null;
  phone: string | null;
  currency: string | null;
  address: string | null;
  logo_url: string | null;
  status: SchoolRecord['status'] | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  subscription_status: SchoolRecord['subscriptionStatus'];
  subscription_plan: string | null;
  subscription_type: SchoolRecord['subscriptionType'];
  trial_start_date: string | Date | null;
  trial_end_date: string | Date | null;
  subscription_start_date: string | Date | null;
  subscription_end_date: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: SchoolRow): SchoolRecord {
  // Same defensive fallback as student-repo.ts's toRecord — see
  // toIsoRequired's header. Less likely to bite for `schools` (a small,
  // administratively-maintained table) than for `students`, but "less
  // likely" isn't a reason to leave the same class of bug half-fixed.
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    name: r.name,
    legalName: r.legal_name,
    shortCode: r.short_code,
    email: r.email,
    phone: r.phone,
    // Real DDL for both fields below: `DEFAULT '...'`, no NOT NULL — a
    // real row can have NULL here (see schema.ts's header on this whole
    // class of finding). Falls back to the column's own declared
    // default, not an arbitrary guess.
    currency: r.currency ?? 'UGX',
    address: r.address,
    logoUrl: r.logo_url,
    status: r.status ?? 'active',
    createdAt,
    updatedAt: toIsoRequired(r.updated_at, createdAt),
    deletedAt: toIso(r.deleted_at),
    subscriptionStatus: r.subscription_status,
    subscriptionPlan: r.subscription_plan,
    subscriptionType: r.subscription_type,
    trialStartDate: toIso(r.trial_start_date),
    trialEndDate: toIso(r.trial_end_date),
    subscriptionStartDate: toIso(r.subscription_start_date),
    subscriptionEndDate: toIso(r.subscription_end_date),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, name, legal_name, short_code, email, phone, currency, address,
                             logo_url, status, created_at, updated_at, deleted_at,
                             subscription_status, subscription_plan, subscription_type,
                             trial_start_date, trial_end_date, subscription_start_date,
                             subscription_end_date, deleted_by, delete_reason, restored_at, restored_by
                        FROM schools`;

async function findById(id: number): Promise<SchoolRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? LIMIT 1`, [id])) as SchoolRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

/** Standalone functions, not object-literal methods that lean on `this` —
 *  safe to destructure, pass around, or call independently of the
 *  `SchoolRepo` object the factory below assembles them into. */
export function createMysqlSchoolRepo(): SchoolRepo {
  return {
    findById,

    async create(input: NewSchoolInput) {
      const res = (await query(
        `INSERT INTO schools (name, legal_name, short_code, email, phone, currency, address, logo_url, status,
                               subscription_status, subscription_plan, subscription_type, trial_start_date,
                               trial_end_date, subscription_start_date, subscription_end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.name, input.legalName ?? null, input.shortCode ?? null, input.email ?? null,
          input.phone ?? null, input.currency ?? 'UGX', input.address ?? null, input.logoUrl ?? null,
          input.status ?? 'active', input.subscriptionStatus ?? null, input.subscriptionPlan ?? null,
          input.subscriptionType ?? null, input.trialStartDate ?? null, input.trialEndDate ?? null,
          input.subscriptionStartDate ?? null, input.subscriptionEndDate ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(res.insertId);
      if (!created) throw new RepoError('School vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(id, patch) {
      const existing = await findById(id);
      if (!existing) throw new RepoError(`School ${id} not found`, 'NOT_FOUND');
      // `!== undefined`, not `??` — a caller explicitly clearing a
      // nullable field via update(id, { legalName: null }) must have
      // that null applied, not silently ignored in favor of the
      // existing value the way `??` would (found while writing
      // person-repo.ts's equivalent method; fixed here for consistency).
      const merged: NewSchoolInput = {
        name: patch.name ?? existing.name,
        legalName: patch.legalName !== undefined ? patch.legalName : existing.legalName,
        shortCode: patch.shortCode !== undefined ? patch.shortCode : existing.shortCode,
        email: patch.email !== undefined ? patch.email : existing.email,
        phone: patch.phone !== undefined ? patch.phone : existing.phone,
        currency: patch.currency !== undefined ? patch.currency : existing.currency,
        address: patch.address !== undefined ? patch.address : existing.address,
        logoUrl: patch.logoUrl !== undefined ? patch.logoUrl : existing.logoUrl,
        status: patch.status ?? existing.status,
        subscriptionStatus: patch.subscriptionStatus !== undefined ? patch.subscriptionStatus : existing.subscriptionStatus,
        subscriptionPlan: patch.subscriptionPlan !== undefined ? patch.subscriptionPlan : existing.subscriptionPlan,
        subscriptionType: patch.subscriptionType !== undefined ? patch.subscriptionType : existing.subscriptionType,
        trialStartDate: patch.trialStartDate !== undefined ? patch.trialStartDate : existing.trialStartDate,
        trialEndDate: patch.trialEndDate !== undefined ? patch.trialEndDate : existing.trialEndDate,
        subscriptionStartDate: patch.subscriptionStartDate !== undefined ? patch.subscriptionStartDate : existing.subscriptionStartDate,
        subscriptionEndDate: patch.subscriptionEndDate !== undefined ? patch.subscriptionEndDate : existing.subscriptionEndDate,
      };
      await query(
        `UPDATE schools SET name=?, legal_name=?, short_code=?, email=?, phone=?, currency=?, address=?, logo_url=?, status=?,
                subscription_status=?, subscription_plan=?, subscription_type=?, trial_start_date=?, trial_end_date=?,
                subscription_start_date=?, subscription_end_date=?
          WHERE id = ?`,
        [
          merged.name, merged.legalName ?? null, merged.shortCode ?? null, merged.email ?? null,
          merged.phone ?? null, merged.currency ?? 'UGX', merged.address ?? null, merged.logoUrl ?? null,
          merged.status ?? 'active', merged.subscriptionStatus ?? null, merged.subscriptionPlan ?? null,
          merged.subscriptionType ?? null, merged.trialStartDate ?? null, merged.trialEndDate ?? null,
          merged.subscriptionStartDate ?? null, merged.subscriptionEndDate ?? null, id,
        ],
      );
      const updated = await findById(id);
      if (!updated) throw new RepoError(`School ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(id) {
      const res = (await query(
        `UPDATE schools SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL`,
        [id],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`School ${id} not found or already deleted`, 'NOT_FOUND');
    },
  };
}
