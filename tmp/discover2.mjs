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
const S = 8002;
const TERM = 300004;

const [counts] = await conn.execute(
  `SELECT e.class_id, c.name, COUNT(*) n
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
    WHERE e.school_id = ? AND e.status='active' AND e.deleted_at IS NULL
    GROUP BY e.class_id, c.name ORDER BY c.name`,
  [S]
);
console.log('ACTIVE ENROLLMENT CLASS COUNTS (any term):', JSON.stringify(counts, null, 2));

const [countsTerm] = await conn.execute(
  `SELECT e.class_id, c.name, COUNT(*) n
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
    WHERE e.school_id = ? AND e.term_id = ? AND e.deleted_at IS NULL
    GROUP BY e.class_id, c.name ORDER BY c.name`,
  [S, TERM]
);
const [peopleCols] = await conn.execute(`SHOW COLUMNS FROM people`);
console.log('PEOPLE COLUMNS:', JSON.stringify(peopleCols.map(c=>c.Field), null, 2));

const [existingRefs] = await conn.execute(
  `SELECT reference, COUNT(*) n FROM student_ledger WHERE school_id=? AND reference LIKE '%MASTORAH%' GROUP BY reference`,
  [S]
);
console.log('EXISTING MASTORAH LEDGER REFS:', JSON.stringify(existingRefs, null, 2));

const [ledgerColCheck] = await conn.execute(`SHOW COLUMNS FROM student_ledger`);
console.log('STUDENT_LEDGER COLUMNS:', JSON.stringify(ledgerColCheck.map(c=>c.Field), null, 2));

await conn.end();


