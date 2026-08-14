import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const cols = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='students'
        AND COLUMN_NAME IN ('deleted_at','deleted_by','delete_reason','restored_at','restored_by','updated_at')`) as any[];
  console.log('students delete-metadata columns:', cols.map((c:any)=>c.COLUMN_NAME).join(', ') || '(none beyond deleted_at?)');
  const n = await query(`SELECT COUNT(*) c FROM students WHERE deleted_at IS NOT NULL`) as any[];
  console.log('soft-deleted students platform-wide:', n[0].c);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
