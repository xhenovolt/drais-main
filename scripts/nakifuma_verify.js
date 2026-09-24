const fs = require('fs');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

async function main() {
  const env = dotenv.parse(fs.readFileSync('.env.local', 'utf8'));
  const c = await mysql.createConnection({
    host: env.TIDB_HOST,
    port: Number(env.TIDB_PORT),
    user: env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    database: env.TIDB_DB,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const [classes] = await c.execute(`
      SELECT cl.name, COUNT(s.id) AS students
        FROM classes cl
        LEFT JOIN students s ON s.class_id = cl.id AND s.school_id = 12020 AND s.deleted_at IS NULL
       WHERE cl.school_id = 12020 AND cl.deleted_at IS NULL
       GROUP BY cl.id, cl.name ORDER BY cl.name
    `);
    const [values] = await c.execute(`
      SELECT f.code, v.value_text, COUNT(*) AS students
        FROM student_custom_values v
        JOIN custom_fields f ON f.id = v.field_id
        JOIN students s ON s.id = v.student_id
       WHERE s.school_id = 12020 AND s.deleted_at IS NULL AND f.code = 'accommodation'
       GROUP BY f.code, v.value_text ORDER BY v.value_text
    `);
    const [counts] = await c.execute(`
      SELECT COUNT(*) AS students,
             COUNT(DISTINCT admission_no) AS distinct_admission,
             SUM(class_id IS NULL) AS missing_class
        FROM students WHERE school_id = 12020 AND deleted_at IS NULL
    `);
    const [contacts] = await c.execute(`
      SELECT (SELECT COUNT(*) FROM contacts WHERE school_id = 12020 AND deleted_at IS NULL) AS contacts,
             (SELECT COUNT(*) FROM student_contacts sc JOIN students s ON s.id = sc.student_id WHERE s.school_id = 12020 AND s.deleted_at IS NULL) AS links,
             (SELECT COUNT(*) - COUNT(DISTINCT CONCAT(student_id, ':', contact_id)) FROM student_contacts sc JOIN students s ON s.id = sc.student_id WHERE s.school_id = 12020 AND s.deleted_at IS NULL) AS duplicate_links
    `);
    const [terms] = await c.execute('SELECT id, name FROM terms WHERE school_id = 12020 AND is_active = 1 ORDER BY id DESC LIMIT 1');
    const term = terms[0];
    const [enrollmentCounts] = await c.execute(`
      SELECT COUNT(*) AS rows_count, COUNT(DISTINCT e.student_id) AS students_count
        FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.school_id = 12020 AND e.term_id = ? AND e.status = 'active'
         AND s.school_id = 12020 AND s.deleted_at IS NULL
    `, [term.id]);
    const [duplicateEnrollments] = await c.execute(`
      SELECT e.student_id, e.term_id, COUNT(*) AS row_count
        FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.school_id = 12020 AND e.term_id = ? AND e.status = 'active'
         AND s.school_id = 12020 AND s.deleted_at IS NULL
       GROUP BY e.student_id, e.term_id HAVING COUNT(*) > 1 LIMIT 20
    `, [term.id]);
    const [duplicateAdmissions] = await c.execute(`
      SELECT admission_no, COUNT(*) AS row_count
        FROM students WHERE school_id = 12020 AND deleted_at IS NULL
       GROUP BY admission_no HAVING COUNT(*) > 1 LIMIT 20
    `);
    console.log(JSON.stringify({ classes, accommodationValues: values, counts: counts[0], term, enrollmentCounts: enrollmentCounts[0], duplicateEnrollments, duplicateAdmissions, contacts: contacts[0] }, null, 2));
  } finally {
    await c.end();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});