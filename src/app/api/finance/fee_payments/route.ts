import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// GET /api/finance/fee_payments?student_id=&term_id=&page=&per_page&id=
//  - if id is provided return single receipt
// POST /api/finance/fee_payments { student_id, term_id, wallet_id, amount, method, paid_by, payer_contact, reference, receipt_no }
export async function GET(req: NextRequest){
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const student_id = searchParams.get('student_id');
  const term_id = searchParams.get('term_id');
  const page = parseInt(searchParams.get('page', 10)||'1');
  const per_page = parseInt(searchParams.get('per_page', 10)||'25');
  const offset = (page-1)*per_page;
  
  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    
    if(id){
      const [[receipt]]: any = await conn.execute(`
        SELECT fp.*, p.first_name, p.last_name, w.name wallet_name 
        FROM fee_payments fp 
        JOIN students s ON s.id=fp.student_id 
        JOIN people p ON p.id=s.person_id 
        JOIN wallets w ON w.id=fp.wallet_id 
        WHERE fp.id=? AND s.school_id=?
      `,[id, schoolId]);
      
      if(!receipt) return NextResponse.json({ error:'Not found' },{ status:404 });
      return NextResponse.json({ data: receipt });
    }
    
    const where: string[] = ['s.school_id = ?'];
    const params: any[] = [schoolId];
    
    if(student_id){ where.push('fp.student_id=?'); params.push(student_id); }
    if(term_id){ where.push('fp.term_id=?'); params.push(term_id); }
    
    const whereSql = 'WHERE ' + where.join(' AND ');
    const safeLimit = Math.max(1, Math.min(200, isNaN(per_page) ? 25 : per_page));
    const safeOffset = Math.max(0, isNaN(offset) ? 0 : offset);
    
    const [rows] = await conn.execute(`
      SELECT fp.id,fp.student_id,fp.term_id,fp.wallet_id,fp.amount,fp.method,fp.paid_by,fp.receipt_no,fp.created_at,p.first_name,p.last_name 
      FROM fee_payments fp 
      JOIN students s ON s.id=fp.student_id 
      JOIN people p ON p.id=s.person_id 
      ${whereSql} 
      ORDER BY fp.id DESC 
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,[...params]);
    
    const [[countRow]]: any = await conn.execute(`
      SELECT COUNT(*) total FROM fee_payments fp 
      JOIN students s ON s.id=fp.student_id 
      ${whereSql}
    `, params);
    
    return NextResponse.json({ data: rows, total: countRow.total });
  } catch (err: any) {
    console.error('[fee_payments] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}

export async function POST(req: NextRequest){
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const body = await req.json();
  const { student_id, term_id, wallet_id, amount, method, paid_by, payer_contact, reference, receipt_no, allocate=true } = body||{};
  
  if(!student_id || !term_id || !wallet_id || !amount) {
    return NextResponse.json({ error:'Missing required fields' },{ status:400 });
  }
  
  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    
    // Verify student belongs to this school
    const [[student]]: any = await conn.execute(`SELECT id FROM students WHERE id=? AND school_id=?`, [student_id, schoolId]);
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    
    await conn.beginTransaction?.();
    
    // Insert payment
    const [res]:any = await conn.execute(`
      INSERT INTO fee_payments (student_id,term_id,wallet_id,amount,method,paid_by,payer_contact,reference,receipt_no) 
      VALUES (?,?,?,?,?,?,?,?,?)
    `,[student_id,term_id,wallet_id,amount,method||null,paid_by||null,payer_contact||null,reference||null,receipt_no||null]);
    
    const paymentId = res.insertId;
    let remaining = parseFloat(amount);
    
    if(allocate){
      // Fetch unpaid items (school_id isolated)
      const [items]:any = await conn.execute(`
        SELECT id,amount,discount,paid,(amount-discount-paid) AS outstanding 
        FROM student_fee_items 
        WHERE student_id=? AND term_id=? AND school_id=? AND (amount-discount-paid) > 0 
        ORDER BY id ASC
      `,[student_id,term_id, schoolId]);
      
      for(const it of items){
        if(remaining<=0) break;
        const apply = Math.min(remaining, it.outstanding);
        await conn.execute(`UPDATE student_fee_items SET paid = paid + ? WHERE id=?`,[apply,it.id]);
        remaining -= apply;
      }
    }
    
    const [[payment]]: any = await conn.execute(`
      SELECT fp.*, p.first_name,p.last_name,w.name wallet_name 
      FROM fee_payments fp 
      JOIN students s ON s.id=fp.student_id 
      JOIN people p ON p.id=s.person_id 
      JOIN wallets w ON w.id=fp.wallet_id 
      WHERE fp.id=? AND s.school_id=?
    `,[paymentId, schoolId]);
    
    await conn.commit?.();
    return NextResponse.json({ message:'Payment recorded', data: payment });
  } catch(e:any){
    try {
      await conn.rollback?.();
    } catch {}
    console.error('[fee_payments] POST error:', e);
    return NextResponse.json({ error:e.message },{ status:500 });
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}
