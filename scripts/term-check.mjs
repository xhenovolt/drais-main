import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({ host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com', port: 4000, user: '2Trc8kJebpKLb1Z.root', password: 'QMNAOiP9J1rANv4Z', database: 'drais', ssl: { rejectUnauthorized: false } });

// Current term check
const [terms] = await conn.execute('SELECT id, name FROM terms WHERE school_id=8002 ORDER BY id DESC LIMIT 5');
console.log('Terms:', JSON.stringify(terms));

// Term I 2026 enrollments
const [t1statuses] = await conn.execute("SELECT status, COUNT(*) as cnt FROM enrollments WHERE school_id=8002 AND term_id=30005 GROUP BY status");
console.log('Term I 2026 statuses:', JSON.stringify(t1statuses));

// How many students have active enrollment in Term I 2026
const [[activeT1]] = await conn.execute("SELECT COUNT(DISTINCT student_id) as n FROM enrollments WHERE school_id=8002 AND term_id=30005 AND status='active'");
console.log('Active in Term I 2026:', activeT1.n);

// Therefore admitted count (not active in current term)
const [[admittedCount]] = await conn.execute("SELECT COUNT(*) as n FROM students s WHERE s.school_id=8002 AND s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.term_id=30005 AND e.status='active')");
console.log('Would show as admitted (current term = Term I 2026):', admittedCount.n);

await conn.end();
