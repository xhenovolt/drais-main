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
  };
}

const nowIso = () => new Date().toISOString();

export function createSqliteSchoolRepo(db: SqliteConnection): SchoolRepo {
  const findById = async (id: number): Promise<SchoolRecord | null> => {
    const row = db.prepare(
      `SELECT id, name, legal_name, short_code, email, phone, currency, address,
              logo_url, status, created_at, updated_at, deleted_at
         FROM schools WHERE id = ?`,
    ).get(id) as SchoolRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async create(input: NewSchoolInput) {
      const res = db.prepare(
        `INSERT INTO schools (name, legal_name, short_code, email, phone, currency, address, logo_url, status)
         VALUES (@name, @legalName, @shortCode, @email, @phone, @currency, @address, @logoUrl, @status)`,
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
      });
      const created = await findById(Number(res.lastInsertRowid));
      if (!created) throw new RepoError('School vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(id, patch) {
      const existing = await findById(id);
      if (!existing) throw new RepoError(`School ${id} not found`, 'NOT_FOUND');
      const merged: NewSchoolInput = {
        name: patch.name ?? existing.name,
        legalName: patch.legalName ?? existing.legalName,
        shortCode: patch.shortCode ?? existing.shortCode,
        email: patch.email ?? existing.email,
        phone: patch.phone ?? existing.phone,
        currency: patch.currency ?? existing.currency,
        address: patch.address ?? existing.address,
        logoUrl: patch.logoUrl ?? existing.logoUrl,
        status: patch.status ?? existing.status,
      };
      db.prepare(
        `UPDATE schools SET name=@name, legal_name=@legalName, short_code=@shortCode, email=@email,
                phone=@phone, currency=@currency, address=@address, logo_url=@logoUrl, status=@status,
                updated_at=@updatedAt
          WHERE id=@id`,
      ).run({
        id,
        name: merged.name, legalName: merged.legalName ?? null, shortCode: merged.shortCode ?? null,
        email: merged.email ?? null, phone: merged.phone ?? null, currency: merged.currency ?? 'UGX',
        address: merged.address ?? null, logoUrl: merged.logoUrl ?? null, status: merged.status ?? 'active',
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
