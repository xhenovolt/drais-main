/**
 * Snapshot print route — emergency-template parity.
 *
 * GET /academics/report-cards/{secular|theology|mixed}/{snapshotId}/print
 *   ?class_id=<index>      filter to one class (zero-based index)
 *   ?student_id=<dbId>     filter to one student (numeric studentDbId)
 *
 * Reads only the snapshot row (DB) and a static template file shipped in
 * the repo at backup/. No live MySQL queries on the results path.
 *
 * The output mirrors src/app/academics/secular-emergency-reports/route.ts
 * and theology-emergency-reports/route.ts so users get pixel-identical
 * prints from snapshots they generated themselves.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSessionSchoolId } from '@/lib/auth';
import { loadSnapshot } from '@/lib/snapshots/storage';
import { snapshotToTemplateMap } from '@/lib/snapshots/adapter/toTemplateMap';
import { renderEmergencyTemplate } from '@/lib/snapshots/adapter/renderEmergencyTemplate';
import type { ReportSnapshot, SnapshotType } from '@/lib/snapshots/types';

const TEMPLATE_FILES: Record<SnapshotType, string> = {
  secular:  'secular-emergency-template.html',
  theology: 'theology-emergency-template.html',
  mixed:    'secular-emergency-template.html',
};

const VALID_TYPES: SnapshotType[] = ['theology', 'secular', 'mixed'];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ type: string; snapshotId: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { type, snapshotId } = await ctx.params;
  if (!VALID_TYPES.includes(type as SnapshotType)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const snapshot = await loadSnapshot(snapshotId, session.schoolId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (snapshot.meta.type !== type) {
    return NextResponse.json({ error: 'Snapshot type mismatch' }, { status: 400 });
  }

  const templatePath = path.join(process.cwd(), 'backup', TEMPLATE_FILES[type as SnapshotType]);
  let template: string;
  try {
    template = await fs.readFile(templatePath, 'utf8');
  } catch (e: any) {
    console.error('[snapshots/print] Missing template:', templatePath, e?.message);
    return NextResponse.json(
      { error: 'TEMPLATE_MISSING', message: `Template file not found: ${TEMPLATE_FILES[type as SnapshotType]}` },
      { status: 500 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const classIdRaw  = sp.get('class_id');
  const studentIdRaw = sp.get('student_id');
  const filterClassIdx = classIdRaw !== null ? parseInt(classIdRaw, 10) : null;
  const filterStudentDbId = studentIdRaw !== null ? parseInt(studentIdRaw, 10) : null;

  const isArabic = snapshot.meta.numerals === 'arabic';
  const direction = isArabic ? 'rtl' : 'ltr';
  const lang = isArabic ? 'ar' : 'en';

  // Render every student into one big HTML body (matching emergency routes).
  const studentBlocks: string[] = [];
  snapshot.classes.forEach((cls, classIdx) => {
    if (filterClassIdx !== null && !Number.isNaN(filterClassIdx) && classIdx !== filterClassIdx) return;
    cls.students.forEach((stu, studentIdx) => {
      if (filterStudentDbId !== null && !Number.isNaN(filterStudentDbId) && stu.studentDbId !== filterStudentDbId) return;
      const out = snapshotToTemplateMap({ snapshot, classIdx, studentIdx });
      studentBlocks.push(renderEmergencyTemplate(template, out));
    });
  });

  if (studentBlocks.length === 0) {
    return new NextResponse(emptyDocument(snapshot, lang, direction), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const printControls = buildPrintControls(snapshot, isArabic);
  const fullHtml = wrapDocument(
    snapshot,
    lang,
    direction,
    printControls + '\n' + studentBlocks.join('\n'),
  );

  return new NextResponse(fullHtml, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function buildPrintControls(snapshot: ReportSnapshot, isArabic: boolean): string {
  const classOptions = snapshot.classes.map((c, i) => {
    const label = isArabic ? `📚 ${c.className}` : `📚 ${c.className}`;
    return `<option value="${i}">${escape(label)}</option>`;
  }).join('');
  const allLabel       = isArabic ? '🔄 جميع الفصول'   : '🔄 All Classes';
  const printAllLabel  = isArabic ? '🖨️ طباعة الكل'    : '🖨️ Print All';
  const printClsLabel  = isArabic ? '🖨️ طباعة الفصل'  : '🖨️ Print Selected Class';
  const selectLabel    = isArabic ? 'اختر الفصل:'      : 'Select class:';

  return `
    <div class="no-print" style="position: fixed; top: 10px; ${isArabic ? 'left' : 'right'}: 10px; background: #fff; border: 1px solid #ccc; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); border-radius: 6px; z-index: 9999; min-width: 240px;">
      <div style="font-size: 12px; color: #555; margin-bottom: 6px;">${selectLabel}</div>
      <select id="snapshotClassSelect" onchange="snapshotFilterByClass()" style="width: 100%; padding: 6px; margin-bottom: 8px; font-size: 13px;">
        <option value="">${allLabel}</option>
        ${classOptions}
      </select>
      <button onclick="window.print()" style="display: block; width: 100%; margin-bottom: 6px; padding: 8px; background: #09a12a; color: white; border: 0; border-radius: 4px; cursor: pointer; font-weight: bold;">${printAllLabel}</button>
      <button onclick="snapshotPrintSelectedClass()" style="display: block; width: 100%; padding: 8px; background: #0066cc; color: white; border: 0; border-radius: 4px; cursor: pointer; font-weight: bold;">${printClsLabel}</button>
    </div>
    <script>
      function snapshotFilterByClass() {
        var v = document.getElementById('snapshotClassSelect').value;
        if (v) window.location.href = '?class_id=' + v;
        else   window.location.href = window.location.pathname;
      }
      function snapshotPrintSelectedClass() {
        var v = document.getElementById('snapshotClassSelect').value;
        if (v) {
          var w = window.open('?class_id=' + v, '_blank');
          if (w) w.addEventListener('load', function () { try { w.print(); } catch (e) {} });
        } else {
          window.print();
        }
      }
    </script>
  `;
}

function wrapDocument(snapshot: ReportSnapshot, lang: string, direction: 'ltr' | 'rtl', body: string): string {
  const title = `${escape(snapshot.meta.schoolName)} — ${escape(snapshot.meta.termName)} ${escape(snapshot.meta.yearName)}`;
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${direction}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20px; color: #333; direction: ${direction}; }
    .report-container { width: 800px; margin: auto; border: 1px solid #ccc; padding: 10px; page-break-after: always; }
    @page { size: A4; margin: 1cm; }
    .blue-banner { background: #09a12a; color: white; text-align: center; padding: 5px; font-weight: bold; letter-spacing: 2px; margin: 5px 0; }
    .student-info-table { width: 100%; border-collapse: collapse; border: 1px dashed #999; margin-bottom: 10px; }
    .info-label { color: #555; font-size: 11px; }
    .info-value { color: #0066cc; font-weight: bold; font-size: 14px; text-transform: uppercase; }
    .results-table { width: 100%; border-collapse: collapse; margin-top: -1px; }
    .results-table th, .results-table td { border: 1px solid #333; padding: 4px; text-align: center; }
    .results-table th { background: #f2f2f2; text-transform: uppercase; font-size: 11px; }
    .comment-cell { font-style: italic; color: #09a12a; font-size: 11px; width: 30%; text-align: ${direction === 'rtl' ? 'right' : 'left'} !important; }
    .initials { color: #09a12a; font-weight: bold; }
    .grade-scale { width: 100%; border-collapse: collapse; margin-top: 15px; }
    .grade-scale td { border: 1px solid #000; text-align: center; padding: 3px; font-size: 10px; }
    .grade-header { background: #f2f2f2; font-weight: bold; }
    @media print {
      .report-container { page-break-after: always; }
      .no-print { display: none !important; }
      body { font-size: 10px; padding: 0; zoom: 90%; }
      img { max-width: 100%; height: auto; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function emptyDocument(snapshot: ReportSnapshot, lang: string, direction: 'ltr' | 'rtl'): string {
  const msg = direction === 'rtl'
    ? 'لا توجد نتائج للعرض'
    : 'No results to display';
  return wrapDocument(snapshot, lang, direction,
    `<div style="padding: 60px; text-align: center; color: #666;">${msg}</div>`,
  );
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch] as string);
}
