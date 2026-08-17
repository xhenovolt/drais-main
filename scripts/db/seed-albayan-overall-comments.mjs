#!/usr/bin/env node
/**
 * Seed Albayan's (school_id 8002) overall report comments THROUGH the
 * Intelligent Overall-Comment engine (`report_overall_comment_rules` —
 * see src/lib/drce/overallComments.server.ts / commentEngine.ts), keyed on
 * the learner's DIVISION rather than a raw average — this is what the
 * report cards are actually meant to depend on.
 *
 * Division labels come straight from src/lib/reports/canonical-report-engine.ts
 * (DEFAULT_DIVISION_CONFIG): 'Division I' | 'Division II' | 'Division III' |
 * 'Division IV' | 'Division U' for non-nursery classes, and a letter grade
 * 'A'..'E' (getNurseryOverallGrade) for nursery classes.
 *
 * Idempotent: deletes any existing classTeacher/dos/headTeacher rules for
 * this school before inserting, so re-running replaces the seed cleanly
 * without duplicating rows or touching rules for other schools.
 *
 *   node --env-file=.env.local scripts/db/seed-albayan-overall-comments.mjs            # online TiDB
 *   node --env-file=.env.local scripts/db/seed-albayan-overall-comments.mjs --local    # local MySQL
 */
import mysql from 'mysql2/promise';
import { loadEnv, onlineConfig, localConfig } from './_shared.mjs';

loadEnv();
const SCHOOL_ID = 8002;
const useLocal = process.argv.includes('--local');

// Each entry: division value the rule matches on, plus per-role English/Arabic text.
const DIVISION_COMMENTS = [
  {
    division: 'Division I',
    classTeacher: { en: 'Brilliant!! All my hopes are in you — keep this outstanding standard up.', ar: 'عمل رائع! كل آمالي معلقة عليك، استمر بهذا التميز.' },
    dos:          { en: 'Outstanding results, Division I — stay focused and keep this excellent momentum.', ar: 'نتائج متميزة في القسم الأول، استمر بنفس التركيز.' },
    headTeacher:  { en: 'Excellent achievement! You are a role model to your peers — keep up this great work.', ar: 'إنجاز ممتاز! أنت قدوة لزملائك، استمر بهذا العمل الرائع.' },
  },
  {
    division: 'Division II',
    classTeacher: { en: 'Very promising results — stay focused and aim for Division I next term.', ar: 'نتائج واعدة جداً، استمر بنفس التركيز للوصول إلى القسم الأول.' },
    dos:          { en: 'Very good performance, Division II — keep up the consistent effort.', ar: 'أداء جيد جداً في القسم الثاني، واصل بذل الجهد.' },
    headTeacher:  { en: 'You are first-grade material — keep more focused to reach the top.', ar: 'أنت من الطلبة المتميزين، ركّز أكثر للوصول إلى القمة.' },
  },
  {
    division: 'Division III',
    classTeacher: { en: 'Good effort — improve on your weaker subjects to move up a division.', ar: 'جهد جيد، حسّن في المواد الأضعف للانتقال إلى قسم أعلى.' },
    dos:          { en: 'A fair performance, Division III — more consistent work is needed.', ar: 'أداء مقبول في القسم الثالث، يلزم مزيد من الانتظام في العمل.' },
    headTeacher:  { en: 'You need to be more active in class discussions and revision to improve.', ar: 'عليك أن تكون أكثر نشاطاً في المناقشات الصفية والمراجعة لتتحسن.' },
  },
  {
    division: 'Division IV',
    classTeacher: { en: 'You have to be more active in your discussion groups and revise more.', ar: 'عليك أن تكون أكثر نشاطاً في المجموعات الدراسية والمراجعة.' },
    dos:          { en: 'More effort is needed from you to raise your division next term.', ar: 'يلزم بذل مزيد من الجهد لرفع قسمك في الفصل القادم.' },
    headTeacher:  { en: 'You are capable of improving — just stay more focused on your studies.', ar: 'أنت قادر على التحسن، فقط ركّز أكثر في دراستك.' },
  },
  {
    division: 'Division U',
    classTeacher: { en: 'More concentration and effort is needed from you to perform better.', ar: 'التركيز والجهد الإضافي مطلوبان منك لتحسين أدائك.' },
    dos:          { en: 'Work very hard to improve your performance — extra support is available.', ar: 'اجتهد كثيراً لتحسين أدائك، الدعم الإضافي متاح لك.' },
    headTeacher:  { en: "Concentrate more on your academics; let's meet to plan how to help you improve.", ar: 'ركّز أكثر على دراستك، دعنا نجتمع لنخطط لمساعدتك على التحسن.' },
  },
  // Nursery overall grades (A best .. E weakest) — getNurseryOverallGrade().
  {
    division: 'A',
    classTeacher: { en: 'Excellent performance! Keep up the great work.', ar: 'أداء ممتاز! استمر بهذا العمل الرائع.' },
    dos:          { en: 'Outstanding achievement in all areas of learning.', ar: 'إنجاز متميز في جميع المجالات.' },
    headTeacher:  { en: 'An exceptional learner — continue to excel.', ar: 'متعلم استثنائي، استمر في التفوق.' },
  },
  {
    division: 'B',
    classTeacher: { en: 'Very good work — aim for excellence next term.', ar: 'عمل جيد جداً، اسعَ للتميز في الفصل القادم.' },
    dos:          { en: 'Good progress, keep working hard.', ar: 'تقدم جيد، واصل الاجتهاد.' },
    headTeacher:  { en: 'Well done — you can achieve even more.', ar: 'أحسنت، بإمكانك تحقيق المزيد.' },
  },
  {
    division: 'C',
    classTeacher: { en: 'Satisfactory progress — more effort is needed.', ar: 'تقدم مقبول، يلزم مزيد من الجهد.' },
    dos:          { en: 'Average performance, with room for improvement.', ar: 'أداء متوسط، هناك مجال للتحسن.' },
    headTeacher:  { en: 'Work harder to improve your performance.', ar: 'اجتهد أكثر لتحسين أدائك.' },
  },
  {
    division: 'D',
    classTeacher: { en: 'Needs more attention and practice at home and school.', ar: 'يحتاج إلى مزيد من الانتباه والتدريب.' },
    dos:          { en: 'Below average — requires extra support.', ar: 'دون المتوسط، يحتاج دعماً إضافياً.' },
    headTeacher:  { en: 'More focus and effort is needed from you.', ar: 'يلزم مزيد من التركيز والجهد منك.' },
  },
  {
    division: 'E',
    classTeacher: { en: 'Requires immediate intervention and close support.', ar: 'يحتاج إلى تدخل فوري ومتابعة قريبة.' },
    dos:          { en: "Needs significant improvement — let's work together.", ar: 'يحتاج إلى تحسن كبير، لنعمل معاً.' },
    headTeacher:  { en: 'Extra help and close attention is required for this learner.', ar: 'مطلوب مساعدة إضافية ومتابعة دقيقة لهذا المتعلم.' },
  },
];

