import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import {
  BUILT_IN_TEMPLATES,
  isTemplateCategory,
  type RegistryEntry,
  type TemplateCategory,
} from '@/lib/drce/registry';

/**
 * GET /api/drce/registry — unified, category-driven list of every
 * report-card template available to the calling school.
 *
 * Phase 2 contract:
 *   * Every entry carries an explicit `category` (the canonical taxonomy)
 *     and `renderer` (the engine that turns it into bytes).
 *   * The category for `dvcf_documents` rows comes from the DB column —
 *     no name-based detection.
 *   * Built-in templates declare their own category in code.
 *
 * Query params:
 *   document_type   default 'report_card'
 *   category        filter to one of the valid TemplateCategory values
 *   renderer        filter to drce|emergency_html
 *   include_counts  '1' to also return per-category counts
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const documentType = sp.get('document_type') ?? 'report_card';
  const categoryRaw  = sp.get('category');
  const rendererRaw  = sp.get('renderer');
  const includeCounts = sp.get('include_counts') === '1';

  if (categoryRaw !== null && !isTemplateCategory(categoryRaw)) {
    return NextResponse.json(
      { error: `Invalid category. Expected one of standard|emergency|legacy_rpt|drce|arabic|custom` },
      { status: 400 },
    );
  }
  if (rendererRaw !== null && rendererRaw !== 'drce' && rendererRaw !== 'emergency_html') {
    return NextResponse.json(
      { error: `Invalid renderer. Expected drce|emergency_html` },
      { status: 400 },
    );
  }

  const entries: RegistryEntry[] = [];

  // DB-backed DRCE documents. Failure here must not hide built-ins —
  // fall through with a logged warning.
  try {
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, school_id, document_type, name, description,
                is_default, template_key, template_category, updated_at
           FROM dvcf_documents
          WHERE document_type = ?
            AND (school_id IS NULL OR school_id = ?)
          ORDER BY is_default DESC, name ASC`,
        [documentType, session.schoolId],
      );

      for (const r of rows as Array<{
        id: number; school_id: number | null; document_type: string;
        name: string; description: string; is_default: number;
        template_key: string | null; template_category: TemplateCategory;
        updated_at: string | Date;
      }>) {
        // Defensive: if the column came back as something outside the
        // ENUM (impossible under MySQL semantics, but guards against a
        // schema mismatch in pre-migration environments), fall back to
        // 'drce' since this is the dvcf_documents table.
        const category: TemplateCategory = isTemplateCategory(r.template_category)
          ? r.template_category
          : 'drce';

        entries.push({
          id:               String(r.id),
          name:             r.name,
          description:      r.description ?? '',
          category,
          renderer:         'drce',
          documentType:     r.document_type as RegistryEntry['documentType'],
          supportedTypes:   ['secular', 'theology', 'mixed'],
          // Arabic support is implied by category — explicit, not inferred from name.
          supportsArabic:   category === 'arabic',
          supportsTheology: true,
          isCustom:         r.school_id === session.schoolId,
          isDefault:        r.is_default === 1,
          updatedAt:        r.updated_at
            ? (typeof r.updated_at === 'string'
                ? r.updated_at
                : new Date(r.updated_at).toISOString())
            : null,
        });
      }
    } finally {
      await conn.end();
    }
  } catch (e) {
    console.error('[drce/registry] dvcf_documents lookup failed', e);
  }

  // Built-in templates. Filtered by document_type so the registry
  // call for id_card or transcript does not surface report-card built-ins.
  for (const t of BUILT_IN_TEMPLATES) {
    if (t.documentType === documentType) entries.push(t);
  }

  // Per-category counts BEFORE filtering, so the dashboard can render the
  // full taxonomy with zeroes where a category is empty.
  const counts: Record<TemplateCategory, number> = {
    standard: 0, emergency: 0, legacy_rpt: 0, drce: 0, arabic: 0, custom: 0,
  };
  for (const e of entries) counts[e.category]++;

  let filtered = entries;
  if (categoryRaw) filtered = filtered.filter(e => e.category === categoryRaw);
  if (rendererRaw) filtered = filtered.filter(e => e.renderer === rendererRaw);

  return NextResponse.json({
    success:    true,
    templates:  filtered,
    ...(includeCounts ? { counts } : {}),
  });
}
