const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const [key, ...rest] = line.split('=');
    if (!key) continue;
    const value = rest.join('=').trim();
    if (value === '') continue;
    process.env[key.trim()] = value;
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

  const snapshotId = 'b22e7122-25ed-4a71-809e-a40d958eb04a';
  const [rows] = await conn.execute(
    `SELECT id, snapshot_id, school_id, term_id, year_id, type, status, generated_at, completed_at, snapshot_json, data_hash
       FROM report_snapshots
      WHERE snapshot_id = ?
      LIMIT 1`,
    [snapshotId],
  );

  console.log('snapshot_row_count:', rows.length);
  if (!rows.length) {
    await conn.end();
    return;
  }

  const row = rows[0];
  const parsed = JSON.parse(row.snapshot_json || '{}');
  console.log('row metadata:', {
    id: row.id,
    snapshot_id: row.snapshot_id,
    school_id: row.school_id,
    term_id: row.term_id,
    year_id: row.year_id,
    type: row.type,
    status: row.status,
    generated_at: row.generated_at,
    completed_at: row.completed_at,
    data_hash: row.data_hash,
  });
  console.log('meta keys:', Object.keys(parsed.meta || {}));
  console.log('snapshot.meta.language:', parsed.meta?.language);
  console.log('snapshot.config keys:', parsed.config ? Object.keys(parsed.config) : null);
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
      results: (s.results || []).map((r) => ({
        subject: r.subjectName || r.subject_name || null,
        score: r.score ?? r.total ?? null,
        grade: r.grade || null,
      })),
    })),
  ).filter((s) =>
    String(s.name).toLowerCase().includes('musa') ||
    String(s.name).toLowerCase().includes('tariq') ||
    String(s.admissionNumber).toLowerCase().includes('s8002/01216')
  );

  console.log('matched students:', JSON.stringify(students, null, 2));
  await conn.end();
})();
