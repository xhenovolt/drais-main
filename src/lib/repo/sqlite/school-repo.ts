/**
 * @drais/repo-sqlite — SchoolRepo, SQLite implementation.
 * Mirrors mysql/school-repo.ts's contract exactly — the parity test suite
 * (../__tests__/repo-parity.test.mjs) runs the identical assertions
 * against both. better-sqlite3 is synchronous; methods stay `async` only
 * to satisfy the shared interface, per connection.ts's header note.
 */
import type { SqliteConnection } from './connection';
import type { SchoolRepo } from '../contract/school-repo';
import type { SchoolRecord, NewSchoolInput } from '../contract/types';
import { RepoError } from '../contract/types';

interface SchoolRow {
  id: number;
  name: string;
  legal_name: string | null;
  short_code: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  address: string | null;
  logo_url: string | null;
  status: SchoolRecord['status'];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  subscription_status: SchoolRecord['subscriptionStatus'];
  subscription_plan: string | null;
  subscription_type: SchoolRecord['subscriptionType'];
  trial_start_date: string | null;
  trial_end_date: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: SchoolRow): SchoolRecord {
  return {
    id: r.id,
    name: r.name,
    legalName: r.legal_name,
    shortCode: r.short_code,
    email: r.email,
    phone: r.phone,
    currency: r.currency,
    address: r.address,
    logoUrl: r.logo_url,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    subscriptionStatus: r.subscription_status,
    subscriptionPlan: r.subscription_plan,
    subscriptionType: r.subscription_type,
    trialStartDate: r.trial_start_date,
    trialEndDate: r.trial_end_date,
    subscriptionStartDate: r.subscription_start_date,
    subscriptionEndDate: r.subscription_end_date,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, name, legal_name, short_code, email, phone, currency, address, logo_url,
                      status, created_at, updated_at, deleted_at, subscription_status, subscription_plan,
                      subscription_type, trial_start_date, trial_end_date, subscription_start_date,
                      subscription_end_date, deleted_by, delete_reason, restored_at, restored_by`;

const nowIso = () => new Date().toISOString();

export function createSqliteSchoolRepo(db: SqliteConnection): SchoolRepo {
  const findById = async (id: number): Promise<SchoolRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM schools WHERE id = ?`).get(id) as SchoolRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async create(input: NewSchoolInput) {
      const res = db.prepare(
        `INSERT INTO schools (name, legal_name, short_code, email, phone, currency, address, logo_url, status,
                               subscription_status, subscription_plan, subscription_type, trial_start_date,
                               trial_end_date, subscription_start_date, subscription_end_date)
         VALUES (@name, @legalName, @shortCode, @email, @phone, @currency, @address, @logoUrl, @status,
                 @subscriptionStatus, @subscriptionPlan, @subscriptionType, @trialStartDate, @trialEndDate,
                 @subscriptionStartDate, @subscriptionEndDate)`,
      ).run({
        name: input.name,
        legalName: input.legalName ?? null,
        shortCode: input.shortCode ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        currency: input.currency ?? 'UGX',
        address: input.address ?? null,
        logoUrl: input.logoUrl ?? null,
        status: input.status ?? 'active',
        subscriptionStatus: input.subscriptionStatus ?? null,
        subscriptionPlan: input.subscriptionPlan ?? null,
        subscriptionType: input.subscriptionType ?? null,
        trialStartDate: input.trialStartDate ?? null,
        trialEndDate: input.trialEndDate ?? null,
        subscriptionStartDate: input.subscriptionStartDate ?? null,
        subscriptionEndDate: input.subscriptionEndDate ?? null,
      });
      const created = await findById(Number(res.lastInsertRowid));
      if (!created) throw new RepoError('School vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(id, patch) {
      const existing = await findById(id);
      if (!existing) throw new RepoError(`School ${id} not found`, 'NOT_FOUND');
      // `!== undefined`, not `??`, for nullable fields — see
      // mysql/school-repo.ts's update() for why.
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
      db.prepare(
        `UPDATE schools SET name=@name, legal_name=@legalName, short_code=@shortCode, email=@email,
                phone=@phone, currency=@currency, address=@address, logo_url=@logoUrl, status=@status,
                subscription_status=@subscriptionStatus, subscription_plan=@subscriptionPlan,
                subscription_type=@subscriptionType, trial_start_date=@trialStartDate,
                trial_end_date=@trialEndDate, subscription_start_date=@subscriptionStartDate,
                subscription_end_date=@subscriptionEndDate, updated_at=@updatedAt
          WHERE id=@id`,
      ).run({
        id,
        name: merged.name, legalName: merged.legalName ?? null, shortCode: merged.shortCode ?? null,
        email: merged.email ?? null, phone: merged.phone ?? null, currency: merged.currency ?? 'UGX',
        address: merged.address ?? null, logoUrl: merged.logoUrl ?? null, status: merged.status ?? 'active',
        subscriptionStatus: merged.subscriptionStatus ?? null, subscriptionPlan: merged.subscriptionPlan ?? null,
        subscriptionType: merged.subscriptionType ?? null, trialStartDate: merged.trialStartDate ?? null,
        trialEndDate: merged.trialEndDate ?? null, subscriptionStartDate: merged.subscriptionStartDate ?? null,
        subscriptionEndDate: merged.subscriptionEndDate ?? null,
        updatedAt: nowIso(),
      });
      const updated = await findById(id);
      if (!updated) throw new RepoError(`School ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(id) {
      const res = db.prepare(
        `UPDATE schools SET deleted_at = @now, updated_at = @now WHERE id = @id AND deleted_at IS NULL`,
      ).run({ id, now: nowIso() });
      if (!res.changes) throw new RepoError(`School ${id} not found or already deleted`, 'NOT_FOUND');
    },
  };
}
