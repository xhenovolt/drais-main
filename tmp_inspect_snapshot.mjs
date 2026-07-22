import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { computeDivision, computeAggregateFromGrades, gradeForScore } from './src/lib/reports/canonical-report-engine.js';
import { computeAssessmentRawValues } from './src/lib/drce/assessmentUtils.js';
import { getContributingAssessmentResults } from './src/lib/snapshots/assessment.js';

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
const [rows] = await conn.execute('SELECT snapshot_json FROM report_snapshots WHERE snapshot_id = ? LIMIT 1', [snapshotId]);
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('Snapshot not found');
  process.exit(1);
}
const snap = JSON.parse(rows[0].snapshot_json);
console.log('snapshotId', snapshotId, 'meta.type', snap.meta?.type, 'meta.language', snap.meta?.language, 'classes', snap.classes?.length);
let mismatchCount = 0;
let total10 = 0;
for (const cls of snap.classes ?? []) {
  for (const stu of cls.students ?? []) {
    const contributing = getContributingAssessmentResults(stu.results ?? [], cls.subjects ?? []);
    const drceAssessment = computeAssessmentRawValues(contributing);
    const grades = contributing.map((r) => r.grade || gradeForScore(r.score ?? 0, false));
    const agg = computeAggregateFromGrades(grades);
    const div = computeDivision(agg, { boundaries:[12,24,28,32], labels:['Division I','Division II','Division III','Division IV','Division U'] });
    if (agg === 10) total10 += 1;
    if ((drceAssessment.aggregate !== agg) || (drceAssessment.division !== div)) {
      mismatchCount += 1;
      if (mismatchCount <= 20) {
        console.log('MISMATCH', {
          classId: cls.classId,
          className: cls.className,
          studentDbId: stu.studentDbId,
          name: stu.name,
          grades,
          agg,
          div,
          drceAggregate: drceAssessment.aggregate,
          drceDivision: drceAssessment.division,
          contributingSubjectCount: contributing.length,
        });
      }
    }
  }
}
console.log('total10', total10, 'mismatchCount', mismatchCount);
await conn.end();
