/**
 * POST /api/id-card-templates/convert-to-drce
 *
 * Lazy one-shot migration: takes the school's active id_card_templates row,
 * converts it to a DRCE document with document_kind='id_card', persists it
 * as a new dvcf_documents row, and returns the new id so the caller can
 * open it in the editor.
 *
 * Idempotency: if a DRCE document already exists with
 * template_key='id_card_legacy:<rowId>' the existing id is returned and
 * no new row is created.
 *
 * Coexistence: the legacy id_card_templates row is NOT modified or deleted.
 * Both editors remain usable until the school has confirmed parity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getConnection } from '@/lib/db';
import { DEFAULT_ID_CARD_CONFIG, type IDCardConfig } from '@/lib/idCardConfig';
import { convertIdCardConfigToDRCE } from '@/lib/drce/idCardConverter';

interface SchoolBrandRow {
  id: number;
  name: string;
  logo_url: string | null;
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'drce.edit', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const conn = await getConnection();
  try {
    // 1. Read the school's active legacy ID card template (config JSON).
    const [tplRows] = await conn.execute(
      `SELECT id, name, config_json FROM id_card_templates
        WHERE school_id = ? AND is_active = 1
        ORDER BY updated_at DESC LIMIT 1`,
      [session.schoolId],
    );
    const tpl = (tplRows as Array<{ id: number; name: string; config_json: string }>)[0];

    // Defaults if the school has never customised — we still produce a DRCE
    // doc so the editor opens with sensible content.
    let config: IDCardConfig;
    let legacyId = 0;
    let templateName = 'ID Card';
    if (tpl) {
      legacyId = tpl.id;
      templateName = tpl.name || 'ID Card';
      try { config = { ...DEFAULT_ID_CARD_CONFIG, ...JSON.parse(tpl.config_json) }; }
      catch { config = DEFAULT_ID_CARD_CONFIG; }
    } else {
      config = DEFAULT_ID_CARD_CONFIG;
    }

    // 2. Look up school brand so the converted card has correct logo/name
    //    bound by default. The renderer will still resolve student/meta
    //    bindings at render time per learner.
    const [schoolRows] = await conn.execute(
      `SELECT id, name, logo_url FROM schools WHERE id = ? LIMIT 1`,
      [session.schoolId],
    );
    const school = (schoolRows as SchoolBrandRow[])[0];

    // 3. Idempotency: if we've already created a DRCE doc for this legacy
    //    row, return that id.
    const linkedKey = `id_card_legacy:${legacyId}`;
    const [existingRows] = await conn.execute(
      `SELECT id FROM dvcf_documents
        WHERE school_id = ? AND template_key = ?
        LIMIT 1`,
      [session.schoolId, linkedKey],
    );
    const existing = (existingRows as Array<{ id: number }>)[0];
    if (existing) {
      return NextResponse.json({ success: true, id: existing.id, reused: true });
    }

    // 4. Convert.
    const drceDoc = convertIdCardConfigToDRCE({
      legacyRowId: legacyId,
      name:        templateName,
      config,
      schoolName:  school?.name ?? 'School',
      schoolLogo:  school?.logo_url ?? null,
    });

    // 5. Persist as a new dvcf_documents row.
    const [insertResult] = await conn.execute(
      `INSERT INTO dvcf_documents
         (school_id, document_type, name, description, schema_json,
          schema_version, is_default, template_category, document_kind, template_key)
       VALUES (?, 'id_card', ?, ?, ?, 1, 0, 'custom', 'id_card', ?)`,
      [
        session.schoolId,
        templateName,
        `Migrated from legacy ID card template #${legacyId}`,
        JSON.stringify(drceDoc),
        linkedKey,
      ],
    );
    const newId = (insertResult as { insertId: number }).insertId;
    return NextResponse.json({ success: true, id: newId, reused: false });
  } catch (e) {
    console.error('[id-card convert-to-drce]', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    await conn.end();
  }
}
