'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Printer, Search, RefreshCw, Users, X, ChevronDown,
  FileText, AlertCircle,
} from 'lucide-react';
import NorthgateReport from '@/components/reports/NorthgateReport';
import NorthgateClassicTemplate from '@/components/reports/NorthgateClassicTemplate';
import type { NorthgateReportData } from '@/components/reports/types';

// ============================================================================
// /reports/northgate  — Northgate School Report Card Generator
// ============================================================================

interface Student {
  id: number;
  admission_no: string;
  full_name: string;
  photo_url: string | null;
  class_name: string;
  stream_name: string;
  class_id: number | null;
  term_id: number | null;
}

interface ClassOption { id: number; name: string; }
interface TermOption  { id: number; name: string; academic_year: string; }

export default function NorthgateReportPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const isClassic    = searchParams.get('template') === 'classic';

  // ── Filter state ──────────────────────────────────────────────────────────
  const [classes,  setClasses]  = useState<ClassOption[]>([]);
  const [terms,    setTerms]    = useState<TermOption[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [selectedTermId,  setSelectedTermId]  = useState<number | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [listError,   setListError]   = useState<string | null>(null);

  // ── Report state ──────────────────────────────────────────────────────────
  const [reportData,     setReportData]     = useState<NorthgateReportData | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [loadingReport,  setLoadingReport]  = useState(false);
  const [reportError,    setReportError]    = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // ── Fetch students list ───────────────────────────────────────────────────
  const fetchStudents = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (selectedClassId) params.set('class_id', String(selectedClassId));
      if (selectedTermId)  params.set('term_id',  String(selectedTermId));
      if (searchQuery)     params.set('query',    searchQuery);

      const res  = await fetch(`/api/reports/northgate/students?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');

      setStudents(data.students);
      if (!classes.length && data.classes?.length) setClasses(data.classes);
      if (!terms.length   && data.terms?.length)   setTerms(data.terms);
    } catch (err: any) {
      setListError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, [selectedClassId, selectedTermId, searchQuery, classes.length, terms.length]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // ── Generate report for a student ────────────────────────────────────────
  const generateReport = async (student: Student) => {
    setSelectedStudent(student);
    setReportData(null);
    setReportError(null);
    setLoadingReport(true);

    try {
      const params = new URLSearchParams({ student_id: String(student.id) });
      if (selectedTermId)            params.set('term_id',  String(selectedTermId));
      if (student.class_id)          params.set('class_id', String(student.class_id));
      else if (selectedClassId)      params.set('class_id', String(selectedClassId));

      const res  = await fetch(`/api/reports/northgate/generate?${params}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Generation failed');
      setReportData(body.data);
    } catch (err: any) {
      setReportError(err.message);
    } finally {
      setLoadingReport(false);
    }
  };

  // ── Print handler ─────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Dismiss report panel ─────────────────────────────────────────────────
  const closeReport = () => {
    setSelectedStudent(null);
    setReportData(null);
    setReportError(null);
  };

  return (
    <>
      {/* ── Print styles: hide everything except the report ── */}
      <style>{`
        @media print {
          .ng-no-print { display: none !important; }
          .ng-print-area { position: fixed; inset: 0; background: white; z-index: 9999; overflow: visible; }
        }
      `}</style>

      {/* ══════════════════════ HEADER (hidden on print) ══════════════════════ */}
      <div className="ng-no-print min-h-screen bg-gray-50">
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/reports/kitchen')}
                className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm"
              >
                <ArrowLeft size={16} /> Back to Kitchen
              </button>
              <div className="h-4 w-px bg-gray-300" />
              <FileText size={20} className="text-blue-700" />
              <div>
                <h1 className="text-base font-bold text-gray-800 leading-tight">
                  Northgate Report Cards
                  {isClassic && (
                    <span className="ml-2 text-xs font-normal bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Classic (rpt.html)</span>
                  )}
                </h1>
                <p className="text-xs text-gray-500">Select a student → click Generate → Print</p>
              </div>
            </div>
            {selectedStudent && reportData && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-blue-700 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-800"
              >
                <Printer size={15} /> Print {selectedStudent.full_name.split(' ')[0]}'s Report
              </button>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* ── Filters ── */}
          <div className="bg-white rounded-lg border shadow-sm p-4 mb-6">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Class filter */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Class</label>
                <div className="relative">
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value ? Number(e.target.value) : '')}
                    className="border rounded px-3 py-1.5 text-sm pr-7 appearance-none w-44"
                  >
                    <option value="">All classes</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Term filter */}
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Term</label>
                <div className="relative">
                  <select
                    value={selectedTermId}
                    onChange={e => setSelectedTermId(e.target.value ? Number(e.target.value) : '')}
                    className="border rounded px-3 py-1.5 text-sm pr-7 appearance-none w-52"
                  >
                    <option value="">Latest results</option>
                    {terms.map(t => (
                      <option key={t.id} value={t.id}>{t.name} — {t.academic_year}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Search */}
              <div className="flex-1 min-w-48">
                <label className="block text-xs text-gray-500 mb-1 font-medium">Search</label>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Name or admission no..."
                    className="border rounded pl-8 pr-3 py-1.5 text-sm w-full"
                  />
                </div>
              </div>

              <button
                onClick={fetchStudents}
                className="flex items-center gap-1.5 border rounded px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-600"
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
          </div>

          {/* ── Student list ── */}
          {listError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700">
              <AlertCircle size={18} /> {listError}
            </div>
          ) : loadingList ? (
            <div className="text-center py-16 text-gray-400">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Loading students...
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users size={32} className="mx-auto mb-3 opacity-40" />
              <p>No students found. Try adjusting the filters.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Users size={15} /> {students.length} student{students.length !== 1 ? 's' : ''}
                </span>
                {selectedStudent && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    Generating for: <strong>{selectedStudent.full_name}</strong>
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2 font-semibold">Student</th>
                    <th className="text-left px-4 py-2 font-semibold">Adm No</th>
                    <th className="text-left px-4 py-2 font-semibold">Class</th>
                    <th className="text-left px-4 py-2 font-semibold">Stream</th>
                    <th className="text-right px-4 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => {
                    const isActive = selectedStudent?.id === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={`border-b last:border-0 transition-colors ${
                          isActive ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                        }`}
                      >
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {s.photo_url ? (
                              <img src={s.photo_url} alt="" className="w-7 h-7 rounded-full object-cover border" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                {s.full_name.charAt(0)}
                              </div>
                            )}
                            <span className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                              {s.full_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">{s.admission_no}</td>
                        <td className="px-4 py-2 text-gray-600">{s.class_name || '–'}</td>
                        <td className="px-4 py-2 text-gray-600">{s.stream_name || '–'}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => generateReport(s)}
                            disabled={loadingReport && isActive}
                            className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                              isActive
                                ? 'bg-blue-700 text-white'
                                : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'
                            }`}
                          >
                            {loadingReport && isActive ? 'Generating…' : 'Generate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════ REPORT PANEL (scrollable, printable) ══════════════ */}
      {selectedStudent && (
        <div className="ng-print-area fixed inset-0 bg-black/60 z-50 overflow-y-auto ng-no-print" style={{ zIndex: 9000 }}>
          {/* Close + print controls (hidden on print) */}
          <div className="ng-no-print sticky top-0 bg-white border-b shadow flex items-center justify-between px-6 py-3 z-10" style={{ display: 'flex' }}>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-800">
                {selectedStudent.full_name} — Report Card
              </span>
              {reportData && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Ready</span>
              )}
              {loadingReport && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <RefreshCw size={12} className="animate-spin" /> Generating…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {reportData && (
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-blue-800"
                >
                  <Printer size={14} /> Print Report
                </button>
              )}
              <button
                onClick={closeReport}
                className="text-gray-500 hover:text-gray-800 border rounded px-3 py-1.5 text-sm flex items-center gap-1"
              >
                <X size={14} /> Close
              </button>
            </div>
          </div>

          {/* Report content */}
          <div className="py-8 flex justify-center">
            <div ref={reportRef}>
              {reportError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-center gap-3 text-red-700 max-w-lg">
                  <AlertCircle size={20} />
                  <div>
                    <p className="font-semibold">Failed to generate report</p>
                    <p className="text-sm mt-1">{reportError}</p>
                  </div>
                </div>
              ) : isClassic ? (
                <NorthgateClassicTemplate data={reportData ?? undefined} />
              ) : (
                <NorthgateReport data={reportData ?? undefined} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
