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
