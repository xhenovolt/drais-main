const fs = require('fs');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const xlsx = require('xlsx');

const SCHOOL_ID = 12020;
const SOURCE = 'BACKUP/samples/DRAIS LIST.xlsx';

const clean = value => String(value ?? '').trim();
const norm = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

async function main() {
  console.error('[nakifuma] starting');
  const env = dotenv.parse(fs.readFileSync('.env.local', 'utf8'));
  const db = await mysql.createConnection({
    host: env.TIDB_HOST,
    port: Number(env.TIDB_PORT),
    user: env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    database: env.TIDB_DB,
    charset: 'utf8mb4',
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000,
  });
  console.error('[nakifuma] connected');

  try {
    const workbook = xlsx.readFile(SOURCE);
    const source = xlsx.utils.sheet_to_json(workbook.Sheets.Student_info_report202609161511, { defval: '' });
    console.error(`[nakifuma] source rows: ${source.length}`);
    const [students] = await db.execute(`
      SELECT s.id, s.admission_no, s.class_id, p.first_name, p.last_name, p.other_name
        FROM students s JOIN people p ON p.id = s.person_id
       WHERE s.school_id = ? AND s.deleted_at IS NULL
    `, [SCHOOL_ID]);
    const [classes] = await db.execute(
      'SELECT id, name FROM classes WHERE school_id = ? AND deleted_at IS NULL', [SCHOOL_ID],
    );
    const [years] = await db.execute(
      "SELECT id, name, status FROM academic_years WHERE school_id = ? ORDER BY (status = 'active') DESC, id DESC LIMIT 1",
      [SCHOOL_ID],
    );
    const [terms] = await db.execute(
      'SELECT id, name, is_active FROM terms WHERE school_id = ? ORDER BY is_active DESC, id DESC LIMIT 1',
      [SCHOOL_ID],
    );
    const [existing] = await db.execute(
      'SELECT id, student_id, class_id, academic_year_id, term_id, status FROM enrollments WHERE school_id = ? AND student_id IN (SELECT id FROM students WHERE school_id = ? AND deleted_at IS NULL)',
      [SCHOOL_ID, SCHOOL_ID],
    );

    const studentsByAdmission = new Map(students.map(row => [norm(row.admission_no), row]));
    const classesByName = new Map(classes.map(row => [norm(row.name), row]));
    const year = years[0];
    const term = terms[0];
    if (!year || !term) throw new Error(`Missing academic year or term (year=${!!year}, term=${!!term})`);

    const missing = [];
    const conflicts = [];
    const pending = [];
    for (const row of source) {
      const student = studentsByAdmission.get(norm(row['REG NO']));
      const className = /^S([1-6])$/i.test(clean(row.Class)) ? `Senior ${clean(row.Class).slice(1)}` : clean(row.Class);
      const classRow = classesByName.get(norm(className));
      if (!student || !classRow) {
        missing.push({ admissionNo: row['REG NO'], student: !!student, className, class: !!classRow });
        continue;
      }
      const rows = existing.filter(e => Number(e.student_id) === Number(student.id) && Number(e.term_id) === Number(term.id));
      const active = rows.find(e => e.status === 'active');
      if (active && Number(active.class_id) !== Number(classRow.id)) {
        conflicts.push({ admissionNo: row['REG NO'], existingClassId: active.class_id, sourceClass: className });
      } else if (!active) {
        pending.push({ studentId: student.id, classId: classRow.id });
      }
    }

    const summary = {
      schoolId: SCHOOL_ID,
      sourceRows: source.length,
      liveStudents: students.length,
      academicYear: year,
      term,
      existingEnrollments: existing.length,
      pendingEnrollments: pending.length,
      missing: missing.length,
      conflicts: conflicts.length,
    };
    if (missing.length || conflicts.length) {
      console.log(JSON.stringify({ ...summary, missing: missing.slice(0, 20), conflicts: conflicts.slice(0, 20), applied: false }, null, 2));
      throw new Error('Enrollment backfill refused because matches or existing classes are not fully safe.');
    }

    await db.beginTransaction();
    for (const item of pending) {
      await db.execute(`
        INSERT INTO enrollments
          (school_id, student_id, class_id, academic_year_id, term_id, status)
        SELECT ?, ?, ?, ?, ?, 'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM enrollments
            WHERE school_id = ? AND student_id = ? AND term_id = ? AND status = 'active'
         )
      `, [SCHOOL_ID, item.studentId, item.classId, year.id, term.id, SCHOOL_ID, item.studentId, term.id]);
    }
    await db.commit();

    const [verify] = await db.execute(
      "SELECT COUNT(*) AS enrolled FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.school_id = ? AND e.term_id = ? AND e.status = 'active' AND s.school_id = ? AND s.deleted_at IS NULL",
      [SCHOOL_ID, term.id, SCHOOL_ID],
    );
    console.log(JSON.stringify({ ...summary, inserted: pending.length, verifiedActiveForTerm: verify[0].enrolled, applied: true }, null, 2));
  } catch (error) {
    try { await db.rollback(); } catch {}
    throw error;
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});