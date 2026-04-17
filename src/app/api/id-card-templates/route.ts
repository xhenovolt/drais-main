import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { DEFAULT_ID_CARD_CONFIG, IDCardConfig } from '@/lib/idCardConfig';

export { DEFAULT_ID_CARD_CONFIG, IDCardConfig };

// ============================================================================
// GET /api/id-card-templates  — returns active template for this school
// POST /api/id-card-templates — upsert active template for this school
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT id, name, config_json FROM id_card_templates
         WHERE school_id = ? AND is_active = 1
         ORDER BY updated_at DESC LIMIT 1`,
        [schoolId]
      );
      const found = (rows as any[])[0];
      if (found) {
        let config: IDCardConfig;
        try { config = { ...DEFAULT_ID_CARD_CONFIG, ...JSON.parse(found.config_json) }; }
        catch { config = DEFAULT_ID_CARD_CONFIG; }
        return NextResponse.json({ success: true, id: found.id, name: found.name, config });
      }
      // No row yet — return defaults
      return NextResponse.json({ success: true, id: null, name: 'Default', config: DEFAULT_ID_CARD_CONFIG });
    } finally {
      await conn.end();
    }
  } catch (err: any) {
    console.error('[id-card-templates GET]', err);
    // Graceful fallback if table doesn't exist yet
    return NextResponse.json({ success: true, id: null, name: 'Default', config: DEFAULT_ID_CARD_CONFIG });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const { name = 'Default', config } = body as { name?: string; config: Partial<IDCardConfig> };
    if (!config) return NextResponse.json({ error: 'config is required' }, { status: 400 });

    const merged = { ...DEFAULT_ID_CARD_CONFIG, ...config };
    const configJson = JSON.stringify(merged);

    const conn = await getConnection();
    try {
      // Deactivate old templates for this school
      await conn.execute(
        `UPDATE id_card_templates SET is_active = 0 WHERE school_id = ?`,
        [schoolId]
      );
      // Insert new active template
      const [result] = await conn.execute(
        `INSERT INTO id_card_templates (school_id, name, config_json, is_active)
         VALUES (?, ?, ?, 1)`,
        [schoolId, name, configJson]
      );
      const insertId = (result as any).insertId;
      return NextResponse.json({ success: true, id: insertId, name, config: merged });
    } finally {
      await conn.end();
    }
  } catch (err: any) {
    console.error('[id-card-templates POST]', err);
    return NextResponse.json({ error: err.message || 'Save failed' }, { status: 500 });
  }
}
