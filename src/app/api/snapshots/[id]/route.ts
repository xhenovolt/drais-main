import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { loadSnapshot, deleteSnapshot, getSnapshotRow, saveSnapshot } from '@/lib/snapshots/storage';
import { hashCanonical } from '@/lib/snapshots/normalizers';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const snapshot = await loadSnapshot(id, session.schoolId);
  if (!snapshot) {
    // 404 (not 403) — do not leak existence across schools.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = await getSnapshotRow(id, session.schoolId);
  return NextResponse.json({ success: true, snapshot, row });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const snapshot = await loadSnapshot(id, session.schoolId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || !Array.isArray(body.actions)) {
    return NextResponse.json({ error: 'Missing actions array' }, { status: 400 });
  }

  for (const action of body.actions) {
    const classIdx = action?.classIdx;
    const studentDbId = action?.studentDbId;
    const field = action?.field;
    const value = action?.value;
    const rowIndex = action?.rowIndex;

    if (typeof classIdx !== 'number' || typeof field !== 'string' || typeof value !== 'string') {
      return NextResponse.json({ error: 'Invalid action payload' }, { status: 400 });
    }

    const cls = snapshot.classes[classIdx];
    if (!cls) {
      return NextResponse.json({ error: 'Class index out of range' }, { status: 400 });
    }

    if (field === 'classTeacher' || field === 'dos' || field === 'headTeacher') {
      if (typeof studentDbId !== 'number') {
        return NextResponse.json({ error: 'Student ID required for comment edits' }, { status: 400 });
      }
      const student = cls.students.find(s => s.studentDbId === studentDbId);
      if (!student) {
        return NextResponse.json({ error: 'Student not found' }, { status: 400 });
      }

      student.comments = {
        classTeacher: student.comments?.classTeacher ?? '',
        dos:          student.comments?.dos ?? '',
        headTeacher:  student.comments?.headTeacher ?? '',
        [field]:      value,
      };
    } else if (field === 'remarks') {
      if (typeof studentDbId !== 'number') {
        return NextResponse.json({ error: 'Student ID required for remark edits' }, { status: 400 });
      }
      const student = cls.students.find(s => s.studentDbId === studentDbId);
      if (!student) {
        return NextResponse.json({ error: 'Student not found' }, { status: 400 });
      }
      if (typeof rowIndex !== 'number' || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= student.results.length) {
        return NextResponse.json({ error: 'Invalid row index' }, { status: 400 });
      }
      student.results[rowIndex] = {
        ...student.results[rowIndex],
        remarks: value,
      };
    } else if (field === 'initials') {
      const subjectId = action?.subjectId;
      if (typeof subjectId !== 'number') {
        return NextResponse.json({ error: 'Subject ID required for initials edits' }, { status: 400 });
      }

      let updatedCount = 0;
      cls.students.forEach((student) => {
        const result = student.results.find(r => r.subjectId === subjectId);
        if (result) {
          result.initials = value;
          updatedCount += 1;
        }
      });

      if (updatedCount === 0) {
        return NextResponse.json({ error: 'No matching result rows found for initials sync' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Unsupported field' }, { status: 400 });
    }
  }

  snapshot.meta.dataHash = hashCanonical(snapshot.classes);
  await saveSnapshot({ snapshotId: id, snapshot });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  // Authorization is school-scoped: deleteSnapshot enforces school_id match,
  // so a user can only ever remove their own school's snapshot rows. Source
  // marks/results are untouched.
  const { id } = await ctx.params;
  const ok = await deleteSnapshot(id, session.schoolId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
