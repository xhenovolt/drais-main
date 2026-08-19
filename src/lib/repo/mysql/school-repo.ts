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

async function findById(id: number): Promise<SchoolRecord | null> {
  const rows = (await query(
    `SELECT id, name, legal_name, short_code, email, phone, currency, address,
            logo_url, status, created_at, updated_at, deleted_at
       FROM schools WHERE id = ? LIMIT 1`,
    [id],
  )) as SchoolRow[];
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
        `INSERT INTO schools (name, legal_name, short_code, email, phone, currency, address, logo_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.name, input.legalName ?? null, input.shortCode ?? null, input.email ?? null,
          input.phone ?? null, input.currency ?? 'UGX', input.address ?? null, input.logoUrl ?? null,
          input.status ?? 'active',
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
      await query(
        `UPDATE schools SET name=?, legal_name=?, short_code=?, email=?, phone=?, currency=?, address=?, logo_url=?, status=?
          WHERE id = ?`,
        [
          merged.name, merged.legalName ?? null, merged.shortCode ?? null, merged.email ?? null,
          merged.phone ?? null, merged.currency ?? 'UGX', merged.address ?? null, merged.logoUrl ?? null,
          merged.status ?? 'active', id,
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
