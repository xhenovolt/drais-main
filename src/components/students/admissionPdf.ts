/* Enhanced Admission PDF Generator
 * Bilingual (English + Arabic) simple single‑page PDF without external libs.
 * NOTE: Arabic text will appear in logical order without contextual shaping (letters disconnected)
 * because full Arabic shaping requires complex font handling beyond this lightweight generator.
 */

export interface AdmissionPdfOptions {
  schoolName?: string;
  schoolNameAr?: string;
  lang?: 'en' | 'ar' | 'bilingual'; // default bilingual
}

export function generateAdmissionPdf(student: any, form: any, opts: AdmissionPdfOptions = {}) {
  const { schoolName='School', schoolNameAr='', lang='bilingual' } = opts;
  try {
    const now = new Date();
    const sections: { titleEn: string; titleAr: string; rows: [string,string,string?][] }[] = [];

    const fullName = [form.first_name, form.other_name, form.last_name].filter(Boolean).join(' ');

    sections.push({
      titleEn: 'Student Information', titleAr: 'معلومات الطالب', rows: [
        ['Full Name', fullName, 'الاسم الكامل'],
        ['Admission No', student?.admission_no || '', 'رقم القيد'],
        ['Gender', form.gender||'', 'الجنس'],
        ['Date of Birth', form.date_of_birth||'', 'تاريخ الميلاد'],
        ['Place of Birth', form.place_of_birth||'', 'مكان الميلاد'],
        ['Nationality ID', form.nationality_id||'', 'الجنسية'],
        ['Address', form.address||'', 'العنوان'],
        ['Residence', form.place_of_residence||'', 'مكان الإقامة'],
        ['Phone', form.phone||'', 'هاتف'],
        ['Email', form.email||'', 'البريد الإلكتروني'],
        ['Admission Date', form.admission_date||'', 'تاريخ القبول'],
      ]
    });

    sections.push({
      titleEn: 'Family / Guardian', titleAr: 'الأسرة / الوصي', rows: [
        ['Primary Guardian', form.primary_guardian_name||'', 'الوصي الرئيسي'],
        ['Guardian Contact', form.primary_guardian_contact||'', 'هاتف الوصي'],
        ['Father Name', form.father_name||'', 'اسم الأب'],
        ['Father Contact', form.father_contact||'', 'هاتف الأب'],
        ['Father Occupation', form.father_occupation||'', 'مهنة الأب'],
        ['Orphan Status ID', form.orphan_status_id||'', 'حالة اليتم'],
      ]
    });

    const kinLines = (form.next_of_kin||[]).filter((k:any)=>k.name).map((k:any)=> `${k.sequence||''}. ${k.name}${k.contact? ' ('+k.contact+')':''}`);
    sections.push({
      titleEn: 'Next of Kin', titleAr: 'أقرب الأقارب', rows: kinLines.length? kinLines.map((l:string,idx:number)=>['Kin '+(idx+1), l, 'قريب '+(idx+1)]):[['None','-','لا يوجد']]
    });

    const eduLines = (form.education_levels||[]).filter((e:any)=>e.education_type && e.level_name).map((e:any)=> `${e.education_type}: ${e.level_name}${e.institution? ' @ '+e.institution:''}`);
    sections.push({
      titleEn: 'Education Levels', titleAr: 'المستويات التعليمية', rows: eduLines.length? eduLines.map((l:string,idx:number)=>['Level '+(idx+1), l, 'المستوى '+(idx+1)]):[['None','-','لا يوجد']]
    });

    sections.push({
      titleEn: "Hafz Progress", titleAr: 'التقدم في الحفظ', rows: [
        ['Juz Memorized', form.hafz_juz_memorized||0, 'عدد الأجزاء المحفوظة']
      ]
    });

    sections.push({
      titleEn: 'Curriculums', titleAr: 'المناهج', rows: [
        ['Curriculums', (Array.isArray(form.curriculums)? form.curriculums.join(', '):'-'), 'المناهج التعليمية']
      ]
    });

    if(form.notes) sections.push({ titleEn: 'Notes', titleAr: 'ملاحظات', rows: [['Notes', form.notes, 'ملاحظات']] });

    // PDF layout constants
    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const margin = 36;
    const lineHeight = 14;
    let y = pageHeight - margin;

    const content: string[] = [];
    // Draw header box & titles
    content.push('q');
    content.push('0.2 w');
    content.push(`${margin} ${y-40} ${pageWidth - margin*2} 50 re S`); // header rectangle
    content.push('Q');
    content.push('BT /F1 20 Tf 0 0 0 rg');
    content.push(textAt(margin + 12, y - 18, schoolName));
    if(lang!=='en') content.push('ET BT /F1 14 Tf 0 0 0 rg ' + textAt(margin + 12, y - 36, schoolNameAr));
    content.push('ET');

    y -= 70; // move below header

    // Meta line (date & ID)
    content.push('BT /F1 10 Tf 0 0 0 rg');
    const genLine = `Generated: ${now.toISOString()}`;
    content.push(textAt(margin, y, genLine));
    content.push('ET');
    y -= 20;

    // Sections
    for(const section of sections){
      const secTitle = section.titleEn + (lang==='bilingual'? ' / '+section.titleAr : (lang==='ar'? section.titleAr:''));
      const boxTop = y;
      // Reserve at least some height; dynamic based on rows.
      const rowsNeeded = section.rows.length;
      const estHeight =  (rowsNeeded + 2) * lineHeight + 12; // title + spacing
      if(y - estHeight < margin) break; // stop if page overflow (no pagination implemented)

      // Box
      content.push('q 0.6 w 0 0 0 RG');
      content.push(`${margin} ${y - estHeight} ${pageWidth - margin*2} ${estHeight} re S`);
      content.push('Q');

      // Title
      y -= lineHeight;
      content.push('BT /F1 12 Tf 0 0 0 rg');
      content.push(textAt(margin + 8, y, secTitle));
      content.push('ET');
      y -= lineHeight;

      // Rows
      for(const [enVal, value, arVal] of section.rows){
        const label = (lang==='en')? enVal : (lang==='ar'? (arVal||'') : `${enVal} / ${arVal||''}`);
        const display = String(value ?? '');
        const leftText = label + ': ' + display;
        // Wrap if too long
        const wrapped = wrapText(leftText, 90);
        for(const wLine of wrapped){
          if(y - lineHeight < (boxTop - estHeight) + lineHeight){
            break; // avoid overflow in box
          }
          content.push('BT /F1 9 Tf 0 0 0 rg');
            content.push(textAt(margin + 14, y, wLine));
          content.push('ET');
          y -= lineHeight;
        }
      }
      y -= 12; // spacing after section
    }

    // Signature area
    if(y - 80 > margin){
      content.push('q 0.5 w');
      const sigY = y - 40;
      content.push(`${margin+40} ${sigY} 180 0 re S`); // line substitute (degenerate rect)
      content.push(`${margin+260} ${sigY} 180 0 re S`);
      content.push('Q');
      content.push('BT /F1 9 Tf');
      content.push(textAt(margin+70, sigY - 12, (lang==='ar'||lang==='bilingual')?'توقيع ولي الأمر / Guardian Signature':'Guardian Signature'));
      content.push(textAt(margin+300, sigY - 12, (lang==='ar'||lang==='bilingual')?'توقيع الإدارة / Admin Signature':'Admin Signature'));
      content.push('ET');
    }

    // Final content
    const contentStream = content.join('\n');
    const contentLength = contentStream.length;

    // Build minimal PDF objects
    const objects: string[] = [];
    const xref: number[] = [];
    const pdfHeader = '%PDF-1.4\n';
    function addObject(body: string){
      const offset = pdfHeader.length + objects.reduce((a,c)=>a+c.length,0);
      xref.push(offset);
      const index = xref.length; // 1-based
      objects.push(`${index} 0 obj\n${body}\nendobj\n`);
      return index;
    }

    const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const contentObj = addObject(`<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream`);
    const pageObj = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
    const pagesObj = addObject(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`);
    // Replace parent placeholder in page object not strictly required
    const rootObj = addObject(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

    // Assemble PDF
    let pdf = pdfHeader + objects.join('');
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${xref.length+1}\n0000000000 65535 f \n`;
    for(const off of xref){ pdf += off.toString().padStart(10,'0') + ' 00000 n \n'; }
    pdf += `trailer\n<< /Size ${xref.length+1} /Root ${rootObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (student?.admission_no || 'admission') + '_form.pdf';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);
  } catch (e) {
    console.error('PDF generation failed', e);
  }
}

function textAt(x:number,y:number,text:string){
  return `${x} ${y} Td (${escapePdfText(text)}) Tj`;
}

function escapePdfText(t:string){
  return t.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/\r?\n/g,' ');
}

function wrapText(t:string, maxChars:number){
  if(t.length <= maxChars) return [t];
  const words = t.split(/\s+/); const lines:string[]=[]; let cur='';
  for(const w of words){
    if((cur + ' ' + w).trim().length > maxChars){ if(cur) lines.push(cur.trim()); cur = w; } else { cur += ' ' + w; }
  }
  if(cur) lines.push(cur.trim());
  return lines;
}
