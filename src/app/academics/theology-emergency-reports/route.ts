import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getSessionSchoolId } from '@/lib/auth';
import { fetchSchool } from '@/lib/snapshots/queries';

const escapeHtml = (s: string): string =>
  String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch] as string);

/**
 * Convert Arabic numerals to Western numerals for parsing/calculations
 * ٠→0, ١→1, ٢→2, ٣→3, ٤→4, ٥→5, ٦→6, ٧→7, ٨→8, ٩→9, ٫→.
 */
function arabicToWestern(arabicStr: string): string {
  if (!arabicStr) return '0';
  const arabicDigits: { [key: string]: string } = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
    '٫': '.'
  };
  return arabicStr.replace(/[٠-٩٫]/g, (char) => arabicDigits[char] || char);
}

/**
 * Convert Western numerals to Arabic numerals for display
 * 0→٠, 1→١, 2→٢, 3→٣, 4→٤, 5→٥, 6→٦, 7→٧, 8→٨, 9→٩, .→٫
 */
function toArabicNumerals(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '٠';
  
  const str = value.toString();
  const arabicMap: { [key: string]: string } = {
    '0': '٠',
    '1': '١',
    '2': '٢',
    '3': '٣',
    '4': '٤',
    '5': '٥',
    '6': '٦',
    '7': '٧',
    '8': '٨',
    '9': '٩',
    '.': '٫'
  };
  
  return str.replace(/[0-9.]/g, (char) => arabicMap[char] || char);
}

