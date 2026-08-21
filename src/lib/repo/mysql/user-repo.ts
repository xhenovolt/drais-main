/**
 * @drais/repo-mysql — UserRepo, MySQL/TiDB implementation.
 *
 * Deliberately does NOT select password_reset_token, verification_token,
 * email_verification_token, passcode_hash, two_factor_secret, or
 * biometric_key — see contract/types.ts's header on this sub-effort for
 * the security reasoning. password_hash IS selected (a one-way bcrypt
 * hash, safe at rest, and required for offline password verification).
 *
 * preferences (JSON column) arrives from mysql2 already parsed into a JS
 * value — mysql2 auto-JSON.parse()s JSON-typed columns — so it's passed
 * through directly, no extra parsing needed.
 */
import { query } from '@/lib/db';
import type { UserRepo } from '../contract/user-repo';
import type { UserRecord, NewUserInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoRequired, toNum, toNumOrNull } from './util';

interface UserRow {
  id: number | string;
  school_id: number | string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  password_hash: string;
  role_id: number | string | null;
  is_active: number | null;
  is_verified: number | null;
  last_login_at: string | Date | null;
  last_password_change: string | Date | null;
  failed_login_attempts: number | null;
  locked_until: string | Date | null;
  created_by: number | string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  username: string | null;
  person_id: number | string | null;
  status: string | null;
  profile_photo: string | null;
  email_verified: number | null;
  login_attempts: number | null;
  last_activity: string | Date | null;
  preferences: unknown;
  two_factor_enabled: number | null;
  biometric_enabled: number | null;
  must_change_password: number;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
  last_failed_login_at: string | Date | null;
}

function toBoolOrNull(v: number | null): boolean | null {
  return v == null ? null : Boolean(v);
}

function toRecord(r: UserRow): UserRecord {
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    schoolId: toNumOrNull(r.school_id),
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    avatarUrl: r.avatar_url,
    passwordHash: r.password_hash,
    roleId: toNumOrNull(r.role_id),
    isActive: toBoolOrNull(r.is_active),
    isVerified: toBoolOrNull(r.is_verified),
    lastLoginAt: toIso(r.last_login_at),
    lastPasswordChange: toIso(r.last_password_change),
    failedLoginAttempts: r.failed_login_attempts,
    lockedUntil: toIso(r.locked_until),
    createdBy: toNumOrNull(r.created_by),
    createdAt,
    updatedAt: toIsoRequired(r.updated_at, createdAt),
    deletedAt: toIso(r.deleted_at),
    username: r.username,
    personId: toNumOrNull(r.person_id),
    status: r.status,
    profilePhoto: r.profile_photo,
    emailVerified: toBoolOrNull(r.email_verified),
    loginAttempts: r.login_attempts,
    lastActivity: toIso(r.last_activity),
    preferences: (r.preferences ?? null) as Record<string, unknown> | null,
    twoFactorEnabled: toBoolOrNull(r.two_factor_enabled),
    biometricEnabled: toBoolOrNull(r.biometric_enabled),
    mustChangePassword: Boolean(r.must_change_password),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
    lastFailedLoginAt: toIso(r.last_failed_login_at),
  };
}

const BASE_SELECT = `SELECT id, school_id, first_name, last_name, email, phone, avatar_url, password_hash,
                             role_id, is_active, is_verified, last_login_at, last_password_change,
                             failed_login_attempts, locked_until, created_by, created_at, updated_at,
                             deleted_at, username, person_id, status, profile_photo, email_verified,
                             login_attempts, last_activity, preferences, two_factor_enabled,
                             biometric_enabled, must_change_password, deleted_by, delete_reason,
                             restored_at, restored_by, last_failed_login_at
                        FROM users`;

async function findById(schoolId: number, id: number): Promise<UserRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as UserRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlUserRepo(): UserRepo {
  return {
    findById,

    async findByEmail(schoolId, email) {
      const rows = (await query(
        `${BASE_SELECT} WHERE email = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
        [email, schoolId],
      )) as UserRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY last_name ASC, first_name ASC LIMIT ${limit}`,
        [schoolId],
      )) as UserRow[];
      return rows.map(toRecord);
    },

    async create(input: NewUserInput) {
      const res = (await query(
        `INSERT INTO users (school_id, first_name, last_name, email, phone, avatar_url, password_hash, role_id,
                             is_active, is_verified, created_by, username, person_id, status, profile_photo,
                             email_verified, preferences, two_factor_enabled, biometric_enabled, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId ?? null, input.firstName, input.lastName, input.email, input.phone ?? null,
          input.avatarUrl ?? null, input.passwordHash, input.roleId ?? null, input.isActive ?? null,
          input.isVerified ?? null, input.createdBy ?? null, input.username ?? null, input.personId ?? null,
          input.status ?? null, input.profilePhoto ?? null, input.emailVerified ?? null,
          input.preferences ? JSON.stringify(input.preferences) : null, input.twoFactorEnabled ?? null,
          input.biometricEnabled ?? null, input.mustChangePassword ?? false,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      // Fetch by id alone, not findById(schoolId, id) — input.schoolId can
      // legitimately be null, matching classes.create()'s established reasoning.
      const rows = (await query(`${BASE_SELECT} WHERE id = ? LIMIT 1`, [res.insertId])) as UserRow[];
      if (!rows.length) throw new RepoError('User vanished immediately after insert', 'NOT_FOUND');
      return toRecord(rows[0]);
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
      await query(
        `UPDATE users SET school_id=?, first_name=?, last_name=?, email=?, phone=?, avatar_url=?, password_hash=?,
                role_id=?, is_active=?, is_verified=?, created_by=?, username=?, person_id=?, status=?,
                profile_photo=?, email_verified=?, preferences=?, two_factor_enabled=?, biometric_enabled=?,
                must_change_password=?
          WHERE id = ? AND school_id = ?`,
        [
          merged.schoolId ?? null, merged.firstName, merged.lastName, merged.email, merged.phone ?? null,
          merged.avatarUrl ?? null, merged.passwordHash, merged.roleId ?? null, merged.isActive ?? null,
          merged.isVerified ?? null, merged.createdBy ?? null, merged.username ?? null, merged.personId ?? null,
          merged.status ?? null, merged.profilePhoto ?? null, merged.emailVerified ?? null,
          merged.preferences ? JSON.stringify(merged.preferences) : null, merged.twoFactorEnabled ?? null,
          merged.biometricEnabled ?? null, merged.mustChangePassword ?? false, id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`User ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE users SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`User ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE users SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`User ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`User ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },

    async recordFailedLogin(schoolId, id, opts) {
      await query(
        `UPDATE users SET failed_login_attempts = ?, locked_until = ?, last_failed_login_at = ?
          WHERE id = ? AND school_id = ?`,
        [opts.failedLoginAttempts, opts.lockedUntil, opts.lastFailedLoginAt, id, schoolId],
      );
    },

    async clearLoginLockout(schoolId, id) {
      await query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_failed_login_at = NULL
          WHERE id = ? AND school_id = ?`,
        [id, schoolId],
      );
    },

    async recordSuccessfulLogin(schoolId, id, lastLoginAt) {
      await query(`UPDATE users SET last_login_at = ? WHERE id = ? AND school_id = ?`, [lastLoginAt, id, schoolId]);
    },
  };
}
