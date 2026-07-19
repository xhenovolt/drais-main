import type {
  DRCECommentItem,
  DRCEColumn,
  DRCEDocument,
  DRCEField,
  DRCEGradeRow,
  DRCESection,
  DRCEShape,
  Language,
} from './schema';

export type DRCEDirection = 'ltr' | 'rtl' | 'auto';

const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;

const EXACT_AR: Record<string, string> = {
  Name: 'الاسم',
  'Student Name': 'اسم الطالب',
  Sex: 'الجنس',
  Gender: 'الجنس',
  Class: 'الصف',
  Stream: 'الشعبة',
  Term: 'الفصل',
  'Student No.': 'رقم الطالب',
  'Admission No.': 'رقم القبول',
  Results: 'النتائج',
  'Academic Results': 'النتائج الأكاديمية',
  'Academic Performance': 'الأداء الأكاديمي',
  Subject: 'المادة',
  MT: 'منتصف الفصل',
  'Mid Term': 'منتصف الفصل',
  EOT: 'نهاية الفصل',
  'End Term': 'نهاية الفصل',
  Total: 'المجموع',
  Grade: 'التقدير',
  Comment: 'التعليق',
  Remarks: 'الملاحظات',
  Initials: 'التوقيع',
  Position: 'الترتيب',
  'Class Position': 'الترتيب في الصف',
  Aggregates: 'المجاميع',
  Division: 'القسم',
  'Grade Assessment': 'التقييم',
  'Class teacher comment:': 'تعليق معلم الفصل:',
  'Class Teacher Comment:': 'تعليق معلم الفصل:',
  'Class Teacher:': 'معلم الفصل:',
  'DOS Comment:': 'تعليق مدير الدراسة:',
  'Headteacher comment:': 'تعليق المدير:',
  'Headteacher Comment:': 'تعليق المدير:',
  Headteacher: 'المدير',
  HEADTEACHER: 'المدير',
  'CLASS TEACHER': 'معلم الفصل',
  'Class Teacher': 'معلم الفصل',
  'Teacher Comment': 'تعليق المعلم',
  'Next term begins': 'بداية الفصل القادم',
  TOTAL: 'المجموع',
  AVERAGE: 'المتوسط',
  'Division I': 'القسم الأول',
  'Division II': 'القسم الثاني',
  'Division III': 'القسم الثالث',
  'Division IV': 'القسم الرابع',
  'Division U': 'غير مصنف',
  'SIGNED BY': 'التوقيع',
  Date: 'التاريخ',
  'Date:': 'التاريخ:',
  CONFIDENTIAL: 'سري',
  'Principal Subjects Comprising the General Assessment': 'المواد الأساسية للتقييم العام',
};

export function hasArabicText(value: unknown): boolean {
  return typeof value === 'string' && ARABIC_RE.test(value);
}

export function translateReportLiteral(value: string | undefined | null): string {
  if (!value) return value ?? '';
  const trimmed = value.trim();
  const suffix = value.endsWith(':') && !trimmed.endsWith(':') ? ':' : '';
  return EXACT_AR[trimmed] ?? EXACT_AR[trimmed.replace(/\s+/g, ' ')] ?? (suffix ? `${EXACT_AR[trimmed.replace(/:$/, '')] ?? trimmed}${suffix}` : value);
}

export function resolveLocalizedText(
  language: Language | undefined,
  value: string,
  arValue?: string,
): string {
  if (language !== 'ar') return value;
  if (arValue && arValue.trim() !== '') return arValue;
  return translateReportLiteral(value);
}

export function resolveLocalizedLabel(
  language: Language | undefined,
  label: string,
  labelAr?: string,
): string {
  return resolveLocalizedText(language, label, labelAr);
}

function isArabicTemplateName(doc: DRCEDocument): boolean {
  const haystack = [
    doc.meta?.name,
    doc.meta?.template_key,
    doc.meta?.report_type,
    doc.meta?.document_kind,
  ].filter(Boolean).join(' ');
  return /arabic|عربي|عربية|theology|tahfiz/i.test(haystack);
}

function sectionHasArabic(section: DRCESection): boolean {
  if ('content' in section && hasArabicText((section as { content?: { text?: string } }).content?.text)) return true;
  if ('fields' in section && (section as { fields?: DRCEField[] }).fields?.some(f => hasArabicText(f.label))) return true;
  if ('columns' in section && (section as { columns?: DRCEColumn[] }).columns?.some(c => hasArabicText(c.header))) return true;
  if ('items' in section && (section as { items?: DRCECommentItem[] }).items?.some(i => hasArabicText(i.label))) return true;
  if ('grades' in section && (section as { grades?: DRCEGradeRow[] }).grades?.some(g => hasArabicText(g.label) || hasArabicText(g.remark))) return true;
  if (section.type === 'container') return ((section as { children?: DRCESection[] }).children ?? []).some(sectionHasArabic);
  if (section.type === 'shape') return shapeHasArabic((section as { shape: DRCEShape }).shape);
  return false;
}

function shapeHasArabic(shape: DRCEShape): boolean {
  return shape.type === 'text' && hasArabicText(shape.content);
}

export function inferDocumentLanguage(doc: DRCEDocument, fallback: Language = 'en'): Language {
  const explicit = doc.meta?.defaultLanguage;
  if (explicit === 'ar' || explicit === 'en') return explicit;
  if ((doc.sections ?? []).some(sectionHasArabic)) return 'ar';
  if ((doc.pages ?? []).some(p => (p.sections ?? []).some(sectionHasArabic))) return 'ar';
  if ((doc.shapes ?? []).some(shapeHasArabic)) return 'ar';
  return isArabicTemplateName(doc) ? 'ar' : fallback;
}

