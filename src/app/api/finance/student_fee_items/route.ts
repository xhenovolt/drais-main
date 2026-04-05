import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// GET /api/finance/student_fee_items?student_id=&term_id=&class_id=&page=&per_page=&unbalanced=1
// POST { student_id, term_id, item, amount, discount } -> create student fee item
// POST { action: 'seed', class_id, term_id } -> seed for all class enrollees
// PATCH { id, discount, paid } -> update discount or manually adjust paid
export async function GET(req: NextRequest){
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { searchParams } = new URL(req.url);
  const student_id = searchParams.get('student_id');
  const term_id = searchParams.get('term_id');
  const class_id = searchParams.get('class_id');
  const page = parseInt(searchParams.get('page', 10)||'1');
  const per_page = parseInt(searchParams.get('per_page', 10)||'50');
  const unbalanced = searchParams.get('unbalanced');
  const offset=(page-1)*per_page;
  
  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const where:string[]=['st.school_id = ?']; 
    const params:any[]=[schoolId];
    
    if(student_id){ where.push('sfi.student_id=?'); params.push(student_id);} 
    if(term_id){ where.push('sfi.term_id=?'); params.push(term_id);} 
    if(class_id){
      where.push('sfi.student_id IN (SELECT student_id FROM enrollments WHERE class_id=? AND school_id=?'+(term_id? ' AND term_id=?':'')+')');
      params.push(class_id); params.push(schoolId); 
      if(term_id) params.push(term_id);
    }
    if(unbalanced){ where.push('(sfi.amount - sfi.discount - sfi.paid) > 0'); }
    
    const whereSql = 'WHERE ' + where.join(' AND ');
    const safeLimit = Math.max(1, Math.min(200, isNaN(per_page) ? 50 : per_page));
    const safeOffset = Math.max(0, isNaN(offset) ? 0 : offset);
    
    const [rows]:any = await conn.execute(`
      SELECT sfi.id,sfi.student_id,sfi.term_id,sfi.item,sfi.amount,sfi.discount,sfi.paid,sfi.balance,p.first_name,p.last_name 
      FROM student_fee_items sfi 
      JOIN students st ON st.id=sfi.student_id 
      JOIN people p ON p.id=st.person_id 
      ${whereSql} 
      ORDER BY sfi.id DESC 
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,[...params]);
    
    const [[countRow]]:any = await conn.execute(`
      SELECT COUNT(*) total FROM student_fee_items sfi 
      JOIN students st ON st.id=sfi.student_id 
      ${whereSql}
    `, params);
    
    return NextResponse.json({ data: rows, total: countRow.total });
  } catch (err: any) {
    console.error('[student_fee_items] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
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
  const schoolId = session.schoolId;
  const conn = await getConnection();
  
  try {
    if(body?.action==='seed'){
      const { class_id, term_id } = body;
      if(!class_id||!term_id) return NextResponse.json({ error:'class_id & term_id required' },{ status:400 });
      
      // Verify class belongs to this school
      const [[classExists]]: any = await conn.execute(
        `SELECT id FROM classes WHERE id=? AND school_id=?`, 
        [class_id, schoolId]
      );
      if (!classExists) return NextResponse.json({ error:'Class not found' },{ status:404 });
      
      // Fetch students enrolled (school_id isolated)
      const [students]:any = await conn.execute(`
        SELECT DISTINCT e.student_id FROM enrollments e 
        WHERE e.class_id=? AND e.term_id=? AND e.status='active' AND e.school_id=?
      `,[class_id,term_id, schoolId]);
      
      if(students.length===0){ 
        return NextResponse.json({ inserted:0, message:'No enrolled students' }); 
      }
      
      // Fetch fee structure items (school_id isolated)
      const [items]:any = await conn.execute(`
        SELECT item, amount FROM fee_structures 
        WHERE class_id=? AND term_id=? AND school_id=?
      `,[class_id,term_id, schoolId]);
      
      if(items.length===0){ 
        return NextResponse.json({ inserted:0, message:'No fee structure items' }); 
      }
      
      // Existing fee items
      const studentIds = students.map((s:any)=>s.student_id);
      const [existing]:any = await conn.execute(`
        SELECT student_id,item FROM student_fee_items 
        WHERE term_id=? AND student_id IN (${studentIds.map(()=>'?').join(',')})
      `,[term_id, ...studentIds]);
      
      const existingSet = new Set(existing.map((r:any)=>`${r.student_id}__${r.item}`));
      const toInsert:any[]=[];
      
      for(const s of students){
        for(const it of items){
          const key=`${s.student_id}__${it.item}`;
          if(!existingSet.has(key)) toInsert.push([s.student_id, term_id, it.item, it.amount]);
        }
      }
      
      let inserted=0;
      if(toInsert.length){
        const chunks:number = Math.ceil(toInsert.length/500);
        for(let i=0;i<chunks;i++){
          const slice = toInsert.slice(i*500,(i+1)*500);
          const placeholders = slice.map(()=>'(?,?,?,?,0,0)').join(',');
          // columns: student_id, term_id, item, amount, discount, paid
          const flat = slice.flatMap(r=>[r[0],r[1],r[2],r[3]]);
          await conn.execute(`
            INSERT INTO student_fee_items (student_id,term_id,item,amount,discount,paid) 
            VALUES ${placeholders}
          `, flat);
        }
        inserted=toInsert.length;
      }
      return NextResponse.json({ message:'Seed complete', inserted });
    }
    
    // Create single fee item
    const { student_id, term_id, item, amount, discount=0 } = body||{};
    if(!student_id||!term_id||!item||!amount) return NextResponse.json({ error:'Missing fields' },{ status:400 });
    
    // Verify student belongs to this school
    const [[student]]: any = await conn.execute(
      `SELECT id FROM students WHERE id=? AND school_id=?`, 
      [student_id, schoolId]
    );
    if (!student) return NextResponse.json({ error:'Student not found' },{ status:404 });
    
    await conn.execute(`
      INSERT INTO student_fee_items (student_id,term_id,item,amount,discount,paid) 
      VALUES (?,?,?,?,?,0)
    `,[student_id,term_id,item,amount,discount]);
    
    const [rows]:any = await conn.execute(`
      SELECT id,student_id,term_id,item,amount,discount,paid,balance 
      FROM student_fee_items 
      WHERE student_id=? AND term_id=?
      ORDER BY id DESC LIMIT 1
    `,[student_id,term_id]);
    
    return NextResponse.json({ message:'Student fee item added', data: rows[0] });
  } catch (err: any) {
    console.error('[student_fee_items] POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}

export async function PATCH(req: NextRequest){
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const body = await req.json();
  const { id, discount, paid } = body||{};
  if(!id) return NextResponse.json({ error:'Missing id' },{ status:400 });
  
  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const sets:string[]=[]; 
    const params:any[]=[];
    
    if(discount!==undefined){ sets.push('discount=?'); params.push(discount); }
    if(paid!==undefined){ sets.push('paid=?'); params.push(paid); }
    if(!sets.length) return NextResponse.json({ error:'Nothing to update' },{ status:400 });
    
    params.push(id);
    
    await conn.execute(`
      UPDATE student_fee_items 
      SET ${sets.join(', ')} 
      WHERE id=?
    `,params);
    
    const [[row]]:any = await conn.execute(`
      SELECT id,student_id,term_id,item,amount,discount,paid,balance 
      FROM student_fee_items 
      WHERE id=?
    `,[id]);
    
    if (!row) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    
    return NextResponse.json({ message:'Updated', data: row });
  } catch (err: any) {
    console.error('[student_fee_items] PATCH error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (conn) {
      try { await conn.end(); } catch {}
    }
  }
}
