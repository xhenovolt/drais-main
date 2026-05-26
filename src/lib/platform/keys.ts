import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { PLATFORM_SCOPES, type PlatformScope } from './scopes';

export interface PlatformKeyRow {
  id:                 number;
  key_id:             string;
  secret_hash:        string;
  consumer:           string;
  label:              string | null;
  scopes:             string[] | string;
  allowed_ips:        string[] | string | null;
  rate_limit_per_min: number;
  expires_at:         Date | null;
  revoked_at:         Date | null;
  last_used_at:       Date | null;
}

export interface IssuedKey {
  keyId:    string;
  secret:   string;
  token:    string; // "pk_live_<keyId>.<secret>" — shown to caller ONCE
  consumer: string;
  scopes:   PlatformScope[];
  expiresAt: Date | null;
}

function randomId(bytes: number) {
  return randomBytes(bytes).toString('base64url');
}

export async function issuePlatformKey(input: {
  consumer:        string;
  label?:          string;
  scopes:          PlatformScope[];
  allowedIps?:     string[];
  rateLimitPerMin?: number;
  expiresAt?:      Date | null;
  createdBy?:      number | null;
  environment?:    'live' | 'test';
}): Promise<IssuedKey> {
  const env = input.environment ?? 'live';
  for (const s of input.scopes) {
    if (!PLATFORM_SCOPES.includes(s)) throw new Error(`Unknown scope: ${s}`);
  }
  const keyId  = `pk_${env}_${randomId(12)}`;
  const secret = randomId(32);
  const secret_hash = await bcrypt.hash(secret, 10);

  await query(
    `INSERT INTO platform_api_keys
       (key_id, secret_hash, consumer, label, scopes, allowed_ips,
        rate_limit_per_min, expires_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      keyId,
      secret_hash,
      input.consumer,
      input.label ?? null,
      JSON.stringify(input.scopes),
      input.allowedIps ? JSON.stringify(input.allowedIps) : null,
      input.rateLimitPerMin ?? 600,
      input.expiresAt ?? null,
      input.createdBy ?? null,
    ],
  );

  return {
    keyId,
    secret,
    token:    `${keyId}.${secret}`,
    consumer: input.consumer,
    scopes:   input.scopes,
    expiresAt: input.expiresAt ?? null,
  };
}

export async function revokePlatformKey(keyId: string, revokedBy: number | null) {
  await query(
    `UPDATE platform_api_keys
        SET revoked_at = NOW(), revoked_by = ?
      WHERE key_id = ? AND revoked_at IS NULL`,
    [revokedBy, keyId],
  );
}

export async function listPlatformKeys(): Promise<Array<Omit<PlatformKeyRow, 'secret_hash'>>> {
  const rows = (await query(
    `SELECT id, key_id, consumer, label, scopes, allowed_ips, rate_limit_per_min,
            expires_at, revoked_at, last_used_at
       FROM platform_api_keys
      ORDER BY created_at DESC`,
  )) as any[];
  return rows.map(r => ({
    ...r,
    scopes:      typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes,
    allowed_ips: r.allowed_ips == null ? null : (typeof r.allowed_ips === 'string' ? JSON.parse(r.allowed_ips) : r.allowed_ips),
  }));
}

export async function getKeyByKeyId(keyId: string): Promise<PlatformKeyRow | null> {
  const rows = (await query(
    `SELECT * FROM platform_api_keys WHERE key_id = ? LIMIT 1`,
    [keyId],
  )) as PlatformKeyRow[];
  if (!rows.length) return null;
  const r = rows[0] as any;
  return {
    ...r,
    scopes:      typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes,
    allowed_ips: r.allowed_ips == null ? null : (typeof r.allowed_ips === 'string' ? JSON.parse(r.allowed_ips) : r.allowed_ips),
  };
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/** Stable, salt-free fingerprint of a token for safe logging. */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}
