/**
 * GET /api/verify/[token]
 *
 * PUBLIC anti-forgery endpoint. Validates a signed token from a
 * printed QR code and returns sanitised proof-of-authenticity data:
 *
 *   { verified: true, school, term, year, type, learner?: { name,
 *     class, stream, admissionNo }, generatedAt }
 *
 * No session required — the HMAC IS the access proof. Returns 404
 * (not 401) when the token is bad so an attacker can't distinguish
 * "wrong signature" from "wrong snapshot id". Same response shape
 * on every failure mode.
 *
 * Surfaces the MINIMUM data needed to prove authenticity. Marks /
 * comments / fees are NOT returned — verifying does not entitle a
 * scanner to private record content.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyVerifyToken } from '@/lib/snapshots/verify-token';
import { query } from '@/lib/db';

function notFound() {
  return NextResponse.json({ verified: false, error: 'Invalid or unknown token' }, { status: 404 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyVerifyToken(token);
  if (!payload) return notFound();

  // Load the snapshot row scoped to the school id baked into the token
  // (or any school when no `c` claim is present — older tokens). Status
  // = 'ready' filters out generating/failed rows.
  const rows = (await query(
    `SELECT rs.snapshot_json, rs.type, rs.created_at,
            s.name  AS school_name,
            t.name  AS term_name,
            ay.name AS year_name
       FROM report_snapshots rs
       LEFT JOIN schools         s  ON s.id  = rs.school_id
       LEFT JOIN terms           t  ON t.id  = rs.term_id
       LEFT JOIN academic_years  ay ON ay.id = rs.year_id
      WHERE rs.snapshot_id = ?
        AND rs.status = 'ready'
        ${payload.c ? 'AND rs.school_id = ?' : ''}
      LIMIT 1`,
    payload.c ? [payload.s, payload.c] : [payload.s],
  )) as Array<{
    snapshot_json: string;
    type:          string;
    created_at:    string;
    school_name:   string | null;
    term_name:     string | null;
    year_name:     string | null;
  }>;
  if (rows.length === 0) return notFound();
  const row = rows[0];

  let learnerOut: { name: string; class: string; stream: string | null; admissionNo: string } | undefined;
  if (payload.u) {
    try {
      const snap = JSON.parse(row.snapshot_json);
      const classes = Array.isArray(snap?.classes) ? snap.classes : [];
      outer: for (const cls of classes) {
        const students = Array.isArray(cls?.students) ? cls.students : [];
        for (const stu of students) {
          if (Number(stu?.studentDbId) === payload.u) {
            learnerOut = {
              name:        String(stu.name || ''),
              class:       String(cls.className || ''),
              stream:      cls.stream ?? null,
              admissionNo: String(stu.admissionNumber || stu.id || ''),
            };
            break outer;
          }
        }
      }
    } catch { /* corrupt snapshot — treat as if learner not present */ }
    if (!learnerOut) return notFound();
  }

  return NextResponse.json({
    verified:    true,
    school:      row.school_name,
    term:        row.term_name,
    year:        row.year_name,
    type:        row.type,
    learner:     learnerOut,
    generatedAt: row.created_at,
  });
}
