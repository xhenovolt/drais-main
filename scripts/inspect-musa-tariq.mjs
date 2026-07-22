#!/usr/bin/env node
import dotenv from 'dotenv';
import { query } from '../src/lib/db';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

async function main() {
  const students = await query(
    `SELECT s.id AS student_id, s.admission_no, p.first_name, p.last_name,
            rc.id AS report_card_id, rc.term_id, rc.overall_grade,
            rcm.total_score, rcm.average_score, rcm.position
       FROM students s
       JOIN people p ON s.person_id = p.id
       LEFT JOIN report_cards rc ON rc.student_id = s.id
       LEFT JOIN report_card_metrics rcm ON rcm.report_card_id = rc.id
      WHERE CONCAT(p.first_name, ' ', p.last_name) LIKE ?
      ORDER BY s.id ASC
      LIMIT 50`,
    ['%Musa Tariq%'],
  );

  console.log('students:', JSON.stringify(students, null, 2));

  const snaps = await query(
    `SELECT rs.id, rs.snapshot_id, rs.school_id, rs.term_id, rs.year_id, rs.type
       FROM report_snapshots rs
      WHERE rs.snapshot_json LIKE ?
      ORDER BY rs.id DESC
      LIMIT 20`,
    ['%Musa Tariq%'],
  );

  console.log('snapshots:', JSON.stringify(snaps, null, 2));

  for (const snap of snaps) {
    const row = await query('SELECT snapshot_json FROM report_snapshots WHERE id = ?', [snap.id]);
    if (!row.length) continue;
    const snapJson = JSON.parse(row[0].snapshot_json);
    const studentsInSnap = (snapJson.classes || []).flatMap((c) =>
      (c.students || []).map((s) => ({
        className: c.className,
        studentId: s.id,
        name: s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        aggregates: s.aggregates,
        division: s.division,
        results: (s.results || []).map((r) => ({
          subjectName: r.subjectName || r.subject_name || null,
          score: r.score ?? r.total ?? null,
          grade: r.grade || null,
        })),
      })),
    );
    const matches = studentsInSnap.filter((s) =>
      String(s.name).toLowerCase().includes('musa') || String(s.name).toLowerCase().includes('tariq')
    );
    console.log(`snapshot ${snap.snapshot_id} matches:`, JSON.stringify(matches.slice(0, 20), null, 2));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
