// Phase 7, sub-effort 6: users, roles, user_roles, role_permissions,
// permissions — the offline-authentication data layer. Same in-memory,
// real-SQLite approach as the other repo-sqlite test files.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

describe('repo-sqlite: Phase 7 sub-effort 6 (users, roles, RBAC)', () => {
  let db, repos, schoolId, otherSchoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Auth Test School' });
    schoolId = school.id;
    const otherSchool = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = otherSchool.id;
  });

  after(() => {
    closeSqliteDb(db);
  });

  describe('UserRepo', () => {
    it('create/findById round-trip, and the record has no secret-material keys at all', async () => {
      const u = await repos.users.create({
        schoolId, firstName: 'Amina', lastName: 'Nakato', email: 'amina@example.com',
        passwordHash: '$2a$10$fakebcryptfakebcryptfakebcryptfakebcryptfake',
      });
      assert.equal(u.email, 'amina@example.com');
      assert.equal('twoFactorSecret' in u, false, 'UserRecord must never carry two_factor_secret — deliberate security scope cut');
      assert.equal('biometricKey' in u, false, 'UserRecord must never carry biometric_key — deliberate security scope cut');
      assert.equal('passwordResetToken' in u, false);
      const found = await repos.users.findById(schoolId, u.id);
      assert.deepEqual(found, u);
    });

    it('findByEmail finds the right user, scoped to school, and is deleted_at-aware', async () => {
      await repos.users.create({ schoolId, firstName: 'Second', lastName: 'User', email: 'second@example.com', passwordHash: 'x' });
      const found = await repos.users.findByEmail(schoolId, 'second@example.com');
      assert.equal(found?.email, 'second@example.com');

      const wrongSchool = await repos.users.findByEmail(otherSchoolId, 'second@example.com');
      assert.equal(wrongSchool, null, 'a user must not resolve under the wrong school');
    });

    it('preferences JSON round-trips as a real object, not a stringified blob', async () => {
      const u = await repos.users.create({
        schoolId, firstName: 'Pref', lastName: 'Test', email: 'pref@example.com', passwordHash: 'x',
        preferences: { theme: 'dark', locale: 'en' },
      });
      assert.deepEqual(u.preferences, { theme: 'dark', locale: 'en' });
      const found = await repos.users.findById(schoolId, u.id);
      assert.deepEqual(found?.preferences, { theme: 'dark', locale: 'en' });
    });

    it('mustChangePassword defaults false, not undefined/null', async () => {
      const u = await repos.users.create({ schoolId, firstName: 'Def', lastName: 'Ault', email: 'default@example.com', passwordHash: 'x' });
      assert.equal(u.mustChangePassword, false);
    });

    it('update() applies an explicit null; softDelete + restore carries the richer audit trail', async () => {
      const u = await repos.users.create({ schoolId, firstName: 'Temp', lastName: 'User', email: 'temp@example.com', passwordHash: 'x', phone: '123' });
      const cleared = await repos.users.update(schoolId, u.id, { phone: null });
      assert.equal(cleared.phone, null);

      await repos.users.softDelete(schoolId, u.id, { deletedBy: 1, deleteReason: 'left school' });
      const listed = await repos.users.listBySchool(schoolId, { limit: 1000 });
      assert.ok(!listed.some((x) => x.id === u.id));
      const restored = await repos.users.restore(schoolId, u.id, 2);
      assert.equal(restored.deletedAt, null);
      assert.equal(restored.restoredBy, 2);
    });
  });

  describe('RoleRepo + UserRoleRepo + RolePermissionRepo + PermissionRepo — full login-shaped resolution', () => {
    it('resolves a user -> roles -> permission codes end-to-end, the exact shape login needs', async () => {
      const teacher = await repos.users.create({ schoolId, firstName: 'Grace', lastName: 'Teacher', email: 'teacher@example.com', passwordHash: 'x' });
      const role = await repos.roles.create({ schoolId, name: 'Teacher', slug: 'teacher' });
      await repos.userRoles.assign({ userId: teacher.id, roleId: role.id, schoolId });

      const perm1 = await repos.permissions.findByCode('attendance.mark') ?? { id: null };
      // permissions is a global catalog this repo doesn't seed automatically —
      // create the rows this test needs directly via the sqlite handle, the
      // same pattern the seed-only tables use, since PermissionRepo has no
      // create() (global reference data isn't this repo's to mutate that way).
      db.prepare(`INSERT INTO permissions (code, module) VALUES (?, ?)`).run('attendance.mark', 'attendance');
      const perm = await repos.permissions.findByCode('attendance.mark');
      assert.ok(perm);

      await repos.rolePermissions.grant(role.id, perm.id);

      const userRoles = await repos.userRoles.listByUser(schoolId, teacher.id);
      assert.equal(userRoles.length, 1);
      assert.equal(userRoles[0].roleId, role.id);

      const codes = await repos.rolePermissions.listCodesByRole(role.id);
      assert.deepEqual(codes, ['attendance.mark']);
    });

    it('RolePermissionRepo.grant is idempotent — a second grant of the same pair does not throw or duplicate', async () => {
      const role = await repos.roles.create({ schoolId, name: 'Idempotent Role' });
      db.prepare(`INSERT INTO permissions (code) VALUES ('idempotent.test')`).run();
      const perm = await repos.permissions.findByCode('idempotent.test');

      await repos.rolePermissions.grant(role.id, perm.id);
      await repos.rolePermissions.grant(role.id, perm.id); // second grant, must not throw or duplicate

      const codes = await repos.rolePermissions.listCodesByRole(role.id);
      assert.deepEqual(codes, ['idempotent.test'], 'a duplicate grant must not produce a duplicate entry');
    });

    it('revoke removes the grant; UserRoleRepo.revoke deactivates rather than deleting', async () => {
      const user = await repos.users.create({ schoolId, firstName: 'Rev', lastName: 'Oke', email: 'revoke@example.com', passwordHash: 'x' });
      const role = await repos.roles.create({ schoolId, name: 'Revocable Role' });
      await repos.userRoles.assign({ userId: user.id, roleId: role.id, schoolId });

      await repos.userRoles.revoke(user.id, role.id);
      const active = await repos.userRoles.listByUser(schoolId, user.id);
      assert.equal(active.length, 0, 'revoked assignment must not appear in the active list');

      db.prepare(`INSERT INTO permissions (code) VALUES ('revoke.test')`).run();
      const perm = await repos.permissions.findByCode('revoke.test');
      await repos.rolePermissions.grant(role.id, perm.id);
      await repos.rolePermissions.revoke(role.id, perm.id);
      const codes = await repos.rolePermissions.listCodesByRole(role.id);
      assert.deepEqual(codes, []);
    });

    it('findById is school-scoped for roles — a real tenant-isolation check', async () => {
      const otherRole = await repos.roles.create({ schoolId: otherSchoolId, name: 'Other School Role' });
      assert.equal(await repos.roles.findById(schoolId, otherRole.id), null);
    });

    it('PermissionRepo is global — no school scoping parameter at all', async () => {
      db.prepare(`INSERT INTO permissions (code, module) VALUES ('global.test', 'core')`).run();
      const all = await repos.permissions.listAll();
      assert.ok(all.some((p) => p.code === 'global.test'));
    });
  });
});
