import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// POST /api/finance/pay_fee_item { fee_item_id, wallet_id, amount, method, paid_by, receipt_no, reference, category_id }
// Atomically pays a specific student_fee_item (no spreading across items)
export async function POST(req: NextRequest){
  const body = await req.json();
  const { fee_item_id, wallet_id = 1, amount, method, paid_by, receipt_no, reference, category_id } = body||{};
  if(!fee_item_id || !amount) return NextResponse.json({ error:'fee_item_id and amount are required' },{ status:400 });
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    await conn.beginTransaction?.();
    const [[item]]: any = await conn.execute(`SELECT id, student_id, term_id, item, amount, discount, paid, (amount-discount-paid) AS outstanding FROM student_fee_items WHERE id=? FOR UPDATE`,[fee_item_id]);
    if(!item) throw new Error('Fee item not found');
    if(parseFloat(amount) <=0 ) throw new Error('Invalid amount');
    if(parseFloat(amount) > parseFloat(item.outstanding)) throw new Error('Amount exceeds outstanding');
    // Insert payment
    const [payRes]: any = await conn.execute(`INSERT INTO fee_payments (student_id,term_id,wallet_id,amount,method,paid_by,reference,receipt_no) VALUES (?,?,?,?,?,?,?,?)`,[item.student_id,item.term_id,wallet_id,amount,method||null,paid_by||null,reference||`Fee:${item.item}`,receipt_no||null]);
    const payment_id = payRes.insertId;
    // Update fee item paid
    await conn.execute(`UPDATE student_fee_items SET paid = paid + ? WHERE id=?`,[amount, fee_item_id]);
    // Optional ledger entry if category provided
    if(category_id){
      await conn.execute(`INSERT INTO ledger (school_id,wallet_id,category_id,tx_type,amount,reference,description,student_id) VALUES (?,?,?,?,?,?,?,?)`,[null,wallet_id,category_id,'credit',amount,reference||`Fee:${item.item}`,`Payment for fee item ${item.item}`,item.student_id]);
    }
    const [[updated]]: any = await conn.execute(`SELECT id, student_id, term_id, item, amount, discount, paid, (amount-discount-paid) AS balance FROM student_fee_items WHERE id=?`,[fee_item_id]);
    await conn.commit?.();
    await conn.end();
    return NextResponse.json({ message:'Payment successful', payment_id, item: updated });
  } catch(e:any){
    await conn.rollback?.();
    await conn.end();
    return NextResponse.json({ error:e.message },{ status:400 });
  }
}
