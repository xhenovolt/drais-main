/**
 * POST /api/students/bulk-photo-map
 *
 * Accepts a folder-upload of images (field: photos[]).
 * Strips the file extension, normalises the filename, and runs Levenshtein
 * distance against every student name in the school.
 *
 * ≥ 90% similarity  → auto-upload to Cloudinary, link to student
 *  < 90% similarity  → add to pendingMatches[] for manual review
 *
 * Response shape:
 * {
 *   autoMatched: { person_id, name, photo_url, file_name }[],
 *   pendingMatches: { file_name, topMatch: {person_id, name, score}, buffer_b64: string }[]
 *   summary: { total, auto, pending, failed }
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto } from '@/lib/cloudinary';
import { logAudit } from '@/lib/audit';

// ── Levenshtein distance ────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  return 1 - dist / Math.max(a.length, b.length);
}

function normaliseFilename(name: string): string {
  // Remove extension, replace underscores/hyphens/dots with spaces, trim
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[_\-\.]+/g, ' ')
    .trim()
    .toLowerCase();
}

const AUTO_THRESHOLD = 0.90; // ≥ 90% → auto-link
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED   = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let connection;
  try {
    const formData = await req.formData();
    const photos = formData.getAll('photos') as File[];

    if (!photos.length) {
      return NextResponse.json({ success: false, error: 'No photos provided' }, { status: 400 });
    }

    for (const photo of photos) {
      if (!ALLOWED.includes(photo.type.toLowerCase())) {
        return NextResponse.json({ success: false, error: `${photo.name}: unsupported type` }, { status: 400 });
      }
      if (photo.size > MAX_BYTES) {
        return NextResponse.json({ success: false, error: `${photo.name} exceeds 10 MB` }, { status: 400 });
      }
    }

    connection = await getConnection();

    // Load all student names for this school
    const [students]: any = await connection.execute(
      `SELECT p.id AS person_id,
              CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,'')) AS full_name
         FROM people p
         JOIN students s ON s.person_id = p.id
        WHERE s.school_id = ?`,
      [session.schoolId],
    );

    const autoMatched:   any[] = [];
    const pendingMatches:any[] = [];
    const failed:        any[] = [];

    for (const photo of photos) {
      const normalised = normaliseFilename(photo.name);
      let bestScore  = 0;
      let bestMatch: { person_id: number; name: string } | null = null;

      for (const s of students) {
        const normName = s.full_name.trim().toLowerCase();
        const score    = similarity(normalised, normName);
        if (score > bestScore) { bestScore = score; bestMatch = { person_id: s.person_id, name: s.full_name }; }
      }

      try {
        const buffer = Buffer.from(await photo.arrayBuffer());

        if (bestScore >= AUTO_THRESHOLD && bestMatch) {
          // Auto-upload & link
          const result = await uploadStudentPhoto(buffer, photo.size, 'drais/students', `person_${bestMatch.person_id}`);

          await connection.execute(
            'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
            [result.secure_url, bestMatch.person_id],
          );

          await logAudit(connection, {
            user_id:    session.userId,
            action:     'BULK_PHOTO_AUTO_MATCH',
            entity_type:'student_photo',
            target_id:  bestMatch.person_id,
            details:    { file_name: photo.name, matched_name: bestMatch.name, score: bestScore, photo_url: result.secure_url },
          });

          autoMatched.push({
            person_id: bestMatch.person_id,
            name:      bestMatch.name,
            photo_url: result.secure_url,
            file_name: photo.name,
            score:     Math.round(bestScore * 100),
          });
        } else {
          // Queue for manual review — return base64 thumbnail
          pendingMatches.push({
            file_name:  photo.name,
            buffer_b64: buffer.toString('base64'),
            mime_type:  photo.type,
            topMatch:   bestMatch
              ? { person_id: bestMatch.person_id, name: bestMatch.name, score: Math.round(bestScore * 100) }
              : null,
          });
        }
      } catch (err: any) {
        console.error(`[bulk-photo-map] ${photo.name}:`, err);
        failed.push({ file_name: photo.name, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      autoMatched,
      pendingMatches,
      failed,
      summary: {
        total:   photos.length,
        auto:    autoMatched.length,
        pending: pendingMatches.length,
        failed:  failed.length,
      },
    });

  } catch (error: any) {
    console.error('[bulk-photo-map] error:', error);
    return NextResponse.json({
      success: false,
      error:   'Bulk photo map failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

// ── Confirm a pending match ──────────────────────────────────────────────────
// PUT /api/students/bulk-photo-map
// Body: { person_id, buffer_b64, mime_type, file_name }
export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let connection;
  try {
    const { person_id, buffer_b64, mime_type, file_name } = await req.json();

    if (!person_id || !buffer_b64) {
      return NextResponse.json({ success: false, error: 'person_id and buffer_b64 are required' }, { status: 400 });
    }

    const buffer    = Buffer.from(buffer_b64, 'base64');
    const fileSizeB = buffer.byteLength;

    connection = await getConnection();

    const [rows]: any = await connection.execute('SELECT id, photo_url FROM people WHERE id = ?', [person_id]);
    if (!rows.length) return NextResponse.json({ success: false, error: 'Person not found' }, { status: 404 });

    const oldPhotoUrl = rows[0].photo_url;
    const result = await uploadStudentPhoto(buffer, fileSizeB, 'drais/students', `person_${person_id}`);

    await connection.execute(
      'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
      [result.secure_url, person_id],
    );

    await logAudit(connection, {
      user_id:    session.userId,
      action:     'BULK_PHOTO_MANUAL_CONFIRM',
      entity_type:'student_photo',
      target_id:  Number(person_id),
      details:    { old_photo_url: oldPhotoUrl, new_photo_url: result.secure_url, file_name },
    });

    return NextResponse.json({ success: true, photo_url: result.secure_url });

  } catch (error: any) {
    console.error('[bulk-photo-map PUT] error:', error);
    return NextResponse.json({
      success: false,
      error:   'Failed to confirm match',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
