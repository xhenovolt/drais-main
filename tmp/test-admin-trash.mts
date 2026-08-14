import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { listTrash } from '@/lib/trash/service';

async function main() {
  // Find a school that actually has soft-deleted students.
  const sch = await query(
    `SELECT school_id, COUNT(*) c FROM students WHERE deleted_at IS NOT NULL
      GROUP BY school_id ORDER BY c DESC LIMIT 1`) as any[];
  if (!sch.length) { console.log('no soft-deleted students anywhere'); return; }
  const schoolId = Number(sch[0].school_id);
  console.log(`testing /admin/trash for school ${schoolId} (${sch[0].c} soft-deleted students)\n`);

  try {
    const all = await listTrash({ schoolId, page: 1, limit: 50 } as any);
    console.log(`listTrash(all): total=${all.total}, returned=${all.items.length}`);
    const byEntity: Record<string, number> = {};
    for (const it of all.items) byEntity[(it as any).entity] = (byEntity[(it as any).entity] || 0) + 1;
    console.log('  entities on page 1:', JSON.stringify(byEntity));
    console.log('  sample:', all.items.slice(0, 3).map((i: any) => `${i.entity}#${i.id} "${i.label}"`).join(' | '));

    const students = await listTrash({ schoolId, entity: 'student', page: 1, limit: 50 } as any);
    console.log(`\nlistTrash(student): total=${students.total}, returned=${students.items.length}`);
    console.log('  sample:', students.items.slice(0, 3).map((i: any) => `#${i.id} "${i.label}" (${i.subtitle})`).join(' | '));

    console.log(`\nVERDICT: ${all.total > 0 && students.total > 0 ? 'WORKS ✓ — trash returns soft-deleted rows' : 'BROKEN ✗'}`);
  } catch (e: any) {
    console.log('listTrash THREW:', e.message);
    console.log('\nVERDICT: BROKEN ✗ (exception)');
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