/**
 * Emergency Theology Reports
 * GET /academics/theology-emergency-reports — Generate bulk reports from JSON backup
 * Query params:
 * - class_id: Filter by specific class
 * - format: 'html' (default) or 'json' for data
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const school = await fetchSchool(session.schoolId);
    const brandNameAr = school?.arabicName || school?.schoolName || 'المدرسة';
    const brandLogo   = school?.logoUrl    || '/placeholder-logo.png';

    const classId = req.nextUrl.searchParams.get('class_id');
    const format = req.nextUrl.searchParams.get('format') || 'html';

    // Read the JSON backup file
    const jsonPath = path.join(process.cwd(), 'backup', 'theology-results-term1-2026.json');
    const jsonData = await fs.readFile(jsonPath, 'utf-8');
    const data = JSON.parse(jsonData);

    if (format === 'json') {
      return NextResponse.json(data);
    }

    // Read the template
    const templatePath = path.join(process.cwd(), 'backup', 'theology-emergency-template.html');
    let template = await fs.readFile(templatePath, 'utf-8');

    // Filter classes if specified
    let classesToRender = data.classes;
    if (classId) {
      // classId is the index of the class in the array
      const idx = parseInt(classId, 10);
      if (!isNaN(idx) && idx >= 0 && idx < data.classes.length) {
        classesToRender = [data.classes[idx]];
      }
    }

    // Generate HTML for all reports
    let allReportsHtml = '';

    // Add print controls at the top
    const printControls = `
      <div class="no-print" style="position: fixed; top: 10px; right: 10px; background: white; border: 2px solid #09a12a; border-radius: 8px; padding: 15px; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); min-width: 300px;">
        <div style="text-align: center; margin-bottom: 12px;">
          <h3 style="margin: 0 0 8px 0; color: #09a12a;">التحكم في التقارير</h3>
        </div>
        
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; font-weight: bold; color: #333;">اختر الفصل:</label>
          <select id="classSelect" onchange="filterByClass()" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;">
            <option value="">🔄 جميع الفصول</option>
            ${data.classes.map((c, idx) => `<option value="${idx}">📚 ${c.className}</option>`).join('')}
          </select>
        </div>

        <div style="display: flex; gap: 8px; flex-direction: column;">
          <button onclick="showAll()" style="flex: 1; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">📋 عرض الكل</button>
          <button onclick="window.print()" style="flex: 1; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">🖨️ طباعة الكل</button>
          <button onclick="printSelectedClass()" style="flex: 1; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">🖨️ طباعة الفصل</button>
        </div>
      </div>

      <script>
        function showAll() {
          document.getElementById('classSelect').value = '';
          window.location.href = window.location.pathname;
        }

        function filterByClass() {
          const selectedClass = document.getElementById('classSelect').value;
          if (selectedClass) {
            window.location.href = '?class_id=' + selectedClass;
          } else {
            window.location.href = window.location.pathname;
          }
        }

        function printSelectedClass() {
          const selectedClass = document.getElementById('classSelect').value;
          if (selectedClass) {
            const url = '?class_id=' + selectedClass;
            window.open(url, '_blank').print();
          } else {
            window.print();
          }
        }
      </script>
    `;

    for (const classInfo of classesToRender) {
      for (const student of classInfo.students) {
        let reportHtml = template;

        // Replace placeholders
        reportHtml = reportHtml.replace(/\{\{student_no\}\}/g, student.id || '');
        reportHtml = reportHtml.replace(/\{\{student_name\}\}/g, student.name || '');
        reportHtml = reportHtml.replace(/\{\{gender\}\}/g, 'N/A');
        reportHtml = reportHtml.replace(/\{\{class_name\}\}/g, classInfo.className || classInfo.class_name || '');
        reportHtml = reportHtml.replace(/\{\{stream_name\}\}/g, '');

        // Generate subjects table rows from results array
        let subjectsHtml = '';
        let totalMarks = 0;
        let subjectCount = 0;

        if (student.results && Array.isArray(student.results)) {
          for (const result of student.results) {
            // Each result has: subject, score, grade
            // Convert Arabic numerals to Western before parsing
            const westernScore = arabicToWestern(result.score as string);
            const scoreValue = result.score !== null ? parseFloat(westernScore) : 0;
            const grade = result.grade || '';

            // Format scores as Arabic numerals for display (no decimals)
            const displayScore = toArabicNumerals(Math.round(scoreValue).toString());
            subjectsHtml += `<tr><td>${result.subject}</td><td>${displayScore}</td><td>${displayScore}</td><td style="color:blue">${grade}</td><td class="comment-cell"></td><td class="initials">ب.ج.م</td></tr>`;

            if (result.score !== null) {
              totalMarks += scoreValue;
              subjectCount++;
            }
          }
        }

        const averageMarks = subjectCount > 0 ? Math.round((totalMarks / subjectCount) * 100) / 100 : 0;

        reportHtml = reportHtml.replace(/\{\{#subjects\}\}([\s\S]*?)\{\{\/subjects\}\}/, subjectsHtml);
        reportHtml = reportHtml.replace(/\{\{total_marks\}\}/g, toArabicNumerals(Math.round(totalMarks).toString()));
        reportHtml = reportHtml.replace(/\{\{average_marks\}\}/g, toArabicNumerals(Math.round(averageMarks).toString()));

        // Position info
        reportHtml = reportHtml.replace(/\{\{class_position\}\}/g, toArabicNumerals(student.position || 'N/A'));
        reportHtml = reportHtml.replace(/\{\{class_total\}\}/g, toArabicNumerals(classInfo.students.length));
        reportHtml = reportHtml.replace(/\{\{stream_position\}\}/g, toArabicNumerals(student.position || 'N/A')); // Simplified
        reportHtml = reportHtml.replace(/\{\{stream_total\}\}/g, toArabicNumerals(classInfo.students.length.toString())); // Simplified
        reportHtml = reportHtml.replace(/\{\{aggregates\}\}/g, toArabicNumerals(Math.round(totalMarks).toString()));
        reportHtml = reportHtml.replace(/\{\{division\}\}/g, toArabicNumerals('1')); // Simplified

        // Comments (placeholder)
        reportHtml = reportHtml.replace(/\{\{class_teacher_comment\}\}/g, 'عمل ممتاز، استمر');
        reportHtml = reportHtml.replace(/\{\{dos_comment\}\}/g, 'شكرا لهذا الجهد، استمر');
        reportHtml = reportHtml.replace(/\{\{headteacher_comment\}\}/g, 'درجات واعدة استمر');

        // Next term date
        reportHtml = reportHtml.replace(/\{\{next_term_date\}\}/g, '1st June 2026');

        allReportsHtml += reportHtml;
      }
    }

    // Combine everything
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تقارير الطوارئ - اللاهوت</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20px; color: #333; direction: rtl; }
          .report-container { width: 800px; margin: auto; border: 1px solid #ccc; padding: 10px; page-break-after: always; }
          @page { size: A4; margin: 1cm; }

          /* Header Logic */
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
          .school-name { font-size: 20px; color: #000080; font-weight: bold; margin: 0; text-align: center; }
          .school-info { font-size: 12px; font-weight: bold; font-style: italic; margin: 2px 0; text-align: center; }

          /* Banner */
          .blue-banner { background: #09a12a; color: white; text-align: center; padding: 5px; font-weight: bold; letter-spacing: 2px; margin: 5px 0; }

          /* Student Info Section */
          .student-info-table { width: 100%; border-collapse: collapse; border: 1px dashed #999; margin-bottom: 10px; }
          .info-label { color: #555; font-size: 11px; text-align: right; }
          .info-value { color: #0066cc; font-weight: bold; font-size: 14px; text-transform: uppercase; text-align: right; }

          /* Tables */
          .results-table { width: 100%; border-collapse: collapse; margin-top: -1px; }
          .results-table th, .results-table td { border: 1px solid #333; padding: 4px; text-align: center; }
          .results-table th { background: #f2f2f2; text-transform: uppercase; font-size: 11px; }
          .comment-cell { text-align: right !important; font-style: italic; color: #08c441; font-size: 11px; width: 40%; }
          .initials { color: #09a12a; font-weight: bold; }

          /* Remarks Section Labels */
          .remark-row { display: flex; align-items: flex-start; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
          .remark-text { margin-right: 10px; font-style: italic; color: #09a12a; font-size: 13px; text-align: right; }

          /* Grade Scale Footer */
          .grade-scale { width: 100%; border-collapse: collapse; margin-top: 15px; }
          .grade-scale td { border: 1px solid #000; text-align: center; padding: 3px; font-size: 10px; }
          .grade-header { background: #f2f2f2; font-weight: bold; }

          /* Print styles */
          @media print {
            .report-container { page-break-after: always; }
            .no-print { display: none !important; }
            body { font-size: 10px; padding: 0; zoom: 90%; }
            img { max-width: 100%; height: auto; }
          }
        </style>
      </head>
      <body>
        ${printControls}
        
        <!-- School Logo Header -->
        <div class="no-print" style="text-align: center; margin-bottom: 20px; padding-top: 80px;">
          <img src="${escapeHtml(brandLogo)}" alt="${escapeHtml(brandNameAr)}" style="height: 80px; object-fit: contain; margin-bottom: 10px;">
          <h1 style="margin: 10px 0; color: #09a12a; font-size: 24px;">${escapeHtml(brandNameAr)}</h1>
          <p style="margin: 5px 0; color: #666;">تقارير الطوارئ - مادة اللاهوت</p>
        </div>
        
        ${allReportsHtml}
      </body>
      </html>
    `;

    return new NextResponse(fullHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

  } catch (error) {
    console.error('Error generating emergency reports:', error);
    return NextResponse.json({ error: 'Failed to generate reports' }, { status: 500 });
  }
}