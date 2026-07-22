const fs = require('fs');
const mysql = require('mysql2/promise');
const envPath = '.env.local';
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (key) process.env[key] = value;
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

  console.log('connected to database', process.env.TIDB_DB || process.env.TIDB_DATABASE || 'drais');

  const [snapshotCountRows] = await conn.execute('SELECT COUNT(*) AS cnt FROM report_snapshots');
  console.log('report_snapshots count:', snapshotCountRows[0].cnt);

  const [schoolTermRows] = await conn.execute(
    'SELECT id, snapshot_id, school_id, term_id, type, status, data_hash FROM report_snapshots WHERE school_id = ? AND term_id = ? ORDER BY id ASC',
    [8002, 300004],
  );
  console.log('school 8002 term 300004 snapshots:', JSON.stringify(schoolTermRows, null, 2));

  const snapshotSearchPatterns = ['%MUSA TARIQ MUKISA%', '%Musa Tariq%', '%Musa%', '%Tariq%'];
  for (const pattern of snapshotSearchPatterns) {
    const [rows] = await conn.execute(
      'SELECT id, snapshot_id, school_id, term_id, type, status, data_hash, CHAR_LENGTH(snapshot_json) AS len FROM report_snapshots WHERE snapshot_json LIKE ? ORDER BY id DESC',
      [pattern],
    );
    console.log(`rows matching ${pattern}:`, JSON.stringify(rows.slice(0, 20), null, 2));
  }

  const targetSnapshotIds = ['b22e7122-25ed-4a71-809e-a40d958eb04a'];
  for (const snapshotId of targetSnapshotIds) {
    const [rows] = await conn.execute('SELECT id, snapshot_id, school_id, term_id, type, status, data_hash, CHAR_LENGTH(snapshot_json) AS len FROM report_snapshots WHERE snapshot_id = ? LIMIT 1', [snapshotId]);
    console.log('lookup snapshot_id', snapshotId, 'rows:', JSON.stringify(rows, null, 2));
  }

  const [rows] = await conn.execute('SELECT id, snapshot_id, snapshot_json FROM report_snapshots WHERE snapshot_json LIKE ? OR snapshot_json LIKE ? ORDER BY id DESC LIMIT 20', ['%MUSA TARIQ%', '%Musa Tariq%']);
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.snapshot_json || '{}');
      const matches = (parsed.classes || []).flatMap((cls) =>
        (cls.students || []).map((s) => ({
          className: cls.className,
          studentDbId: s.studentDbId,
          admissionNumber: s.admissionNumber || s.id,
          name: s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
          aggregates: s.aggregates,
          division: s.division,
          overallGrade: s.overallGrade || s.overall_grade || null,
          resultCount: (s.results || []).length,
        })),
      ).filter((s) =>
        String(s.name).toLowerCase().includes('musa') ||
        String(s.name).toLowerCase().includes('tariq') ||
        String(s.admissionNumber).toLowerCase().includes('musa') ||
        String(s.admissionNumber).toLowerCase().includes('tariq')
      );
      console.log('snapshot row', row.id, row.snapshot_id, 'matched student rows:', JSON.stringify(matches, null, 2));
    } catch (err) {
      console.error('failed parsing snapshot', row.id, err);
    }
  }

  await conn.end();
})();
