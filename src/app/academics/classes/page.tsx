"use client";
import React, { Fragment, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Tab, Dialog, Transition } from '@headlessui/react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { t } from '@/lib/i18n';

const API_BASE = '/api';
const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface Curriculum {
  id: number;
  code: string;
  name: string;
}

interface ClassRec {
  id: number;
  name: string;
  class_level: number | null;
  head_teacher_id: number | null;
  curriculum_id: number | null;
}

function DataShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/40 dark:border-white/10 backdrop-blur bg-white/80 dark:bg-slate-900/60 shadow-xl">
      {children}
    </div>
  );
}

const fieldBase =
  "w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-slate-800/70 border border-white/40 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-400 text-sm placeholder-gray-400 dark:placeholder-gray-500";

// Re‑usable modal shell components
function CurriculumModal({ open, onClose, onSave, edit }: { open: boolean; onClose: () => void; onSave: (v: Partial<Curriculum>) => void; edit?: Curriculum }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    if (edit) {
      setCode(edit.code);
      setName(edit.name);
    } else {
      setCode('');
      setName('');
    }
  }, [edit, open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ code, name });
  };
  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gradient-to-br from-black/50 to-black/70 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-md">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 -translate-y-4 scale-95"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 scale-100"
              leaveTo="opacity-0 -translate-y-4 scale-95"
            >
              <Dialog.Panel className="rounded-2xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-800/70 backdrop-blur-xl shadow-2xl">
                <form onSubmit={submit} className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <Dialog.Title className="text-lg font-semibold tracking-tight">
                      {edit ? t('academics.edit_curriculum', 'Edit Curriculum') : t('academics.new_curriculum', 'New Curriculum')}
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide mb-1">
                        {t('academics.code', 'Code')}
                      </label>
                      <input
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className={fieldBase}
                        placeholder={t('academics.code_placeholder', 'e.g. SEC')}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide mb-1">
                        {t('academics.name', 'Name')}
                      </label>
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={fieldBase}
                        placeholder={t('academics.name_placeholder', 'Secular Curriculum')}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20"
                    >
                      {t('academics.cancel', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white shadow-lg hover:brightness-110"
                    >
                      {edit ? t('academics.save_changes', 'Save Changes') : t('academics.create', 'Create')}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

function ClassModal({ open, onClose, onSave, edit, curriculums }: { open: boolean; onClose: () => void; onSave: (v: Partial<ClassRec>) => void; edit?: ClassRec; curriculums: Curriculum[] }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [head, setHead] = useState('');
  const [curriculum, setCurriculum] = useState('');
  useEffect(() => {
    if (edit) {
      setName(edit.name);
      setLevel(edit.class_level?.toString() || '');
      setHead(edit.head_teacher_id?.toString() || '');
      setCurriculum(edit.curriculum_id?.toString() || '');
    } else {
      setName('');
      setLevel('');
      setHead('');
      setCurriculum('');
    }
  }, [edit, open]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, class_level: level ? parseInt(level, 10) : undefined, head_teacher_id: head ? parseInt(head, 10) : undefined, curriculum_id: curriculum ? parseInt(curriculum, 10) : undefined });
  };
  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gradient-to-br from-black/50 to-black/70 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-lg">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 -translate-y-4 scale-95"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 scale-100"
              leaveTo="opacity-0 -translate-y-4 scale-95"
            >
              <Dialog.Panel className="rounded-2xl border border-white/20 dark:border-white/10 bg-gradient-to-br from-white/90 to-white/70 dark:from-slate-900/90 dark:to-slate-800/70 backdrop-blur-xl shadow-2xl">
                <form onSubmit={submit} className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <Dialog.Title className="text-lg font-semibold tracking-tight">
                      {edit ? t('academics.edit_class', 'Edit Class') : t('academics.new_class', 'New Class')}
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide mb-1">
                        {t('academics.name', 'Name')}
                      </label>
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={fieldBase}
                        placeholder={t('academics.name_placeholder', 'e.g. Primary One')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide mb-1">
                          {t('academics.level', 'Level')}
                        </label>
                        <input
                          value={level}
                          onChange={(e) => setLevel(e.target.value)}
                          className={fieldBase}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide mb-1">
                          {t('academics.head_teacher_id', 'Head Teacher ID')}
                        </label>
                        <input
                          value={head}
                          onChange={(e) => setHead(e.target.value)}
                          className={fieldBase}
                          placeholder="123"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide mb-1">
                        {t('academics.curriculum', 'Curriculum')}
                      </label>
                      <select value={curriculum} onChange={(e) => setCurriculum(e.target.value)} className={fieldBase}>
                        <option value="">{t('academics.none', '-- None --')}</option>
                        {curriculums.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20"
                    >
                      {t('academics.cancel', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white shadow-lg hover:brightness-110"
                    >
                      {edit ? t('academics.save_changes', 'Save Changes') : t('academics.create', 'Create')}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default function ClassesCurriculumsPage() {
  // Defensive data parsing
  const currSWR = useSWR(`${API_BASE}/curriculums`, fetcher);
  const classSWR = useSWR(`${API_BASE}/classes`, fetcher);
  const rawCurr = currSWR.data;
  const rawClass = classSWR.data;
  const curriculums: Curriculum[] = Array.isArray(rawCurr) ? rawCurr : rawCurr?.data || [];
  const classes: ClassRec[] = Array.isArray(rawClass) ? rawClass : rawClass?.data || [];
  const loadingCurr = !currSWR.error && !currSWR.data;
  const loadingClass = !classSWR.error && !classSWR.data;
  const [currModal, setCurrModal] = useState<{ open: boolean; edit?: Curriculum }>({ open: false });
  const [classModal, setClassModal] = useState<{ open: boolean; edit?: ClassRec }>({ open: false });
  const [tabIndex, setTabIndex] = useState(0);

  const saveCurriculum = async (v: Partial<Curriculum>) => {
    if (currModal.edit) {
      await fetch(`${API_BASE}/curriculums`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: currModal.edit.id, ...v }) });
    } else {
      await fetch(`${API_BASE}/curriculums`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
    }
    setCurrModal({ open: false });
    currSWR.mutate();
  };
  const deleteCurr = async (id: number) => {
    if (!confirm('Delete curriculum?')) return;
    await fetch(`${API_BASE}/curriculums`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    currSWR.mutate();
  };
  const saveClass = async (v: Partial<ClassRec>) => {
    if (classModal.edit) {
      await fetch(`${API_BASE}/classes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: classModal.edit.id, ...v }) });
    } else {
      await fetch(`${API_BASE}/classes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
    }
    setClassModal({ open: false });
    classSWR.mutate();
  };
  const deleteClass = async (id: number) => {
    if (!confirm('Delete class?')) return;
    await fetch(`${API_BASE}/classes`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    classSWR.mutate();
  };

  return (
    <div className="p-6">
      <div className="mb-4 font-semibold text-lg">{t('academics.classes_curriculums', 'Classes & Curriculums')}</div>
      <Tab.Group selectedIndex={tabIndex} onChange={setTabIndex}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <Tab.List className="flex gap-2 bg-slate-100/80 dark:bg-slate-800/70 backdrop-blur rounded-xl p-1 shadow-inner border border-white/40 dark:border-white/10">
            {['Curriculums', 'Classes'].map((label) => (
              <Tab key={label} className={({ selected }) => `px-5 py-2 text-sm font-semibold rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-fuchsia-500 ${selected ? 'bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white shadow-lg ring-1 ring-white/30' : 'text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-white/10'}`}>{label}</Tab>
            ))}
          </Tab.List>
          <div>
            {tabIndex === 0 && (
              <button onClick={() => setCurrModal({ open: true })} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white shadow-lg hover:brightness-110">
                <Plus className="w-4 h-4" />
                {t('academics.new_curriculum', 'New Curriculum')}
              </button>
            )}
            {tabIndex === 1 && (
              <button onClick={() => setClassModal({ open: true })} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white shadow-lg hover:brightness-110">
                <Plus className="w-4 h-4" />
                {t('academics.new_class', 'New Class')}
              </button>
            )}
          </div>
        </div>
        <Tab.Panels>
          <Tab.Panel>
            <DataShell>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.id', 'ID')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.code', 'Code')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.name', 'Name')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.linked_classes', 'Linked Classes')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('academics.actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/30 dark:divide-white/5">
                    {loadingCurr && [...Array(4)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={5} className="px-3 py-3"><div className="h-5 rounded bg-slate-200/70 dark:bg-slate-700/40" /></td></tr>))}
                    {!loadingCurr && curriculums.map(c => {
                      const linked = classes.filter(cl => cl.curriculum_id === c.id).length;
                      return (
                        <tr key={c.id} className="hover:bg-indigo-50/60 dark:hover:bg-slate-800/70 transition">
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">{c.id}</td>
                          <td className="px-3 py-2 font-medium">{c.code}</td>
                          <td className="px-3 py-2 font-medium">{c.name}</td>
                          <td className="px-3 py-2"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 dark:bg-indigo-400/10">{linked}<span className="opacity-60">cls</span></span></td>
                          <td className="px-3 py-2"><div className="flex justify-end gap-2"><button onClick={() => setCurrModal({ open: true, edit: c })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title={t('academics.edit', 'Edit')}><Pencil className="w-4 h-4" /></button><button onClick={() => deleteCurr(c.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title={t('academics.delete', 'Delete')}><Trash2 className="w-4 h-4" /></button></div></td>
                        </tr>
                      );
                    })}
                    {!loadingCurr && curriculums.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-xs text-slate-500">{t('academics.no_curriculums_found', 'No curriculums found.')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </DataShell>
          </Tab.Panel>
          <Tab.Panel>
            <DataShell>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.id', 'ID')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.name', 'Name')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.level', 'Level')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.head_teacher', 'Head Teacher')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('academics.curriculum', 'Curriculum')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('academics.actions', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/30 dark:divide-white/5">
                    {loadingClass && [...Array(4)].map((_, i) => (<tr key={i} className="animate-pulse"><td colSpan={6} className="px-3 py-3"><div className="h-5 rounded bg-slate-200/70 dark:bg-slate-700/40" /></td></tr>))}
                    {!loadingClass && classes.map(c => {
                      const cur = curriculums.find(cc => cc.id === c.curriculum_id);
                      return (
                        <tr key={c.id} className="hover:bg-indigo-50/60 dark:hover:bg-slate-800/70 transition">
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">{c.id}</td>
                          <td className="px-3 py-2 font-medium">{c.name}</td>
                          <td className="px-3 py-2">{c.class_level ?? '-'}</td>
                          <td className="px-3 py-2">{c.head_teacher_id ?? '-'}</td>
                          <td className="px-3 py-2">{cur ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-fuchsia-600/10 text-fuchsia-600 dark:text-fuchsia-400 dark:bg-fuchsia-400/10">{cur.code}<span className="opacity-60">{cur.name.length > 10 ? cur.name.slice(0, 9) + '…' : cur.name}</span></span> : '-'}</td>
                          <td className="px-3 py-2"><div className="flex justify-end gap-2"><button onClick={() => setClassModal({ open: true, edit: c })} className="p-1.5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25" title={t('academics.edit', 'Edit')}><Pencil className="w-4 h-4" /></button><button onClick={() => deleteClass(c.id)} className="p-1.5 rounded-md bg-red-500/15 text-red-600 hover:bg-red-500/25" title={t('academics.delete', 'Delete')}><Trash2 className="w-4 h-4" /></button></div></td>
                        </tr>
                      );
                    })}
                    {!loadingClass && classes.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-xs text-slate-500">{t('academics.no_classes_found', 'No classes found.')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </DataShell>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
      <CurriculumModal open={currModal.open} onClose={() => setCurrModal({ open: false })} onSave={saveCurriculum} edit={currModal.edit} />
      <ClassModal open={classModal.open} onClose={() => setClassModal({ open: false })} onSave={saveClass} edit={classModal.edit} curriculums={curriculums} />
    </div>
  );
}