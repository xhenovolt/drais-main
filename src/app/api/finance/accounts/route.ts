import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// GET  /api/finance/accounts         → list accounts for school
// POST /api/finance/accounts         → create new account
// DELETE /api/finance/accounts?id=N  → deactivate account

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const conn = await getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT id, name, type, description, is_active, created_at
       FROM finance_accounts
       WHERE school_id = ? ORDER BY type, name`,
      [session.schoolId]
    );
    return NextResponse.json(rows);
  } finally {
    await conn.end();
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { name, type, description } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  const validTypes = ['income', 'liability', 'clearing', 'asset'];
  if (type && !validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const conn = await getConnection();
  try {
    const [result]: any = await conn.execute(
      `INSERT INTO finance_accounts (name, type, school_id, description)
       VALUES (?, ?, ?, ?)`,
      [name.trim(), type || 'income', session.schoolId, description ?? null]
    );
    return NextResponse.json({ id: result.insertId, name, type: type || 'income' }, { status: 201 });
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
      `UPDATE finance_accounts SET is_active = 0 WHERE id = ? AND school_id = ?`,
      [id, session.schoolId]
    );
    return NextResponse.json({ ok: true });
  } finally {
    await conn.end();
  }
}