export function inferDocumentDirection(doc: DRCEDocument, language?: Language): 'ltr' | 'rtl' {
  const dir = doc.meta?.direction;
  if (dir === 'rtl' || dir === 'ltr') return dir;
  return (language ?? inferDocumentLanguage(doc)) === 'ar' ? 'rtl' : 'ltr';
}

function arabizeText(value: string): string {
  if (hasArabicText(value)) return value;
  return translateReportLiteral(value);
}

function arabizeShape(shape: DRCEShape): DRCEShape {
  if (shape.type !== 'text') return shape;
  return {
    ...shape,
    content: arabizeText(shape.content),
    align: shape.align === 'left' ? 'right' : shape.align,
  };
}

function arabizeSection(section: DRCESection): DRCESection {
  let next = section;
  if ('content' in next && typeof (next as { content?: { text?: string; textAr?: string } }).content?.text === 'string') {
    const content = (next as { content: { text: string; textAr?: string } }).content;
    next = {
      ...next,
      content: {
        ...content,
        textAr: content.textAr ?? translateReportLiteral(content.text),
      },
    } as DRCESection;
  }
  if ('fields' in next) {
    const fields = ((next as { fields?: DRCEField[] }).fields ?? []).map(f => ({
      ...f,
      labelAr: f.labelAr ?? translateReportLiteral(f.label),
    }));
    next = { ...next, fields } as DRCESection;
  }
  if ('columns' in next) {
    const columns = ((next as { columns?: DRCEColumn[] }).columns ?? []).map(c => ({
      ...c,
      headerAr: c.headerAr ?? translateReportLiteral(c.header),
      align: c.align === 'left' ? 'right' : c.align,
    }));
    next = { ...next, columns } as DRCESection;
  }
  if ('items' in next) {
    const items = ((next as { items?: DRCECommentItem[] }).items ?? []).map(i => ({
      ...i,
      labelAr: i.labelAr ?? translateReportLiteral(i.label),
    }));
    next = { ...next, items } as DRCESection;
  }
  if ('grades' in next) {
    const grades = ((next as { grades?: DRCEGradeRow[] }).grades ?? []).map(g => ({
      ...g,
      labelAr: g.labelAr ?? translateReportLiteral(g.label),
      remarkAr: g.remarkAr ?? translateReportLiteral(g.remark),
    }));
    next = { ...next, grades } as DRCESection;
  }
  if (next.type === 'assessment') {
    const style = (next as { style?: Record<string, unknown> }).style ?? {};
    next = {
      ...next,
      style: {
        ...style,
        positionLabel: arabizeText(String(style.positionLabel ?? 'Position')),
        assessmentLabel: arabizeText(String(style.assessmentLabel ?? 'Grade Assessment')),
      },
    } as DRCESection;
  }
  if (next.type === 'results_table') {
    const cfg = (next as unknown as { totalsConfig?: Record<string, unknown> }).totalsConfig;
    if (cfg) {
      next = {
        ...next,
        totalsConfig: {
          ...cfg,
          labelText: arabizeText(String(cfg.labelText ?? 'TOTAL')),
          averageLabelText: arabizeText(String(cfg.averageLabelText ?? 'AVERAGE')),
        },
      } as DRCESection;
    }
  }
  if (next.type === 'signature_block') {
    next = {
      ...next,
      signatories: (next.signatories ?? []).map(s => ({ ...s, roleLabel: arabizeText(s.roleLabel) })),
      style: { ...next.style, dateLabel: arabizeText(next.style?.dateLabel ?? 'Date:') },
    } as DRCESection;
  }
  if (next.type === 'shape') {
    next = { ...next, shape: arabizeShape(next.shape) } as DRCESection;
  }
  if (next.type === 'container') {
    next = { ...next, children: (next.children ?? []).map(arabizeSection) } as DRCESection;
  }
  return next;
}

export function arabizeDocumentText(doc: DRCEDocument): DRCEDocument {
  return {
    ...doc,
    meta: { ...doc.meta, defaultLanguage: 'ar', direction: 'rtl' },
    watermark: doc.watermark?.type === 'text'
      ? { ...doc.watermark, content: arabizeText(doc.watermark.content) }
      : doc.watermark,
    sections: (doc.sections ?? []).map(arabizeSection),
    pages: doc.pages?.map(p => ({
      ...p,
      sections: (p.sections ?? []).map(arabizeSection),
      pageHeader: p.pageHeader ? arabizeSection(p.pageHeader) : p.pageHeader,
      pageFooter: p.pageFooter ? arabizeSection(p.pageFooter) : p.pageFooter,
    })),
    shapes: (doc.shapes ?? []).map(arabizeShape),
    runningHeader: doc.runningHeader ? { ...doc.runningHeader, text: arabizeText(doc.runningHeader.text), align: doc.runningHeader.align === 'left' ? 'right' : doc.runningHeader.align } : doc.runningHeader,
    runningFooter: doc.runningFooter ? { ...doc.runningFooter, text: arabizeText(doc.runningFooter.text), align: doc.runningFooter.align === 'left' ? 'right' : doc.runningFooter.align } : doc.runningFooter,
  };
}
