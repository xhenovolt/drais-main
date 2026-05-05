import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import {
  BUILT_IN_EMERGENCY_TEMPLATES,
  type RegistryEntry,
} from '@/lib/drce/registry';

/**
 * GET /api/drce/registry — unified list of every report-card template
 * available to the calling school. Merges database-backed DRCE documents
 * with built-in emergency templates so selection UIs only need one fetch.
 *
 * Query params:
 *   document_type   default 'report_card'
 *   category        filter to one of standard|emergency|compact|detailed
 *   renderer        filter to drce|emergency_html
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const documentType = sp.get('document_type') ?? 'report_card';
  const category     = sp.get('category');
  const renderer     = sp.get('renderer');

  const entries: RegistryEntry[] = [];

  // Database-backed DRCE documents (custom + shared defaults). Failure here
  // must not hide built-in templates — fall through with an empty list.
  try {
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, school_id, document_type, name, description,
                is_default, template_key, updated_at
           FROM dvcf_documents
          WHERE document_type = ?
            AND (school_id IS NULL OR school_id = ?)
          ORDER BY is_default DESC, name ASC`,
        [documentType, session.schoolId],
      );
      for (const r of rows as Array<{
        id: number; school_id: number | null; document_type: string;
        name: string; description: string; is_default: number;
        template_key: string | null; updated_at: string | Date;
      }>) {
        entries.push({
          id:               String(r.id),
          name:             r.name,
          description:      r.description ?? '',
          category:         'standard',
          renderer:         'drce',
          documentType:     r.document_type as RegistryEntry['documentType'],
          supportedTypes:   ['secular', 'theology', 'mixed'],
          supportsArabic:   false,
          supportsTheology: true,
          isCustom:         r.school_id === session.schoolId,
          isDefault:        r.is_default === 1,
          isEmergency:      false,
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

  // Built-in emergency templates. Filtered by document_type so the registry
  // call for id_card or transcript does not show report-card emergencies.
  for (const t of BUILT_IN_EMERGENCY_TEMPLATES) {
    if (t.documentType === documentType) entries.push(t);
  }

  let filtered = entries;
  if (category) filtered = filtered.filter(e => e.category === category);
  if (renderer) filtered = filtered.filter(e => e.renderer === renderer);

  return NextResponse.json({ success: true, templates: filtered });
}
