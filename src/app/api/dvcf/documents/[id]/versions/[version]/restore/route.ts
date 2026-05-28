/**
 * POST /api/dvcf/documents/[id]/versions/[version]/restore
 *
 * Overwrites the current document with the contents of an older version.
 * The restore itself is recorded as a new version (so it is undoable).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getConnection } from '@/lib/db';
import { getVersion, snapshotVersion } from '@/lib/drce/versions';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const p = await params;
  const docId = Number(p.id);
  const versionNo = Number(p.version);
  if (!Number.isFinite(docId) || !Number.isFinite(versionNo)) {
    return NextResponse.json({ error: 'Invalid id or version' }, { status: 400 });
  }

  const v = await getVersion(docId, versionNo, session.schoolId);
  if (!v) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE dvcf_documents
          SET schema_json = ?, schema_version = schema_version + 1
        WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
      [v.schema_json, docId, session.schoolId],
    );
    const snap = await snapshotVersion({
      documentId:    docId,
      schemaJson:    v.schema_json,
      name:          v.name,
      authorUserId:  session.userId,
      changeSummary: `Restored from version ${versionNo}`,
    });
    return NextResponse.json({ success: true, restored_from: versionNo, new_version_no: snap.version_no });
  } finally {
    await conn.end();
  }
}
