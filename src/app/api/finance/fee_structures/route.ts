import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// GET /api/finance/fee_structures?class_id=&term_id=
// POST /api/finance/fee_structures { class_id, term_id, item, amount }
export async function GET(req: NextRequest){
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const class_id = searchParams.get('class_id');
  const term_id = searchParams.get('term_id');
  const where: string[] = []; const params:any[]=[];
  if(class_id){ where.push('class_id=?'); params.push(class_id); }
  if(term_id){ where.push('term_id=?'); params.push(term_id); }
  const whereSql = where.length? 'WHERE '+where.join(' AND '): '';
  const conn = await getConnection();
  const [rows]:any = await conn.execute(`SELECT id,class_id,term_id,item,amount FROM fee_structures ${whereSql} ORDER BY id DESC` , params);
  await conn.end();
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest){
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json();
  const { class_id, term_id, item, amount } = body||{};
  if(!class_id||!term_id||!item||!amount) return NextResponse.json({ error:'Missing fields' },{ status:400 });
  const conn = await getConnection();
  await conn.execute(`INSERT INTO fee_structures (class_id,term_id,item,amount) VALUES (?,?,?,?)`,[class_id,term_id,item,amount]);
  const [rows]:any = await conn.execute(`SELECT id,class_id,term_id,item,amount FROM fee_structures ORDER BY id DESC LIMIT 1`);
  await conn.end();
  return NextResponse.json({ message:'Fee item added', data: rows[0] });
}
