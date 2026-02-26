"use client";
import React, { useEffect, useState, Fragment, useMemo, useOptimistic, useTransition } from 'react';
import { Dialog, Transition, Listbox, Tab } from '@headlessui/react';
import { X, ChevronsUpDown, Check, Loader2, Save, Table, RefreshCw, Edit3 } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';

const API_BASE = '/api';
const API_MISSING = `${API_BASE}/class_results/missing`;
const API_SUBMIT = `${API_BASE}/class_results/submit`;

interface Option { id:number; name:string; }
interface StudentRow { student_id:number; first_name:string; last_name:string; score:number|null; grade:string|null; remarks:string|null; }

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

export default function ClassResultsManager() {
  const { t } = useTranslation('common');
  const [isPending, startTransition] = useTransition();
  
  const [open,setOpen]=useState(false);
  const [terms,setTerms]=useState<Option[]>([]);
  const [classes,setClasses]=useState<Option[]>([]);
  const [subjects,setSubjects]=useState<Option[]>([]);
  const [types,setTypes]=useState<Option[]>([]);
  const [term,setTerm]=useState<Option|null>(null);
  const [klass,setKlass]=useState<Option|null>(null);
  const [subject,setSubject]=useState<Option|null>(null);
  const [rtype,setRtype]=useState<Option|null>(null);
  const [loading,setLoading]=useState(false);
  const [rows,setRows]=useState<StudentRow[]>([]);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState<string>('');
  const [includeMissing,setIncludeMissing]=useState(true);
  const [list,setList]=useState<any[]>([]);
  const [listLoading,setListLoading]=useState(false);
  const [listPage,setListPage]=useState(1);
  const [listTotal,setListTotal]=useState(0);
  const perPage=25;
  const [filters, setFilters] = useState({ search: '', class_id: '', result_type_id: '', subject_id: '', term_id: '' });

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
      const [te, cl, su, rt] = await Promise.all([
        fetch(`${API_BASE}/terms`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch terms: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/classes`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch classes: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/subjects`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch subjects: ${r.status}`);
          return r.json();
        }),
        fetch(`${API_BASE}/result_types`).then(r => {
          if (!r.ok) throw new Error(`Failed to fetch result types: ${r.status}`);
          return r.json();
        })
      ]);
      setTerms(te.data || []);
      setClasses(cl.data || []);
      setSubjects(su.data || []);
      setTypes(rt.data || []);
    } catch (error) {
      console.error('Error loading metadata:', error);
      setMessage('Failed to load form data');
    }
  };

  useEffect(() => { loadMeta(); }, []);

  // Load results list whenever filters change
  useEffect(() => {
    const { search, ...apiFilters } = filters;
    const qs = new URLSearchParams({
      class_id: apiFilters.class_id,
      subject_id: apiFilters.subject_id,
      result_type_id: apiFilters.result_type_id,
      term_id: apiFilters.term_id
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
          let filteredResults = d.data || [];
          // Apply client-side search filter
          if (search) {
            const searchLower = search.toLowerCase();
            filteredResults = filteredResults.filter((result: any) =>
              `${result.first_name} ${result.last_name}`.toLowerCase().includes(searchLower)
            );
          }
          setList(filteredResults);
          setListTotal(filteredResults.length);
        }
      })
      .catch(e => {
        console.error('Error loading results:', e);
        setMessage(e.message || 'Failed to load results');
      })
      .finally(() => setListLoading(false));
  }, [filters.class_id, filters.subject_id, filters.result_type_id, filters.term_id, filters.search]);

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
          // Update actual state
          setList(prev => prev.map(result =>
            result.id === resultId ? { ...result, ...data.updatedResult } : result
          ));
        } else {
          toast.dismiss(savingToast);
          toast.error(data.error || 'Failed to update score');
          // Revert optimistic update
          const { search, ...apiFilters } = filters;
          const qs = new URLSearchParams(apiFilters);
          fetch(`${API_BASE}/class-results/list?${qs.toString()}`)
            .then(r => {
              if (!r.ok) throw new Error(`Server error: ${r.status}`);
              return r.json();
            })
            .then(d => setList(d.data || []));
        }
      } catch (error) {
        toast.dismiss(savingToast);
        toast.error('Network error - please try again');
        console.error('Error updating score:', error);
      }
    });
  };

  const handleOpenModal = () => {
    setOpen(true);
    setKlass(classes.find(c => String(c.id) === String(filters.class_id)) || null);
    setSubject(subjects.find(s => String(s.id) === String(filters.subject_id)) || null);
    setRtype(types.find(rt => String(rt.id) === String(filters.result_type_id)) || null);
    setTerm(terms.find(t => String(t.id) === String(filters.term_id)) || null);
    setRows([]);
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
      include_missing: includeMissing,
      entries: rows.filter(r => r.score !== null || (r.grade && r.grade !== '') || (r.remarks && r.remarks !== '')).map(r => ({ student_id: r.student_id, score: r.score, grade: r.grade, remarks: r.remarks }))
    };
    try {
      const res = await fetch(API_SUBMIT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      if (data.error) {
        setMessage(data.error);
        toast.error(data.error);
      } else {
        setMessage('Saved');
        toast.success('Results submitted successfully!');
        // Refresh list
        const { search, ...apiFilters } = filters;
        const qs = new URLSearchParams(apiFilters);
        fetch(`${API_BASE}/class-results/list?${qs.toString()}`)
          .then(r => {
            if (!r.ok) throw new Error(`Server error: ${r.status}`);
            return r.json();
          })
          .then(d => setList(d.data || []))
          .catch(err => {
            console.error('Error refreshing list:', err);
            setMessage(err.message || 'Failed to refresh list');
          });
        setOpen(false);
      }
    } catch (e: any) {
      setMessage(e.message || 'Failed to submit results');
      toast.error(e.message || 'Failed to submit results');
      console.error('Error submitting results:', e);
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
        const scoresArr = subjectColumns.map(s => {
          const result = row.scores[s.id];
          return result ? parseFloat(result.score) : null;
        }).filter((v): v is number => typeof v === 'number' && !isNaN(v) && v !== null);

        const total = scoresArr.reduce((a, b) => a + b, 0);
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

  // Filter marklist for search and filters (but keep position from full class)
  const filteredMarklist = React.useMemo(() => {
    let rows = marklist;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(row => row.name.toLowerCase().includes(q));
    }
    if (filters.class_id) {
      const className = classes.find(c => String(c.id) === String(filters.class_id))?.name;
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
  const exportToExcel = (scope: 'learner' | 'class' | 'school', data: any[]) => {
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
    <div className="mt-8 space-y-10">
      {/* Filters above the table */}
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
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filters.subject_id}
          onChange={e => setFilters(f => ({ ...f, subject_id: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">{t('all_subjects')}</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={filters.result_type_id}
          onChange={e => setFilters(f => ({ ...f, result_type_id: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">{t('all_types')}</option>
          {types.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
        </select>
        <select
          value={filters.term_id}
          onChange={e => setFilters(f => ({ ...f, term_id: e.target.value }))}
          className="px-3 py-1.5 border rounded-md text-sm"
        >
          <option value="">{t('all_terms')}</option>
          {terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
        </select>
        <button
          onClick={handleOpenModal}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white"
        >
          {t('add_edit_results')}
        </button>
        
        {/* Export buttons moved here for better positioning */}
        <div className="flex gap-2 ml-4">
          <button
            onClick={() => exportToPDF('learner', filteredMarklist)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-red-500 to-pink-500 text-white hover:from-red-600 hover:to-pink-600 transition-all"
          >
            PDF
          </button>
          <button
            onClick={() => exportToExcel('learner', filteredMarklist)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 transition-all"
          >
            Excel
          </button>
          <button
            onClick={() => exportToCSV(filteredMarklist)}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 transition-all"
          >
            CSV
          </button>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">{t('existing_results')}</h2>
          <button onClick={() => setFilters({ ...filters })} className="px-3 py-1.5 rounded-md text-xs font-medium bg-black/5 dark:bg-white/10 flex items-center gap-1"><RefreshCw className="w-3 h-3"/>{t('refresh')}</button>
        </div>
        <div className="overflow-auto rounded-xl border border-white/30 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-slate-100/60 dark:bg-slate-800/60">
              <tr>
                <th className="text-left px-3 py-2">{t('student')}</th>
                <th className="text-left px-3 py-2">{t('class')}</th>
                {subjectColumns.map(s => (
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
                  {subjectColumns.map(s => (
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
                <div className="relative p-6 border-b border-white/30 dark:border-white/10 flex items-center gap-4">
                  <h2 className="text-sm font-semibold tracking-wide uppercase">{t('class_results_entry')}</h2>
                  {message && <span className={`text-xs font-medium ml-auto ${message==='Saved'?'text-green-600':'text-red-600'}`}>{message}</span>}
                  <button onClick={()=>setOpen(false)} className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 ml-auto"><X className="w-5 h-5"/></button>
                </div>
                <div className="relative p-6 space-y-6">
                  <div className="grid md:grid-cols-5 gap-5">
                    <SelectBox label={t('term')} value={term ?? null} onChange={setTerm} items={terms} placeholder={t('optional')} />
                    <SelectBox label={t('class')} value={klass ?? null} onChange={v=>{setKlass(v);}} items={classes} />
                    <SelectBox label={t('subject')} value={subject ?? null} onChange={setSubject} items={subjects.filter(s=>!klass || s)} />
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



      {/* Add helpful hints for users */}
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

      <div id="report-area" className="hidden">
        {/* Core report area to be exported */}
        {/* ...existing report rendering code... */}
      </div>
    </div>
  );
}