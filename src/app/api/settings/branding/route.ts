/**
 * School branding (Phase 3).
 *
 * GET  — this school's theme settings (defaults when no row exists).
 * PUT  — upsert this school's theme (school.update). Colours are validated
 *        as #RGB / #RRGGBB / #RRGGBBAA. Reset = PUT with nulls.
 *
 * The applied result is the BASELINE theme for everyone in the school; a
 * user's personal appearance choice still overrides for their own session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RADII = ['none', 'sm', 'md', 'lg', 'full'];
const BUTTON = ['solid', 'gradient', 'outline'];
const CARD = ['elevated', 'flat', 'glass'];
const SIDEBAR = ['solid', 'glass'];
const BRANDING = ['logo', 'name', 'both'];

const DEFAULTS = {
  primary_color: null, secondary_color: null, accent_color: null, logo_url: null,
  glass_enabled: 1, border_radius: 'lg', button_style: 'solid', card_style: 'elevated',
  sidebar_style: 'solid', report_branding: 'logo', receipt_branding: 'logo',
};

function color(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!HEX.test(s)) throw new Error(`Invalid colour: ${s}`);
  return s;
}
const oneOf = (v: unknown, allowed: string[], fallback: string) =>
  (typeof v === 'string' && allowed.includes(v)) ? v : fallback;

export async function GET(req: NextRequest) {
  // Any authenticated member of the school may READ the visual theme (it's
  // applied to their own UI). Editing still requires school.update (PUT).
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rows = (await query(`SELECT * FROM school_theme_settings WHERE school_id = ? LIMIT 1`, [session.schoolId])) as any[];
  return NextResponse.json({ success: true, theme: rows[0] ?? { school_id: session.schoolId, ...DEFAULTS } });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'school.update', session.isSuperAdmin); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => ({}));
  let t;
  try {
    t = {
      primary_color: color(b.primary_color),
      secondary_color: color(b.secondary_color),
      accent_color: color(b.accent_color),
      logo_url: b.logo_url ? String(b.logo_url).trim().slice(0, 512) : null,
      glass_enabled: b.glass_enabled === false || b.glass_enabled === 0 ? 0 : 1,
      border_radius: oneOf(b.border_radius, RADII, 'lg'),
      button_style: oneOf(b.button_style, BUTTON, 'solid'),
      card_style: oneOf(b.card_style, CARD, 'elevated'),
      sidebar_style: oneOf(b.sidebar_style, SIDEBAR, 'solid'),
      report_branding: oneOf(b.report_branding, BRANDING, 'logo'),
      receipt_branding: oneOf(b.receipt_branding, BRANDING, 'logo'),
    };
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await query(
    `INSERT INTO school_theme_settings
       (school_id, primary_color, secondary_color, accent_color, logo_url, glass_enabled,
        border_radius, button_style, card_style, sidebar_style, report_branding, receipt_branding, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       primary_color=VALUES(primary_color), secondary_color=VALUES(secondary_color),
       accent_color=VALUES(accent_color), logo_url=VALUES(logo_url), glass_enabled=VALUES(glass_enabled),
       border_radius=VALUES(border_radius), button_style=VALUES(button_style), card_style=VALUES(card_style),
       sidebar_style=VALUES(sidebar_style), report_branding=VALUES(report_branding),
       receipt_branding=VALUES(receipt_branding), updated_by=VALUES(updated_by)`,
    [session.schoolId, t.primary_color, t.secondary_color, t.accent_color, t.logo_url, t.glass_enabled,
     t.border_radius, t.button_style, t.card_style, t.sidebar_style, t.report_branding, t.receipt_branding,
     session.userId ?? null],
  );

  await logAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: AuditAction.SETTINGS_CHANGED, entityType: 'school_theme_settings', entityId: session.schoolId,
    details: t, ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });

  return NextResponse.json({ success: true, theme: { school_id: session.schoolId, ...t } });
}
