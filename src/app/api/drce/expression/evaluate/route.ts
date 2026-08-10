/**
 * POST /api/drce/expression/evaluate
 * Body: { expression, snapshot_id?, class_idx?, student_idx? }
 *
 * Evaluates a DRCE expression against either a real snapshot (when
 * snapshot_id is given) or a built-in demo context. Used by the editor's
 * variable picker to show schools what {next_term_begins | date:"D MMM"} or
 * {avg(results,"score") | number:"#,##0.0"} would render to BEFORE they
 * publish the template.
 *
 * Tenant-safe: when snapshot_id is provided, the snapshot is school-scoped
 * via the session before any data is read.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveExpression } from '@/lib/drce/computed/resolveExpression';
import { listComputed } from '@/lib/drce/computed/registry';
import { knownFormatters } from '@/lib/drce/computed/formatters';
import { listAggregators } from '@/lib/drce/computed/aggregations';
import { loadSnapshot } from '@/lib/snapshots/storage';
import { snapshotToDRCEDataContext } from '@/lib/snapshots/adapter/toDRCEDataContext';
import type { DRCEDataContext } from '@/lib/drce/schema';
import { checkModule } from '@/lib/auth/requireModule';

// Minimal demo context — same shape used by the editor preview.
const DEMO_CTX: DRCEDataContext = {
  student: {
    fullName: 'Nakato Sarah B.', firstName: 'Sarah', lastName: 'Nakato',
    gender: 'Female', className: 'P6 East', streamName: 'East',
    admissionNo: 'ADM/2026/0042', photoUrl: null, dateOfBirth: null,
  },
  subjects: [
    { id: 1, name: 'Mathematics',    totalMarks: 100, subjectType: 'primary' },
    { id: 2, name: 'English',        totalMarks: 100, subjectType: 'primary' },
    { id: 3, name: 'Science',        totalMarks: 100, subjectType: 'primary' },
    { id: 4, name: 'Social Studies', totalMarks: 100, subjectType: 'primary' },
  ],
  results: [
    { subjectId: 1, subjectName: 'Mathematics',    score: 84, grade: 'A',  remarks: 'Excellent' },
    { subjectId: 2, subjectName: 'English',        score: 72, grade: 'B',  remarks: 'Good'      },
    { subjectId: 3, subjectName: 'Science',        score: 65, grade: 'C',  remarks: 'Fair'      },
    { subjectId: 4, subjectName: 'Social Studies', score: 48, grade: 'D',  remarks: 'Improving' },
  ] as unknown as DRCEDataContext['results'],
  assessment: { classPosition: '3 of 28', averageScore: '67.3', overallGrade: 'B', remarks: 'Steady progress' } as unknown as DRCEDataContext['assessment'],
  comments:   { classTeacher: 'Keep practising mathematics.', dos: '', headTeacher: '' } as unknown as DRCEDataContext['comments'],
  meta: {
    schoolName: 'Demo Academy', schoolAddress: 'P.O. Box 1234, Kampala',
    schoolContact: '+256 700 000 000', schoolEmail: 'office@demo.example',
    centerNo: 'C/000', registrationNo: 'R/000',
    term: 'Term 2', year: '2026', reportTitle: 'Term 2 Report — 2026',
    nextTermBegins: '2026-09-15',
    calendar: {
      next_term_starts_at: '2026-09-15',
      this_term_ends_at:   '2026-08-22',
      next_term_name:      'Term 3',
      prev_term_name:      'Term 1',
      year_rollover:       false,
    },
  },
};

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;

  const body = await req.json().catch(() => null);
  const expression = String(body?.expression ?? '').slice(0, 4000);
  if (!expression) return NextResponse.json({ error: 'expression is required' }, { status: 400 });

  let ctx: DRCEDataContext = DEMO_CTX;
  let source: 'demo' | 'snapshot' = 'demo';

  if (body?.snapshot_id) {
    const snapshotId = String(body.snapshot_id);
    const snap = await loadSnapshot(snapshotId, session.schoolId);
    if (!snap) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }
    const classIdx = Math.max(0, Math.min(snap.classes.length - 1, Number(body.class_idx ?? 0)));
    const cls = snap.classes[classIdx];
    const studentIdx = Math.max(0, Math.min((cls?.students.length ?? 1) - 1, Number(body.student_idx ?? 0)));
    if (cls && cls.students[studentIdx]) {
      const schoolMeta = {
        schoolName:     snap.meta.branding?.schoolName ?? snap.meta.schoolName,
        schoolAddress:  snap.meta.branding?.address,
        schoolContact:  snap.meta.branding?.phone || snap.meta.branding?.email,
        schoolEmail:    snap.meta.branding?.email,
        centerNo:       snap.meta.branding?.centerNo,
        registrationNo: snap.meta.branding?.registrationNumber,
        arabicName:     snap.meta.branding?.arabicName,
        arabicAddress:  snap.meta.branding?.arabicAddress,
        logoUrl:        snap.meta.branding?.logoUrl,
        reportTitle:    `${snap.meta.termName} ${snap.meta.yearName}`,
      };
      ctx = snapshotToDRCEDataContext(snap, classIdx, studentIdx, schoolMeta);
      source = 'snapshot';
    }
  }

  let value: string;
  try {
    value = resolveExpression(expression, ctx);
  } catch (e) {
    return NextResponse.json({
      error: 'Expression error', message: e instanceof Error ? e.message : String(e),
    }, { status: 400 });
  }

  return NextResponse.json({
    success:    true,
    source,
    expression,
    value,
    catalog: {
      computed:    listComputed().map(c => ({ name: c.name, group: c.group, description: c.description })),
      aggregators: listAggregators(),
      formatters:  knownFormatters(),
    },
  });
}
