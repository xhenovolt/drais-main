const fs = require('fs');
const mysql = require('mysql2/promise');
const envPath = '.env.local';
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1].trim()] = m[2].trim();
  }
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB || process.env.TIDB_DATABASE || 'drais',
    ssl: { rejectUnauthorized: false },
  });

  const snapshotIds = [
    'b0b82517-9c2b-4a05-a4e8-5824af2004e1',
    'cae511f7-b1d4-437c-b5ee-401b1536c160',
    '9c19a28f-ebfe-4ab5-9ff7-d663b75cc9d9',
  ];

  for (const snapshotId of snapshotIds) {
    const [rows] = await conn.execute(
      'SELECT id, snapshot_id, school_id, term_id, type, status, data_hash, CHAR_LENGTH(snapshot_json) AS len FROM report_snapshots WHERE snapshot_id = ? LIMIT 1',
      [snapshotId],
    );
    console.log('snapshotId', snapshotId, 'rows', rows.length, JSON.stringify(rows, null, 2));
    if (!rows.length) continue;
    const [{ snapshot_json: snapshotJson }] = rows;
    const parsed = JSON.parse(snapshotJson || '{}');
    const students = (parsed.classes || []).flatMap((cls) =>
      (cls.students || []).map((s) => ({
        className: cls.className,
        stream: cls.stream,
        studentDbId: s.studentDbId,
        admissionNumber: s.admissionNumber || s.id,
        name: s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        aggregates: s.aggregates,
        division: s.division,
        overallGrade: s.overallGrade || s.overall_grade || null,
      })),
    ).filter((s) =>
      String(s.name).toLowerCase().includes('musa') ||
      String(s.name).toLowerCase().includes('tariq') ||
      String(s.admissionNumber).toLowerCase().includes('01216')
    );
    console.log('matched students in snapshot', snapshotId, JSON.stringify(students, null, 2));
  }

  const [peopleRows] = await conn.execute(
    `SELECT p.id AS person_id, p.first_name, p.last_name, p.other_names
       FROM people p
      WHERE CONCAT(p.first_name,' ',p.last_name) LIKE ?
         OR CONCAT(p.last_name,' ',p.first_name) LIKE ?
      LIMIT 50`,
    ['%Musa%','%Tariq%'],
  );
  console.log('peopleRows:', JSON.stringify(peopleRows, null, 2));

  const personIds = peopleRows.map((r) => r.person_id);
  if (personIds.length) {
    const [studentRows] = await conn.execute(
      `SELECT s.id AS student_id, s.person_id, s.admission_no, s.school_id, s.class_id
         FROM students s
        WHERE s.person_id IN (?)
        LIMIT 50`,
      [personIds],
    );
    console.log('studentRows:', JSON.stringify(studentRows, null, 2));
  }

  await conn.end();
})();
