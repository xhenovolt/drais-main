import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { DRAIS_DEFAULT_DOCUMENT } from '@/lib/drce/defaults';
import type { DRCEDocument, DRCESection } from '@/lib/drce/schema';
import type { ReportLayoutJSON } from '@/lib/reportTemplates';

// ============================================================================
// GET /api/dvcf/link-template/[templateId]
//
// Finds or creates a dvcf_document linked to a report_template by ID.
// When creating, migrates the kitchen template's layout_json colors/fonts
// into the DRCEDocument so each template looks distinct in the editor.
// Returns { id: number } — the dvcf_document ID to navigate to.
// ============================================================================

/** Migrate old ReportLayoutJSON → DRCEDocument, preserving colors/fonts. */
function migrateKitchenLayout(layout: ReportLayoutJSON, name: string): DRCEDocument {
  const base = structuredClone(DRAIS_DEFAULT_DOCUMENT);

  // ── Theme ──
  base.meta.name = name;
  if (layout.page?.fontFamily)  base.theme.fontFamily     = layout.page.fontFamily;
  if (layout.page?.fontSize)    base.theme.baseFontSize   = layout.page.fontSize;
  if (layout.page?.background)  base.theme.pageBackground = layout.page.background;
  if (layout.page?.padding)     base.theme.pagePadding    = layout.page.padding;
  if (layout.banner?.backgroundColor) base.theme.primaryColor   = layout.banner.backgroundColor;
  if (layout.table?.th?.background)   base.theme.secondaryColor = layout.table.th.background;
  if (layout.ribbon?.background && !layout.ribbon.background.startsWith('linear')) {
    base.theme.accentColor = layout.ribbon.background;
  }
  if (layout.pageBorder) {
    base.theme.pageBorder = {
      enabled: layout.pageBorder.enabled ?? false,
      color:   layout.pageBorder.color   ?? '#cccccc',
      width:   layout.pageBorder.width   ?? 1,
      style:   (layout.pageBorder.style  ?? 'solid') as 'solid' | 'dashed' | 'dotted' | 'double',
      radius:  layout.pageBorder.radius  ?? 0,
    };
  }

  // ── Per-section styles ──
  base.sections = base.sections.map((s: DRCESection): DRCESection => {
    switch (s.type) {
      case 'banner':
        return {
          ...s,
          style: {
            ...s.style,
            backgroundColor: layout.banner?.backgroundColor ?? s.style.backgroundColor,
            color:           layout.banner?.color           ?? s.style.color,
            fontSize:        layout.banner?.fontSize        ?? s.style.fontSize,
            textAlign:       (layout.banner?.textAlign      ?? s.style.textAlign) as 'left' | 'center' | 'right',
            letterSpacing:   layout.banner?.letterSpacing   ?? s.style.letterSpacing,
            textTransform:   (layout.banner?.textTransform  ?? s.style.textTransform) as 'uppercase' | 'none' | 'capitalize',
            padding:         layout.banner?.padding         ?? s.style.padding,
            borderRadius:    layout.banner?.borderRadius    ?? s.style.borderRadius,
          },
        };
      case 'ribbon':
        return {
          ...s,
          style: {
            ...s.style,
            background: layout.ribbon?.background ?? s.style.background,
            color:      layout.ribbon?.color      ?? s.style.color,
            fontSize:   layout.ribbon?.fontSize   ?? s.style.fontSize,
            padding:    layout.ribbon?.padding    ?? s.style.padding,
          },
        };
      case 'student_info':
        return {
          ...s,
          style: {
            ...s.style,
            border:         layout.studentInfoBox?.border      ?? s.style.border,
            borderRadius:   layout.studentInfoBox?.borderRadius ?? s.style.borderRadius,
            padding:        layout.studentInfoBox?.padding      ?? s.style.padding,
            background:     layout.studentInfoBox?.background   ?? s.style.background,
            labelColor:     s.style.labelColor,
            valueColor:     layout.studentValue?.color          ?? s.style.valueColor,
            valueFontWeight: layout.studentValue?.fontWeight    ?? s.style.valueFontWeight,
          },
        };
      case 'results_table':
        return {
          ...s,
          style: {
            ...s.style,
            headerBackground: layout.table?.th?.background ?? s.style.headerBackground,
            headerBorder:     layout.table?.th?.border     ?? s.style.headerBorder,
            rowBorder:        layout.table?.td?.border     ?? s.style.rowBorder,
            headerFontSize:   layout.table?.fontSize       ?? s.style.headerFontSize,
            rowFontSize:      layout.table?.fontSize       ?? s.style.rowFontSize,
            padding:          layout.table?.th?.padding    ?? s.style.padding,
          },
        };
      case 'comments':
        return {
          ...s,
          style: {
            ...s.style,
            ribbonBackground: layout.comments?.ribbon?.background ?? s.style.ribbonBackground,
            ribbonColor:      layout.comments?.ribbon?.color      ?? s.style.ribbonColor,
            textColor:        layout.comments?.text?.color        ?? s.style.textColor,
          },
        };
      case 'grade_table':
        return {
          ...s,
          style: {
            headerBackground: layout.gradeTable?.th?.background ?? s.style.headerBackground,
            border:           layout.gradeTable?.th?.border     ?? s.style.border,
          },
        };
      case 'header':
        return {
          ...s,
          style: {
            ...s.style,
            layout:       (layout.header?.layout      ?? s.style.layout) as 'three-column' | 'centered' | 'left-logo',
            paddingBottom: layout.header?.paddingBottom ?? s.style.paddingBottom,
            borderBottom:  layout.header?.borderBottom  ?? s.style.borderBottom,
            opacity:       layout.header?.opacity        ?? s.style.opacity,
          },
        };
      default:
        return s;
    }
  });

  return base;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const { schoolId } = session;

    const { templateId } = await params;
    const tid = parseInt(templateId, 10);
    if (isNaN(tid)) return NextResponse.json({ error: 'Invalid templateId' }, { status: 400 });

    const templateKey = `kitchen_rpt_${tid}`;

    const conn = await getConnection();
    try {
      // Check for existing linked document
      const [existing] = await conn.execute(
        `SELECT id, schema_json FROM dvcf_documents
         WHERE template_key = ? AND (school_id IS NULL OR school_id = ?)
         LIMIT 1`,
        [templateKey, schoolId],
      );

      const rows = existing as { id: number; schema_json: string }[];
      if (rows.length > 0) {
        // If the existing doc was seeded with empty/default schema, re-migrate it now
        const raw = rows[0].schema_json;
        let needsMigration = !raw || raw === '{}' || raw === 'null';
        if (!needsMigration) {
          try {
            const parsed = JSON.parse(raw) as { theme?: { primaryColor?: string } };
            // Default blue is the "never customised" sentinel
            if (parsed?.theme?.primaryColor === '#0000FF') needsMigration = true;
          } catch { needsMigration = true; }
        }
        if (!needsMigration) {
          return NextResponse.json({ id: rows[0].id });
        }
        // Fall through to re-migrate and update
        const [tmplRowsM] = await conn.execute(
          `SELECT name, layout_json FROM report_templates
           WHERE id = ? AND (school_id IS NULL OR school_id = ?) LIMIT 1`,
          [tid, schoolId],
        );
        const tmplM = (tmplRowsM as { name: string; layout_json: string }[])[0];
        const nameM = tmplM?.name ?? `Template ${tid}`;
        let docM: DRCEDocument;
        try {
          const layoutM = typeof tmplM?.layout_json === 'string'
            ? JSON.parse(tmplM.layout_json) as ReportLayoutJSON
            : (tmplM?.layout_json as ReportLayoutJSON | undefined);
          docM = layoutM ? migrateKitchenLayout(layoutM, nameM) : structuredClone(DRAIS_DEFAULT_DOCUMENT);
          docM.meta.name = nameM;
        } catch {
          docM = structuredClone(DRAIS_DEFAULT_DOCUMENT);
          docM.meta.name = nameM;
        }
        await conn.execute(
          `UPDATE dvcf_documents SET schema_json = ?, name = ? WHERE id = ?`,
          [JSON.stringify(docM), nameM, rows[0].id],
        );
        return NextResponse.json({ id: rows[0].id });
      }

      // Fetch the source report_template
      const [tmplRows] = await conn.execute(
        `SELECT name, layout_json FROM report_templates
         WHERE id = ? AND (school_id IS NULL OR school_id = ?) LIMIT 1`,
        [tid, schoolId],
      );

      const tmpl = (tmplRows as { name: string; layout_json: string }[])[0];
      const name = tmpl?.name ?? `Template ${tid}`;

      // Parse layout_json and migrate colors into a DRCEDocument
      let doc: DRCEDocument;
      try {
        const layout = typeof tmpl?.layout_json === 'string'
          ? JSON.parse(tmpl.layout_json) as ReportLayoutJSON
          : (tmpl?.layout_json as ReportLayoutJSON | undefined);
        doc = layout ? migrateKitchenLayout(layout, name) : structuredClone(DRAIS_DEFAULT_DOCUMENT);
        doc.meta.name = name;
      } catch {
        doc = structuredClone(DRAIS_DEFAULT_DOCUMENT);
        doc.meta.name = name;
      }

      const [result] = await conn.execute(
        `INSERT INTO dvcf_documents
           (school_id, document_type, name, description, schema_json, schema_version, is_default, template_key)
         VALUES (?, 'report_card', ?, '', ?, 1, 0, ?)`,
        [schoolId, name, JSON.stringify(doc), templateKey],
      );

      const insertId = (result as { insertId: number }).insertId;
      return NextResponse.json({ id: insertId });
    } finally {
      await conn.end();
    }
  } catch (error: unknown) {
    console.error('[dvcf/link-template GET]', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

