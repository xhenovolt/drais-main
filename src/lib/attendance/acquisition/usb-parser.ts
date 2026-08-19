/**
 * Phase 5 (extensibility adapter) — USB attendance log parser.
 *
 * docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md §7 names "USB/CSV import"
 * as an adapter that reuses the acquisition staging backbone (§7 diagram:
 * "Acquisition adapters (TCP pull │ ADMS push │ USB/CSV import │ manual)").
 * This is that adapter's parsing half — it turns a file pulled off a USB
 * stick from a ZKTeco terminal into the SAME RawPunch[] shape the TCP/ADMS
 * adapters produce (src/lib/attendance/acquisition/service.ts), so it can
 * flow through the identical beginAcquisition → stageRecords →
 * validateAcquisition → commitAcquisition pipeline. No attendance decision
 * logic lives here — this module only turns bytes into verbatim wall-clock
 * punches. It NEVER writes to attendance_raw_events.
 *
 * Format notes (why this is deliberately strict, not "best effort"):
 * ZKTeco's own USB export ("Backup Data to USB Disk" on the device menu)
 * produces a plain-text file, one punch per line, fields separated by tabs
 * on most firmware families:
 *
 *   PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>status<TAB>verify[<TAB>workcode]
 *
 * Firmware variance is real and undocumented per device model (the same
 * caveat the TCP-pull forensic audit raised about node-zklib's record
 * parsing, RC-risk table item 4) — so this parser:
 *   - accepts tab OR comma as the field separator (auto-detected per file,
 *     not per line, to avoid a file that mixes interpretations),
 *   - accepts an optional header row (skipped if the first field of the
 *     first line isn't a plausible device PIN),
 *   - accepts date/time in the unambiguous ISO-like family only
 *     (YYYY-MM-DD or YYYY/MM/DD, optional 'T' separator, seconds optional).
 *     It deliberately does NOT attempt to guess MM/DD vs DD/MM ordering —
 *     that is exactly the class of silent misinterpretation RC-1 through
 *     RC-6 were about, just at parse time instead of conversion time. A
 *     line whose date can't be read unambiguously is INVALID, not guessed.
 *   - never touches a timezone. The wall string is captured verbatim, in
 *     whatever local clock the device's own export used — exactly the
 *     DeviceWallTime contract every other acquisition adapter follows.
 *
 * A malformed line is never silently dropped: it is counted and returned
 * in `errors` with its line number and raw text, so the operator sees it
 * on the Raw Inspection screen before anything is staged.
 */
import { isDeviceWallTime, type DeviceWallTime } from './wall-time';
import type { RawPunch } from './service';

export interface UsbParseError {
  line: number;
  raw: string;
  reason: string;
}

export interface UsbParseResult {
  punches: RawPunch[];
  errors: UsbParseError[];
  /** Field separator detected for the whole file. */
  delimiter: '\t' | ',' | null;
}

const PIN_RE = /^\d{1,32}$/;
// YYYY-MM-DD or YYYY/MM/DD, optional 'T' or space, HH:MM optional :SS.
const DATE_RE = /^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

const MAX_LINES = 200_000; // sane upper bound; a real device log is a few thousand to low tens of thousands

function normalizeWallTime(raw: string): DeviceWallTime | null {
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const wall = `${y}-${mo}-${d} ${h}:${mi}:${se ?? '00'}`;
  return isDeviceWallTime(wall) ? (wall as DeviceWallTime) : null;
}

function detectDelimiter(sampleLines: string[]): '\t' | ',' {
  const tabCount = sampleLines.reduce((n, l) => n + (l.includes('\t') ? 1 : 0), 0);
  const commaCount = sampleLines.reduce((n, l) => n + (l.includes(',') ? 1 : 0), 0);
  // Prefer tab (the ZKTeco-native export delimiter) unless the file is
  // clearly comma-shaped and has no tabs at all.
  return tabCount >= commaCount ? '\t' : ',';
}

/** Parse a raw USB export file's text into staged-shape RawPunch records. */
export function parseZktecoUsbFile(text: string): UsbParseResult {
  const allLines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (!allLines.length) return { punches: [], errors: [], delimiter: null };
  if (allLines.length > MAX_LINES) {
    return {
      punches: [],
      errors: [{ line: 0, raw: '', reason: `File has ${allLines.length} lines, exceeding the ${MAX_LINES} safety limit — is this really an attendance export?` }],
      delimiter: null,
    };
  }

  const delimiter = detectDelimiter(allLines.slice(0, 20));

  // Optional header row: skip it if the first field of line 1 doesn't look
  // like a PIN (e.g. "PIN", "UserID", "Badge Number", ...).
  let startIdx = 0;
  const firstFields = allLines[0].split(delimiter).map(f => f.trim());
  if (firstFields.length > 0 && !PIN_RE.test(firstFields[0])) {
    startIdx = 1;
  }

  const punches: RawPunch[] = [];
  const errors: UsbParseError[] = [];
  const seen = new Set<string>(); // dedupe exact "pin|wall" repeats WITHIN this file

  for (let i = startIdx; i < allLines.length; i++) {
    const lineNo = i + 1;
    const raw = allLines[i];
    const fields = raw.split(delimiter).map(f => f.trim());

    if (fields.length < 2) {
      errors.push({ line: lineNo, raw, reason: `Expected at least PIN and date/time (got ${fields.length} field(s))` });
      continue;
    }

    const pin = fields[0];
    if (!PIN_RE.test(pin)) {
      errors.push({ line: lineNo, raw, reason: `"${pin}" is not a plausible device PIN` });
      continue;
    }

    const wallTime = normalizeWallTime(fields[1]);
    if (!wallTime) {
      errors.push({ line: lineNo, raw, reason: `"${fields[1]}" is not a recognizable YYYY-MM-DD HH:MM:SS timestamp — refusing to guess the date order` });
      continue;
    }

    const key = `${pin}|${wallTime}`;
    if (seen.has(key)) continue; // same file listing the same punch twice — silent, harmless collapse (not a data question, a file-format one)
    seen.add(key);

    const statusCode = fields[2] !== undefined && fields[2] !== '' ? (Number.isFinite(Number(fields[2])) ? Number(fields[2]) : null) : null;
    const verifyType = fields[3] !== undefined && fields[3] !== '' ? (Number.isFinite(Number(fields[3])) ? Number(fields[3]) : null) : null;

    punches.push({
      seq: lineNo,
      deviceUserId: pin,
      wallTime,
      verifyType,
      ioMode: statusCode,
      statusCode: null,
      displayName: null,
      rawHex: null,
    });
  }

  return { punches, errors, delimiter };
}
