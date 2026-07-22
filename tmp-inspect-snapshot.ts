import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { computeDivision, computeAggregateFromGrades, gradeForScore } from './src/lib/reports/canonical-report-engine';

dotenv.config({ path: '.env.local' });
const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || process.env.TIDB_DATABASE || 'drais',
  ssl: { rejectUnauthorized: false },
});
const snapshotId = 'b9b303ed-e832-425a-b717-11a3181c1cb3';
const [rows] = await conn.execute(`SELECT snapshot_json FROM report_snapshots WHERE snapshot_id = ? LIMIT 1`, [snapshotId]);
const snap = JSON.parse((rows as any)[0].snapshot_json);
function getSubjectById(cls: any, id: number) {
  return cls.subjects.find((s: any) => s.id === id);
}
const issues: any[] = [];
for (const cls of snap.classes) {
  for (const stu of cls.students) {
    const contributing = (stu.results || []).filter((r: any) => {
      const subj = getSubjectById(cls, r.subjectId);
      return subj && subj.subjectType === 'primary' && !/ire/i.test(r.subjectName);
    });
    const grades = contributing.map((r: any) => r.grade || gradeForScore(r.score ?? 0, false));
    const agg = computeAggregateFromGrades(grades);
    const div = computeDivision(agg, { boundaries:[12,24,28,32], labels:['Division I','Division II','Division III','Division IV','Division U'] });
    if (agg <= 12 && div !== 'Division I') {
      issues.push({ classId: cls.classId, className: cls.className, studentDbId: stu.studentDbId, name: stu.name, agg, div, grades });
    }
  }
}
console.log('issues count', issues.length);
console.log(JSON.stringify(issues.slice(0,20), null, 2));
await conn.end();
