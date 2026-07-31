'use client';

import React, { Fragment, useState, useMemo, useTransition, useOptimistic } from 'react';
import useSWR, { mutate } from 'swr';
import { toast } from 'react-hot-toast';
import { Dialog, Transition, Listbox } from '@headlessui/react';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Loader2, Plus, Edit2, Save, X, RefreshCw, FileDown, Upload, Edit3 } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

// Helper function for translations with fallback
const useTranslation = () => {
  const { t: i18nT } = useI18n();
  const t = (key: string, fallback?: string) => {
    try {
      const result = i18nT(key);
      return result === key && fallback ? fallback : result;
    } catch {
      return fallback || key;
    }
  };
  return { t };
};

// SelectBox component (reused from ClassResultsManager)
function SelectBox({ label, value, onChange, items, placeholder = '— Select —' }: any) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{label}</label>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <Listbox.Button className="relative w-full cursor-pointer rounded-xl bg-white/60 dark:bg-slate-800/50 backdrop-blur-md px-4 py-2.5 text-left border border-white/40 dark:border-white/10 shadow-sm hover:shadow-md transition-all text-xs font-medium">
            <span className="block truncate">{value?.name ?? placeholder}</span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </span>
          </Listbox.Button>
          <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-xl text-xs">
              {items.map((item: any) => (
                <Listbox.Option
                  key={item.id}
                  value={item}
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2.5 px-4 ${active ? 'bg-indigo-600 text-white' : 'text-slate-900 dark:text-slate-100'}`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>{item.name}</span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-1">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

// Main TahfizResultsManager component
export default function TahfizResultsManager() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ search: '', class_id: '', subject_id: '', result_type_id: '', term_id: '' });
  const [klass, setKlass] = useState<any>(null);
  const [term, setTerm] = useState<any>(null);
  const [subject, setSubject] = useState<any>(null);
  const [rtype, setRtype] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [includeMissing, setIncludeMissing] = useState(true);
  const [listPage, setListPage] = useState(1);
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const perPage = 100;

  // Optimistic updates
  const [isPending, startTransition] = useTransition();
  
  // Fetch tahfiz classes (WHERE name='tahfiz' or class_type='tahfiz')
  const { data: classesData } = useSWR('/api/classes?type=tahfiz', (url) => fetch(url).then(r => r.json()));
  const classes = useMemo(() => classesData?.data ?? [], [classesData]);

  // Fetch tahfiz subjects (WHERE subject_type='tahfiz')
  const { data: subjectsData } = useSWR('/api/subjects?type=tahfiz', (url) => fetch(url).then(r => r.json()));
  const subjects = useMemo(() => subjectsData?.data ?? [], [subjectsData]);

  // Fetch result types
  const { data: typesData } = useSWR('/api/result_types', (url) => fetch(url).then(r => r.json()));
  const types = useMemo(() => typesData?.data ?? [], [typesData]);

  // Fetch terms
  const { data: termsData } = useSWR('/api/terms', (url) => fetch(url).then(r => r.json()));
  const terms = useMemo(() => termsData?.data ?? [], [termsData]);

  // Build list URL with filters
  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.class_id) params.append('class_id', filters.class_id);
    if (filters.subject_id) params.append('subject_id', filters.subject_id);
    if (filters.result_type_id) params.append('result_type_id', filters.result_type_id);
    if (filters.term_id) params.append('term_id', filters.term_id);
    params.append('subject_type', 'tahfiz'); // FILTER FOR TAHFIZ ONLY
    params.append('page', String(listPage));
    params.append('per_page', String(perPage));
    return `/api/class_results/list?${params.toString()}`;
  }, [filters, listPage]);

  // Fetch list of tahfiz results
  const { data: listData, isLoading: listLoading } = useSWR(listUrl, (url) => fetch(url).then(r => r.json()));
  const listResults = useMemo(() => listData?.data ?? [], [listData]);
  const listTotal = useMemo(() => listData?.total ?? 0, [listData]);

  // Optimistic list state
  const [optimisticList, updateOptimisticList] = useOptimistic(listResults, (state, { id, field, value }: any) => {
    return state.map((item: any) => (item.id === id ? { ...item, [field]: value } : item));
  });

  // Subject columns for marklist display
  const subjectColumns = useMemo(() => {
    if (!filters.subject_id) return subjects; // Show all tahfiz subjects if no filter
    return subjects.filter((s: any) => String(s.id) === String(filters.subject_id));
  }, [subjects, filters.subject_id]);

  // Build marklist (similar to academics)
  const marklist = useMemo(() => {
    const classGroups: Record<string, any[]> = {};
    optimisticList.forEach((r: any) => {
      let student = classGroups[r.class_name]?.find((s: any) => s.student_id === r.student_id);
      if (!student) {
        if (!classGroups[r.class_name]) classGroups[r.class_name] = [];
        student = {
          student_id: r.student_id,
          admission_no: r.admission_no,
          name: `${r.last_name}, ${r.first_name}`,
          class_name: r.class_name,
          scores: {},
          allScores: [],
        };
        classGroups[r.class_name].push(student);
      }
      student.scores[r.subject_id] = r;
      const scoreNum = typeof r.score === 'number' ? r.score : (r.score !== null && r.score !== undefined && r.score !== '' ? parseFloat(r.score) : null);
      if (!isNaN(scoreNum) && scoreNum !== null) student.allScores.push(scoreNum);
    });
    
    let allRows: any[] = [];
    Object.values(classGroups).forEach((students: any[]) => {
      students.forEach(row => {
        const scoresArr = subjectColumns.map((s: any) => {
          const result = row.scores[s.id];
          return result ? parseFloat(result.score) : null;
        }).filter((v: any) => !isNaN(v) && v !== null);
        
        const total = scoresArr.reduce((a: number, b: number) => a + b, 0);
        const min = scoresArr.length ? Math.min(...scoresArr) : null;
        const max = scoresArr.length ? Math.max(...scoresArr) : null;
        const avg = scoresArr.length ? (total / scoresArr.length) : null;
        row.total = Math.round(total * 100) / 100;
        row.min = min;
        row.max = max;
        row.avg = avg;
      });
      
      // Sort by total descending for position within class
      students.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
      students.forEach((row, i) => { 
        row.position = i + 1; 
        row.totalInClass = students.length;
      });
      allRows = allRows.concat(students);
    });
    return allRows;
  }, [optimisticList, subjectColumns]);

  // Filter marklist for search
  const filteredMarklist = useMemo(() => {
    let rows = marklist;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(row => row.name.toLowerCase().includes(q));
    }
    if (filters.class_id) {
      const className = classes.find((c: any) => String(c.id) === String(filters.class_id))?.name;
      if (className) rows = rows.filter(row => String(row.class_name) === String(className));
    }
    return rows;
  }, [marklist, filters, classes]);

  const sortedLearners = useMemo(() => {
    return [...rows].sort((a, b) => {
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [rows]);

  // Fetch missing students for bulk entry
  const handleFetchMissingRows = async () => {
    if (!klass || !subject || !rtype) return;
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({
        class_id: klass.id,
        subject_id: subject.id,
        result_type_id: rtype.id,
        subject_type: 'tahfiz' // FILTER TAHFIZ ONLY
      });
      if (term) params.append('term_id', term.id);

      const res = await fetch(`/api/class_results/missing?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch students');

      const students = json.data ?? [];
      
      // Deduplicate by student_id (important!)
      const seen = new Map();
      students.forEach((s: any) => {
        if (!seen.has(s.student_id)) {
          seen.set(s.student_id, {
            student_id: s.student_id,
            admission_no: s.admission_no,
            first_name: s.first_name,
            last_name: s.last_name,
            score: null,
            grade: null,
            remarks: '',
          });
        }
      });

      setRows(Array.from(seen.values()));
      if (seen.size === 0) {
        toast.success('All students already have results for this combination');
      } else {
        toast.success(`Loaded ${seen.size} student(s) without results`);
      }
    } catch (err: any) {
      console.error(err);
      setMessage(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update row in modal
  const updateRow = (student_id: number, field: string, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.student_id !== student_id) return r;
      const updated = { ...r, [field]: value };
      // Auto-calculate grade when score changes
      if (field === 'score' && value !== null && value !== '') {
        const score = parseFloat(value);
        if (!isNaN(score)) {
          if (score >= 90) updated.grade = 'A+';
          else if (score >= 80) updated.grade = 'A';
          else if (score >= 70) updated.grade = 'B';
          else if (score >= 60) updated.grade = 'C';
          else if (score >= 50) updated.grade = 'D';
          else updated.grade = 'F';
        } else {
          updated.grade = null;
        }
      }
      return updated;
    }));
  };

  // Submit bulk results
  const submitResults = async () => {
    if (!klass || !subject || !rtype) return;
    setSaving(true);
    setMessage('');
    try {
      const entries = rows
        .filter(r => includeMissing || (r.score !== null && r.score !== ''))
        .map(r => ({
          student_id: r.student_id,
          score: r.score !== null && r.score !== '' ? parseFloat(r.score) : null,
          grade: r.grade,
          remarks: r.remarks || ''
        }));

      const payload = {
        class_id: klass.id,
        subject_id: subject.id,
        result_type_id: rtype.id,
        term_id: term?.id || null,
        entries
      };

      const res = await fetch('/api/class_results/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save results');

      setMessage('Saved');
      toast.success(`Successfully saved ${json.success} result(s)`);
      
      // Refresh the list
      mutate(listUrl);
      
      // Reset form
      setRows([]);
      setKlass(null);
      setSubject(null);
      setRtype(null);
      setTerm(null);
      
      setTimeout(() => setOpen(false), 1000);
    } catch (err: any) {
      console.error(err);
      setMessage(err.message);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Inline edit (optimistic update)
  const updateScore = async (id: number, field: string, value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    if (value !== '' && numValue !== null && isNaN(numValue)) {
      toast.error('Invalid number');
      return;
    }

    // Calculate grade automatically
    let grade = null;
    if (field === 'score' && numValue !== null) {
      if (numValue >= 90) grade = 'A+';
      else if (numValue >= 80) grade = 'A';
      else if (numValue >= 70) grade = 'B';
      else if (numValue >= 60) grade = 'C';
      else if (numValue >= 50) grade = 'D';
      else grade = 'F';
    }

    // Optimistic update
    startTransition(() => {
      updateOptimisticList({ id, field, value: numValue });
      if (grade) updateOptimisticList({ id, field: 'grade', value: grade });
    });

    try {
      const payload: any = { [field]: numValue };
      if (grade) payload.grade = grade;

      const res = await fetch(`/api/class-results/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Update failed');
      }
      toast.success('Updated successfully');
      mutate(listUrl);
    } catch (err: any) {
      toast.error(err.message);
      mutate(listUrl); // Revert optimistic update
    }
  };

  const handleOpenModal = () => {
    setOpen(true);
    setRows([]);
    setMessage('');
  };

  // Cell edit handlers
  const handleCellEdit = (result: any, field: string) => {
    setEditingCell({ id: result.id, field });
    setEditValue(String(result[field] || ''));
  };

  const handleCellSave = () => {
    if (editingCell) {
      updateScore(editingCell.id, editingCell.field, editValue);
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Render editable cell
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

  return (
    <div className="mt-8 space-y-10">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input
          type="text"
          placeholder={t('search')}
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        />
        <select
          value={filters.class_id}
          onChange={e => setFilters(f => ({ ...f, class_id: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">{t('all_classes')}</option>
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filters.subject_id}
          onChange={e => setFilters(f => ({ ...f, subject_id: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">{t('all_subjects')}</option>
          {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={filters.result_type_id}
          onChange={e => setFilters(f => ({ ...f, result_type_id: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">{t('all_types')}</option>
          {types.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
        <select
          value={filters.term_id}
          onChange={e => setFilters(f => ({ ...f, term_id: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">{t('all_terms')}</option>
          {terms.map((term: any) => <option key={term.id} value={term.id}>{term.name}</option>)}
        </select>
        <button
          onClick={handleOpenModal}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white"
        >
          {t('add_edit_results')}
        </button>
      </div>
      
      {/* Results Table */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">{t('tahfiz_results', 'Tahfiz Results')}</h2>
          <button onClick={() => mutate(listUrl)} className="px-3 py-1.5 rounded-md text-xs font-medium bg-black/5 dark:bg-white/10 flex items-center gap-1">
            <RefreshCw className="w-3 h-3"/>{t('refresh')}
          </button>
        </div>
        <div className="overflow-auto rounded-xl border border-white/30 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-slate-100/60 dark:bg-slate-800/60">
              <tr>
                <th className="text-left px-3 py-2">{t('student')}</th>
                <th className="text-left px-3 py-2">{t('class')}</th>
                {subjectColumns.map((s: any) => (
                  <th key={s.id} className="text-left px-3 py-2 relative">
                    {s.name}
                    {isPending && filteredMarklist.some(row => {
                      const result = row.scores[s.id];
                      return result && editingCell?.id === result.id && editingCell?.field === 'score';
                    }) && (
                      <div className="absolute top-1 right-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      </div>
                    )}
                  </th>
                ))}
                <th className="text-left px-3 py-2">{t('total')}</th>
                <th className="text-left px-3 py-2">{t('min')}</th>
                <th className="text-left px-3 py-2">{t('max')}</th>
                <th className="text-left px-3 py-2">{t('avg')}</th>
                <th className="text-left px-3 py-2">{t('position')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredMarklist.map(row => (
                <tr key={row.student_id} className="odd:bg-white/50 dark:odd:bg-slate-800/40">
                  <td className="px-3 py-1.5 font-medium">{row.name}</td>
                  <td className="px-3 py-1.5">{row.class_name || '-'}</td>
                  {subjectColumns.map((s: any) => (
                    <td key={s.id} className="px-3 py-1.5">
                      {row.scores[s.id] ? renderEditableCell(row.scores[s.id]) : '-'}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 font-semibold">{row.total ?? '-'}</td>
                  <td className="px-3 py-1.5">{row.min ?? '-'}</td>
                  <td className="px-3 py-1.5">{row.max ?? '-'}</td>
                  <td className="px-3 py-1.5">{row.avg !== null && row.avg !== undefined ? row.avg.toFixed(2) : '-'}</td>
                  <td className="px-3 py-1.5 font-bold text-blue-600">{row.position}/{row.totalInClass}</td>
                </tr>
              ))}
              {!listLoading && filteredMarklist.length===0 && <tr><td colSpan={subjectColumns.length+8} className="px-4 py-8 text-center text-slate-500">{t('no_results_found')}</td></tr>}
            </tbody>
          </table>
          {listLoading && <div className="flex items-center gap-2 px-4 py-3 text-xs"><Loader2 className="w-4 h-4 animate-spin"/>{t('loading')}...</div>}
        </div>
        {listTotal>perPage && <div className="flex items-center gap-3 text-xs pt-2"><button disabled={listPage===1} onClick={()=>setListPage(p=>p-1)} className="px-3 py-1 rounded bg-black/5 dark:bg-white/10 disabled:opacity-30">{t('prev')}</button><span>{t('page')} {listPage} {t('of')} {Math.ceil(listTotal/perPage)}</span><button disabled={listPage>=Math.ceil(listTotal/perPage)} onClick={()=>setListPage(p=>p+1)} className="px-3 py-1 rounded bg-black/5 dark:bg-white/10 disabled:opacity-30">{t('next')}</button></div>}
      </div>

      {/* Bulk Entry Modal */}
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
                <div className="relative p-6 border-b border-white/30 dark:border-white/10 flex items-center gap-4">
                  <h2 className="text-sm font-semibold tracking-wide uppercase">{t('tahfiz_results_entry', 'Tahfiz Results Entry')}</h2>
                  {message && <span className={`text-xs font-medium ml-auto ${message==='Saved'?'text-green-600':'text-red-600'}`}>{message}</span>}
                  <button onClick={()=>setOpen(false)} className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 ml-auto"><X className="w-5 h-5"/></button>
                </div>
                <div className="relative p-6 space-y-6">
                  <div className="grid md:grid-cols-5 gap-5">
                    <SelectBox label={t('term')} value={term ?? null} onChange={setTerm} items={terms} placeholder={t('optional')} />
                    <SelectBox label={t('class')} value={klass ?? null} onChange={(v: any)=>{setKlass(v);}} items={classes} />
                    <SelectBox label={t('subject')} value={subject ?? null} onChange={setSubject} items={subjects} />
                    <SelectBox label={t('result_type')} value={rtype ?? null} onChange={setRtype} items={types} />
                    <div className="flex flex-col justify-end">
                      <button
                        disabled={!klass||!subject||!rtype||loading}
                        onClick={handleFetchMissingRows}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white disabled:opacity-40"
                      >
                        {t('load')}
                      </button>
                    </div>
                  </div>
                  {rows.length>0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {t('student_results', 'Student Results')} ({rows.length} {t('students', 'students')})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto rounded-xl border border-white/30 dark:border-white/10 p-4 bg-white/20 dark:bg-slate-800/20 backdrop-blur">
                        {sortedLearners.map(r=> (
                          <div key={r.student_id} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur rounded-xl p-4 border border-white/40 dark:border-white/10 space-y-3">
                            <div className="text-center">
                              <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 mb-3" title={`${r.first_name} ${r.last_name}`}>
                                {r.first_name} {r.last_name}
                              </h4>
                              <input 
                                type="number" 
                                step="0.01" 
                                className="w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-white/40 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-center font-medium" 
                                value={r.score ?? ''} 
                                onChange={e=>updateRow(r.student_id,'score', e.target.value===''? null : parseFloat(e.target.value))}
                                placeholder="Score"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeMissing} onChange={e=>setIncludeMissing(e.target.checked)} /> <span>{t('auto_create_null_rows')}</span></label>
                    <div className="flex gap-2">
                      <button disabled={saving || rows.length===0} onClick={submitResults} className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white disabled:opacity-40"><Save className="w-4 h-4"/>{saving? t('saving')+'...':t('save_results')}</button>
                    </div>
                  </div>
                  {loading && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin"/>{t('loading_students')}...</div>}
                </div>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Edit hints */}
      <div className="text-xs text-gray-500 flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Edit3 className="w-3 h-3" />
          <span>Click any score to edit</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-green-600">●</span>
          <span>Press Enter to save</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-600">●</span>
          <span>Press Escape to cancel</span>
        </div>
      </div>
    </div>
  );
}
