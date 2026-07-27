/**
 * Control Center — one-click school provisioning (P20).
 *
 * Founder-independent onboarding: an operator creates a fully-usable tenant in
 * a single transaction — school record + SuperAdmin role + first admin user
 * (forced to set their own password on first login) — then assigns a plan
 * (which starts the billing clock). Modules follow the opt-out default, so the
 * new school has everything enabled until Control disables something.
 *
 * Mirrors the school+admin shape created by self-signup, so a provisioned
 * school is indistinguishable from a self-served one downstream.
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { getConnection, query } from '@/lib/db';
import { controlAudit } from '@/lib/control/auth';
import { assignPlanToSchool } from '@/lib/control/subscriptions';

export interface ProvisionInput {
  name: string;
  adminName: string;
  adminEmail: string;
  adminPhone?: string | null;
  planCode?: string | null;
  shortCode?: string | null;
  district?: string | null;
  country?: string | null;
}

export interface ProvisionResult {
  ok: boolean;
  reason?: string;
  schoolId?: number;
  adminEmail?: string;
  tempPassword?: string;
  plan?: string | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** PURE: validate the wizard input. Returns the trimmed/normalised fields. */
export function validateProvisionInput(input: Partial<ProvisionInput>): { ok: true; value: ProvisionInput } | { ok: false; reason: string } {
  const name = String(input.name ?? '').trim();
  const adminName = String(input.adminName ?? '').trim();
  const adminEmail = String(input.adminEmail ?? '').trim().toLowerCase();
  if (name.length < 2) return { ok: false, reason: 'School name is required' };
  if (adminName.length < 2) return { ok: false, reason: 'Admin name is required' };
  if (!EMAIL_RE.test(adminEmail)) return { ok: false, reason: 'A valid admin email is required' };
  return {
    ok: true,
    value: {
      name, adminName, adminEmail,
      adminPhone: input.adminPhone ? String(input.adminPhone).trim().slice(0, 32) : null,
      planCode: input.planCode ? String(input.planCode).trim().toLowerCase() : null,
      shortCode: input.shortCode ? String(input.shortCode).trim().slice(0, 40) : null,
      district: input.district ? String(input.district).trim().slice(0, 120) : null,
      country: input.country ? String(input.country).trim().slice(0, 120) : null,
    },
  };
}

/** PURE: a readable one-time password (no ambiguous chars). */
export function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

const firstLast = (full: string): [string, string] => {
  const parts = full.trim().split(/\s+/);
  return [parts[0] || full, parts.slice(1).join(' ')];
};

/**
 * Provision a new school + its first admin, transactionally. Assigns the plan
 * (billing clock) after commit. Returns the one-time admin password to relay.
 */
export async function provisionSchool(input: ProvisionInput, operatorId: number | null, ip?: string | null): Promise<ProvisionResult> {
  // Reject a duplicate admin email up front (a user is globally unique by email).
  const dupe = (await query(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1`, [input.adminEmail]).catch(() => [])) as any[];
  if (dupe.length) return { ok: false, reason: 'A user with that email already exists' };

  const tempPassword = generateTempPassword();
  const hashed = await bcrypt.hash(tempPassword, 12);
  const [firstName, lastName] = firstLast(input.adminName);

  const conn = await getConnection();
  let schoolId: number;
  try {
    await conn.beginTransaction();

    const [maxRow] = await conn.execute<any[]>(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM schools`);
    schoolId = Number(maxRow[0].next_id);

    await conn.execute(
      `INSERT INTO schools (id, name, short_code, district, country, status, subscription_status, setup_complete, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, 0, NOW())`,
      [schoolId, input.name, input.shortCode, input.district, input.country, input.planCode ? 'active' : 'trial'],
    );

    const [roleRes] = await conn.execute<any>(
      `INSERT INTO roles (school_id, name, slug, description, is_super_admin, is_active)
       VALUES (?, 'SuperAdmin', 'superadmin', 'Full system access for school owners', TRUE, TRUE)`,
      [schoolId],
    );
    const roleId = roleRes.insertId;

    const [userRes] = await conn.execute<any>(
      `INSERT INTO users (school_id, first_name, last_name, email, phone, password_hash, is_active, is_verified, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE, TRUE, NOW())`,
      [schoolId, firstName, lastName, input.adminEmail, input.adminPhone, hashed],
    );

    await conn.execute(
      `INSERT INTO user_roles (user_id, role_id, school_id, is_active, assigned_at)
       VALUES (?, ?, ?, TRUE, NOW())`,
      [userRes.insertId, roleId, schoolId],
    );

    await conn.commit();
  } catch (e: any) {
    try { await conn.rollback(); } catch { /* ignore */ }
    return { ok: false, reason: e?.message || 'Provisioning failed' };
  } finally {
    conn.end(); // wrapper maps end() → release back to the pool
  }

  // Plan assignment (and its billing clock) runs on the pool after commit; a
  // failure here leaves a usable school on the default trial, so it's non-fatal.
  let plan: string | null = null;
  if (input.planCode) {
    const res = await assignPlanToSchool(schoolId, input.planCode, operatorId, ip).catch(() => ({ ok: false }));
    if ((res as any).ok) plan = input.planCode;
  }

  await controlAudit(operatorId, 'provisioned_school', `schools:${schoolId}`,
    { name: input.name, admin: input.adminEmail, plan }, ip ?? null).catch(() => {});

  return { ok: true, schoolId, adminEmail: input.adminEmail, tempPassword, plan };
}
