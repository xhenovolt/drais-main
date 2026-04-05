import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { bulkImportBalances, BulkBalanceRow } from '@/lib/services/FinanceLedger';
import { getConnection } from '@/lib/db';

// POST /api/finance/bulk-import
//
// Body (JSON):
//   { rows: [{ student_id, balance, reference? }, ...], term_id? }
//   OR
//   { csv: "student_id,balance,reference\n812001,50000,Opening Balance\n...", term_id? }
//
// balance > 0 → debit  (student owes money)
// balance < 0 → credit (school owes student)

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const termId = body.term_id ? +body.term_id : undefined;

  let rows: BulkBalanceRow[] = [];

  // ── Accept CSV string ──────────────────────────────────────────────────
  if (typeof body.csv === 'string') {
    const lines = body.csv.trim().split('\n');
    const start = lines[0].toLowerCase().startsWith('student') ? 1 : 0; // skip header
    for (const line of lines.slice(start)) {
      const parts = line.split(',').map(s => s.trim());
      const sid = parseInt(parts[0], 10);
      const bal = parseFloat(parts[1]);
      if (!sid || isNaN(bal)) continue;
      rows.push({ student_id: sid, balance: bal, reference: parts[2] || 'Opening Balance' });
    }
  }

  // ── Accept JSON array ──────────────────────────────────────────────────
  if (Array.isArray(body.rows)) {
    for (const r of body.rows) {
      const sid = parseInt(r.student_id, 10);
      const bal = parseFloat(r.balance);
      if (!sid || isNaN(bal)) continue;
      rows.push({ student_id: sid, balance: bal, reference: r.reference || 'Opening Balance' });
    }
  }

  if (!rows.length) {
    return NextResponse.json({ error: 'No valid rows found in import data' }, { status: 400 });
  }

  // Validate all student IDs belong to this school (security)
  const conn = await getConnection();
  try {
    const ids = rows.map(r => r.student_id);
    const ph = ids.map(() => '?').join(',');
    const [valid]: any[] = await conn.execute(
      `SELECT id FROM students WHERE id IN (${ph}) AND school_id = ?`,
      [...ids, session.schoolId]
    );
    const validSet = new Set((valid as any[]).map((r: any) => r.id));
    const rejected = rows.filter(r => !validSet.has(r.student_id));
    rows = rows.filter(r => validSet.has(r.student_id));

    if (!rows.length) {
      return NextResponse.json({
        error: 'None of the provided student IDs belong to your school',
        rejected_count: rejected.length,
      }, { status: 400 });
    }

    const result = await bulkImportBalances(rows, session.schoolId, termId, session.userId);

    return NextResponse.json({
      ok: true,
      message: `Import complete: ${result.success} entries created, ${result.failed} failed`,
      rows_submitted: rows.length + rejected.length,
      rows_valid: rows.length,
      rows_rejected_wrong_school: rejected.length,
      ...result,
    });
  } finally {
    await conn.end();
  }
}
