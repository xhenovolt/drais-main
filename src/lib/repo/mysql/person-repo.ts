/**
 * @drais/repo-mysql — PersonRepo, MySQL/TiDB implementation.
 * Thin wrapper over src/lib/db.ts's `query` — see school-repo.ts's header
 * for the isolation rule this follows.
 */
import { query } from '@/lib/db';
import type { PersonRepo } from '../contract/person-repo';
import type { PersonRecord, NewPersonInput } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoDate, toIsoRequired, toNum, toNumOrNull } from './util';

interface PersonRow {
  id: number | string;
  school_id: number | string | null;
  first_name: string;
  last_name: string;
  other_name: string | null;
  gender: string | null;
  date_of_birth: string | Date | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photo_url: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
}

function toRecord(r: PersonRow): PersonRecord {
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    schoolId: toNumOrNull(r.school_id),
    firstName: r.first_name,
    lastName: r.last_name,
    otherName: r.other_name,
    gender: r.gender,
    dateOfBirth: toIsoDate(r.date_of_birth),
    phone: r.phone,
    email: r.email,
    address: r.address,
    photoUrl: r.photo_url,
    createdAt,
    updatedAt: toIsoRequired(r.updated_at, createdAt),
    deletedAt: toIso(r.deleted_at),
  };
}

const BASE_SELECT = `SELECT id, school_id, first_name, last_name, other_name, gender, date_of_birth,
                             phone, email, address, photo_url, created_at, updated_at, deleted_at
                        FROM people`;

async function findById(id: number): Promise<PersonRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? LIMIT 1`, [id])) as PersonRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlPersonRepo(): PersonRepo {
  return {
    findById,

    async create(input: NewPersonInput) {
      const res = (await query(
        `INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address, photo_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId ?? null, input.firstName, input.lastName, input.otherName ?? null,
          input.gender ?? null, input.dateOfBirth ?? null, input.phone ?? null, input.email ?? null,
          input.address ?? null, input.photoUrl ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(res.insertId);
      if (!created) throw new RepoError('Person vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(id, patch) {
      const existing = await findById(id);
      if (!existing) throw new RepoError(`Person ${id} not found`, 'NOT_FOUND');
      const merged: NewPersonInput = {
        schoolId: patch.schoolId !== undefined ? patch.schoolId : existing.schoolId,
        firstName: patch.firstName ?? existing.firstName,
        lastName: patch.lastName ?? existing.lastName,
        otherName: patch.otherName !== undefined ? patch.otherName : existing.otherName,
        gender: patch.gender !== undefined ? patch.gender : existing.gender,
        dateOfBirth: patch.dateOfBirth !== undefined ? patch.dateOfBirth : existing.dateOfBirth,
        phone: patch.phone !== undefined ? patch.phone : existing.phone,
        email: patch.email !== undefined ? patch.email : existing.email,
        address: patch.address !== undefined ? patch.address : existing.address,
        photoUrl: patch.photoUrl !== undefined ? patch.photoUrl : existing.photoUrl,
      };
      await query(
        `UPDATE people SET school_id=?, first_name=?, last_name=?, other_name=?, gender=?, date_of_birth=?,
                phone=?, email=?, address=?, photo_url=?
          WHERE id = ?`,
        [
          merged.schoolId ?? null, merged.firstName, merged.lastName, merged.otherName ?? null,
          merged.gender ?? null, merged.dateOfBirth ?? null, merged.phone ?? null, merged.email ?? null,
          merged.address ?? null, merged.photoUrl ?? null, id,
        ],
      );
      const updated = await findById(id);
      if (!updated) throw new RepoError(`Person ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(id) {
      const res = (await query(
        `UPDATE people SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND deleted_at IS NULL`,
        [id],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Person ${id} not found or already deleted`, 'NOT_FOUND');
    },
  };
}
