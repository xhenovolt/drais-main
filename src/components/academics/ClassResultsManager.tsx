"use client";
import React, { useEffect, useState, Fragment, useMemo, useOptimistic, useTransition, useRef } from 'react';
import { Dialog, Transition, Listbox, Tab } from '@headlessui/react';
import { X, ChevronsUpDown, Check, Loader2, Save, Table, RefreshCw, Edit3 } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { createPortal } from 'react-dom';
// jspdf + xlsx are dynamically imported inside the export handlers below to
// keep these heavy libs out of the eager build/client graph. (html2canvas was
// imported but unused — removed.)
import { toast } from 'react-hot-toast';

const API_BASE = '/api';
const API_MISSING = `${API_BASE}/class_results/missing`;
const API_SUBMIT = `${API_BASE}/class_results/submit`;

// Success pulse animation styles
const successAnimationStyle = `
  @keyframes successPulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.7); }
    50% { box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
  }
  .success-pulse {
    animation: successPulse 0.6s ease-out;
  }
`;

// Bulk Entry Grid Component
interface BulkEntryGridProps {
  bulkData: any;
  setBulkData: (data: any) => void;
  subjects: Option[];
  classId?: number;
}

const BulkEntryGrid: React.FC<BulkEntryGridProps> = React.memo(function BulkEntryGrid({ bulkData, setBulkData, subjects, classId }) {
  const [focusedCell, setFocusedCell] = useState<{ studentId: number; subjectId: number } | null>(null);

  // Filter subjects to only those allocated to the class
  const classSubjects = React.useMemo(() => subjects.filter(subject => {
    // In a real implementation, you'd check against class_subjects table
    // For now, show all subjects
    return true;
  }), [subjects]);

  const students = React.useMemo(() => Object.values(bulkData), [bulkData]);

  const updateScore = (studentId: number, subjectId: number, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    if (numValue !== null && (isNaN(numValue) || numValue < 0 || numValue > 100)) {
      return; // Invalid score
    }

    setBulkData((prev: any) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        scores: {
          ...prev[studentId].scores,
          [subjectId]: numValue
        }
      }
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent, studentId: number, subjectId: number) => {
    const currentIndex = students.findIndex((s: any) => s.student_id === studentId);
    const currentSubjectIndex = classSubjects.findIndex(s => s.id === subjectId);

    let nextStudentId = studentId;
    let nextSubjectId = subjectId;

    switch (e.key) {
      case 'ArrowRight':
        if (currentSubjectIndex < classSubjects.length - 1) {
          nextSubjectId = classSubjects[currentSubjectIndex + 1].id;
        }
        break;
      case 'ArrowLeft':
        if (currentSubjectIndex > 0) {
          nextSubjectId = classSubjects[currentSubjectIndex - 1].id;
        }
        break;
      case 'ArrowDown':
        if (currentIndex < students.length - 1) {
          nextStudentId = (students[currentIndex + 1] as any).student_id;
        }
        break;
      case 'ArrowUp':
        if (currentIndex > 0) {
          nextStudentId = (students[currentIndex - 1] as any).student_id;
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          if (currentSubjectIndex > 0) {
            nextSubjectId = classSubjects[currentSubjectIndex - 1].id;
          } else if (currentIndex > 0) {
            nextStudentId = (students[currentIndex - 1] as any).student_id;
            nextSubjectId = classSubjects[classSubjects.length - 1].id;
          }
        } else {
          if (currentSubjectIndex < classSubjects.length - 1) {
            nextSubjectId = classSubjects[currentSubjectIndex + 1].id;
          } else if (currentIndex < students.length - 1) {
            nextStudentId = (students[currentIndex + 1] as any).student_id;
            nextSubjectId = classSubjects[0].id;
          }
        }
        break;
    }

    if (nextStudentId !== studentId || nextSubjectId !== subjectId) {
      setFocusedCell({ studentId: nextStudentId, subjectId: nextSubjectId });
    }
  };

  const handlePaste = (e: React.ClipboardEvent, studentId: number, subjectId: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const rows = pasteData.split('\n').map(row => row.split('\t'));

    let currentStudentIndex = students.findIndex((s: any) => s.student_id === studentId);
    let currentSubjectIndex = classSubjects.findIndex(s => s.id === subjectId);

    rows.forEach((row, rowOffset) => {
      row.forEach((cell, colOffset) => {
        const targetStudentIndex = currentStudentIndex + rowOffset;
        const targetSubjectIndex = currentSubjectIndex + colOffset;

        if (targetStudentIndex < students.length && targetSubjectIndex < classSubjects.length) {
          const targetStudent = students[targetStudentIndex] as any;
          const targetSubject = classSubjects[targetSubjectIndex];
          updateScore(targetStudent.student_id, targetSubject.id, cell.trim());
        }
      });
    });
  };

  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            <th className="sticky left-0 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-left font-semibold min-w-[200px]">
              Student
            </th>
            {classSubjects.map(subject => (
              <th key={subject.id} className="px-3 py-2 text-center font-semibold min-w-[80px]">
                {subject.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student: any, studentIndex) => (
            <tr key={student.student_id} className={studentIndex % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800'}>
              <td className="sticky left-0 bg-inherit border-r border-slate-200 dark:border-slate-700 px-3 py-2 font-medium">
                <div>
                  <div className="font-semibold">{student.first_name} {student.last_name}</div>
                  <div className="text-xs text-slate-500">{student.admission_no}</div>
                </div>
              </td>
              {classSubjects.map(subject => {
                const score = student.scores?.[subject.id];
                const isFocused = focusedCell?.studentId === student.student_id && focusedCell?.subjectId === subject.id;

                return (
                  <td key={subject.id} className="px-1 py-1 border-r border-slate-100 dark:border-slate-700">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={score ?? ''}
                      onChange={(e) => updateScore(student.student_id, subject.id, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, student.student_id, subject.id)}
                      onPaste={(e) => handlePaste(e, student.student_id, subject.id)}
                      onFocus={() => setFocusedCell({ studentId: student.student_id, subjectId: subject.id })}
                      className={`w-full px-2 py-1 text-center border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        isFocused ? 'ring-2 ring-blue-500' : 'border-transparent hover:border-slate-300'
                      } ${score !== null && score !== undefined && (score < 0 || score > 100) ? 'border-red-300 bg-red-50' : ''}`}
                      placeholder="-"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});


interface Option { id:number; name:string; }
interface TermOption extends Option { academic_year_id:number; academic_year:string; }
interface StudentRow { student_id:number; first_name:string; last_name:string; score:number|null; grade:string|null; remarks:string|null; }

// Inline create-on-type combobox lives in a shared file so the results
// import system can reuse the same affordance. See EntityTypeahead.tsx
// for the why + behaviour notes.
import { EntityTypeahead as Typeahead } from './EntityTypeahead';

const SelectBox:React.FC<{label:string; value:any; onChange:(v:any)=>void; items:Option[]; placeholder?:string; disabled?:boolean}> = ({label,value,onChange,items,placeholder='Select',disabled}) => (
  <Listbox value={value} onChange={onChange} disabled={disabled}>
    <div className="space-y-1">
      <Listbox.Label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">{label}</Listbox.Label>
      <div className={`relative rounded-xl border border-white/40 dark:border-white/10 bg-gradient-to-br from-slate-200/40 to-slate-50/20 dark:from-slate-800/60 dark:to-slate-900/40 backdrop-blur px-3 py-2 ${disabled?'opacity-50 cursor-not-allowed':'cursor-pointer'}`}>          
        <Listbox.Button className="flex w-full items-center justify-between text-left text-sm font-medium">
          <span className="truncate">{value? value.name : placeholder}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-60" />
        </Listbox.Button>
        {!disabled && (
          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-20 mt-2 left-0 right-0 max-h-64 overflow-auto rounded-xl border border-white/30 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl p-1 text-sm">
              {items.map(o => (
                <Listbox.Option key={o.id} value={o} className={({active,selected})=>`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${active?'bg-black/5 dark:bg-white/10':''} ${selected?'text-fuchsia-600 dark:text-fuchsia-400 font-semibold':''}`}>
                  {({selected}) => (<><span className="flex-1 truncate">{o.name}</span>{selected && <Check className="w-4 h-4"/>}</>)}
                </Listbox.Option>
              ))}
              {items.length===0 && <div className="px-3 py-4 text-center text-xs text-slate-500">No options</div>}
            </Listbox.Options>
          </Transition>) }
      </div>
    </div>
  </Listbox>
);

export default function ClassResultsManager({ academicType = 'secular' }: { academicType?: 'secular' | 'theology' }) {
  const { t } = useTranslation('common');
  const [isPending, startTransition] = useTransition();

  const [open,setOpen]=useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [bulkMode, setBulkMode] = useState(false); // New: toggle between single-subject and bulk modes
  const [terms,setTerms]=useState<TermOption[]>([]);
  const [classes,setClasses]=useState<Option[]>([]);
  const [subjects,setSubjects]=useState<Option[]>([]);
  const [types,setTypes]=useState<Option[]>([]);
  // Needed for inline term creation — terms require an academic_year_id.
  // We pick the first / most recent one as the default parent year.
  const [academicYears,setAcademicYears]=useState<Option[]>([]);
  const [term,setTerm]=useState<Option|null>(null);
  const [klass,setKlass]=useState<Option|null>(null);
  const [subject,setSubject]=useState<Option|null>(null);
  const [rtype,setRtype]=useState<Option|null>(null);
  const [loading,setLoading]=useState(false);
  const [rows,setRows]=useState<StudentRow[]>([]);
  const [bulkData,setBulkData]=useState<any>({}); // New: for bulk entry mode
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<string>('');
  const [includeMissing,setIncludeMissing]=useState(true);
  const [list,setList]=useState<any[]>([]);
  const [listLoading,setListLoading]=useState(false);
  const [listPage,setListPage]=useState(1);
  const [listTotal,setListTotal]=useState(0);
  const [listLimit,setListLimit]=useState(50);
  const [listSortBy,setListSortBy]=useState<'name'|'score'|'class'>('name');
  const [listSortOrder,setListSortOrder]=useState<'asc'|'desc'>('asc');
  const perPage=listLimit;
  const [filters, setFilters] = useState({ search: '', class_id: '', result_type_id: '', subject_id: '', term_id: '', academic_year_id: '' });

  // Inject success animation styles on mount
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = successAnimationStyle;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Optimistic updates for inline editing
  const [optimisticList, updateOptimisticList] = useOptimistic(
    list,
    (currentList, { id, field, value }: { id: number; field: string; value: any }) => {
      return currentList.map(result =>
        result.id === id ? { ...result, [field]: value } : result
      );
    }
  );

  // Editing state
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Fetch lookup data (terms, classes, subjects, result types)
  const loadMeta = async () => {
    try {
      const [te, cl, su, rt, ay] = await Promise.all([
        fetch(`${API_BASE}/terms`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch terms: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/classes`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch classes: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/subjects?academic_type=${academicType}`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch subjects: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/result_types`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch result types: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/academic_years`).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
      ]);
      setTerms((te.data || []) as TermOption[]);
      setAcademicYears((ay.data || []) as Option[]);
      // Filter classes to only those belonging to the current academicType program.
      // Falls back to all classes if no classes have program tags yet.
      const allClasses: any[] = cl.data || [];
      const programClasses = allClasses.filter(
        (c: any) => c.program_name?.toLowerCase() === academicType.toLowerCase()
      );
      setClasses(programClasses.length > 0 ? programClasses : allClasses);
      setSubjects(su.data || []);
      setTypes(rt.data || []);
    } catch (error) {
      console.error('Error loading metadata:', error);
      setMessage('Failed to load form data');
    }
  };

  useEffect(() => { loadMeta(); }, [academicType]);

  // ── Inline create handlers for Typeahead.onCreate ────────────────────────
  //
  // Each returns the newly-created option (with id + name) so the Typeahead
  // can auto-select it. They post to the existing public APIs — no new
  // routes needed — and refresh the local cache so subsequent typeaheads see
  // the new value. All three are tolerant of soft API rejections (the user
  // sees the existing record selected rather than a hard error).

  async function createTerm(name: string): Promise<Option | null> {
    if (academicYears.length === 0) {
      toast.error('Create an academic year first before adding a term.');
      return null;
    }
    const year = academicYears[0]; // most recent — terms API orders by year DESC
    try {
      const res = await fetch(`${API_BASE}/terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, academic_year_id: year.id, status: 'active' }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 409 = exists; pick from the fresh list below
        if (res.status !== 409) {
          toast.error(data.error || 'Could not create term');
          return null;
        }
      }
      // Re-fetch terms so the new row is in the cache
      const fresh = await fetch(`${API_BASE}/terms`).then(r => r.json()).catch(() => ({ data: [] }));
      const list = (fresh.data || []) as TermOption[];
      setTerms(list);
      const created = list.find(t => t.name.toLowerCase() === name.toLowerCase()) || null;
      if (created) toast.success(`Term "${name}" ready.`);
      return created;
    } catch (e: any) {
      toast.error(e.message || 'Network error creating term');
      return null;
    }
  }

  async function createSubject(name: string): Promise<Option | null> {
    try {
      const res = await fetch(`${API_BASE}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, academic_type: academicType, subject_type: 'core' }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) {
        toast.error(data.error || 'Could not create subject');
        return null;
      }
      const fresh = await fetch(`${API_BASE}/subjects?academic_type=${academicType}`).then(r => r.json()).catch(() => ({ data: [] }));
      const list = (fresh.data || []) as Option[];
      setSubjects(list);
      const created = list.find(s => s.name.toLowerCase() === name.toLowerCase()) || null;
      if (!created) return null;
      // Auto-allocate to the currently-selected class. Without this the
      // submit endpoint immediately rejects with SUBJECT_NOT_ALLOCATED
      // and the operator has to detour through the allocations admin
      // page. Allocation is silent (no toast on success) — failure is
      // surfaced via toast.error so the operator knows the subject
      // exists but is unallocated.
      if (klass) {
        await ensureSubjectAllocated(created.id, klass.id, /*announce*/ false);
      }
      toast.success(`Subject "${name}" ready.`);
      return created;
    } catch (e: any) {
      toast.error(e.message || 'Network error creating subject');
      return null;
    }
  }

  /**
   * Idempotently allocate a subject to a class. Returns true on success
   * (or when an active allocation already exists), false on real
   * failure. Used as part of inline subject creation AND as the
   * "Allocate & retry" recovery after a SUBJECT_NOT_ALLOCATED submit.
   */
  async function ensureSubjectAllocated(subjectId: number, classId: number, announce: boolean): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/academics/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: classId, subject_id: subjectId }),
      });
      // 409/200 both mean we now have an active allocation.
      if (res.ok || res.status === 409) {
        if (announce) toast.success('Allocation created. Resubmitting…');
        return true;
      }
      const data = await res.json().catch(() => ({}));
      if (announce) toast.error(data.error || data.message || `Allocation failed (${res.status})`);
      return false;
    } catch (e: any) {
      if (announce) toast.error(e.message || 'Network error allocating subject');
      return false;
    }
  }

  async function createResultType(name: string): Promise<Option | null> {
    // result_types requires a unique code. Auto-derive from the name —
    // upper-snake-case of the first 24 chars, plus a 4-char random suffix
    // to avoid collisions when two schools both create "Mid Term".
    const baseCode = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${baseCode}_${suffix}`;
    try {
      const res = await fetch(`${API_BASE}/result_types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, weight: 100 }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) {
        toast.error(data.error || 'Could not create result type');
        return null;
      }
      const fresh = await fetch(`${API_BASE}/result_types`).then(r => r.json()).catch(() => ({ data: [] }));
      const list = (fresh.data || []) as Option[];
      setTypes(list);
      const created = list.find(rt => rt.name.toLowerCase() === name.toLowerCase()) || null;
      if (created) toast.success(`Result type "${name}" ready. Adjust weight later in the Result Types tab.`);
      return created;
    } catch (e: any) {
      toast.error(e.message || 'Network error creating result type');
      return null;
    }
  }

  // Reset page to 1 whenever filters/sort/limit change
  useEffect(() => { setListPage(1); }, [filters.class_id, filters.subject_id, filters.result_type_id, filters.term_id, filters.academic_year_id, filters.search, listSortBy, listSortOrder, listLimit]);

  // Load results list with server-side pagination, search, and sort
  useEffect(() => {
    const qs = new URLSearchParams({
      class_id: filters.class_id,
      subject_id: filters.subject_id,
      result_type_id: filters.result_type_id,
      term_id: filters.term_id,
      academic_year_id: filters.academic_year_id,
      search: filters.search,
      sort_by: listSortBy,
      sort_order: listSortOrder,
      page: String(listPage),
      limit: String(listLimit),
      academic_type: academicType,
    });
    setListLoading(true);
    fetch(`${API_BASE}/class-results/list?${qs.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (d.error) setMessage(d.error);
        else {
          setList(d.data || []);
          setListTotal(d.meta?.total ?? (d.data || []).length);
        }
      })
      .catch(e => {
        console.error('Error loading results:', e);
        setMessage(e.message || 'Failed to load results');
      })
      .finally(() => setListLoading(false));
  }, [filters.class_id, filters.subject_id, filters.result_type_id, filters.term_id, filters.academic_year_id, filters.search, listSortBy, listSortOrder, listPage, listLimit]);

  // Update score with optimistic UI
  const updateScore = async (resultId: number, field: string, value: any) => {
    // Validation
    if (field === 'score') {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        toast.error('Score must be between 0 and 100');
        return;
      }
    }

    // Show saving toast
    const savingToast = toast.loading('Saving...', {
      duration: Infinity,
      style: { background: '#3b82f6', color: 'white' },
    });

    // Optimistic update
    updateOptimisticList({ id: resultId, field, value });

    // API call
    startTransition(async () => {
      try {
        const response = await fetch(`${API_BASE}/class-results/${resultId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value, actor_user_id: 1 })
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
          toast.dismiss(savingToast);
          toast.success('Score updated successfully', {
            duration: 2000,
            style: { background: '#10b981', color: 'white' },
          });
          // Update actual state — patch in-place, no extra refetch
          setList(prev => prev.map(result =>
            result.id === resultId ? { ...result, ...(data.updatedResult ?? { [field]: value }) } : result
          ));
        } else {
          toast.dismiss(savingToast);
          toast.error(data.error || 'Failed to update score');
          // Revert by resetting filters to trigger reload
          setFilters(f => ({ ...f }));
        }
      } catch (error) {
        toast.dismiss(savingToast);
        toast.error('Network error - please try again');
        console.error('Error updating score:', error);
      }
    });
  };

  const handleOpenModal = (mode: 'single' | 'bulk' = 'single') => {
    setBulkMode(mode === 'bulk');
    setOpen(true);
    setKlass(classes.find(c => String(c.id) === String(filters.class_id)) || null);
    setSubject(subjects.find(s => String(s.id) === String(filters.subject_id)) || null);
    setRtype(types.find(rt => String(rt.id) === String(filters.result_type_id)) || null);
    setTerm(terms.find(t => String(t.id) === String(filters.term_id)) || null);
    setRows([]);
    setBulkData({});
  };

  const handleFetchMissingRows = () => {
    if (!klass || !subject || !rtype) return;
    fetchMissingRows({
      class_id: klass.id,
      subject_id: subject.id,
      result_type_id: rtype.id,
      term_id: term?.id || ''
    });
  };

  const loadBulkData = async () => {
    if (!klass || !rtype || !term) return;
    setLoading(true);
    try {
      // Get all subjects for this class
      const classSubjectsRes = await fetch(`${API_BASE}/class-subjects?class_id=${klass.id}&academic_type=${academicType}`);
      const classSubjects = classSubjectsRes.ok ? await classSubjectsRes.json() : [];

      // Get all students in the class
      const studentsRes = await fetch(`${API_BASE}/enrollments?class_id=${klass.id}&status=active`);
      const enrollments = studentsRes.ok ? await studentsRes.json() : [];

      // Get existing results for all subjects
      const resultsRes = await fetch(`${API_BASE}/class-results/bulk?class_id=${klass.id}&term_id=${term.id}&result_type_id=${rtype.id}&academic_type=${academicType}`);
      const existingResults = resultsRes.ok ? await resultsRes.json() : [];

      // Structure the data
      const students = enrollments.data || [];
      const subjectsList = classSubjects.data || [];
      const results = existingResults.data || [];

      // Create bulk data structure: { student_id: { subject_id: score, ... }, ... }
      const data: any = {};
      students.forEach((student: any) => {
        data[student.student_id] = {
          student_id: student.student_id,
          first_name: student.first_name,
          last_name: student.last_name,
          admission_no: student.admission_no,
          scores: {}
        };
      });

      // Populate existing scores
      results.forEach((result: any) => {
        if (data[result.student_id]) {
          data[result.student_id].scores[result.subject_id] = result.score;
        }
      });

      setBulkData(data);
    } catch (error) {
      console.error('Error loading bulk data:', error);
      setMessage('Failed to load bulk data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMissingRows = async (bulkFilters: any) => {
    setLoading(true);
    setMessage('');
    const qs = new URLSearchParams(bulkFilters);
    try {
      const res = await fetch(`${API_MISSING}?${qs.toString()}`);
      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!data.success) setMessage(data.error || 'Error loading missing learners');
      else {
        // Deduplicate learners by student_id (fallback to admission_no + name if no id)
        const items = data.data || [];
        const seen = new Map<string | number, any>();
        for (const item of items) {
          const key = item.student_id ?? item.id ?? `${(item.admission_no||'').toString().trim()}::${(item.first_name||'').toString().trim()}::${(item.last_name||'').toString().trim()}`;
          if (!seen.has(key)) {
            seen.set(key, item);
          } else {
            // Optional: merge minimal fields if some are missing in the first entry
            const existing = seen.get(key);
            // Keep existing values, but fill in any missing data from item
            for (const k of Object.keys(item)) {
              if ((existing[k] === undefined || existing[k] === null || existing[k] === '') && item[k] !== undefined) {
                existing[k] = item[k];
              }
            }
            seen.set(key, existing);
          }
        }
        const unique = Array.from(seen.values());
        // Preserve API order as much as possible but ensure uniqueness
        setRows(unique.map((r: any) => ({ ...r, score: null, grade: null, remarks: null })));
      }
    } catch (e: any) {
      setMessage(e.message || 'Failed to fetch data');
      console.error('Error fetching missing rows:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateRow=(sid:number,field:keyof StudentRow,value:any)=>{ setRows(r=>r.map(row=> row.student_id===sid? {...row,[field]:value}:row)); };

  const submitResults = async () => {
    if (!klass || !subject || !rtype) return;
    setSaving(true);
    setMessage('');
    const payload = {
      class_id: klass.id,
      subject_id: subject.id,
      result_type_id: rtype.id,
      term_id: term?.id,
      academic_type: academicType,
      include_missing: includeMissing,
      entries: rows.filter(r => r.score !== null || (r.grade && r.grade !== '') || (r.remarks && r.remarks !== '')).map(r => ({ student_id: r.student_id, score: r.score, grade: r.grade, remarks: r.remarks }))
    };
    const postOnce = async () => fetch(API_SUBMIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    try {
      let res = await postOnce();
      let data: any = await res.json().catch(() => ({}));

      // SUBJECT_NOT_ALLOCATED recovery: the API refuses to write results
      // for a subject the class doesn't have allocated. Until very
      // recently the user was just shown the raw 400 with no path
      // forward. Now: if the subject + class are both known, we
      // auto-allocate and replay the submit. The fix matches the
      // operator's intent — they're trying to enter marks for this
      // subject in this class right now.
      if (!res.ok && data?.code === 'SUBJECT_NOT_ALLOCATED' && klass && subject) {
        toast('Allocating subject to class…', { icon: '⏳' });
        const allocated = await ensureSubjectAllocated(subject.id, klass.id, /*announce*/ true);
        if (allocated) {
          res = await postOnce();
          data = await res.json().catch(() => ({}));
        }
      }

      if (!res.ok) {
        const msg = data?.error || `Server error: ${res.status} ${res.statusText}`;
        setMessage(msg);
        toast.error(msg);
        return;
      }
      if (data.error) {
        setMessage(data.error);
        toast.error(data.error);
        return;
      }

      setMessage('✓ Saved Successfully!');
      setShowSuccessAnimation(true);
      toast.success('Results submitted successfully!');
      setTimeout(() => {
        setList([]);
        setFilters(f => ({ ...f }));
        setOpen(false);
        setShowSuccessAnimation(false);
      }, 800);
    } catch (e: any) {
      setMessage(e.message || 'Failed to submit results');
      toast.error(e.message || 'Failed to submit results');
      console.error('Error submitting results:', e);
    } finally {
      setSaving(false);
    }
  };

  const submitBulkResults = async () => {
    if (!klass || !rtype || !term) return;
    setSaving(true);
    setMessage('');

    const entries: any[] = [];
    Object.values(bulkData).forEach((studentData: any) => {
      Object.entries(studentData.scores).forEach(([subjectId, score]) => {
        if (score !== null && score !== undefined && score !== '') {
          entries.push({
            student_id: studentData.student_id,
            subject_id: parseInt(subjectId),
            score: parseFloat(score.toString()),
            class_id: klass.id,
            result_type_id: rtype.id,
            term_id: term.id,
            academic_type: academicType
          });
        }
      });
    });

    const postBulk = async (es: any[]) => {
      const res = await fetch(`${API_BASE}/class_results/bulk-submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: es, academic_type: academicType }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
      return res.json();
    };

    try {
      let data = await postBulk(entries);

      // SUBJECT_NOT_ALLOCATED recovery (bulk variant). The bulk endpoint
      // does not 400 on un-allocated subjects — it silently pushes the
      // affected rows into `ignored[]` with reason ~ "Subject not
      // allocated to class". Before this fix, the operator saw
      // "X records saved" with no warning that some were dropped.
      // Now: detect those rows, batch-allocate their subjects to the
      // class via /api/academics/allocations, then replay JUST those
      // entries. Bounded to one retry — if the second attempt still
      // ignores anything, the toast surfaces the residual count.
      const isAllocIgnored = (r: { reason?: string }) =>
        typeof r.reason === 'string' && /not allocated to class/i.test(r.reason);
      const ignored1: Array<{ subject_id: number; student_id: number; reason?: string }> = Array.isArray(data?.ignored) ? data.ignored : [];
      const allocBlocked = ignored1.filter(isAllocIgnored);
      if (allocBlocked.length > 0) {
        const subjectIds = Array.from(new Set(allocBlocked.map(r => r.subject_id)));
        toast(`Allocating ${subjectIds.length} subject${subjectIds.length === 1 ? '' : 's'} to class…`, { icon: '⏳' });
        const allocatedSubjects = new Set<number>();
        for (const sid of subjectIds) {
          const ok = await ensureSubjectAllocated(sid, klass.id, /*announce*/ false);
          if (ok) allocatedSubjects.add(sid);
        }
        if (allocatedSubjects.size > 0) {
          const blockedKeys = new Set(allocBlocked.map(r => `${r.student_id}::${r.subject_id}`));
          const retryEntries = entries.filter(e =>
            allocatedSubjects.has(e.subject_id) &&
            blockedKeys.has(`${e.student_id}::${e.subject_id}`),
          );
          if (retryEntries.length > 0) {
            const second = await postBulk(retryEntries);
            const insertedSecond = Number(second?.inserted ?? 0);
            // Roll up the combined picture into `data` so the success
            // toast reflects everything that actually landed.
            data = {
              ...data,
              inserted: Number(data.inserted ?? 0) + insertedSecond,
              ignored:  ignored1
                .filter(r => !(allocatedSubjects.has(r.subject_id) && blockedKeys.has(`${r.student_id}::${r.subject_id}`)))
                .concat(Array.isArray(second?.ignored) ? second.ignored : []),
            };
          }
        }
      }

      if (data.error) {
        setMessage(data.error);
        toast.error(data.error);
        return;
      }
      const remainingIgnored = Array.isArray(data.ignored) ? data.ignored.length : 0;
      const inserted = Number(data.inserted ?? 0);
      setMessage('✓ Bulk results saved successfully!');
      setShowSuccessAnimation(true);
      if (remainingIgnored > 0) {
        toast.success(`Saved ${inserted}; ${remainingIgnored} row${remainingIgnored === 1 ? '' : 's'} ignored`);
      } else {
        toast.success(`Bulk results submitted successfully! ${inserted} records saved.`);
      }
      setTimeout(() => {
        setList([]);
        setFilters(f => ({ ...f }));
        setOpen(false);
        setShowSuccessAnimation(false);
      }, 800);
    } catch (e: any) {
      setMessage(e.message || 'Failed to submit bulk results');
      toast.error(e.message || 'Failed to submit bulk results');
      console.error('Error submitting bulk results:', e);
    } finally {
      setSaving(false);
    }
  };

  // Helper: get unique subjects from results
  const subjectColumns = React.useMemo(() => {
    const subjectSet = new Map();
    optimisticList.forEach(r => {
      if (r.subject_id && r.subject_name) subjectSet.set(r.subject_id, r.subject_name);
    });
    return Array.from(subjectSet, ([id, name]) => ({ id, name }));
  }, [optimisticList]);

  // Group results by student and class with enhanced calculations
  // Data is already server-side paginated/filtered/sorted — just build the marklist
  const marklist = React.useMemo(() => {
    const classGroups: Record<string, any[]> = {};
    optimisticList.forEach(r => {
      if (!classGroups[r.class_name]) classGroups[r.class_name] = [];
      let student = classGroups[r.class_name].find(s => s.student_id === r.student_id);
      if (!student) {
        student = {
          student_id: r.student_id,
          name: `${r.last_name}, ${r.first_name}`,
          class_name: r.class_name,
          program_name: r.program_name || null,
          scores: {},
          allScores: [],
        };
        classGroups[r.class_name].push(student);
      }
      student.scores[r.subject_id] = r;
      // Keep program_name if available
      if (r.program_name && !student.program_name) student.program_name = r.program_name;
      const scoreNum = typeof r.score === 'number' ? r.score : (r.score !== null && r.score !== undefined && r.score !== '' ? parseFloat(r.score) : null);
      if (scoreNum !== null && !isNaN(scoreNum)) student.allScores.push(scoreNum);
    });
    
    let allRows: any[] = [];
    Object.values(classGroups).forEach((students: any[]) => {
      students.forEach(row => {
        const scoresArr = subjectColumns.map(s => {
          const result = row.scores[s.id];
          return result ? parseFloat(result.score) : null;
        }).filter((v): v is number => typeof v === 'number' && !isNaN(v));

        const total = scoresArr.reduce((a, b) => a + b, 0);
        const avg = scoresArr.length ? (total / scoresArr.length) : null;
        row.total = Math.round(total * 100) / 100;
        row.avg = avg;
      });
      
      // Sort by total descending for class position
      students.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
      students.forEach((row, i) => { 
        row.position = i + 1; 
        row.totalInClass = students.length;
      });
      allRows = allRows.concat(students);
    });
    return allRows;
  }, [optimisticList, subjectColumns]);

  // filteredMarklist = marklist as-is (filtering/search/sort is server-side now)
  const filteredMarklist = marklist;

  const sortedLearners = useMemo(() => {
    return [...rows].sort((a, b) => {
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [rows]);

  // Handle cell edit
  const handleCellEdit = (result: any, field: string) => {
    setEditingCell({ id: result.id, field });
    setEditValue(String(result[field] || ''));
  };

  // Handle cell save
  const handleCellSave = () => {
    if (editingCell) {
      updateScore(editingCell.id, editingCell.field, editValue);
      setEditingCell(null);
      setEditValue('');
    }
  };

  // Handle cell cancel
  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Render editable cell for scores in table
  const renderEditableCell = (result: any) => {
    const isEditing = editingCell?.id === result.id && editingCell?.field === 'score';
    const isUpdating = isPending && editingCell?.id === result.id && editingCell?.field === 'score';

    if (isEditing) {
      return (
        <div className="relative">
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleCellSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCellSave();
              if (e.key === 'Escape') handleCellCancel();
            }}
            className="w-full px-1 py-0.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            min={0}
            max={100}
            disabled={isUpdating}
          />
          {isUpdating && (
            <div className="absolute inset-y-0 right-1 flex items-center">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className={`cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors ${
          isUpdating ? 'bg-blue-50 border border-blue-200' : ''
        }`}
        onClick={() => !isUpdating && handleCellEdit(result, 'score')}
      >
        <span className={isUpdating ? 'text-blue-600' : ''}>{result.score ?? '-'}</span>
      </div>
    );
  };

  // Export to PDF
  const exportToPDF = async (scope: 'learner' | 'class' | 'school', data: any[]) => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('l', 'pt');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    const tableWidth = pageWidth - margin * 2;
    
    // Header
    pdf.setFontSize(18);
    pdf.text('Class Results', margin, margin);
    pdf.setFontSize(10);
    pdf.text(`Date: ${new Date().toLocaleDateString()}`, margin, margin + 10);
    pdf.text(`Time: ${new Date().toLocaleTimeString()}`, margin, margin + 20);
    
    // Table: Add column headers
    const headers = [
      'Student Name',
      'Class',
      ...subjectColumns.map(s => s.name),
      'Total',
      'Min',
      'Max',
      'Avg',
      'Position'
    ];
    
    // Table: Add rows
    const rows = data.map(row => [
      row.name,
      row.class_name,
      ...subjectColumns.map(s => {
        const score = row.scores?.[s.id];
        return score ? (score.score || score) : '-';
      }),
      row.total ?? '-',
      row.min ?? '-',
      row.max ?? '-',
      row.avg !== null && row.avg !== undefined ? row.avg.toFixed(2) : '-',
      `${row.position}/${row.totalInClass}`
    ]);
    
    // Table: Auto-adjust column widths
    const columnWidths = headers.map((_, i) => {
      if (i === 0) return 100; // Student Name
      if (i === 1) return 50;  // Class
      return 40; // Subjects, Total, Min, Max, Avg, Position
    });
    
    // Table: Draw
    pdf.autoTable({
      head: [headers],
      body: rows,
      startY: margin + 40,
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      styles: {
        fontSize: 10,
        cellPadding: 2,
        overflow: 'linebreak',
        lineWidth: 0.1,
        halign: 'center',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [22, 160, 133],
        textColor: [255, 255, 255],
        fontSize: 11,
        cellPadding: 3,
      },
      columnStyles: Object.fromEntries(
        columnWidths.map((width, i) => [i, { cellWidth: width }])
      ),
    });
    
    // Footer
    const footerText = scope === 'learner' ? 'Learner Report' : scope === 'class' ? 'Class Report' : 'School Report';
    const footerY = pageHeight - margin;
    pdf.setFontSize(10);
    pdf.text(footerText, margin, footerY, { align: 'left' });
    pdf.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth - margin - 100, footerY, { align: 'right' });
    
    // Save the PDF
    pdf.save(`class_results_${new Date().getTime()}.pdf`);
  };

  // Export to Excel
  const exportToExcel = async (scope: 'learner' | 'class' | 'school', data: any[]) => {
    const XLSX = await import('xlsx');
    if (!data || data.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      // Transform data for Excel export
      const excelData = data.map(row => {
        const rowData: any = {
          'Student Name': row.name,
          'Class': row.class_name || '-'
        };
        
        // Add subject scores
        subjectColumns.forEach(subject => {
          const score = row.scores?.[subject.id];
          rowData[subject.name] = score ? (score.score || score) : '-';
        });
        
        // Add summary data
        rowData['Total'] = row.total ?? '-';
        rowData['Min'] = row.min ?? '-';
        rowData['Max'] = row.max ?? '-';
        rowData['Avg'] = row.avg !== null && row.avg !== undefined ? row.avg.toFixed(2) : '-';
        rowData['Position'] = `${row.position}/${row.totalInClass}`;
        
        return rowData;
      });

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Results');
      
      // Set column widths
      const columnWidths = [
        { wpx: 200 }, // Student Name
        { wpx: 100 }, // Class
        ...subjectColumns.map(() => ({ wpx: 80 })), // Subject columns
        { wpx: 80 }, // Total
        { wpx: 60 }, // Min
        { wpx: 60 }, // Max
        { wpx: 60 }, // Avg
        { wpx: 100 }, // Position
      ];
      
      ws['!cols'] = columnWidths;
      
      XLSX.writeFile(wb, `class_results_${new Date().getTime()}.xlsx`);
      toast.success('Excel file exported successfully!');
    } catch (error) {
      console.error('Excel export error:', error);
      toast.error('Failed to export Excel file');
    }
  };

  // Export to CSV
  const exportToCSV = (data: any[]) => {
    if (!data || data.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      const headers = [
        'Student Name',
        'Class',
        ...subjectColumns.map(s => s.name),
        'Total',
        'Min',
        'Max',
        'Avg',
        'Position'
      ];

      const csvRows = [
        headers.join(','),
        ...data.map(row => [
          `"${row.name}"`,
          `"${row.class_name || '-'}"`,
          ...subjectColumns.map(s => {
            const score = row.scores?.[s.id];
            return score ? score.score || score : '-';
          }),
          row.total ?? '-',
          row.min ?? '-',
          row.max ?? '-',
          row.avg !== null && row.avg !== undefined ? row.avg.toFixed(2) : '-',
          `${row.position}/${row.totalInClass}`
        ].join(','))
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `class_results_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('CSV exported successfully!');
    } catch (error) {
      console.error('CSV export error:', error);
      toast.error('Failed to export CSV');
    }
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── COMPACT TOOLBAR ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-1.5 px-3 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <input
          type="text"
          placeholder={t('search')}
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          className="h-8 px-2.5 w-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <select
          value={filters.class_id}
          onChange={e => setFilters(f => ({ ...f, class_id: e.target.value }))}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">{t('all_classes')}</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filters.subject_id}
          onChange={e => setFilters(f => ({ ...f, subject_id: e.target.value }))}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">{t('all_subjects')}</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={filters.result_type_id}
          onChange={e => setFilters(f => ({ ...f, result_type_id: e.target.value }))}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">{t('all_types')}</option>
          {types.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
        <select
          value={filters.academic_year_id}
          onChange={e => setFilters(f => ({ ...f, academic_year_id: e.target.value, term_id: '' }))}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">All Years</option>
          {Array.from(
            new Map(terms.map(t => [t.academic_year_id, t.academic_year])).entries()
          ).sort((a, b) => String(b[1]).localeCompare(String(a[1]))).map(([ayId, ayName]) => (
            <option key={ayId} value={ayId}>{ayName}</option>
          ))}
        </select>
        <select
          value={filters.term_id}
          onChange={e => setFilters(f => ({ ...f, term_id: e.target.value }))}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
        >
          <option value="">{t('all_terms')}</option>
          {terms
            .filter(term => !filters.academic_year_id || String(term.academic_year_id) === String(filters.academic_year_id))
            .map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
        </select>

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

        <div className="flex gap-2">
          <button
            onClick={() => handleOpenModal('single')}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            {t('add_edit_results')}
          </button>
          <button
            onClick={() => handleOpenModal('bulk')}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Bulk Entry
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 font-medium">{listTotal} results</span>
          <button onClick={() => setFilters(f => ({ ...f }))} className="h-8 px-2 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1 transition-colors">
            <RefreshCw className="w-3 h-3"/>{t('refresh')}
          </button>
          {[20, 50, 100].map(n => (
            <button
              key={n}
              onClick={() => { setListLimit(n); setListPage(1); }}
              className={`h-8 px-2 rounded-lg text-xs font-medium transition-colors ${listLimit === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >{n}</button>
          ))}
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          {(['name', 'score', 'class'] as const).map(key => (
            <button
              key={key}
              onClick={() => {
                if (listSortBy === key) setListSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                else { setListSortBy(key); setListSortOrder('asc'); }
                setListPage(1);
              }}
              className={`h-8 px-2 rounded-lg text-xs font-medium transition-colors ${listSortBy === key ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
              {listSortBy === key && <span className="ml-0.5">{listSortOrder === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <button onClick={() => exportToPDF('learner', filteredMarklist)} className="h-8 px-2 rounded-lg text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors">PDF</button>
          <button onClick={() => exportToExcel('learner', filteredMarklist)} className="h-8 px-2 rounded-lg text-[10px] font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">XLS</button>
          <button onClick={() => exportToCSV(filteredMarklist)} className="h-8 px-2 rounded-lg text-[10px] font-bold bg-blue-500 text-white hover:bg-blue-600 transition-colors">CSV</button>
        </div>
      </div>

      {/* ── RESULTS TABLE (fills remaining space) ─────────────────── */}
      <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur sticky top-0 z-10 shadow-sm">
              <tr>
                <th
                  className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 select-none whitespace-nowrap"
                  onClick={() => { if (listSortBy==='name') setListSortOrder(o=>o==='asc'?'desc':'asc'); else { setListSortBy('name'); setListSortOrder('asc'); } setListPage(1); }}
                >
                  {t('student')} {listSortBy==='name' && <span>{listSortOrder==='asc'?'↑':'↓'}</span>}
                </th>
                <th
                  className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 select-none whitespace-nowrap"
                  onClick={() => { if (listSortBy==='class') setListSortOrder(o=>o==='asc'?'desc':'asc'); else { setListSortBy('class'); setListSortOrder('asc'); } setListPage(1); }}
                >
                  {t('class')} {listSortBy==='class' && <span>{listSortOrder==='asc'?'↑':'↓'}</span>}
                </th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Program</th>
                {subjectColumns.map(s => (
                  <th key={s.id} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">
                    {s.name}
                  </th>
                ))}
                <th
                  className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 select-none whitespace-nowrap"
                  onClick={() => { if (listSortBy==='score') setListSortOrder(o=>o==='asc'?'desc':'asc'); else { setListSortBy('score'); setListSortOrder('asc'); } setListPage(1); }}
                >
                  {t('total')} {listSortBy==='score' && <span>{listSortOrder==='asc'?'↑':'↓'}</span>}
                </th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{t('avg')}</th>
                <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{t('position')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredMarklist.map((row, idx) => (
                <tr key={`${row.student_id}-${idx}`} className={`border-t border-white/10 dark:border-white/5 ${idx % 2 === 0 ? 'bg-white/40 dark:bg-slate-800/20' : 'bg-white/20 dark:bg-slate-800/10'} hover:bg-indigo-50/40 dark:hover:bg-indigo-900/20 transition-colors`}>
                  <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{row.name}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.class_name || '-'}</td>
                  <td className="px-3 py-2">
                    {row.program_name ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${row.program_name.toLowerCase().includes('islam') || row.program_name.toLowerCase().includes('tahfiz') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                        {row.program_name}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  {subjectColumns.map(s => (
                    <td key={s.id} className="px-3 py-2">
                      {row.scores[s.id] ? renderEditableCell(row.scores[s.id]) : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">{row.total ?? '—'}</td>
                  <td className="px-3 py-2">{row.avg !== null && row.avg !== undefined ? row.avg.toFixed(1) : '—'}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {row.position}/{row.totalInClass}
                    </span>
                  </td>
                </tr>
              ))}
              {!listLoading && filteredMarklist.length === 0 && (
                <tr>
                  <td colSpan={subjectColumns.length + 7} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <Table className="w-8 h-8 opacity-30"/>
                      <span>{t('no_results_found')}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {listLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/>Loading results...
            </div>
          )}
        </div>

      {/* ── PAGINATION FOOTER ──────────────────────────────────── */}
      {listTotal > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between text-xs px-3 py-1.5 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800">
          <span className="text-slate-500">
            {Math.min((listPage - 1) * listLimit + 1, listTotal)}–{Math.min(listPage * listLimit, listTotal)} of {listTotal}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              disabled={listPage === 1}
              onClick={() => setListPage(p => Math.max(1, p - 1))}
              className="h-7 px-2.5 rounded-md bg-slate-100 dark:bg-slate-800 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >← {t('prev')}</button>
            <span className="h-7 px-2.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center">
              {listPage}/{Math.ceil(listTotal / listLimit)}
            </span>
            <button
              disabled={listPage >= Math.ceil(listTotal / listLimit)}
              onClick={() => setListPage(p => p + 1)}
              className="h-7 px-2.5 rounded-md bg-slate-100 dark:bg-slate-800 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >{t('next')} →</button>
          </div>
        </div>
      )}

      {/* Modal for adding/editing results */}
      <Transition show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={()=>setOpen(false)}>
          <Transition.Child 
            as="div"
            enter="ease-out duration-200" 
            enterFrom="opacity-0" 
            enterTo="opacity-100" 
            leave="ease-in duration-150" 
            leaveFrom="opacity-100" 
            leaveTo="opacity-0"
            className="fixed inset-0 bg-gradient-to-br from-slate-900/80 via-fuchsia-900/60 to-indigo-900/80 backdrop-blur"
          />
          <div className="fixed inset-0 overflow-y-auto p-4 md:p-8">
            <div className="mx-auto max-w-6xl">
              <Transition.Child 
                as="div"
                enter="ease-out duration-300" 
                enterFrom="opacity-0 scale-95" 
                enterTo="opacity-100 scale-100" 
                leave="ease-in duration-200" 
                leaveFrom="opacity-100 scale-100" 
                leaveTo="opacity-0 scale-95"
                className="relative rounded-3xl border border-white/15 dark:border-white/10 bg-gradient-to-br from-white/90 via-white/70 to-white/50 dark:from-slate-900/90 dark:via-slate-900/70 dark:to-slate-800/60 backdrop-blur-2xl shadow-2xl overflow-hidden"
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-20 -right-10 w-72 h-72 bg-fuchsia-400/20 blur-3xl rounded-full" />
                  <div className="absolute -bottom-24 -left-20 w-96 h-96 bg-indigo-500/20 blur-3xl rounded-full" />
                </div>
                {/* Sticky Header */}
                <div className="sticky top-0 z-40 p-6 border-b border-white/30 dark:border-white/10 bg-gradient-to-r from-white/95 to-white/90 dark:from-slate-900/95 dark:to-slate-900/90 backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                        {bulkMode ? 'Bulk Results Entry' : t('class_results_entry')}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {bulkMode ? 'Enter scores for multiple subjects simultaneously' : 'Enter scores for each student across all subjects'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {message && <span className={`text-xs font-semibold px-3 py-1 rounded-full ${message.includes('Successfully')?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300':'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>{message}</span>}
                      <button onClick={()=>setOpen(false)} className="group p-2 rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/10 transition-colors" aria-label="Close modal"><X className="w-5 h-5 text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white"/></button>
                    </div>
                  </div>
                </div>
                {/* Content Container with Internal Scroll */}
                <div className="relative px-6 pt-6 pb-24 max-h-[calc(80vh-180px)] overflow-y-auto space-y-6">
                  {/* Filter Section */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">Filter & Load</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <Typeahead label={t('term')} value={term ?? null} onChange={(v) => setTerm(v as TermOption | null)} items={terms} placeholder={terms.length === 0 ? 'Type to create your first term…' : 'Pick or type to create'} entityLabel="term" onCreate={createTerm} />
                      <SelectBox label={t('class')} value={klass ?? null} onChange={v=>{setKlass(v);}} items={classes} />
                      {!bulkMode && (
                        <Typeahead label={t('subject')} value={subject ?? null} onChange={(v) => setSubject(v as Option | null)} items={subjects.filter(s=>!klass || s)} placeholder={subjects.length === 0 ? 'Type a subject name to create it…' : 'Pick or type to create'} entityLabel="subject" onCreate={createSubject} />
                      )}
                      <Typeahead label={t('result_type')} value={rtype ?? null} onChange={(v) => setRtype(v as Option | null)} items={types} placeholder={types.length === 0 ? 'Type to create e.g. End-of-Term…' : 'Pick or type to create'} entityLabel="result type" onCreate={createResultType} />
                      <div className="flex flex-col justify-end">
                        <button
                          disabled={!klass || (!bulkMode && !subject) || !rtype || loading}
                          onClick={bulkMode ? loadBulkData : handleFetchMissingRows}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white disabled:opacity-40 transition-all hover:shadow-lg disabled:cursor-not-allowed"
                        >
                          {loading ? <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" /> : null}
                          {loading ? t('loading') : t('load')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Data Entry - Single Subject Mode */}
                  {!bulkMode && rows.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                          {t('student_results', 'Student Results')} — {rows.length} {t('students', 'students')}
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {sortedLearners.map((r, rowIdx) => (
                          <div
                            key={`student-${r.student_id}-${rowIdx}`}
                            className={`group relative rounded-lg border transition-all duration-200 ${
                              editingCell?.id === r.student_id ? 'ring-2 ring-indigo-500 border-indigo-300 dark:border-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/20' : 'border-slate-200/60 dark:border-slate-700/60'
                            } ${rowIdx % 2 === 0 ? 'bg-slate-50/40 dark:bg-slate-900/20' : 'bg-white/50 dark:bg-slate-800/30'} p-4 hover:border-indigo-300 dark:hover:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-400 dark:focus-within:ring-indigo-500`}
                          >
                            {/* Student Name Label - Floating */}
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2 transition-colors group-hover:text-slate-800 dark:group-hover:text-slate-300">
                              {r.first_name} {r.last_name}
                            </label>
                            {/* Score Input - Modern Excel Style */}
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              className="w-full px-3 py-2.5 rounded-md bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:border-indigo-400 dark:focus:ring-indigo-400 transition-all text-center"
                              value={r.score ?? ''}
                              onChange={e=>updateRow(r.student_id,'score', e.target.value===''? null : parseFloat(e.target.value))}
                              onFocus={() => setEditingCell({ id: r.student_id, field: 'score' })}
                              onBlur={() => setEditingCell(null)}
                              placeholder="Score"
                              aria-label={`Score for ${r.first_name} ${r.last_name}`}
                            />
                            {/* Score Display Helper */}
                            {r.score !== null && r.score !== undefined && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                                {typeof r.score === 'number' && r.score >= 0 && r.score <= 100 ? `${r.score}%` : 'Invalid'}
                              </div>
                            )}
                            {/* Manual subject comment (Phase 6) — teacher's own
                                words; blank falls back to the auto/rule comment
                                at report time. */}
                            <input
                              type="text"
                              className="mt-2 w-full px-3 py-1.5 rounded-md bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-600 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                              value={r.remarks ?? ''}
                              onChange={e=>updateRow(r.student_id,'remarks', e.target.value===''? null : e.target.value)}
                              onFocus={() => setEditingCell({ id: r.student_id, field: 'remarks' })}
                              onBlur={() => setEditingCell(null)}
                              placeholder={t('subject_comment', 'Comment (optional)')}
                              aria-label={`Comment for ${r.first_name} ${r.last_name}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bulk Entry Grid */}
                  {bulkMode && Object.keys(bulkData).length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">
                          Bulk Entry — {Object.keys(bulkData).length} Students
                        </h3>
                        <div className="text-xs text-slate-500">
                          Use Tab/Arrow keys to navigate • Ctrl+V to paste from Excel
                        </div>
                      </div>
                      <BulkEntryGrid
                        bulkData={bulkData}
                        setBulkData={setBulkData}
                        subjects={subjects}
                        classId={klass?.id}
                      />
                    </div>
                  )}

                  {/* Loading State */}
                  {loading && (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mb-2" />
                      <span className="text-xs font-medium">{t('loading_students')}...</span>
                    </div>
                  )}
                </div>

                {/* Sticky Footer */}
                <div className="sticky bottom-0 left-0 right-0 z-40 border-t border-white/30 dark:border-white/10 bg-gradient-to-r from-white/95 to-white/90 dark:from-slate-900/95 dark:to-slate-900/90 backdrop-blur-xl p-6 space-y-4">
                  {!bulkMode && (
                    <label className="flex items-center gap-3 text-xs cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={includeMissing}
                        onChange={e=>setIncludeMissing(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-500 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                      />
                      <span className="text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t('auto_create_null_rows')}</span>
                    </label>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      disabled={saving || (bulkMode ? Object.keys(bulkData).length === 0 : rows.length === 0)}
                      onClick={bulkMode ? submitBulkResults : submitResults}
                      className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white hover:shadow-lg hover:scale-105 active:scale-95 disabled:hover:shadow-none disabled:hover:scale-100 ${showSuccessAnimation ? 'success-pulse' : ''}`}
                    >
                      <Save className="w-4 h-4"/>
                      <span>{saving ? (bulkMode ? 'Saving bulk results...' : t('saving')+'...') : (bulkMode ? 'Save Bulk Results' : t('save_results'))}</span>
                    </button>
                    <button
                      onClick={()=>setOpen(false)}
                      disabled={saving}
                      className="px-6 py-3 rounded-lg text-sm font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>



    </div>
  );
}