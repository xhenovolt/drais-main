import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// GET    /api/finance/fee-items             → list fee items (filter: class_id, program_id, term_id)
// POST   /api/finance/fee-items             → create fee item
// PATCH  /api/finance/fee-items?id=N        → update fee item
// DELETE /api/finance/fee-items?id=N        → deactivate fee item

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const classId   = searchParams.get('class_id');
  const programId = searchParams.get('program_id');
  const termId    = searchParams.get('term_id');
  const active    = searchParams.get('active') !== 'false'; // default: true

  const conn = await getConnection();
  try {
    let sql = `
      SELECT fi.*, fa.name AS account_name, c.name AS class_name, p.name AS program_name
      FROM finance_fee_items fi
      LEFT JOIN finance_accounts fa  ON fi.account_id  = fa.id
      LEFT JOIN classes c            ON fi.class_id    = c.id
      LEFT JOIN programs p           ON fi.program_id  = p.id
      WHERE fi.school_id = ?
    `;
    const params: any[] = [session.schoolId];

    if (active) { sql += ' AND fi.is_active = 1'; }
    if (classId) { sql += ' AND (fi.class_id IS NULL OR fi.class_id = ?)'; params.push(+classId); }
    if (programId) { sql += ' AND (fi.program_id IS NULL OR fi.program_id = ?)'; params.push(+programId); }
    if (termId) { sql += ' AND (fi.term_id IS NULL OR fi.term_id = ?)'; params.push(+termId); }

    sql += ' ORDER BY fi.class_id, fi.name';

    const [rows] = await conn.execute(sql, params);
    return NextResponse.json(rows);
  } finally {
    await conn.end();
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { name, amount, class_id, program_id, term_id, account_id, description } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!amount || isNaN(+amount) || +amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const conn = await getConnection();
  try {
    const [result]: any = await conn.execute(
      `INSERT INTO finance_fee_items
         (name, amount, class_id, program_id, term_id, school_id, account_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(), +amount,
        class_id ? +class_id : null,
        program_id ? +program_id : null,
        term_id ? +term_id : null,
        session.schoolId,
        account_id ? +account_id : null,
        description ?? null,
      ]
    );
    return NextResponse.json({ id: result.insertId, name, amount: +amount }, { status: 201 });
  } finally {
    await conn.end();
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id', 10) ?? '0');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const allowed = ['name', 'amount', 'class_id', 'program_id', 'term_id', 'account_id', 'description', 'is_active'];
  const updates: string[] = [];
  const vals: any[] = [];

  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`);
      vals.push(body[key] === '' ? null : body[key]);
    }
  }
  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  vals.push(id, session.schoolId);

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE finance_fee_items SET ${updates.join(', ')} WHERE id = ? AND school_id = ?`,
      vals
    );
    return NextResponse.json({ ok: true });
  } finally {
    await conn.end();
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id', 10) ?? '0');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE finance_fee_items SET is_active = 0 WHERE id = ? AND school_id = ?`,
      [id, session.schoolId]
    );
    return NextResponse.json({ ok: true });
  } finally {
    await conn.end();
  }
}
