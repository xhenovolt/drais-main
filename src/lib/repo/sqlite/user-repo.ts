/**
 * @drais/repo-sqlite — UserRepo, SQLite implementation.
 * Mirrors mysql/user-repo.ts's contract exactly, including the excluded
 * security-sensitive fields. preferences is stored as a TEXT column here
 * (SQLite has no native JSON type) — JSON.stringify/parse at this
 * boundary, mirroring how mysql2 auto-parses its JSON column type.
 */
import type { SqliteConnection } from './connection';
import type { UserRepo } from '../contract/user-repo';
import type { UserRecord, NewUserInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface UserRow {
  id: number;
  school_id: number | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  password_hash: string;
  role_id: number | null;
  is_active: number | null;
  is_verified: number | null;
  last_login_at: string | null;
  last_password_change: string | null;
  failed_login_attempts: number | null;
  locked_until: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  username: string | null;
  person_id: number | null;
  status: string | null;
  profile_photo: string | null;
  email_verified: number | null;
  login_attempts: number | null;
  last_activity: string | null;
  preferences: string | null;
  two_factor_enabled: number | null;
  biometric_enabled: number | null;
  must_change_password: number;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
  last_failed_login_at: string | null;
}

const toBoolOrNull = (v: number | null) => (v == null ? null : Boolean(v));
const toBit = (v: boolean | null | undefined) => (v == null ? null : v ? 1 : 0);

function parsePrefs(v: string | null): Record<string, unknown> | null {
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function toRecord(r: UserRow): UserRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    avatarUrl: r.avatar_url,
    passwordHash: r.password_hash,
    roleId: r.role_id,
    isActive: toBoolOrNull(r.is_active),
    isVerified: toBoolOrNull(r.is_verified),
    lastLoginAt: r.last_login_at,
    lastPasswordChange: r.last_password_change,
    failedLoginAttempts: r.failed_login_attempts,
    lockedUntil: r.locked_until,
    createdBy: r.created_by,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: r.deleted_at,
    username: r.username,
    personId: r.person_id,
    status: r.status,
    profilePhoto: r.profile_photo,
    emailVerified: toBoolOrNull(r.email_verified),
    loginAttempts: r.login_attempts,
    lastActivity: r.last_activity,
    preferences: parsePrefs(r.preferences),
    twoFactorEnabled: toBoolOrNull(r.two_factor_enabled),
    biometricEnabled: toBoolOrNull(r.biometric_enabled),
    mustChangePassword: Boolean(r.must_change_password),
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
    lastFailedLoginAt: r.last_failed_login_at,
  };
}

const SELECT_COLS = `id, school_id, first_name, last_name, email, phone, avatar_url, password_hash,
                      role_id, is_active, is_verified, last_login_at, last_password_change,
                      failed_login_attempts, locked_until, created_by, created_at, updated_at,
                      deleted_at, username, person_id, status, profile_photo, email_verified,
                      login_attempts, last_activity, preferences, two_factor_enabled,
                      biometric_enabled, must_change_password, deleted_by, delete_reason,
                      restored_at, restored_by, last_failed_login_at`;

const nowIso = () => new Date().toISOString();

