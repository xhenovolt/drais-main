import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// GET /api/finance/ledger?wallet_id=&student_id=&page=&per_page=
// POST /api/finance/ledger { wallet_id, category_id, tx_type, amount, reference, description, student_id, staff_id }
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const wallet_id = searchParams.get('wallet_id');
  const student_id = searchParams.get('student_id');
  const page = parseInt(searchParams.get('page', 10)||'1');
  const per_page = parseInt(searchParams.get('per_page', 10)||'25');
  const offset = (page-1)*per_page;
  const where: string[] = [];
  const params: any[] = [];
  if(wallet_id){ where.push('l.wallet_id=?'); params.push(wallet_id); }
  if(student_id){ where.push('l.student_id=?'); params.push(student_id); }
  const whereSql = where.length? 'WHERE '+where.join(' AND '):'';
  const safePer_page = Math.max(1, Math.min(1000, Number(per_page) || 25));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const conn = await getConnection();
  const [rows] = await conn.execute(`SELECT l.id,l.wallet_id,w.name wallet_name,l.category_id,l.tx_type,l.amount,l.reference,l.description,l.student_id,l.staff_id,l.created_at FROM ledger l JOIN wallets w ON w.id=l.wallet_id ${whereSql} ORDER BY l.id DESC LIMIT ${safePer_page} OFFSET ${safeOffset}`,params);
  const [[countRow]]: any = await conn.execute(`SELECT COUNT(*) total FROM ledger l ${whereSql}`,params);
  await conn.end();
  return NextResponse.json({ data: rows, total: countRow.total });
}

export async function POST(req: NextRequest){
  const body = await req.json();
  const { wallet_id, category_id, tx_type, amount, reference, description, student_id, staff_id } = body||{};
  if(!wallet_id || !category_id || !tx_type || !amount) return NextResponse.json({ error:'Missing required fields' },{ status:400 });
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    connection = await getConnection();
    const [result] = await connection.execute(`
      INSERT INTO ledger (wallet_id, category_id, tx_type, amount, reference, description, student_id, staff_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      wallet_id, category_id, tx_type, amount,
      reference || null, description || null, student_id || null, staff_id || null
    ]);

    // Log action
    await connection.execute(`
      INSERT INTO finance_actions (school_id, actor_user_id, action, entity_type, entity_id, metadata)
      VALUES (?, ?, 'manual_ledger_entry', 'ledger', ?, ?)
    `, [1, 1, result.insertId, JSON.stringify({ amount, tx_type, reference })]);

    return NextResponse.json({
      success: true,
      message: 'Ledger entry created successfully',
      data: { id: result.insertId }
    });

  } catch (error: any) {
    console.error('Ledger creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create ledger entry'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