const ROLES = ['classTeacher', 'dos', 'headTeacher'];

async function main() {
  const cfg = useLocal ? localConfig() : onlineConfig();
  const conn = await mysql.createConnection(cfg);
  console.log(`Connected (${useLocal ? 'local' : 'online'}). Seeding overall comment rules for school_id=${SCHOOL_ID}...`);

  await conn.execute(
    `CREATE TABLE IF NOT EXISTS report_overall_comment_rules (
       id                BIGINT        NOT NULL AUTO_INCREMENT,
       school_id         BIGINT        NOT NULL,
       role              VARCHAR(24)   NOT NULL,
       template_id       BIGINT        NULL,
       custom_key        VARCHAR(64)   NULL,
       mode              VARCHAR(8)    NOT NULL DEFAULT 'replace',
       condition_json    JSON          NULL,
       comment_text      TEXT          NOT NULL,
       comment_text_ar   TEXT          NULL,
       priority          INT           NOT NULL DEFAULT 100,
       is_active         TINYINT       NOT NULL DEFAULT 1,
       created_by        BIGINT        NULL,
       created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       KEY idx_school_role_active (school_id, role, is_active)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );

  // Idempotent replace: clear this school's unscoped (template_id IS NULL)
  // rules for the three built-in roles, then re-insert the full seed.
  const [delResult] = await conn.execute(
    `DELETE FROM report_overall_comment_rules
       WHERE school_id = ? AND template_id IS NULL AND role IN ('classTeacher','dos','headTeacher')`,
    [SCHOOL_ID],
  );
  console.log(`Cleared ${delResult.affectedRows ?? 0} existing rule(s).`);

  let inserted = 0;
  for (const row of DIVISION_COMMENTS) {
    const condition = {
      kind: 'compare',
      left: 'division',
      op: '==',
      right: { kind: 'literal', value: row.division },
    };
    for (const role of ROLES) {
      const text = row[role];
      await conn.execute(
        `INSERT INTO report_overall_comment_rules
           (school_id, role, template_id, custom_key, mode, condition_json, comment_text, comment_text_ar, priority, is_active)
         VALUES (?, ?, NULL, NULL, 'replace', ?, ?, ?, ?, 1)`,
        [SCHOOL_ID, role, JSON.stringify(condition), text.en, text.ar, 10],
      );
      inserted += 1;
    }
  }

  console.log(`Inserted ${inserted} overall comment rule(s) for school_id=${SCHOOL_ID}.`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
