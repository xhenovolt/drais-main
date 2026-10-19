"use client";
import React, { Fragment, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Tab, Dialog, Transition } from '@headlessui/react';
import { Plus, Pencil, Trash2, X, BookOpen, GraduationCap, Users, User, UserCog } from 'lucide-react';
import { confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import ClassTeacherModal from '@/components/academics/ClassTeacherModal';
import { useI18n } from '@/components/i18n/I18nProvider';

const API_BASE = '/api';

interface Curriculum { id: number; code: string; name: string; }
interface Program { id: number; name: string; description?: string; }
interface Teacher {
  id:               number;
  first_name:       string;
  last_name:        string;
  position?:        string | null;
  position_name?:   string | null;
  department_name?: string | null;
}

function teacherDisplayLabel(t: Teacher, tr: (k: string, v?: any) => string): string {
  const name = [t.first_name, t.last_name].map(s => (s ?? '').trim()).filter(Boolean).join(' ');
  const safeName = name || tr('academicsPages.classes.staffNo', { id: t.id });
  const subtitle = t.position_name || t.position || t.department_name;
  return subtitle ? `${safeName} — ${subtitle}` : safeName;
}

interface ClassRec {
  id: number;
  name: string;
  class_level: number | null;
  head_teacher_id: number | null;
  teacher_name: string | null;
  teacher_department: string | null;
  curriculum_id: number | null;
  curriculum_name: string | null;
  curriculum_code: string | null;
  program_id: number | null;
  program_name: string | null;
}

const fieldBase =
  "w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-800/70 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-400 text-sm placeholder-gray-400 dark:placeholder-gray-500";

function ModalShell({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { t } = useI18n();
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
                  <button type="button" onClick={onClose} aria-label={t('academicsPages.classes.close', "Close")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
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
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  useEffect(() => { setCode(edit?.code ?? ''); setName(edit?.name ?? ''); }, [edit, open]);
  return (
    <ModalShell open={open} onClose={onClose} title={edit ? t('academicsPages.classes.editCurriculum', "Edit Curriculum") : t('academicsPages.classes.newCurriculum', "New Curriculum")}>
      <form onSubmit={e => { e.preventDefault(); onSave({ code, name }); }} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">{t('academicsPages.classes.code', "Code")}</label>
          <input required value={code} onChange={e => setCode(e.target.value)} className={fieldBase} placeholder={t('academicsPages.classes.codePh', "e.g. SEC")} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">{t('academicsPages.classes.name', "Name")}</label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldBase} placeholder={t('academicsPages.classes.currNamePh', "e.g. Secular Curriculum")} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">{t('academicsPages.classes.cancel', "Cancel")}</button>
          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:brightness-110">{edit ? t('academicsPages.classes.saveChanges', "Save Changes") : t('academicsPages.classes.create', "Create")}</button>
        </div>
      </form>
    </ModalShell>
  );
}

function ProgramModal({ open, onClose, onSave, edit }: { open: boolean; onClose: () => void; onSave: (v: Partial<Program>) => void; edit?: Program }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => { setName(edit?.name ?? ''); setDesc(edit?.description ?? ''); }, [edit, open]);
  return (
    <ModalShell open={open} onClose={onClose} title={edit ? t('academicsPages.classes.editProgram', "Edit Program") : t('academicsPages.classes.newProgram', "New Program")}>
      <form onSubmit={e => { e.preventDefault(); onSave({ name, description: desc || undefined }); }} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">{t('academicsPages.classes.programName', "Program Name")} <span className="text-red-500">*</span></label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldBase} placeholder={t('academicsPages.classes.programNamePh', "e.g. Theology, Secular, Tahfiz")} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">{t('academicsPages.classes.descOptional', "Description (optional)")}</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} className={fieldBase} rows={2} placeholder={t('academicsPages.classes.descPh', "Short description…")} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">{t('academicsPages.classes.cancel', "Cancel")}</button>
          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:brightness-110">{edit ? t('academicsPages.classes.saveChanges', "Save Changes") : t('academicsPages.classes.create', "Create")}</button>
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
  const { t } = useI18n();
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
    <ModalShell open={open} onClose={onClose} title={edit ? t('academicsPages.classes.editClass', "Edit Class") : t('academicsPages.classes.newClass', "New Class")}>
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
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">{t('academicsPages.classes.className', "Class Name")} <span className="text-red-500">*</span></label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldBase} placeholder={t('academicsPages.classes.classNamePh', "e.g. Primary Three")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">{t('academicsPages.classes.classLevel', "Class Level")}</label>
            <input type="number" min={1} value={level} onChange={e => setLevel(e.target.value)} className={fieldBase} placeholder="3" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">{t('academicsPages.classes.classTeacher', "Class Teacher")}</label>
            <select value={head} onChange={e => setHead(e.target.value)} className={fieldBase}>
              <option value="">{t('academicsPages.classes.none', "— None —")}</option>
              {teachers.map(tch => <option key={tch.id} value={tch.id}>{teacherDisplayLabel(tch, t)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">
            {t('academicsPages.classes.program', "Program")} <span className="text-slate-400 normal-case text-[11px]">{t('academicsPages.classes.programHint', "(e.g. Secular, Theology, Tahfiz)")}</span>
          </label>
          <select value={program} onChange={e => setProgram(e.target.value)} className={fieldBase}>
            <option value="">{t('academicsPages.classes.none', "— None —")}</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600 dark:text-slate-400">
            {t('academicsPages.classes.curriculum', "Curriculum")} <span className="text-slate-400 normal-case text-[11px]">{t('academicsPages.classes.curriculumHint', "(e.g. UNEB, Cambridge)")}</span>
          </label>
          <select value={curriculum} onChange={e => setCurriculum(e.target.value)} className={fieldBase}>
            <option value="">{t('academicsPages.classes.none', "— None —")}</option>
            {curriculums.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">{t('academicsPages.classes.cancel', "Cancel")}</button>
          <button type="submit" className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white hover:brightness-110">{edit ? t('academicsPages.classes.saveChanges', "Save Changes") : t('academicsPages.classes.create', "Create")}</button>
        </div>
      </form>
    </ModalShell>
  );
}

export default function ClassesCurriculumsPage() {
  const { t, rich, digits } = useI18n();
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
  const [classModal,        setClassModal]        = useState<{ open: boolean; edit?: ClassRec }>({ open: false });
  const [teacherModal,      setTeacherModal]      = useState<{ open: boolean; cls?: ClassRec }>({ open: false });
  const [progModal,  setProgModal]  = useState<{ open: boolean; edit?: Program }>({ open: false });
  const [programFilter, setProgramFilter] = useState<number | 'all'>('' as any);

  const saveCurriculum = async (v: Partial<Curriculum>) => {
    const isEdit = !!currModal.edit;
    try {
      await apiFetch(`${API_BASE}/curriculums`, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isEdit ? { id: currModal.edit!.id, ...v } : v), successMessage: isEdit ? t('academicsPages.classes.currUpdated', "Curriculum updated") : t('academicsPages.classes.currCreated', "Curriculum created") });
      setCurrModal({ open: false }); currSWR.mutate();
    } catch { /* */ }
  };
  const deleteCurr = async (id: number) => {
    if (!await confirmAction(t('academicsPages.classes.confirmDeleteCurr', "Delete curriculum?"), t('academicsPages.classes.cannotUndo', "This cannot be undone."), t('academicsPages.classes.delete', "Delete"))) return;
    try { await apiFetch(`${API_BASE}/curriculums`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), successMessage: t('academicsPages.classes.deleted', "Deleted") }); currSWR.mutate(); } catch { /* */ }
  };

  const saveProgram = async (v: Partial<Program>) => {
    const isEdit = !!progModal.edit;
    // Programs live at a single collection endpoint — there is no
    // /api/programs/[id] route, so the previous PUT to `/programs/${id}` hit
    // nothing and returned 404 on every edit. The collection exposes PATCH,
    // and it maps `display_name` rather than `name`: sending {name} was
    // accepted and then changed nothing, which is why renaming a program
    // appeared to work and never did.
    const body: Record<string, unknown> = { ...v };
    if (v.name !== undefined) body.display_name = v.name;
    if (isEdit) body.id = progModal.edit!.id;
    try {
      await apiFetch(`${API_BASE}/programs`, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), successMessage: isEdit ? t('academicsPages.classes.progUpdated', "Program updated") : t('academicsPages.classes.progCreated', "Program created") });
      setProgModal({ open: false }); progSWR.mutate();
    } catch { /* */ }
  };
  const deleteProgram = async (id: number) => {
    if (!await confirmAction(t('academicsPages.classes.confirmDeleteProg', "Delete program?"), t('academicsPages.classes.deleteProgHelp', "Classes linked to this program will lose their program assignment."), t('academicsPages.classes.delete', "Delete"))) return;
    // Same missing route as the edit above: DELETE /api/programs/<id> was a
    // 404, so "Program deleted" never deleted anything. The endpoint takes the
    // id as a query parameter.
    try { await apiFetch(`${API_BASE}/programs?id=${id}`, { method: 'DELETE', successMessage: t('academicsPages.classes.progDeleted', "Program deleted") }); progSWR.mutate(); classSWR.mutate(); } catch { /* */ }
  };

  const saveClass = async (v: Partial<ClassRec & { program_id?: number | null }>) => {
    const isEdit = !!classModal.edit;
    try {
      await apiFetch(`${API_BASE}/classes`, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isEdit ? { id: classModal.edit!.id, ...v } : v), successMessage: isEdit ? t('academicsPages.classes.classUpdated', "Class updated") : t('academicsPages.classes.classCreated', "Class created") });
      setClassModal({ open: false }); classSWR.mutate();
    } catch { /* */ }
  };
  const deleteClass = async (id: number) => {
    if (!await confirmAction(t('academicsPages.classes.confirmDeleteClass', "Delete class?"), t('academicsPages.classes.deleteClassHelp', "This will soft-delete the class."), t('academicsPages.classes.delete', "Delete"))) return;
    try { await apiFetch(`${API_BASE}/classes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), successMessage: t('academicsPages.classes.classDeleted', "Class deleted") }); classSWR.mutate(); } catch { /* */ }
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
      <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{`${t('orgUnits.classes')} — ${t('academic.curriculum')}`}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {rich('academicsPages.classes.intro', { program: <strong>{t('academicsPages.classes.programWord', 'Program')}</strong>, cls: <strong>{t('academicsPages.classes.classWord', 'Class')}</strong>, curriculum: <strong>{t('academicsPages.classes.curriculumWord', 'Curriculum')}</strong> })}
      </p>

      <Tab.Group selectedIndex={tabIndex} onChange={setTabIndex}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <Tab.List className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
            {[t('academicsPages.classes.tab.classes', "Classes"), t('academicsPages.classes.tab.programs', "Programs"), t('academicsPages.classes.tab.curriculums', "Curriculums")].map(label => (
              <Tab key={label} className={({ selected }) => `px-4 py-1.5 text-sm font-semibold rounded-lg transition focus:outline-none ${selected ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{label}</Tab>
            ))}
          </Tab.List>
          <div>
            {tabIndex === 0 && <button onClick={() => setClassModal({ open: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"><Plus className="w-4 h-4" /> {t('academicsPages.classes.newClass', "New Class")}</button>}
            {tabIndex === 1 && <button onClick={() => setProgModal({ open: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-fuchsia-600 hover:bg-fuchsia-500 text-white"><Plus className="w-4 h-4" /> {t('academicsPages.classes.newProgram', "New Program")}</button>}
            {tabIndex === 2 && <button onClick={() => setCurrModal({ open: true })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"><Plus className="w-4 h-4" /> {t('academicsPages.classes.newCurriculum', "New Curriculum")}</button>}
          </div>
        </div>

        <Tab.Panels>
          {/* CLASSES */}
          <Tab.Panel>
            <div className="flex flex-wrap gap-2 mb-4">
              {[{ label: t('academicsPages.classes.allPrograms', "All programs"), val: 'all' as const }, ...programs.map(p => ({ label: p.name, val: p.id as number | 'all' | 0 })), { label: t('academicsPages.classes.noProgram', "No program"), val: 0 as number | 'all' }].map(item => (
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
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.className', "Class Name")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.lvl', "Lvl")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.program', "Program")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.curriculum', "Curriculum")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.classTeacher', "Class Teacher")}</th>
                      <th className="px-4 py-2.5 text-end font-semibold">{t('academicsPages.classes.actions', "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingClasses && [...Array(5)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={6} className="px-4 py-3"><div className="h-5 rounded bg-slate-200 dark:bg-slate-700/40 w-3/4" /></td></tr>))}
                    {!loadingClasses && filteredClasses.length === 0 && (<tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">{t('academicsPages.classes.noClasses', "No classes found. Add classes using the 'New Class' button above.")}</td></tr>)}
                    {!loadingClasses && filteredClasses.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{c.class_level != null ? digits(c.class_level) : '—'}</td>
                        <td className="px-4 py-2.5">
                          {c.program_name ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">{c.program_name}</span> : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {c.curriculum_name ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300">{c.curriculum_code && <span className="opacity-70">{c.curriculum_code}·</span>}{c.curriculum_name}</span> : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {c.teacher_name ? (
                            <div className="flex items-start gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                              <div className="leading-tight">
                                <div className="font-medium">{c.teacher_name}</div>
                                {c.teacher_department && (
                                  <div className="text-[10px] text-slate-400">{c.teacher_department}</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] italic text-slate-400">{t('academicsPages.classes.noClassTeacher', "No class teacher assigned")}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => setTeacherModal({ open: true, cls: c })} className="p-1.5 rounded-md bg-indigo-500/15 text-indigo-600 hover:bg-indigo-500/25" title={t('academicsPages.classes.classTeacher', "Class Teacher")}><UserCog className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setClassModal({ open: true, edit: c })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title={t('academicsPages.classes.edit', "Edit")}><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteClass(c.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title={t('academicsPages.classes.delete', "Delete")}><Trash2 className="w-3.5 h-3.5" /></button>
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
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.programName', "Program Name")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.description', "Description")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.classes', "Classes")}</th>
                      <th className="px-4 py-2.5 text-end font-semibold">{t('academicsPages.classes.actions', "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingProg && [...Array(3)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={4} className="px-4 py-3"><div className="h-5 rounded bg-slate-200 dark:bg-slate-700/40 w-2/3" /></td></tr>))}
                    {!loadingProg && programs.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-12 text-center">
                        <GraduationCap className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">{t('academicsPages.classes.noPrograms', "No programs yet. Create one then assign it to classes.")}</p>
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
                              <Users className="w-3 h-3" />{t('academicsPages.classes.classCount', { count: linked })}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => setProgModal({ open: true, edit: p })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title={t('academicsPages.classes.edit', "Edit")}><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteProgram(p.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title={t('academicsPages.classes.delete', "Delete")}><Trash2 className="w-3.5 h-3.5" /></button>
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
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.code', "Code")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.name', "Name")}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{t('academicsPages.classes.linkedClasses', "Linked Classes")}</th>
                      <th className="px-4 py-2.5 text-end font-semibold">{t('academicsPages.classes.actions', "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingCurr && [...Array(3)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={4} className="px-4 py-3"><div className="h-5 rounded bg-slate-200 dark:bg-slate-700/40 w-1/2" /></td></tr>))}
                    {!loadingCurr && curriculums.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-12 text-center">
                        <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">{t('academicsPages.classes.noCurriculums', "No curriculums yet.")}</p>
                      </td></tr>
                    )}
                    {!loadingCurr && curriculums.map(c => {
                      const linked = classes.filter(cl => cl.curriculum_id === c.id).length;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-2.5"><span className="font-mono text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-400 px-2 py-0.5 rounded bg-fuchsia-50 dark:bg-fuchsia-900/20">{c.code}</span></td>
                          <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                          <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 font-semibold">{t('academicsPages.classes.classCount', { count: linked })}</span></td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => setCurrModal({ open: true, edit: c })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title={t('academicsPages.classes.edit', "Edit")}><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteCurr(c.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title={t('academicsPages.classes.delete', "Delete")}><Trash2 className="w-3.5 h-3.5" /></button>
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
      {teacherModal.cls && (
        <ClassTeacherModal
          open={teacherModal.open}
          onClose={() => setTeacherModal({ open: false })}
          classId={teacherModal.cls.id}
          className={teacherModal.cls.name}
        />
      )}
    </div>
  );
}
