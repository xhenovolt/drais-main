/**
 * src/app/api/drce/templates/[id]/enable-totals/route.ts
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * API endpoint to enable totals/averages in a DRCE template's results table
 * PATCH /api/drce/templates/[id]/enable-totals
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import type { DRCEDocument, DRCEResultsTableSection } from '@/lib/drce/schema';
import { generateDefaultTotalsConfig } from '@/lib/drce/totalsCalculator';
import { checkModule } from '@/lib/auth/requireModule';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const modDenied = await checkModule(session.schoolId, 'academics');
    if (modDenied) return modDenied;
    const schoolId = session.schoolId;

    const templateId = params.id;
    const body = await req.json();
    const {
      labelColumnId,
      sumColumnIds,
      showAverage = true,
      labelText = 'TOTAL',
      averageLabelText = 'AVERAGE',
    } = body;

    // Get the template
    const [templates]: any = await conn.execute(
      `SELECT id, schema FROM drce_documents 
       WHERE id = ? AND (school_id = ? OR built_in = 1)
       LIMIT 1`,
      [templateId, schoolId]
    );

    if (!templates || templates.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const template = templates[0];
    const schema: DRCEDocument = JSON.parse(template.schema);

    // Find results_table section
    const resultsTableSection = schema.sections?.find(
      (s: any) => s.type === 'results_table'
    ) as DRCEResultsTableSection | undefined;

    if (!resultsTableSection) {
      return NextResponse.json(
        { error: 'No results_table section found in template' },
        { status: 400 }
      );
    }

    // Generate or apply totals config
    let totalsConfig;
    if (body.enabled === false) {
      // Disable totals
      totalsConfig = { enabled: false, labelColumnId: '', labelText: '', sumColumnIds: [], showAverage: false };
    } else {
      // Enable totals
      totalsConfig = generateDefaultTotalsConfig(
        resultsTableSection.columns,
        {
          labelColumnId,
          sumColumnIds,
          showAverage,
        }
      );

      // Override labels if provided
      if (labelText) totalsConfig.labelText = labelText;
      if (averageLabelText) totalsConfig.averageLabelText = averageLabelText;
    }

    resultsTableSection.totalsConfig = totalsConfig;

    // Update the template
    const schemaJson = JSON.stringify(schema);
    await conn.execute(
      `UPDATE drce_documents SET schema = ?, updated_at = NOW() WHERE id = ?`,
      [schemaJson, templateId]
    );

    return NextResponse.json({
      success: true,
      message: totalsConfig.enabled ? 'Totals enabled' : 'Totals disabled',
      totalsConfig,
    });
  } catch (error) {
    console.error('Error updating template totals:', error);
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}

/**
 * GET /api/drce/templates/[id]/enable-totals
 * Get current totals configuration for a template
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const modDenied = await checkModule(session.schoolId, 'academics');
    if (modDenied) return modDenied;
    const schoolId = session.schoolId;

    const templateId = params.id;

    const [templates]: any = await conn.execute(
      `SELECT id, schema FROM drce_documents 
       WHERE id = ? AND (school_id = ? OR built_in = 1)
       LIMIT 1`,
      [templateId, schoolId]
    );

    if (!templates || templates.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const template = templates[0];
    const schema: DRCEDocument = JSON.parse(template.schema);

    const resultsTableSection = schema.sections?.find(
      (s: any) => s.type === 'results_table'
    ) as DRCEResultsTableSection | undefined;

    if (!resultsTableSection) {
      return NextResponse.json(
        { error: 'No results_table section found' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      totalsConfig: resultsTableSection.totalsConfig || null,
      columns: resultsTableSection.columns,
    });
  } catch (error) {
    console.error('Error fetching template totals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
