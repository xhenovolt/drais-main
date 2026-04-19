"use client";
import React, { Fragment, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Tab, Dialog, Transition } from '@headlessui/react';
import { Plus, Pencil, Trash2, X, BookOpen, GraduationCap, Users, User } from 'lucide-react';
import { confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const API_BASE = '/api';

interface Curriculum { id: number; code: string; name: string; }
interface Program { id: number; name: string; description?: string; }
interface Teacher { id: number; first_name: string; last_name: string; position?: string | null; }

interface ClassRec {
  id: number;
  name: string;
  class_level: number | null;
  head_teacher_id: number | null;
  teacher_name: string | null;
  curriculum_id: number | null;
  curriculum_name: string | null;
  curriculum_code: string | null;
  program_id: number | null;
  program_name: string | null;
}

const fieldBase =
  "w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-800/70 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-400 text-sm placeholder-gray-400 dark:placeholder-gray-500";

function ModalShell({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-lg">
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 -translate-y-4 scale-95" enterTo="opacity-100 translate-y-0 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 translate-y-0 scale-100" leaveTo="opacity-0 -translate-y-4 scale-95">
              <Dialog.Panel className="rounded-2xl border border-white/20 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Dialog.Title className="text-base font-semibold text-slate-800 dark:text-white">{title}</Dialog.Title>
                  <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-6">{children}</div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

function CurriculumModal({ open, onClose, onSave, edit }: { open: boolean; onClose: () => void; onSave: (v: Partial<Curriculum>) => void; edit?: Curriculum }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  useEffect(() => { setCode(edit?.code ?? ''); setName(edit?.name ?? ''); }, [edit, open]);
  return (
    <ModalShell open={open} onClose={onClose} title={edit ? 'Edit Curriculum' : 'New Curriculum'}>
      <form onSubmit={e => { e.preventDefault(); onSave({ code, name }); }} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">Code</label>
          <input required value={code} onChange={e => setCode(e.target.value)} className={fieldBase} placeholder="e.g. SEC" />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">Name</label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldBase} placeholder="e.g. Secular Curriculum" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">Cancel</button>
          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:brightness-110">{edit ? 'Save Changes' : 'Create'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function ProgramModal({ open, onClose, onSave, edit }: { open: boolean; onClose: () => void; onSave: (v: Partial<Program>) => void; edit?: Program }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => { setName(edit?.name ?? ''); setDesc(edit?.description ?? ''); }, [edit, open]);
  return (
    <ModalShell open={open} onClose={onClose} title={edit ? 'Edit Program' : 'New Program'}>
      <form onSubmit={e => { e.preventDefault(); onSave({ name, description: desc || undefined }); }} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">Program Name <span className="text-red-500">*</span></label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldBase} placeholder="e.g. Theology, Secular, Tahfiz" />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">Description (optional)</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} className={fieldBase} rows={2} placeholder="Short description…" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">Cancel</button>
          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:brightness-110">{edit ? 'Save Changes' : 'Create'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function ClassModal({ open, onClose, onSave, edit, curriculums, programs, teachers }: {
  open: boolean; onClose: () => void;
  onSave: (v: Partial<ClassRec & { program_id?: number | null }>) => void;
  edit?: ClassRec; curriculums: Curriculum[]; programs: Program[]; teachers: Teacher[];
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [head, setHead] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [program, setProgram] = useState('');

  useEffect(() => {
    if (edit) {
      setName(edit.name); setLevel(edit.class_level?.toString() ?? '');
      setHead(edit.head_teacher_id?.toString() ?? '');
      setCurriculum(edit.curriculum_id?.toString() ?? '');
      setProgram(edit.program_id?.toString() ?? '');
    } else { setName(''); setLevel(''); setHead(''); setCurriculum(''); setProgram(''); }
  }, [edit, open]);

  return (
    <ModalShell open={open} onClose={onClose} title={edit ? 'Edit Class' : 'New Class'}>
      <form
        onSubmit={e => {
          e.preventDefault();
          onSave({
            name,
            class_level: level ? parseInt(level, 10) : null,
            head_teacher_id: head ? parseInt(head, 10) : null,
            curriculum_id: curriculum ? parseInt(curriculum, 10) : null,
            program_id: program ? parseInt(program, 10) : null,
          });
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">Class Name <span className="text-red-500">*</span></label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldBase} placeholder="e.g. Primary Three" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">Class Level</label>
            <input type="number" min={1} value={level} onChange={e => setLevel(e.target.value)} className={fieldBase} placeholder="3" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">Class Teacher</label>
            <select value={head} onChange={e => setHead(e.target.value)} className={fieldBase}>
              <option value="">— None —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">
            Program <span className="text-slate-400 normal-case text-[11px]">(e.g. Secular, Theology, Tahfiz)</span>
          </label>
          <select value={program} onChange={e => setProgram(e.target.value)} className={fieldBase}>
            <option value="">— None —</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">
            Curriculum <span className="text-slate-400 normal-case text-[11px]">(e.g. UNEB, Cambridge)</span>
          </label>
          <select value={curriculum} onChange={e => setCurriculum(e.target.value)} className={fieldBase}>
            <option value="">— None —</option>
            {curriculums.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">Cancel</button>
          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:brightness-110">{edit ? 'Save Changes' : 'Create'}</button>
        </div>
      </form>
    </ModalShell>
  );
}

export default function ClassesCurriculumsPage() {
  const currSWR  = useSWR(`${API_BASE}/curriculums`);
  const classSWR = useSWR(`${API_BASE}/classes`);
  const progSWR  = useSWR(`${API_BASE}/programs`);
  const teachSWR = useSWR(`${API_BASE}/teachers`);

  const curriculums: Curriculum[] = (() => { const d = currSWR.data;  return Array.isArray(d) ? d : d?.data ?? []; })();
  const classes:     ClassRec[]   = (() => { const d = classSWR.data; return Array.isArray(d) ? d : d?.data ?? []; })();
  const programs:    Program[]    = (() => { const d = progSWR.data;  return Array.isArray(d) ? d : d?.data ?? []; })();
  const teachers:    Teacher[]    = (() => { const d = teachSWR.data; return Array.isArray(d) ? d : d?.data ?? []; })();

  const [tabIndex, setTabIndex]   = useState(0);
  const [currModal,  setCurrModal]  = useState<{ open: boolean; edit?: Curriculum }>({ open: false });
  const [classModal, setClassModal] = useState<{ open: boolean; edit?: ClassRec }>({ open: false });
  const [progModal,  setProgModal]  = useState<{ open: boolean; edit?: Program }>({ open: false });
  const [programFilter, setProgramFilter] = useState<number | 'all'>('' as any);

  const saveCurriculum = async (v: Partial<Curriculum>) => {
    const isEdit = !!currModal.edit;
    try {
      await apiFetch(`${API_BASE}/curriculums`, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isEdit ? { id: currModal.edit!.id, ...v } : v), successMessage: isEdit ? 'Curriculum updated' : 'Curriculum created' });
      setCurrModal({ open: false }); currSWR.mutate();
    } catch { /* */ }
  };
  const deleteCurr = async (id: number) => {
    if (!await confirmAction('Delete curriculum?', 'This cannot be undone.', 'Delete')) return;
    try { await apiFetch(`${API_BASE}/curriculums`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), successMessage: 'Deleted' }); currSWR.mutate(); } catch { /* */ }
  };

  const saveProgram = async (v: Partial<Program>) => {
    const isEdit = !!progModal.edit;
    const url = isEdit ? `${API_BASE}/programs/${progModal.edit!.id}` : `${API_BASE}/programs`;
    try {
      await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v), successMessage: isEdit ? 'Program updated' : 'Program created' });
      setProgModal({ open: false }); progSWR.mutate();
    } catch { /* */ }
  };
  const deleteProgram = async (id: number) => {
    if (!await confirmAction('Delete program?', 'Classes linked to this program will lose their program assignment.', 'Delete')) return;
    try { await apiFetch(`${API_BASE}/programs/${id}`, { method: 'DELETE', successMessage: 'Program deleted' }); progSWR.mutate(); classSWR.mutate(); } catch { /* */ }
  };

  const saveClass = async (v: Partial<ClassRec & { program_id?: number | null }>) => {
    const isEdit = !!classModal.edit;
    try {
      await apiFetch(`${API_BASE}/classes`, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isEdit ? { id: classModal.edit!.id, ...v } : v), successMessage: isEdit ? 'Class updated' : 'Class created' });
      setClassModal({ open: false }); classSWR.mutate();
    } catch { /* */ }
  };
  const deleteClass = async (id: number) => {
    if (!await confirmAction('Delete class?', 'This will soft-delete the class.', 'Delete')) return;
    try { await apiFetch(`${API_BASE}/classes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), successMessage: 'Class deleted' }); classSWR.mutate(); } catch { /* */ }
  };

  const filteredClasses = programFilter === 'all' || programFilter === ('' as any)
    ? classes
    : programFilter === 0
      ? classes.filter(c => !c.program_id)
      : classes.filter(c => c.program_id === programFilter);

  const loadingClasses = !classSWR.error && !classSWR.data;
  const loadingCurr    = !currSWR.error && !currSWR.data;
  const loadingProg    = !progSWR.error && !progSWR.data;

  return (
    <div className="p-4 md:p-6 max-w-7xl">
      <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Classes, Programs & Curriculums</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        A <strong>Program</strong> is an academic track (Secular, Theology, Tahfiz). A <strong>Class</strong> belongs to a program and has a class teacher. A <strong>Curriculum</strong> is the governing standard (UNEB, Cambridge).
      </p>

      <Tab.Group selectedIndex={tabIndex} onChange={setTabIndex}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <Tab.List className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
            {['Classes', 'Programs', 'Curriculums'].map(label => (
              <Tab key={label} className={({ selected }) => `px-4 py-1.5 text-sm font-semibold rounded-lg transition focus:outline-none ${selected ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{label}</Tab>
            ))}
          </Tab.List>
          <div>
            {tabIndex === 0 && <button onClick={() => setClassModal({ open: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"><Plus className="w-4 h-4" /> New Class</button>}
            {tabIndex === 1 && <button onClick={() => setProgModal({ open: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-fuchsia-600 hover:bg-fuchsia-500 text-white"><Plus className="w-4 h-4" /> New Program</button>}
            {tabIndex === 2 && <button onClick={() => setCurrModal({ open: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"><Plus className="w-4 h-4" /> New Curriculum</button>}
          </div>
        </div>

        <Tab.Panels>
          {/* CLASSES */}
          <Tab.Panel>
            <div className="flex flex-wrap gap-2 mb-4">
              {[{ label: 'All programs', val: 'all' as const }, ...programs.map(p => ({ label: p.name, val: p.id as number | 'all' | 0 })), { label: 'No program', val: 0 as number | 'all' }].map(item => (
                <button key={String(item.val)} onClick={() => setProgramFilter(item.val as any)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${(programFilter === item.val || (programFilter === ('' as any) && item.val === 'all')) ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Class Name</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Lvl</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Program</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Curriculum</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Class Teacher</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingClasses && [...Array(5)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={6} className="px-4 py-3"><div className="h-5 rounded bg-slate-200 dark:bg-slate-700/40 w-3/4" /></td></tr>))}
                    {!loadingClasses && filteredClasses.length === 0 && (<tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">No classes found. Add classes using the 'New Class' button above.</td></tr>)}
                    {!loadingClasses && filteredClasses.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{c.class_level ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          {c.program_name ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">{c.program_name}</span> : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {c.curriculum_name ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300">{c.curriculum_code && <span className="opacity-70">{c.curriculum_code}·</span>}{c.curriculum_name}</span> : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {c.teacher_name ? <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-slate-400" />{c.teacher_name}</span> : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => setClassModal({ open: true, edit: c })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteClass(c.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Tab.Panel>

          {/* PROGRAMS */}
          <Tab.Panel>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Program Name</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Classes</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingProg && [...Array(3)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={4} className="px-4 py-3"><div className="h-5 rounded bg-slate-200 dark:bg-slate-700/40 w-2/3" /></td></tr>))}
                    {!loadingProg && programs.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-12 text-center">
                        <GraduationCap className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No programs yet. Create one then assign it to classes.</p>
                      </td></tr>
                    )}
                    {!loadingProg && programs.map(p => {
                      const linked = classes.filter(c => c.program_id === p.id).length;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">
                            <span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-indigo-500" />{p.name}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-xs">{p.description || '—'}</td>
                          <td className="px-4 py-2.5">
                            <button onClick={() => { setTabIndex(0); setProgramFilter(p.id); }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 transition-colors">
                              <Users className="w-3 h-3" />{linked} class{linked !== 1 ? 'es' : ''}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => setProgModal({ open: true, edit: p })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteProgram(p.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Tab.Panel>

          {/* CURRICULUMS */}
          <Tab.Panel>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Code</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                      <th className="px-4 py-2.5 text-left font-semibold">Linked Classes</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingCurr && [...Array(3)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={4} className="px-4 py-3"><div className="h-5 rounded bg-slate-200 dark:bg-slate-700/40 w-1/2" /></td></tr>))}
                    {!loadingCurr && curriculums.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-12 text-center">
                        <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No curriculums yet.</p>
                      </td></tr>
                    )}
                    {!loadingCurr && curriculums.map(c => {
                      const linked = classes.filter(cl => cl.curriculum_id === c.id).length;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-2.5"><span className="font-mono text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-400 px-2 py-0.5 rounded bg-fuchsia-50 dark:bg-fuchsia-900/20">{c.code}</span></td>
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                          <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 font-semibold">{linked} class{linked !== 1 ? 'es' : ''}</span></td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => setCurrModal({ open: true, edit: c })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteCurr(c.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>

      <CurriculumModal open={currModal.open} onClose={() => setCurrModal({ open: false })} onSave={saveCurriculum} edit={currModal.edit} />
      <ProgramModal    open={progModal.open} onClose={() => setProgModal({ open: false })} onSave={saveProgram}    edit={progModal.edit} />
      <ClassModal      open={classModal.open} onClose={() => setClassModal({ open: false })} onSave={saveClass} edit={classModal.edit} curriculums={curriculums} programs={programs} teachers={teachers} />
    </div>
  );
}
