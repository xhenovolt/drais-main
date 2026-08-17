import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { setDbMode } from '../../src/lib/db/db-mode.ts';
setDbMode('online');
import { query } from '../../src/lib/db.ts';
import { ensureResultsSubmissionLogSchema, logResultsSubmission } from '../../src/lib/academics/results-submission-log.ts';
import { observeAcademics } from '../../src/lib/sentinel/observers/academics.ts';

function ok(label, cond) { console.log(`  ${cond ? '✔' : '✖'} ${label}`); if (!cond) process.exitCode = 1; }

async function main() {
  await ensureResultsSubmissionLogSchema();
  const tables = await query(`SHOW TABLES LIKE 'results_submission_log'`);
  ok('results_submission_log table exists', tables.length === 1);

  const school = (await query(`SELECT id FROM schools WHERE deleted_at IS NULL LIMIT 1`))[0];

  // Simulate 3 failed manual submissions for this school (crosses the n>=3 -> high threshold)
  for (let i = 0; i < 3; i++) {
    await logResultsSubmission({
      schoolId: Number(school.id), route: 'submit', status: 'failed',
      classId: 1, subjectId: 1, errorMessage: 'Synthetic verification failure — DB constraint violation',
    });
  }
  // And one clean success, to prove success rows don't trigger anything.
  await logResultsSubmission({ schoolId: Number(school.id), route: 'submit', status: 'success', insertedCount: 25, ignoredCount: 2 });

  const rows = await query(`SELECT * FROM results_submission_log WHERE school_id = ? ORDER BY id DESC LIMIT 5`, [school.id]);
  ok('4 rows persisted (3 failed + 1 success)', rows.length === 4);

  const observations = await observeAcademics();
  const found = observations.find((o) => o.kind === 'academic_manual_submission_failure' && o.schoolId === Number(school.id));
  ok('observeAcademics() picks up the synthetic failures', !!found);
  ok('severity escalates to high at n=3', found?.severity === 'high');
  console.log('  → observation:', JSON.stringify(found, null, 2));

  // Cleanup — remove the synthetic rows so this school's real Sentinel state isn't polluted.
  await query(`DELETE FROM results_submission_log WHERE school_id = ? AND error_message LIKE 'Synthetic verification%'`, [school.id]);
  await query(`DELETE FROM results_submission_log WHERE school_id = ? AND inserted_count = 25 AND ignored_count = 2`, [school.id]);
  console.log('  → synthetic rows cleaned up.');
}
main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error('FAILED', e); process.exit(1); });