export function createSqliteUserRepo(db: SqliteConnection): UserRepo {
  const findById = async (schoolId: number, id: number): Promise<UserRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM users WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as UserRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async findByEmail(schoolId, email) {
      const row = db.prepare(
        `SELECT ${SELECT_COLS} FROM users WHERE email = ? AND school_id = ? AND deleted_at IS NULL`,
      ).get(email, schoolId) as UserRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `SELECT ${SELECT_COLS} FROM users WHERE school_id = ? ORDER BY last_name ASC, first_name ASC LIMIT ?`
        : `SELECT ${SELECT_COLS} FROM users WHERE school_id = ? AND deleted_at IS NULL ORDER BY last_name ASC, first_name ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as UserRow[];
      return rows.map(toRecord);
    },

    async create(input: NewUserInput) {
      const res = db.prepare(
        `INSERT INTO users (school_id, first_name, last_name, email, phone, avatar_url, password_hash, role_id,
                             is_active, is_verified, created_by, username, person_id, status, profile_photo,
                             email_verified, preferences, two_factor_enabled, biometric_enabled, must_change_password)
         VALUES (@schoolId, @firstName, @lastName, @email, @phone, @avatarUrl, @passwordHash, @roleId,
                 @isActive, @isVerified, @createdBy, @username, @personId, @status, @profilePhoto,
                 @emailVerified, @preferences, @twoFactorEnabled, @biometricEnabled, @mustChangePassword)`,
      ).run({
        schoolId: input.schoolId ?? null, firstName: input.firstName, lastName: input.lastName, email: input.email,
        phone: input.phone ?? null, avatarUrl: input.avatarUrl ?? null, passwordHash: input.passwordHash,
        roleId: input.roleId ?? null, isActive: toBit(input.isActive), isVerified: toBit(input.isVerified),
        createdBy: input.createdBy ?? null, username: input.username ?? null, personId: input.personId ?? null,
        status: input.status ?? null, profilePhoto: input.profilePhoto ?? null, emailVerified: toBit(input.emailVerified),
        preferences: input.preferences ? JSON.stringify(input.preferences) : null,
        twoFactorEnabled: toBit(input.twoFactorEnabled), biometricEnabled: toBit(input.biometricEnabled),
        mustChangePassword: input.mustChangePassword ? 1 : 0,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM users WHERE id = ?`)
        .get(Number(res.lastInsertRowid)) as UserRow | undefined;
      if (!row) throw new RepoError('User vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`User ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewUserInput = {
        schoolId: patch.schoolId !== undefined ? patch.schoolId : existing.schoolId,
        firstName: patch.firstName ?? existing.firstName,
        lastName: patch.lastName ?? existing.lastName,
        email: patch.email ?? existing.email,
        phone: patch.phone !== undefined ? patch.phone : existing.phone,
        avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : existing.avatarUrl,
        passwordHash: patch.passwordHash ?? existing.passwordHash,
        roleId: patch.roleId !== undefined ? patch.roleId : existing.roleId,
        isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
        isVerified: patch.isVerified !== undefined ? patch.isVerified : existing.isVerified,
        createdBy: patch.createdBy !== undefined ? patch.createdBy : existing.createdBy,
        username: patch.username !== undefined ? patch.username : existing.username,
        personId: patch.personId !== undefined ? patch.personId : existing.personId,
        status: patch.status !== undefined ? patch.status : existing.status,
        profilePhoto: patch.profilePhoto !== undefined ? patch.profilePhoto : existing.profilePhoto,
        emailVerified: patch.emailVerified !== undefined ? patch.emailVerified : existing.emailVerified,
        preferences: patch.preferences !== undefined ? patch.preferences : existing.preferences,
        twoFactorEnabled: patch.twoFactorEnabled !== undefined ? patch.twoFactorEnabled : existing.twoFactorEnabled,
        biometricEnabled: patch.biometricEnabled !== undefined ? patch.biometricEnabled : existing.biometricEnabled,
        mustChangePassword: patch.mustChangePassword !== undefined ? patch.mustChangePassword : existing.mustChangePassword,
      };
      db.prepare(
        `UPDATE users SET school_id=@schoolId, first_name=@firstName, last_name=@lastName, email=@email,
                phone=@phone, avatar_url=@avatarUrl, password_hash=@passwordHash, role_id=@roleId,
                is_active=@isActive, is_verified=@isVerified, created_by=@createdBy, username=@username,
                person_id=@personId, status=@status, profile_photo=@profilePhoto, email_verified=@emailVerified,
                preferences=@preferences, two_factor_enabled=@twoFactorEnabled, biometric_enabled=@biometricEnabled,
                must_change_password=@mustChangePassword, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId: merged.schoolId ?? null, firstName: merged.firstName, lastName: merged.lastName,
        email: merged.email, phone: merged.phone ?? null, avatarUrl: merged.avatarUrl ?? null,
        passwordHash: merged.passwordHash, roleId: merged.roleId ?? null, isActive: toBit(merged.isActive),
        isVerified: toBit(merged.isVerified), createdBy: merged.createdBy ?? null, username: merged.username ?? null,
        personId: merged.personId ?? null, status: merged.status ?? null, profilePhoto: merged.profilePhoto ?? null,
        emailVerified: toBit(merged.emailVerified), preferences: merged.preferences ? JSON.stringify(merged.preferences) : null,
        twoFactorEnabled: toBit(merged.twoFactorEnabled), biometricEnabled: toBit(merged.biometricEnabled),
        mustChangePassword: merged.mustChangePassword ? 1 : 0, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`User ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE users SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`User ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE users SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`User ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`User ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
