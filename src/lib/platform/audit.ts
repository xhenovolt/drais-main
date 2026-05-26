import { query } from '@/lib/db';

export interface PlatformAuditRow {
  requestId:       string;
  keyId:           string | null;
  consumer:        string | null;
  method:          string;
  path:            string;
  statusCode:      number;
  ip?:             string | null;
  userAgent?:      string | null;
  idempotencyKey?: string | null;
  payloadBytes?:   number | null;
  responseMs?:     number | null;
  errorCode?:      string | null;
  schoolId?:       number | null;
}

export async function writePlatformAudit(r: PlatformAuditRow): Promise<void> {
  try {
    await query(
      `INSERT INTO platform_api_audit
        (request_id, key_id, consumer, method, path, status_code,
         ip, user_agent, idempotency_key, payload_bytes, response_ms,
         error_code, school_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        r.requestId,
        r.keyId,
        r.consumer,
        r.method,
        r.path,
        r.statusCode,
        r.ip ?? null,
        r.userAgent ?? null,
        r.idempotencyKey ?? null,
        r.payloadBytes ?? null,
        r.responseMs ?? null,
        r.errorCode ?? null,
        r.schoolId ?? null,
      ],
    );
  } catch (e) {
    console.error('[platform-audit] write failed', e);
  }
}
