import { createHash } from 'crypto';
import { query } from '@/lib/db';

export interface IdempotencyHit {
  status: number;
  body:   string;
}

function hashRequest(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex');
}

export async function lookupIdempotent(
  keyId: string,
  idemKey: string,
  method: string,
  path: string,
  body: string,
): Promise<{ hit: IdempotencyHit | null; conflict: boolean }> {
  const rows = (await query(
    `SELECT request_hash, response_status, response_body
       FROM platform_idempotency_keys
      WHERE key_id = ? AND idempotency_key = ?`,
    [keyId, idemKey],
  )) as Array<{ request_hash: string; response_status: number; response_body: string }>;
  if (!rows.length) return { hit: null, conflict: false };

  const want = hashRequest(method, path, body);
  if (rows[0].request_hash !== want) return { hit: null, conflict: true };
  return { hit: { status: rows[0].response_status, body: rows[0].response_body }, conflict: false };
}

export async function storeIdempotent(
  keyId: string,
  idemKey: string,
  method: string,
  path: string,
  body: string,
  status: number,
  responseBody: string,
): Promise<void> {
  const reqHash = hashRequest(method, path, body);
  await query(
    `INSERT IGNORE INTO platform_idempotency_keys
       (key_id, idempotency_key, request_hash, response_status, response_body)
     VALUES (?, ?, ?, ?, ?)`,
    [keyId, idemKey, reqHash, status, responseBody],
  );
}
