/**
 * Pure helpers for the ZKTeco ADMS HTTP push protocol.
 *
 * Keep these functions free of database/framework imports so the wire format
 * can be regression-tested independently of the request handler.
 */

export type AdmsRecord = Record<string, string>;

export interface ParsedAdmsBody {
  records: AdmsRecord[];
  /** Exact non-empty lines, in the same order as `records`. */
  lines: string[];
}

/**
 * Parse the two attendance payload shapes emitted by ZKTeco ADMS devices:
 *
 *   - key/value records: `USER PIN=5\tName=...`
 *   - positional ATTLOG records: `5\t2026-07-17 08:00:00\t0\t1...`
 *
 * A new object is created for every line. This is intentionally line based:
 * one HTTP body may contain many independent records.
 */
export function normalizeDeviceDateTime(raw: string | null | undefined): string | null {
  if (raw == null) return null;

  const clean = String(raw).trim();
  if (!clean) return null;

  // Already in canonical form.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clean)) return clean;

  // Slash-separated values such as 2026/7/8 8:0:0.
  const normalizedSlashes = clean.replace(/\//g, '-');
  const match = normalizedSlashes.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/);
  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    return [
      `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`,
      `${String(Number(hour)).padStart(2, '0')}:${String(Number(minute)).padStart(2, '0')}:${String(Number(second)).padStart(2, '0')}`,
    ].join(' ');
  }

  // Compact 14-digit values such as 20260718080000.
  if (/^\d{14}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }

  // Date-only values become midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return `${clean} 00:00:00`;

  return clean;
}

export function parseZKBody(raw: string, _tableName = ''): ParsedAdmsBody {
  const records: AdmsRecord[] = [];
  const lines: string[] = [];
  if (!raw || !raw.trim()) return { records, lines };

  for (const line of raw.trim().split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lines.push(trimmed);

    // OPERLOG lines have a different positional schema and are retained as
    // raw records rather than being interpreted as attendance punches.
    if (/^OPLOG\s/i.test(trimmed)) {
      records.push({ _TYPE: 'OPERLOG', _RAW: trimmed });
      continue;
    }

    if (trimmed.includes('=')) {
      const record: AdmsRecord = {};
      for (const part of trimmed.split('\t')) {
        const eqIdx = part.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = part.substring(0, eqIdx).trim().toUpperCase();
        const value = part.substring(eqIdx + 1).trim();
        record[key] = value;
      }
      if (Object.keys(record).length > 0) records.push(record);
      continue;
    }

    // Positional ATTLOG: PIN, CHECKTIME, STATUS, VERIFY, WORKCODE, LOGID…
    const cols = trimmed.split('\t');
    if (cols.length >= 2) {
      records.push({
        USERID: cols[0]?.trim() || '',
        CHECKTIME: cols[1]?.trim() || '',
        INOUTMODE: cols[2]?.trim() || '',
        VERIFYTYPE: cols[3]?.trim() || '',
        WORKCODE: cols[4]?.trim() || '',
        LOGID: cols[5]?.trim() || '',
      });
    }
  }

  return { records, lines };
}

/**
 * ADMS acknowledgement for a successfully processed data upload.
 *
 * The count is part of the protocol contract for ATTLOG/OPERLOG and related
 * record uploads. Returning only `OK` can leave the device's upload cursor
 * unchanged, causing it to resend the same batch on every poll.
 */
export function admsUploadAck(recordCount: number): string {
  const count = Number.isFinite(recordCount)
    ? Math.max(0, Math.trunc(recordCount))
    : 0;
  return `OK: ${count}`;
}
