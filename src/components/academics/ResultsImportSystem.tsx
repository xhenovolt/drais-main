"use client";
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Download, Eye, ArrowRight, X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Progress } from '@/components/ui/loading/Progress';
// xlsx dynamically imported where used (below) — keeps it out of the eager graph.
import { EntityTypeahead, type TypeaheadOption } from './EntityTypeahead';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

interface Option { id: number; name: string; }

interface Mapping {
  [header: string]: string;
}

interface ImportPreview {
  headers: string[];
  rows: any[][];
  totalRows: number;
  sampleRows: any[][];
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export default function ResultsImportSystem() {
  const { t, digits } = useI18n();
  // Server row errors / warnings are fixed English sentences — show them in the reader's language.
  const rowMsg = (m: string) => {
    const nf = /^Student not found: (.*)$/.exec(m || '');
    if (nf) return t('academicsPages.resultsImport.studentNotFound', { who: nf[1] });
    const na = /^Subject (.*) not allocated to class$/.exec(m || '');
    if (na) return t('academicsPages.resultsImport.notAllocated', { name: na[1] });
    return uiIsArabic() && isEnglishText(m) ? t('academicsPages.resultsImport.unknown', "Unknown error") : m;
  };
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'import'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mappings, setMappings] = useState<Mapping>({});
  const [academicYears, setAcademicYears] = useState<Option[]>([]);
  const [terms, setTerms] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [resultTypes, setResultTypes] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  // PHASE L3 — the import surface is shared across secular + theology.
  // Previously every batch-created subject was hardcoded to academic_type
  // 'secular', so theology imports landed under the wrong program.
  // Operator picks the type at the top of the import form; defaults to
  // secular because that's the dominant case.
  const [academicType, setAcademicType] = useState<'secular' | 'theology'>('secular');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedResultType, setSelectedResultType] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>({ isValid: false, errors: [], warnings: [] });
  const [importResult, setImportResult] = useState<any>(null);
  // When true, the import route will UPDATE rows that already exist for
  // the same (student, subject, term, result_type) tuple instead of
  // skipping them. Mirrors the user's request: "drais must be wise enough
  // to see the results that exist but might need refactoring just in case".
  const [updateExisting, setUpdateExisting] = useState<boolean>(true);
  // Subjects discovered in the upload that don't yet exist in DRAIS.
  // We surface them on the mapping step with a one-click batch-create CTA.
  const [missingSubjects, setMissingSubjects] = useState<string[]>([]);
  const [creatingSubjects, setCreatingSubjects] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load metadata on mount
  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      const [yearsRes, termsRes, classesRes, typesRes, subjectsRes] = await Promise.all([
        fetch('/api/academic_years'),
        fetch('/api/terms'),
        fetch('/api/classes'),
        fetch('/api/result_types'),
        fetch('/api/subjects')
      ]);

      // Each public API returns { data: [...] }. Defensive .data ?? [] unwrap.
      const unwrap = async (r: Response): Promise<Option[]> => {
        if (!r.ok) return [];
        const j = await r.json().catch(() => ({}));
        if (Array.isArray(j)) return j;
        return (j.data || []) as Option[];
      };

      setAcademicYears(await unwrap(yearsRes));
      setTerms(await unwrap(termsRes));
      setClasses(await unwrap(classesRes));
      setResultTypes(await unwrap(typesRes));
      setSubjects(await unwrap(subjectsRes));
    } catch (error) {
      console.error('Error loading metadata:', error);
    }
  };

  // ── Inline create handlers (background POST → toast → list refresh) ───
  // Mirror of the same pattern in ClassResultsManager.tsx. Each returns
  // the freshly-created option so the EntityTypeahead can auto-select it.

  async function createTerm(name: string): Promise<Option | null> {
    if (academicYears.length === 0) {
      toast.error(t('academicsPages.resultsImport.needYear', "Create an academic year first."));
      return null;
    }
    const yearId = selectedAcademicYear || String(academicYears[0].id);
    const res = await fetch('/api/terms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, academic_year_id: yearId, status: 'active' }),
    });
    if (!res.ok && res.status !== 409) {
      toast.error(t('academicsPages.resultsImport.termFailed', "Could not create term"));
      return null;
    }
    const fresh = await fetch('/api/terms').then(r => r.json()).catch(() => ({ data: [] }));
    const list = (fresh.data || []) as Option[];
    setTerms(list);
    const made = list.find(tm => tm.name.toLowerCase() === name.toLowerCase()) || null;
    if (made) toast.success(t('academicsPages.resultsImport.termReady', { name }));
    return made;
  }

  async function createResultType(name: string): Promise<Option | null> {
    const baseCode = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
    const code = `${baseCode}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const res = await fetch('/api/result_types', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, weight: 100 }),
    });
    if (!res.ok && res.status !== 409) {
      toast.error(t('academicsPages.resultsImport.rtFailed', "Could not create result type"));
      return null;
    }
    const fresh = await fetch('/api/result_types').then(r => r.json()).catch(() => ({ data: [] }));
    const list = (fresh.data || []) as Option[];
    setResultTypes(list);
    const made = list.find(rt => rt.name.toLowerCase() === name.toLowerCase()) || null;
    if (made) toast.success(t('academicsPages.resultsImport.rtReady', { name }));
    return made;
  }

  // Batch-create every name in `missingSubjects`. Used by the orange
  // "Create N subjects" CTA in the mapping panel.
  async function handleCreateMissingSubjects() {
    if (missingSubjects.length === 0) return;
    setCreatingSubjects(true);
    let ok = 0;
    for (const name of missingSubjects) {
      const res = await fetch('/api/subjects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // PHASE L3 — honour the operator's academic-type pick instead of
        // hard-coding 'secular'. Theology imports now land in the right
        // program.
        body: JSON.stringify({ name, academic_type: academicType, subject_type: 'core' }),
      });
      if (res.ok || res.status === 409) ok++;
    }
    // Refresh subjects + auto-map newly-created subjects to their original headers
    const fresh = await fetch('/api/subjects').then(r => r.json()).catch(() => ({ data: [] }));
    const list = (fresh.data || []) as Option[];
    setSubjects(list);
    setMappings(prev => {
      const next = { ...prev };
      for (const header of Object.keys(next)) {
        if (next[header]) continue;
        const found = list.find(s => s.name.toLowerCase() === header.toLowerCase().trim());
        if (found) next[header] = `subject_${found.id}`;
      }
      return next;
    });
    setMissingSubjects([]);
    setCreatingSubjects(false);
    toast.success(t('academicsPages.resultsImport.created', { count: ok }));
  }

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      let rows: any[][] = [];

      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      } else if (selectedFile.name.endsWith('.csv')) {
        // For CSV, we'll handle it in the preview step
        const text = await selectedFile.text();
        const lines = text.split('\n').filter(line => line.trim());
        rows = lines.map(line => line.split(','));
      }

      if (rows.length === 0) {
        throw new Error(t('academicsPages.resultsImport.noData', "No data found in file"));
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);
      const sampleRows = dataRows.slice(0, 5); // Show first 5 rows as sample

      setPreview({
        headers,
        rows: dataRows,
        totalRows: dataRows.length,
        sampleRows
      });

      // Auto-detect mappings AND flag potential subject columns that don't
      // yet exist in DRAIS. The user gets a one-click batch-create panel
      // before they're forced to map by hand.
      const autoMappings: Mapping = {};
      const STUDENT_IDENT_NAMES = new Set([
        'student no', 'student number', 'admission no', 'admission number',
        'admno', 'reg no', 'first name', 'last name', 'name', 'student name',
        'class', 'stream', 'gender', 'sex', 'dob', 'date of birth',
      ]);
      const possiblyMissingSubjects: string[] = [];
      headers.forEach((header: string) => {
        const lowerHeader = String(header).toLowerCase().trim();
        if (!lowerHeader) return;

        if (lowerHeader.includes('student') && lowerHeader.includes('no')) {
          autoMappings[header] = 'admission_no';
        } else if (lowerHeader.includes('admission')) {
          autoMappings[header] = 'admission_no';
        } else if (lowerHeader.includes('first') && lowerHeader.includes('name')) {
          autoMappings[header] = 'first_name';
        } else if (lowerHeader.includes('last') && lowerHeader.includes('name')) {
          autoMappings[header] = 'last_name';
        } else {
          // Exact (case-insensitive) match wins over fuzzy includes — avoids
          // "Math" matching "Mathematics 2" by accident.
          const exact = subjects.find(s => s.name.toLowerCase() === lowerHeader);
          const partial = !exact ? subjects.find(s =>
            s.name.toLowerCase().includes(lowerHeader) ||
            lowerHeader.includes(s.name.toLowerCase())
          ) : null;
          const matchingSubject = exact || partial;
          if (matchingSubject) {
            autoMappings[header] = `subject_${matchingSubject.id}`;
          } else if (!STUDENT_IDENT_NAMES.has(lowerHeader)) {
            // No exact / fuzzy match AND this isn't a known student-identity
            // column. Likely a subject the school hasn't created yet.
            possiblyMissingSubjects.push(String(header).trim());
          }
        }
      });

      setMappings(autoMappings);
      setMissingSubjects(possiblyMissingSubjects);
      setStep('mapping');
    } catch (error) {
      console.error('Error processing file:', error);
      const raw = (error as any)?.message;
      toast.error(t('academicsPages.resultsImport.fileError', { msg: (raw && !(uiIsArabic() && isEnglishText(raw)) ? raw : t('academicsPages.resultsImport.unreadable', "The file could not be read.")) }));
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (header: string, field: string) => {
    setMappings(prev => ({
      ...prev,
      [header]: field
    }));
  };

  const validateMappings = () => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if student identifier is mapped
    const hasStudentId = Object.values(mappings).some(field =>
      field === 'admission_no' || field === 'first_name' || field === 'last_name'
    );

    if (!hasStudentId) {
      errors.push(t('academicsPages.resultsImport.v.student', "At least one student identifier (admission number, first name, or last name) must be mapped"));
    }

    // Check if at least one subject is mapped
    const hasSubjects = Object.values(mappings).some(field => field.startsWith('subject_'));

    if (!hasSubjects) {
      errors.push(t('academicsPages.resultsImport.v.subject', "At least one subject column must be mapped"));
    }

    // Check for required selections
    if (!selectedAcademicYear) {
      errors.push(t('academicsPages.resultsImport.v.year', "Academic year must be selected"));
    }
    if (!selectedTerm) {
      errors.push(t('academicsPages.resultsImport.v.term', "Term must be selected"));
    }
    if (!selectedClass) {
      errors.push(t('academicsPages.resultsImport.v.class', "Class must be selected"));
    }
    if (!selectedResultType) {
      errors.push(t('academicsPages.resultsImport.v.type', "Result type must be selected"));
    }

    setValidation({ isValid: errors.length === 0, errors, warnings });
    return errors.length === 0;
  };

  useEffect(() => {
    if (step === 'mapping') validateMappings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mappings, selectedAcademicYear, selectedTerm, selectedClass, selectedResultType]);

  const handleImport = async () => {
    if (!validateMappings() || !file) return;

    setImporting(true);
    setImportErrors([]);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('academic_year_id', selectedAcademicYear);
      formData.append('term_id', selectedTerm);
      formData.append('class_id', selectedClass);
      formData.append('result_type_id', selectedResultType);
      formData.append('mappings', JSON.stringify(mappings));
      formData.append('update_existing', updateExisting ? '1' : '0');

      const response = await fetch('/api/class_results/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setImportResult(result);
        setStep('import');
      } else if (Array.isArray(result.errors) && result.errors.length > 0) {
        // Row-level problems (e.g. unknown admission numbers): nothing was saved; list them.
        setImportErrors(result.errors);
        toast.error(t('academicsPages.resultsImport.rowsFailed', { count: result.errors.length }));
      } else {
        toast.error(t('academicsPages.resultsImport.importFailed', { msg: (result.error && !(uiIsArabic() && isEnglishText(result.error)) ? result.error : t('academicsPages.resultsImport.unknown', "Unknown error")) }));
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error(t('academicsPages.resultsImport.importFailed', { msg: t('academicsPages.resultsImport.unknown', "Unknown error") }));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const headers = ['Student No', 'First Name', 'Last Name'];
    subjects.slice(0, 5).forEach(subject => {
      headers.push(subject.name);
    });

    const sampleData = [
      headers,
      ['STU001', 'John', 'Doe', 85, 90, 88, 92, 87],
      ['STU002', 'Jane', 'Smith', 92, 88, 95, 90, 91]
    ];

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results Template');
    XLSX.writeFile(wb, 'results_import_template.xlsx');
  };

  const resetImport = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setMappings({});
    setValidation({ isValid: false, errors: [], warnings: [] });
    setImportResult(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('academicsPages.resultsImport.title', "Import Academic Results")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t('academicsPages.resultsImport.subtitle', "Upload Excel or CSV files to bulk import student results")}</p>
        </div>
        <Button onClick={downloadTemplate} variant="outline" className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          {t('academicsPages.resultsImport.template', "Download Template")}
        </Button>
      </div>

      {/* Progress Steps */}
      <div className="flex flex-wrap items-center gap-y-2">
        {[
          { key: 'upload', label: t('academicsPages.resultsImport.step.upload', "Upload File"), icon: Upload },
          { key: 'mapping', label: t('academicsPages.resultsImport.step.mapping', "Map Columns"), icon: FileText },
          { key: 'preview', label: t('academicsPages.resultsImport.step.preview', "Preview & Validate"), icon: Eye },
          { key: 'import', label: t('academicsPages.resultsImport.step.import', "Import Results"), icon: CheckCircle }
        ].map(({ key, label, icon: Icon }, index) => (
          <div key={key} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              step === key ? 'bg-blue-600 text-white' :
              ['upload', 'mapping', 'preview', 'import'].indexOf(step) > index ? 'bg-green-600 text-white' :
              'bg-gray-200 text-gray-600'
            }`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className={`ms-2 text-sm font-medium ${
              step === key ? 'text-blue-600' : 'text-gray-600'
            }`}>
              {label}
            </span>
            {index < 3 && <ArrowRight className="w-4 h-4 mx-4 text-gray-400 rtl:-scale-x-100" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('academicsPages.resultsImport.step.upload', "Upload File")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('academicsPages.resultsImport.uploadTitle', "Upload your results file")}</h3>
              <p className="text-gray-600 mb-4">{t('academicsPages.resultsImport.support', "Support for Excel (.xlsx, .xls) and CSV files")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={loading}>
                {loading ? t('academicsPages.resultsImport.processing', "Processing...") : t('academicsPages.resultsImport.choose', "Choose File")}
              </Button>
            </div>

            {file && (
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">{file.name}</p>
                    <p className="text-sm text-green-700">{t('academicsPages.resultsImport.kb', { n: (file.size / 1024).toFixed(1) })}</p>
                  </div>
                </div>
                <Button onClick={() => setStep('mapping')} variant="outline" size="sm">
                  {t('academicsPages.resultsImport.continue', "Continue")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'mapping' && preview && (
        <Card>
          <CardHeader>
            <CardTitle>{t('academicsPages.resultsImport.mapTitle', "Map Columns to Fields")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Academic type — secular vs theology. Drives which program
                newly batch-created subjects land in. Default secular. */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 flex items-center gap-4">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('academicsPages.resultsImport.program', "Program")}</span>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input type="radio" name="academic_type" value="secular"
                  checked={academicType === 'secular'}
                  onChange={() => setAcademicType('secular')} />
                {t('academicsPages.resultsImport.secular', "Secular")}
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input type="radio" name="academic_type" value="theology"
                  checked={academicType === 'theology'}
                  onChange={() => setAcademicType('theology')} />
                {t('academicsPages.resultsImport.theology', "Theology")}
              </label>
              <span className="ms-auto text-[10px] text-slate-400">
                {t('academicsPages.resultsImport.programHelp', "Any subjects DRAIS creates from your file will be filed under this program.")}
              </span>
            </div>

            {/* Target Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('academicsPages.resultsImport.year', "Academic Year")}</label>
                <select
                  value={selectedAcademicYear}
                  onChange={(e) => setSelectedAcademicYear(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">{t('academicsPages.resultsImport.selectYear', "Select Year")}</option>
                  {academicYears.map(year => (
                    <option key={year.id} value={year.id}>{digits(year.name)}</option>
                  ))}
                </select>
              </div>
              <div>
                <EntityTypeahead
                  label={t('academicsPages.resultsImport.term', "Term")}
                  variant="plain"
                  value={terms.find(tm => String(tm.id) === selectedTerm) as TypeaheadOption || null}
                  onChange={(v) => setSelectedTerm(v ? String(v.id) : '')}
                  items={terms as TypeaheadOption[]}
                  placeholder={terms.length === 0 ? t('academicsPages.resultsImport.ph.firstTerm', "Type to create your first term…") : t('academicsPages.resultsImport.ph.pick', "Pick or type to create")}
                  entityLabel={t('academicsPages.resultsImport.entity.term', "term")}
                  onCreate={createTerm}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('academicsPages.resultsImport.class', "Class")}</label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">{t('academicsPages.resultsImport.selectClass', "Select Class")}</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <EntityTypeahead
                  label={t('academicsPages.resultsImport.resultType', "Result Type")}
                  variant="plain"
                  value={resultTypes.find(rt => String(rt.id) === selectedResultType) as TypeaheadOption || null}
                  onChange={(v) => setSelectedResultType(v ? String(v.id) : '')}
                  items={resultTypes as TypeaheadOption[]}
                  placeholder={resultTypes.length === 0 ? t('academicsPages.resultsImport.ph.firstType', "Type to create e.g. End-of-Term…") : t('academicsPages.resultsImport.ph.pick', "Pick or type to create")}
                  entityLabel={t('academicsPages.resultsImport.entity.resultType', "result type")}
                  onCreate={createResultType}
                />
              </div>
            </div>

            {/* Missing-subjects panel — surfaces when the uploaded file
                has columns that look like subjects but don't yet exist in
                DRAIS. One-click batch-create + auto-remap. */}
            {missingSubjects.length > 0 && (
              <div className="p-4 border border-orange-300 bg-orange-50 dark:bg-orange-950/30 rounded-lg space-y-3">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-orange-900 dark:text-orange-200">
                      {t('academicsPages.resultsImport.missingTitle', { count: missingSubjects.length })}
                    </h4>
                    <p className="text-xs text-orange-800 dark:text-orange-300 mt-1">
                      {t('academicsPages.resultsImport.missingHelp', "DRAIS will create them first, then import the marks. Adjust syllabus codes later from the Subjects tab.")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {missingSubjects.map(s => (
                        <span key={s} className="px-2 py-0.5 rounded text-[11px] font-mono bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-200">{s}</span>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={handleCreateMissingSubjects}
                    disabled={creatingSubjects}
                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-3 py-1.5 whitespace-nowrap"
                  >
                    {creatingSubjects ? (
                      <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {t('academicsPages.resultsImport.creating', "Creating…")}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> {t('academicsPages.resultsImport.createN', { count: missingSubjects.length })}</span>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Refactor-aware toggle — when on, the import UPDATEs marks
                that already exist for the same (student, subject, term,
                result_type) tuple instead of silently skipping. */}
            <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/40 flex items-start gap-3">
              <input
                id="update_existing_toggle"
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="update_existing_toggle" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <span className="font-semibold inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {t('academicsPages.resultsImport.updateExisting', "Update existing marks if found")}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('academicsPages.resultsImport.updateHelp', "When off (the legacy behaviour), rows that already exist for the same student + subject + term + result-type are skipped silently. When on, DRAIS treats the file as the source of truth and refactors them in place.")}
                </span>
              </label>
            </div>

            {/* Column Mappings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">{t('academicsPages.resultsImport.mappings', "Column Mappings")}</h3>
              <div className="grid gap-4">
                {preview.headers.map((header, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex-1">
                      <span className="font-medium">{header}</span>
                      <div className="text-sm text-gray-500 mt-1">
                        {t('academicsPages.resultsImport.sample', { v: preview.sampleRows[0]?.[index] ?? t('academicsPages.resultsImport.na', "N/A") })}
                      </div>
                    </div>
                    <select
                      value={mappings[header] || ''}
                      onChange={(e) => handleMappingChange(header, e.target.value)}
                      className="flex-1 p-2 border rounded-lg"
                    >
                      <option value="">{t('academicsPages.resultsImport.dontImport', "Don't import")}</option>
                      <option value="admission_no">{t('academicsPages.resultsImport.studentNumber', "Student Number")}</option>
                      <option value="first_name">{t('academicsPages.resultsImport.firstName', "First Name")}</option>
                      <option value="last_name">{t('academicsPages.resultsImport.lastName', "Last Name")}</option>
                      {subjects.map(subject => (
                        <option key={subject.id} value={`subject_${subject.id}`}>
                          {t('academicsPages.resultsImport.subjectOpt', { name: subject.name })}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation Errors */}
            {validation.errors.length > 0 && (
              <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <h4 className="text-sm font-medium text-red-800">{t('academicsPages.resultsImport.validationErrors', "Validation Errors")}</h4>
                </div>
                <ul className="mt-2 list-disc list-inside text-sm text-red-700">
                  {validation.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between">
              <Button onClick={() => setStep('upload')} variant="outline">
                {t('academicsPages.resultsImport.back', "Back")}
              </Button>
              <Button onClick={() => setStep('preview')} disabled={!validation.isValid || missingSubjects.length > 0}
                title={missingSubjects.length > 0 ? t('academicsPages.resultsImport.createMissingFirst', "Create the missing subjects first") : undefined}>
                {t('academicsPages.resultsImport.previewImport', "Preview Import")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && preview && (
        <Card>
          <CardHeader>
            <CardTitle>{t('academicsPages.resultsImport.previewTitle', "Preview Import Data")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    {preview.headers.map((header, index) => (
                      <th key={index} className="border border-gray-300 p-2 text-start">
                        {header}
                        <div className="text-xs text-gray-500">
                          <span className="rtl:hidden">→</span><span className="ltr:hidden">←</span> {(() => { const m = mappings[header]; if (!m) return t('academicsPages.resultsImport.notMapped', "Not mapped"); if (m.startsWith('subject_')) return subjects.find(s => `subject_${s.id}` === m)?.name ?? m; return t(`academicsPages.resultsImport.field.${m}`, m); })()}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border border-gray-300 p-2">
                          {cell || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-sm text-gray-600">
              {t('academicsPages.resultsImport.showing', { shown: preview.sampleRows.length, total: preview.totalRows })}
            </div>

            {importErrors.length > 0 && (
              <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                <h4 className="text-sm font-medium text-red-800">{t('academicsPages.resultsImport.rowsFailed', { count: importErrors.length })}</h4>
                <ul className="mt-2 list-disc list-inside text-sm text-red-700 max-h-48 overflow-y-auto">
                  {importErrors.slice(0, 50).map((er, i) => (
                    <li key={i}>{t('academicsPages.resultsImport.rowError', { row: er.row, msg: rowMsg(er.message) })}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between">
              <Button onClick={() => setStep('mapping')} variant="outline">
                {t('academicsPages.resultsImport.back', "Back")}
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? t('academicsPages.resultsImport.importing', "Importing...") : t('academicsPages.resultsImport.start', "Start Import")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'import' && importResult && (
        <Card>
          <CardHeader>
            <CardTitle>{t('academicsPages.resultsImport.completeTitle', "Import Complete")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-green-900 mb-2">{t('academicsPages.resultsImport.success', "Import Successful!")}</h3>
              <div className="space-y-2 text-gray-600">
                <p>{t('academicsPages.resultsImport.imported', { n: importResult.imported ?? 0 })}</p>
                {typeof importResult.updated === 'number' && importResult.updated > 0 && (
                  <p className="text-blue-700 font-medium">{t('academicsPages.resultsImport.refactored', { n: importResult.updated })}</p>
                )}
                <p>{t('academicsPages.resultsImport.skipped', { n: importResult.skipped ?? 0 })}</p>
                {Array.isArray(importResult.warnings) && importResult.warnings.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium text-yellow-800">{t('academicsPages.resultsImport.warnings', "Warnings:")}</h4>
                    <ul className="list-disc list-inside text-yellow-700">
                      {importResult.warnings.map((warning: string, index: number) => (
                        <li key={index}>{rowMsg(warning)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <Button onClick={resetImport}>
                {t('academicsPages.resultsImport.another', "Import Another File")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}