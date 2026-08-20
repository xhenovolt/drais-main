/**
 * @drais/repo-sqlite — provisioning seed writes.
 *
 * Deliberately NOT part of SchoolRepo/StudentRepo's normal create()/update()
 * contract. Provisioning is a different operation from ordinary app writes:
 * it needs to preserve the source row's exact id/timestamps (an upsert of a
 * full record), not generate a fresh auto-increment id and fresh audit
 * timestamps the way a real user action would. Keeping this separate means
 * the repo contract's create()/update() semantics stay honest for every
 * other caller — "create a new row" always means exactly that.
 *
 * ID preservation is a deliberate, scoped-to-this-phase choice: a freshly
 * provisioned local install starts as an exact 1:1 copy with no local
 * writes yet, so there is no ID-collision risk to design around. Real sync
 * (roadmap Phase 9-10) will need its own stable cross-system identity
 * (sync_uuid, per docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §12.2)
 * once local writes can diverge from the source — that is a materially
 * different problem from this one and is intentionally not solved here.
 *
 * Upsert (INSERT ... ON CONFLICT DO UPDATE), not a raw INSERT, so
 * re-provisioning the same school (refresh from cloud) is safe to re-run.
 */
import type { SqliteConnection } from './connection';
import type { SchoolRecord, StudentRecord, PersonRecord } from '../contract/types';

export function seedSchool(db: SqliteConnection, r: SchoolRecord): void {
  db.prepare(`
    INSERT INTO schools (id, name, legal_name, short_code, email, phone, currency, address, logo_url, status, created_at, updated_at, deleted_at)
    VALUES (@id, @name, @legalName, @shortCode, @email, @phone, @currency, @address, @logoUrl, @status, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, legal_name=excluded.legal_name, short_code=excluded.short_code,
      email=excluded.email, phone=excluded.phone, currency=excluded.currency, address=excluded.address,
      logo_url=excluded.logo_url, status=excluded.status, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  `).run({
    id: r.id, name: r.name, legalName: r.legalName, shortCode: r.shortCode, email: r.email,
    phone: r.phone, currency: r.currency, address: r.address, logoUrl: r.logoUrl, status: r.status,
    createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
  });
}

export function seedStudent(db: SqliteConnection, r: StudentRecord): void {
  db.prepare(`
    INSERT INTO students (id, school_id, person_id, admission_no, village_id, admission_date, status, notes, created_at, updated_at, deleted_at)
    VALUES (@id, @schoolId, @personId, @admissionNo, @villageId, @admissionDate, @status, @notes, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      school_id=excluded.school_id, person_id=excluded.person_id, admission_no=excluded.admission_no,
      village_id=excluded.village_id, admission_date=excluded.admission_date, status=excluded.status,
      notes=excluded.notes, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  `).run({
    id: r.id, schoolId: r.schoolId, personId: r.personId, admissionNo: r.admissionNo,
    villageId: r.villageId, admissionDate: r.admissionDate, status: r.status, notes: r.notes,
    createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
  });
}

export function seedPerson(db: SqliteConnection, r: PersonRecord): void {
  db.prepare(`
    INSERT INTO people (id, school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address, photo_url, created_at, updated_at, deleted_at)
    VALUES (@id, @schoolId, @firstName, @lastName, @otherName, @gender, @dateOfBirth, @phone, @email, @address, @photoUrl, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      school_id=excluded.school_id, first_name=excluded.first_name, last_name=excluded.last_name,
      other_name=excluded.other_name, gender=excluded.gender, date_of_birth=excluded.date_of_birth,
      phone=excluded.phone, email=excluded.email, address=excluded.address, photo_url=excluded.photo_url,
      updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  `).run({
    id: r.id, schoolId: r.schoolId, firstName: r.firstName, lastName: r.lastName, otherName: r.otherName,
    gender: r.gender, dateOfBirth: r.dateOfBirth, phone: r.phone, email: r.email, address: r.address,
    photoUrl: r.photoUrl, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
  });
}
