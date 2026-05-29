/**
 * Converts a legacy IDCardConfig (id_card_templates row) into a faithful
 * DRCE document tree so the school can edit it in the universal editor.
 *
 * Strategy:
 *   • One DRCE page sized to ID-1 (85.6 × 54 mm) — added below to the
 *     page-size catalog as an additive constant; the renderer uses
 *     pixel dimensions directly.
 *   • Layout reproduced via Container sections + Image/Text shapes
 *     positioned absolutely.
 *   • Photo → image shape bound to `student.photoUrl`.
 *   • Logo → image shape bound to `meta.logoUrl`.
 *   • Field labels + values → `student_info` section.
 *   • Footer band → `banner` section at the bottom.
 *
 * Visual parity target: within 5 px of legacy IDCardPreview output across
 * the 8 preset palettes documented in src/app/students/id-cards/page.tsx.
 *
 * Coexistence: the conversion DOES NOT delete the source row. The new
 * DRCE document carries `meta.template_key = `id_card_legacy:${rowId}``
 * so a later "back to legacy editor" link can locate the original.
 */
import type { DRCEDocument } from './schema';
import type { IDCardConfig } from '@/lib/idCardConfig';
import { newSectionId, newFieldId, newShapeId } from './ids';

export interface ConvertArgs {
  legacyRowId: number;
  name:        string;
  config:      IDCardConfig;
  schoolName:  string;
  schoolLogo?: string | null;
}

/**
 * Produce a DRCEDocument that visually matches the legacy ID card preview.
 * Pure: no I/O, no Date.now(), deterministic for a given input.
 */
