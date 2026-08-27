import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const TIDB_CONFIG = {
  host: process.env.TIDB_HOST,
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || 'drais',
  ssl: { rejectUnauthorized: false },
};

const conn = await mysql.createConnection(TIDB_CONFIG);
console.log('connected to', TIDB_CONFIG.database, 'at', TIDB_CONFIG.host);

const [schools] = await conn.execute(
  `SELECT id, name FROM schools WHERE LOWER(name) LIKE '%quran%' OR LOWER(name) LIKE '%memoriz%' OR LOWER(name) LIKE '%albayan%' OR LOWER(name) LIKE '%mastorah%' ORDER BY id`
);
console.log('SCHOOLS MATCH:', JSON.stringify(schools, null, 2));

const S = 8002;
const [classes] = await conn.execute(`SELECT id, name, program_id, level FROM classes WHERE school_id = ? ORDER BY id`, [S]);
console.log('CLASSES:', JSON.stringify(classes, null, 2));

const [studentCount] = await conn.execute(`SELECT COUNT(*) n FROM students WHERE school_id = ? AND deleted_at IS NULL`, [S]);
console.log('STUDENT COUNT:', JSON.stringify(studentCount, null, 2));

const [studentCols] = await conn.execute(`SHOW COLUMNS FROM students`);
console.log('STUDENTS COLUMNS:', JSON.stringify(studentCols.map(c=>c.Field), null, 2));

const [feeTables] = await conn.execute(`SHOW TABLES LIKE '%fee%'`);
console.log('FEE TABLES:', JSON.stringify(feeTables, null, 2));

const [sampleStudents] = await conn.execute(`SELECT s.id, s.admission_no, s.class_id, s.theology_class_id, TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) name FROM students s LEFT JOIN people p ON p.id=s.person_id WHERE s.school_id = ? AND s.deleted_at IS NULL LIMIT 10`, [S]);
console.log('SAMPLE STUDENTS:', JSON.stringify(sampleStudents, null, 2));

const [classIdCounts] = await conn.execute(`SELECT class_id, COUNT(*) n FROM students WHERE school_id=? AND deleted_at IS NULL GROUP BY class_id ORDER BY class_id`, [S]);
console.log('CLASS_ID COUNTS:', JSON.stringify(classIdCounts, null, 2));

const [enrollTables] = await conn.execute(`SHOW TABLES LIKE '%enroll%'`);
console.log('ENROLL TABLES:', JSON.stringify(enrollTables, null, 2));

const [termCols] = await conn.execute(`SHOW COLUMNS FROM terms`);
console.log('TERMS COLUMNS:', JSON.stringify(termCols.map(c=>c.Field), null, 2));
const [terms] = await conn.execute(`SELECT * FROM terms WHERE school_id=? ORDER BY id DESC LIMIT 10`, [S]);
console.log('TERMS:', JSON.stringify(terms, null, 2));

const [enrollCols] = await conn.execute(`SHOW COLUMNS FROM enrollments`);
console.log('ENROLLMENTS COLUMNS:', JSON.stringify(enrollCols.map(c=>c.Field), null, 2));
const [enrollSample] = await conn.execute(`SELECT * FROM enrollments WHERE school_id=? ORDER BY id DESC LIMIT 5`, [S]);
console.log('ENROLLMENTS SAMPLE:', JSON.stringify(enrollSample, null, 2));
const [enrollCounts] = await conn.execute(`SELECT class_id, status, COUNT(*) n FROM enrollments WHERE school_id=? GROUP BY class_id, status ORDER BY class_id`, [S]);
console.log('ENROLLMENT CLASS COUNTS:', JSON.stringify(enrollCounts, null, 2));

const [ledgerCols] = await conn.execute(`SHOW COLUMNS FROM student_ledger`);
console.log('LEDGER COLUMNS:', JSON.stringify(ledgerCols.map(c=>c.Field), null, 2));
const [ledgerStats] = await conn.execute(`SELECT type, reference, COUNT(*) n, SUM(amount) total FROM student_ledger WHERE school_id=? GROUP BY type, reference ORDER BY n DESC LIMIT 30`, [S]);
console.log('LEDGER STATS BY REFERENCE:', JSON.stringify(ledgerStats, null, 2));
const [ledgerTotal] = await conn.execute(`SELECT COUNT(*) n, SUM(CASE WHEN type='debit' THEN amount ELSE 0 END) debit, SUM(CASE WHEN type='credit' THEN amount ELSE 0 END) credit FROM student_ledger WHERE school_id=?`, [S]);
console.log('LEDGER TOTAL:', JSON.stringify(ledgerTotal, null, 2));
const [finPayCount] = await conn.execute(`SELECT COUNT(*) n FROM finance_payments WHERE school_id=?`, [S]);
console.log('FINANCE_PAYMENTS COUNT:', JSON.stringify(finPayCount, null, 2));
const [allocCols] = await conn.execute(`SHOW COLUMNS FROM fee_payment_allocations`);
console.log('ALLOC COLUMNS:', JSON.stringify(allocCols.map(c=>c.Field), null, 2));
const [allocCount] = await conn.execute(`SELECT COUNT(*) n FROM fee_payment_allocations`);
console.log('ALLOC COUNT (all schools):', JSON.stringify(allocCount, null, 2));
const [fkCheck] = await conn.execute(`
  SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE REFERENCED_TABLE_NAME = 'student_ledger' AND TABLE_SCHEMA = DATABASE()
`);
console.log('FKs REFERENCING student_ledger:', JSON.stringify(fkCheck, null, 2));

const [ledgerCount] = await conn.execute(`SELECT COUNT(*) n FROM student_ledger WHERE school_id=?`, [S]);
console.log('EXISTING LEDGER ROWS FOR SCHOOL:', JSON.stringify(ledgerCount, null, 2));

await conn.end();
