/**
 * @drais/repo-sqlite — PersonRepo, SQLite implementation.
 * Mirrors mysql/person-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { PersonRepo } from '../contract/person-repo';
import type { PersonRecord, NewPersonInput } from '../contract/types';
import { RepoError } from '../contract/types';

interface PersonRow {
  id: number;
  school_id: number | null;
  first_name: string;
  last_name: string;
  other_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function toRecord(r: PersonRow): PersonRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    firstName: r.first_name,
    lastName: r.last_name,
    otherName: r.other_name,
    gender: r.gender,
    dateOfBirth: r.date_of_birth,
    phone: r.phone,
    email: r.email,
    address: r.address,
    photoUrl: r.photo_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

const nowIso = () => new Date().toISOString();

export function createSqlitePersonRepo(db: SqliteConnection): PersonRepo {
  const findById = async (id: number): Promise<PersonRecord | null> => {
    const row = db.prepare(
      `SELECT id, school_id, first_name, last_name, other_name, gender, date_of_birth,
              phone, email, address, photo_url, created_at, updated_at, deleted_at
         FROM people WHERE id = ?`,
    ).get(id) as PersonRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async create(input: NewPersonInput) {
      const res = db.prepare(
        `INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address, photo_url)
         VALUES (@schoolId, @firstName, @lastName, @otherName, @gender, @dateOfBirth, @phone, @email, @address, @photoUrl)`,
      ).run({
        schoolId: input.schoolId ?? null, firstName: input.firstName, lastName: input.lastName,
        otherName: input.otherName ?? null, gender: input.gender ?? null, dateOfBirth: input.dateOfBirth ?? null,
        phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null,
        photoUrl: input.photoUrl ?? null,
      });
      const created = await findById(Number(res.lastInsertRowid));
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
      db.prepare(
        `UPDATE people SET school_id=@schoolId, first_name=@firstName, last_name=@lastName, other_name=@otherName,
                gender=@gender, date_of_birth=@dateOfBirth, phone=@phone, email=@email, address=@address,
                photo_url=@photoUrl, updated_at=@updatedAt
          WHERE id=@id`,
      ).run({
        id,
        schoolId: merged.schoolId ?? null, firstName: merged.firstName, lastName: merged.lastName,
        otherName: merged.otherName ?? null, gender: merged.gender ?? null, dateOfBirth: merged.dateOfBirth ?? null,
        phone: merged.phone ?? null, email: merged.email ?? null, address: merged.address ?? null,
        photoUrl: merged.photoUrl ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(id);
      if (!updated) throw new RepoError(`Person ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(id) {
      const res = db.prepare(
        `UPDATE people SET deleted_at = @now, updated_at = @now WHERE id = @id AND deleted_at IS NULL`,
      ).run({ id, now: nowIso() });
      if (!res.changes) throw new RepoError(`Person ${id} not found or already deleted`, 'NOT_FOUND');
    },
  };
}
