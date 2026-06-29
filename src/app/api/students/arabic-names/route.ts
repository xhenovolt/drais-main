export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { transliterateName } from '@/lib/i18n/translit';

/**
 * Bulk Arabic learner-name management (localization Batch 4).
 *
 * GET  — export the roster for review. ?missing=1 limits to learners with no
 *        Arabic name; ?draft=1 attaches an AI transliteration DRAFT (with
 *        confidence + needsReview) so the school can preview before applying.
 * POST — import Arabic names. Default mode is "dry_run" (writes nothing, returns
 *        a per-row report). mode:"apply" writes; existing Arabic names are never
 *        overwritten unless overwrite:true. This is the approval gate.
 */

interface RosterRow {
  student_id: number;
  person_id: number;
  admission_no: string | null;
  first_name: string | null;
  last_name: string | null;
  other_name: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  other_name_ar: string | null;
  full_name_ar: string | null;
  class_name: string | null;
  stream_name: string | null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const onlyMissing = req.nextUrl.searchParams.get('missing') === '1';
  const withDraft = req.nextUrl.searchParams.get('draft') === '1';

  const conn = await getConnection();
  try {
    // Correlated subqueries (not GROUP BY) so a learner with multiple active
    // enrollments still yields exactly one row — TiDB runs ONLY_FULL_GROUP_BY.
    const [rows]: any = await conn.execute(
      `SELECT s.id AS student_id, s.person_id, s.admission_no,
              p.first_name, p.last_name, p.other_name,
              p.first_name_ar, p.last_name_ar, p.other_name_ar, p.full_name_ar,
              (SELECT c.name FROM enrollments e JOIN classes c ON e.class_id = c.id
                WHERE e.student_id = s.id AND e.school_id = s.school_id AND e.status = 'active'
                ORDER BY e.id DESC LIMIT 1) AS class_name,
              (SELECT st.name FROM enrollments e JOIN streams st ON e.stream_id = st.id
                WHERE e.student_id = s.id AND e.school_id = s.school_id AND e.status = 'active'
                ORDER BY e.id DESC LIMIT 1) AS stream_name
         FROM students s
         JOIN people p ON s.person_id = p.id
        WHERE s.school_id = ? AND s.deleted_at IS NULL
        ORDER BY p.first_name ASC, p.last_name ASC`,
      [session.schoolId],
    );

    const hasArabic = (r: RosterRow) => !!(
      (r.full_name_ar && r.full_name_ar.trim()) ||
      (r.first_name_ar && r.first_name_ar.trim()) ||
      (r.last_name_ar && r.last_name_ar.trim())
    );

    let list = rows as RosterRow[];
    if (onlyMissing) list = list.filter(r => !hasArabic(r));

    const data = list.map(r => {
      const base = {
        student_id: r.student_id,
        admission_no: r.admission_no,
        english_name: [r.first_name, r.other_name, r.last_name].filter(Boolean).join(' '),
        first_name: r.first_name,
        last_name: r.last_name,
        other_name: r.other_name,
        first_name_ar: r.first_name_ar,
        last_name_ar: r.last_name_ar,
        other_name_ar: r.other_name_ar,
        full_name_ar: r.full_name_ar,
        class_name: r.class_name,
        stream_name: r.stream_name,
        arabic_name_missing: !hasArabic(r),
      };
      if (!withDraft) return base;
      // AI draft per part — never persisted here, only suggested.
      const fd = transliterateName(r.first_name);
      const ld = transliterateName(r.last_name);
      const od = transliterateName(r.other_name);
      const full = [fd.arabic, od.arabic, ld.arabic].filter(Boolean).join(' ').trim();
      const conf = [fd, ld].every(x => x.confidence === 'high') ? 'high'
        : [fd, ld].some(x => x.confidence === 'low') ? 'low' : 'medium';
      return {
        ...base,
        draft: {
          first_name_ar: fd.arabic,
          last_name_ar: ld.arabic,
          other_name_ar: od.arabic,
          full_name_ar: full,
          confidence: conf,
          needs_review: conf !== 'high',
        },
      };
    });

    return NextResponse.json({ success: true, total: data.length, rows: data });
  } catch (e: any) {
    console.error('[arabic-names GET]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

type ImportRow = {
  admission_no?: string;
  first_name_ar?: string;
  last_name_ar?: string;
  other_name_ar?: string;
  full_name_ar?: string;
};

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
  const mode: 'dry_run' | 'apply' = body?.mode === 'apply' ? 'apply' : 'dry_run';
  const overwrite = body?.overwrite === true;
  if (!rows.length) return NextResponse.json({ error: 'No rows provided' }, { status: 400 });

  const conn = await getConnection();
  try {
    // Map admission_no -> person rows for this school (detect duplicates).
    const [people]: any = await conn.execute(
      `SELECT s.admission_no, s.person_id,
              p.first_name_ar, p.last_name_ar, p.other_name_ar, p.full_name_ar
         FROM students s JOIN people p ON s.person_id = p.id
        WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.admission_no IS NOT NULL`,
      [session.schoolId],
    );
    const byAdm = new Map<string, any[]>();
    for (const p of people) {
      const k = String(p.admission_no).trim();
      if (!byAdm.has(k)) byAdm.set(k, []);
      byAdm.get(k)!.push(p);
    }

    const report: { admission_no: string; status: string; detail?: string }[] = [];
    const summary = { total: rows.length, matched: 0, updated: 0, skipped_existing: 0, not_found: 0, duplicate: 0, no_data: 0 };

    for (const row of rows) {
      const adm = String(row.admission_no ?? '').trim();
      if (!adm) { report.push({ admission_no: adm, status: 'not_found', detail: 'missing admission_no' }); summary.not_found++; continue; }

      const matches = byAdm.get(adm);
      if (!matches || matches.length === 0) { report.push({ admission_no: adm, status: 'not_found' }); summary.not_found++; continue; }
      if (matches.length > 1) { report.push({ admission_no: adm, status: 'duplicate', detail: `${matches.length} learners share this admission no` }); summary.duplicate++; continue; }

      const person = matches[0];
      const fields = {
        first_name_ar: (row.first_name_ar ?? '').toString().trim(),
        last_name_ar: (row.last_name_ar ?? '').toString().trim(),
        other_name_ar: (row.other_name_ar ?? '').toString().trim(),
        full_name_ar: (row.full_name_ar ?? '').toString().trim(),
      };
      const provided = Object.entries(fields).filter(([, v]) => v !== '');
      if (!provided.length) { report.push({ admission_no: adm, status: 'no_data' }); summary.no_data++; continue; }
      summary.matched++;

      const existing = !!(person.full_name_ar?.trim() || person.first_name_ar?.trim() || person.last_name_ar?.trim());
      if (existing && !overwrite) { report.push({ admission_no: adm, status: 'skipped_existing', detail: 'has Arabic name; enable overwrite to replace' }); summary.skipped_existing++; continue; }

      if (mode === 'apply') {
        const sets = provided.map(([k]) => `${k} = ?`).join(', ');
        const vals = provided.map(([, v]) => v);
        await conn.execute(
          `UPDATE people SET ${sets} WHERE id = ? AND school_id = ?`,
          [...vals, person.person_id, session.schoolId],
        );
      }
      report.push({ admission_no: adm, status: existing ? 'overwritten' : 'updated' });
      summary.updated++;
    }

    return NextResponse.json({ success: true, mode, overwrite, summary, rows: report });
  } catch (e: any) {
    console.error('[arabic-names POST]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
