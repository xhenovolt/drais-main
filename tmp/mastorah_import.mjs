/**
 * One-off: flush AL-BAYAN (school_id 8002) fee balances and replace them with
 * the "fees current" (secular classes) + "TAHFIDH" (TAHFIZ) sheets from
 * BACKUP/samples/MASTORAH.xlsx, so DRAIS balance == sheet balance per learner.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
dotenv.config({ path: '.env.local' });

const SCHOOL_ID = 8002;
const TERM_ID = 300004; // TERM II — current active term for this school
const REFERENCE = 'MASTORAH Import 2026-08';

const CLASS_NAME_TO_ID = {
  'BABY CLASS': 392002,
  'MIDDLE CLASS': 392003,
  'TOP CLASS': 392004,
  'PRIMARY ONE': 392005,
  'PRIMARY TWO': 392006,
  'PRIMARY THREE': 392007,
  'PRIMARY FOUR': 392008,
  'PRIMARY FIVE': 392009,
  'PRIMARY SIX': 392010,
  'PRIMARY SEVEN': 392011,
  'TAHFIZ': 392013,
};

function classify(text) {
  const t = (text ?? '').toString().toUpperCase();
  if (t.includes('BABY')) return 'BABY CLASS';
  if (t.includes('MIDDLE')) return 'MIDDLE CLASS';
  if (t.includes('TOP')) return 'TOP CLASS';
  if (t.includes('TAHFIZ') || t.includes('TAHFIDH')) return 'TAHFIZ';
  if (t.includes('SEVEN')) return 'PRIMARY SEVEN';
  if (t.includes('SIX')) return 'PRIMARY SIX';
  if (t.includes('FIVE')) return 'PRIMARY FIVE';
  if (t.includes('FOUR') || /P\.?\s?4\b/.test(t)) return 'PRIMARY FOUR';
  if (t.includes('THREE') || /P\.?\s?3\b/.test(t)) return 'PRIMARY THREE';
  if (t.includes('TWO') || /P\.?\s?2\b/.test(t)) return 'PRIMARY TWO';
  if (t.includes('ONE') || /P\.?\s?1\b/.test(t)) return 'PRIMARY ONE';
  return null;
}

function normName(s) {
  return (s || '').toString().toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, ' ').trim();
}
function tokenKey(s) {
  return normName(s).split(' ').filter(Boolean).sort().join(' ');
}

// ── Parse "fees current" — stacked class blocks, balance always at col 4 ──
function parseFeesCurrent(rows) {
  const out = [];
  let currentClass = null;
  for (const row of rows) {
    const c0 = row[0], c1 = row[1], c4 = row[4];
    const name = (c1 ?? '').toString().trim();
    const isNumber = (v) => typeof v === 'number';

    // Header/title row: no numeric balance in col4 — look for a class keyword.
    if (!isNumber(c4)) {
      const guess = classify(c0) || classify(c1);
      if (guess) currentClass = guess;
      continue;
    }
    // Data row candidate: needs a real name, not a label.
    const upper = name.toUpperCase();
    if (!name || ['NAME', 'TOTAL', 'GRAND TOTAL', 'BALANCE'].includes(upper)) continue;
    if (!currentClass) continue;
    out.push({ className: currentClass, name, balance: Number(c4), sheet: 'fees current' });
  }
  return out;
}

// ── Parse "TAHFIDH" — flat table, name at col2, balance (TOTAL) at col8 ──
function parseTahfidh(rows) {
  const out = [];
  for (const row of rows) {
    const name = (row[2] ?? '').toString().trim();
    const bal = row[8];
    if (!name || typeof bal !== 'number') continue;
    const upper = name.toUpperCase();
    if (['NAME', 'TOTAL', 'GRAND TOTAL'].includes(upper)) continue;
    out.push({ className: 'TAHFIZ', name, balance: Number(bal), sheet: 'TAHFIDH' });
  }
  return out;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB || 'drais',
    ssl: { rejectUnauthorized: false },
  });
  console.log('Connected.');
  const DRY_RUN = process.argv.includes('--dry-run');
  if (DRY_RUN) console.log('*** DRY RUN — no deletes or inserts will be committed ***');

  // 1. Flush all existing fee data for this school (both silos: the ledger
  // AND student_fee_items — /finance/learners-fees, /finance/ledger/fees and
  // the dashboard all read student_fee_items, not student_ledger).
  if (!DRY_RUN) {
    const [delLedger] = await conn.execute(`DELETE FROM student_ledger WHERE school_id = ?`, [SCHOOL_ID]);
    console.log(`Flushed student_ledger: ${delLedger.affectedRows} rows deleted.`);
    const [delItems] = await conn.execute(
      `DELETE sfi FROM student_fee_items sfi JOIN students s ON s.id = sfi.student_id WHERE s.school_id = ?`,
      [SCHOOL_ID],
    );
    console.log(`Flushed student_fee_items: ${delItems.affectedRows} rows deleted.`);
  }

  // 2. Current class per student (active enrollment, current term).
  const [enrollRows] = await conn.execute(
    `SELECT student_id, class_id FROM enrollments WHERE school_id = ? AND term_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [SCHOOL_ID, TERM_ID],
  );
  const studentClass = new Map(enrollRows.map(r => [r.student_id, r.class_id]));

  // 3. Student names.
  const [studentRows] = await conn.execute(
    `SELECT s.id, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name
       FROM students s LEFT JOIN people p ON p.id = s.person_id
      WHERE s.school_id = ? AND s.deleted_at IS NULL`,
    [SCHOOL_ID],
  );

  // 4. Build per-class name index: classId -> tokenKey -> [studentId,...]
  const classIndex = new Map();
  const schoolIndex = new Map(); // diagnostic: whole-school (any class) name index
  for (const s of studentRows) {
    const key = tokenKey(s.name);
    if (!key) continue;
    const sArr = schoolIndex.get(key) || [];
    sArr.push(s.id);
    schoolIndex.set(key, sArr);

    const classId = studentClass.get(s.id);
    if (!classId) continue;
    if (!classIndex.has(classId)) classIndex.set(classId, new Map());
    const m = classIndex.get(classId);
    const arr = m.get(key) || [];
    arr.push(s.id);
    m.set(key, arr);
  }

  // 5. Parse workbook.
  const wb = XLSX.readFile('BACKUP/samples/MASTORAH.xlsx');
  const feesCurrentRows = XLSX.utils.sheet_to_json(wb.Sheets['fees current'], { header: 1, defval: '' });
  const tahfidhRows = XLSX.utils.sheet_to_json(wb.Sheets['TAHFIDH'], { header: 1, defval: '' });
  const parsed = [...parseFeesCurrent(feesCurrentRows), ...parseTahfidh(tahfidhRows)];
  console.log(`Parsed ${parsed.length} learner rows from the two sheets.`);

  // 6. Match + insert.
  let inserted = 0, zeroSkipped = 0;
  const usedStudentIds = new Set();
  const unmatched = [];
  for (const r of parsed) {
    const classId = CLASS_NAME_TO_ID[r.className];
    if (!classId) { unmatched.push({ ...r, reason: 'unknown class' }); continue; }
    if (!r.balance) { zeroSkipped++; continue; }

    const key = tokenKey(r.name);
    let candidates = schoolIndex.get(key) || [];
    if (candidates.length > 1) {
      // Ambiguous school-wide — narrow to the class the sheet says they're in.
      const inClass = candidates.filter((id) => studentClass.get(id) === classId);
      if (inClass.length === 1) candidates = inClass;
    }
    if (candidates.length !== 1) {
      const inClassCount = (classIndex.get(classId) || new Map()).get(key)?.length || 0;
      const reason = candidates.length === 0 ? 'no match in school' : `ambiguous (${candidates.length})`;
      unmatched.push({ ...r, reason: `${reason}; in-class=${inClassCount}` });
      continue;
    }
    const studentId = candidates[0];
    if (usedStudentIds.has(studentId)) {
      unmatched.push({ ...r, reason: 'duplicate row for already-imported student' });
      continue;
    }
    usedStudentIds.add(studentId);

    const type = r.balance > 0 ? 'debit' : 'credit';
    const amount = Math.abs(r.balance);
    if (!DRY_RUN) {
      await conn.execute(
        `INSERT INTO student_ledger (student_id, school_id, type, amount, reference, term_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [studentId, SCHOOL_ID, type, amount, REFERENCE, TERM_ID, `${r.className} — ${r.sheet}`],
      );
      // Mirror into student_fee_items — the table the rest of the finance UI
      // (learners-fees, ledger/fees, dashboard, parent portal) actually reads.
      // A negative sheet balance (credit/overpayment) has no natural home in
      // this amount-owed model, so it's recorded as amount=0, paid=amount.
      const feeAmount = r.balance > 0 ? r.balance : 0;
      const feePaid = r.balance > 0 ? 0 : Math.abs(r.balance);
      await conn.execute(
        `INSERT INTO student_fee_items (student_id, term_id, item, amount, discount, waived, paid)
         VALUES (?, ?, ?, ?, 0, 0, ?)`,
        [studentId, TERM_ID, REFERENCE, feeAmount, feePaid],
      );
    }
    inserted++;
  }

  console.log(`Inserted ${inserted} ledger entries. Skipped ${zeroSkipped} zero-balance rows. Unmatched: ${unmatched.length}.`);
  if (unmatched.length) {
    console.log('--- UNMATCHED (need manual review) ---');
    for (const u of unmatched) console.log(`[${u.className}] "${u.name}" balance=${u.balance} — ${u.reason}`);
  }

  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