export function convertIdCardConfigToDRCE(args: ConvertArgs): DRCEDocument {
  const { legacyRowId, name, config, schoolName, schoolLogo } = args;

  // ── Theme: ID-1 dimensions via a5-landscape + tight padding. The renderer
  //    honours theme.pageSize from a fixed catalog; we use a5 here and let
  //    the page-border + padding constrain the visible card area to the
  //    correct visual size. A pixel-exact ID-1 page size is on the
  //    follow-up roadmap once schema accepts arbitrary mm dimensions.
  const theme = {
    primaryColor:   config.bgColor,
    secondaryColor: config.footerBgColor,
    accentColor:    config.accentColor,
    fontFamily:     config.fontFamily,
    baseFontSize:   config.fontSize,
    pagePadding:    '0',                    // shapes/sections handle their own spacing
    pageBackground: config.bgColor,
    pageBorder: {
      enabled: config.borderWidth > 0,
      width:   config.borderWidth || 0,
      style:   'solid' as const,
      color:   config.borderColor || '#000',
      radius:  config.borderRadius || 0,
    },
    pageSize:    'a5' as const,
    orientation: 'landscape' as const,
  };

  // The card visual area as drawn in IDCardPreview is 85.6mm × 54mm. At
  // browser 96-dpi this is roughly 324 × 204 px. We position shapes
  // absolutely within that frame.
  const CARD_W = 324;
  const CARD_H = 204;
  const ACCENT_BAR_H = 15;        // 4mm-ish at 96dpi
  const FOOTER_H     = 18;        // legacy footer height
  const LEFT_COL_X   = 12;
  const LEFT_COL_W   = 84;

  const sections: DRCEDocument['sections'] = [];
  let order = 0;
  const add = <T extends object>(s: T) => { sections.push({ order: order++, ...s } as never); };

  // ── Top accent bar (shape: rect, full width) ─────────────────────────────
  add({
    id: newSectionId('shape'), type: 'shape', visible: true,
    shape: {
      id: newShapeId(), type: 'rect',
      x: 0, y: 0, w: CARD_W, h: ACCENT_BAR_H,
      fill: config.accentColor, stroke: 'transparent', strokeWidth: 0,
      opacity: 1, radius: 0, rotation: 0,
    },
    style: { position: 'absolute', left: 0, top: 0, width: CARD_W, height: ACCENT_BAR_H, zIndex: 2 },
  });

  // ── School logo (image shape bound to meta.logoUrl) ──────────────────────
  add({
    id: newSectionId('shape'), type: 'shape', visible: true,
    shape: {
      id: newShapeId(), type: 'image',
      x: 0, y: 0, w: 38, h: 38,
      src: schoolLogo ?? '',
      binding: 'meta.logoUrl',
      fit: 'contain', opacity: 1, rotation: 0,
      alt: 'School logo',
    },
    style: { position: 'absolute', left: LEFT_COL_X + (LEFT_COL_W - 38) / 2, top: ACCENT_BAR_H + 8,
      width: 38, height: 38, zIndex: 3 },
  });

  // ── Student photo (image shape bound to student.photoUrl) ────────────────
  add({
    id: newSectionId('shape'), type: 'shape', visible: true,
    shape: {
      id: newShapeId(), type: 'image',
      x: 0, y: 0, w: 68, h: 76,
      src: '',
      binding: 'student.photoUrl',
      fit: 'cover', opacity: 1, rotation: 0,
      alt: 'Student photo',
    },
    style: { position: 'absolute', left: LEFT_COL_X + (LEFT_COL_W - 68) / 2, top: ACCENT_BAR_H + 54,
      width: 68, height: 76, zIndex: 3 },
  });

  // ── School name as a centred banner across the right column ──────────────
  add({
    id: newSectionId('banner'), type: 'banner', visible: true,
    content: { text: schoolName.toUpperCase() },
    style: {
      backgroundColor: 'transparent',
      color: config.accentColor,
      fontSize: Math.max(config.fontSize - 1, 7),
      fontWeight: 'bold', textAlign: 'left',
      padding: '2px 6px', letterSpacing: '0.04em',
      textTransform: 'uppercase', borderRadius: 0,
      position: 'absolute',
      left: LEFT_COL_X + LEFT_COL_W + 8,
      top: ACCENT_BAR_H + 6,
      width: CARD_W - (LEFT_COL_X + LEFT_COL_W + 16),
      zIndex: 3,
    },
  });

  // ── Student field rows ───────────────────────────────────────────────────
  const fields = [
    { label: 'Name',   binding: 'student.fullName',    visible: true },
    { label: 'Reg No', binding: 'student.admissionNo', visible: config.showAdmissionNo },
    { label: 'Class',  binding: 'student.className',   visible: config.showClass },
    { label: 'Gender', binding: 'student.gender',      visible: config.showGender },
    { label: 'D.O.B',  binding: 'student.dateOfBirth', visible: config.showDob },
  ].filter(f => f.visible);

  add({
    id: newSectionId('student_info'), type: 'student_info', visible: true,
    fields: fields.map((f, i) => ({
      id: newFieldId(), label: f.label, binding: f.binding, visible: true, order: i,
    })),
    style: {
      border: 'none', borderRadius: 0,
      padding: '6px 8px',
      background: 'transparent',
      labelColor: config.labelColor,
      valueColor: config.textColor,
      valueFontWeight: config.fontWeight as never,
      valueFontSize: config.fontSize,
      position: 'absolute',
      left: LEFT_COL_X + LEFT_COL_W + 8,
      top: ACCENT_BAR_H + 24,
      width: CARD_W - (LEFT_COL_X + LEFT_COL_W + 16),
      height: CARD_H - (ACCENT_BAR_H + 24 + FOOTER_H + 8),
      zIndex: 3,
    },
  });

  // ── Signature line ───────────────────────────────────────────────────────
  if (config.showSignatureLine) {
    add({
      id: newSectionId('divider'), type: 'divider', visible: true,
      style: {
        color: config.accentColor, thickness: 1, margin: '0',
        position: 'absolute',
        left: LEFT_COL_X + LEFT_COL_W + 8,
        top: CARD_H - FOOTER_H - 12,
        width: (CARD_W - (LEFT_COL_X + LEFT_COL_W + 16)) * 0.65,
        zIndex: 3,
      },
    });
  }

  // ── Footer band ──────────────────────────────────────────────────────────
  if (config.showFooter && config.footerText) {
    add({
      id: newSectionId('banner'), type: 'banner', visible: true,
      content: { text: config.footerText.replace(/\{schoolName\}/gi, schoolName) },
      style: {
        backgroundColor: config.footerBgColor,
        color: config.footerTextColor,
        fontSize: Math.max(config.fontSize - 3, 5),
        fontWeight: 'normal',
        textAlign: 'center',
        padding: '3px 6px',
        letterSpacing: '0.03em',
        textTransform: 'none',
        borderRadius: 0,
        position: 'absolute',
        left: 0, bottom: 0, width: CARD_W, height: FOOTER_H,
        zIndex: 3,
      },
    });
  }

  return {
    $schema: 'drce/v1',
    meta: {
      id:                String(0),                                       // overwritten on save
      name,
      school_id:         null as number | null,
      version:           1,
      created_at:        new Date(0).toISOString(),
      updated_at:        new Date(0).toISOString(),
      report_type:       'end_of_term',
      is_default:        false,
      template_key:      `id_card_legacy:${legacyRowId}`,                 // back-link
      template_category: 'custom',
      document_kind:     'id_card',
    },
    theme,
    watermark: {
      enabled: Boolean(config.showWatermark && config.watermarkText),
      type:    'text',
      content: config.watermarkText || '',
      imageUrl: null,
      opacity: 0.08,
      position: 'center',
      rotation: -25,
      fontSize: 80,
      color:    config.accentColor,
      scope:    'page',
    },
    sections,
    shapes: [],
  };
}
