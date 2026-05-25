'use client';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface NoK {
  id?: number;
  sequence?: number;
  name: string;
  address?: string | null;
  occupation?: string | null;
  contact?: string | null;
}

interface Edu {
  id?: number;
  education_type: string;
  level_name: string;
  institution?: string | null;
  year_completed?: number | null;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  studentId: number;
  initial: any;
  onSaved?: () => void;
}

type Tab = 'personal' | 'family' | 'kin' | 'education';

export default function ExtendedProfileModal({ open, onClose, studentId, initial, onSaved }: Props) {
  const [tab, setTab] = useState<Tab>('personal');
  const [saving, setSaving] = useState(false);

  // Singleton blocks
  const [additional, setAdditional] = useState({
    orphan_status:   initial?.additional?.orphan_status   ?? '',
    previous_school: initial?.additional?.previous_school ?? '',
    notes:           initial?.additional?.notes           ?? '',
  });
  const [extended, setExtended] = useState({
    place_of_birth:     initial?.extended?.place_of_birth     ?? '',
    place_of_residence: initial?.extended?.place_of_residence ?? '',
    district_id:        initial?.extended?.district_id        ?? '',
    nationality_id:     initial?.extended?.nationality_id     ?? '',
  });
  const [family, setFamily] = useState({
    orphan_status_id:            initial?.family_status?.orphan_status_id            ?? '',
    primary_guardian_name:       initial?.family_status?.primary_guardian_name       ?? '',
    primary_guardian_contact:    initial?.family_status?.primary_guardian_contact    ?? '',
    primary_guardian_occupation: initial?.family_status?.primary_guardian_occupation ?? '',
    father_name:                 initial?.family_status?.father_name                 ?? '',
    father_living_status_id:     initial?.family_status?.father_living_status_id     ?? '',
    father_occupation:           initial?.family_status?.father_occupation           ?? '',
    father_contact:              initial?.family_status?.father_contact              ?? '',
    notes:                       initial?.family_status?.notes                       ?? '',
  });
  const [nok, setNok] = useState<NoK[]>(initial?.next_of_kin?.length ? initial.next_of_kin : []);
  const [edu, setEdu] = useState<Edu[]>(initial?.education_levels?.length ? initial.education_levels : []);

  const { data: lookupsRes } = useSWR(open ? '/api/lookups/student-profile' : null, fetcher);
  const lookups = lookupsRes?.data ?? { orphan_statuses: [], living_statuses: [], districts: [], nationalities: [] };

  useEffect(() => {
    if (!open) return;
    setAdditional({
      orphan_status:   initial?.additional?.orphan_status   ?? '',
      previous_school: initial?.additional?.previous_school ?? '',
      notes:           initial?.additional?.notes           ?? '',
    });
    setExtended({
      place_of_birth:     initial?.extended?.place_of_birth     ?? '',
      place_of_residence: initial?.extended?.place_of_residence ?? '',
      district_id:        initial?.extended?.district_id        ?? '',
      nationality_id:     initial?.extended?.nationality_id     ?? '',
    });
    setFamily({
      orphan_status_id:            initial?.family_status?.orphan_status_id            ?? '',
      primary_guardian_name:       initial?.family_status?.primary_guardian_name       ?? '',
      primary_guardian_contact:    initial?.family_status?.primary_guardian_contact    ?? '',
      primary_guardian_occupation: initial?.family_status?.primary_guardian_occupation ?? '',
      father_name:                 initial?.family_status?.father_name                 ?? '',
      father_living_status_id:     initial?.family_status?.father_living_status_id     ?? '',
      father_occupation:           initial?.family_status?.father_occupation           ?? '',
      father_contact:              initial?.family_status?.father_contact              ?? '',
      notes:                       initial?.family_status?.notes                       ?? '',
    });
    setNok(initial?.next_of_kin?.length ? initial.next_of_kin : []);
    setEdu(initial?.education_levels?.length ? initial.education_levels : []);
  }, [open, initial]);

  if (!open) return null;

  async function saveSingleton() {
    setSaving(true);
    try {
      const res = await fetch(`/api/students/${studentId}/profile`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          additional,
          extended: {
            ...extended,
            district_id:    extended.district_id    ? Number(extended.district_id)    : null,
            nationality_id: extended.nationality_id ? Number(extended.nationality_id) : null,
          },
          family_status: {
            ...family,
            orphan_status_id:        family.orphan_status_id        ? Number(family.orphan_status_id)        : null,
            father_living_status_id: family.father_living_status_id ? Number(family.father_living_status_id) : null,
          },
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast.success('Profile saved');
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  async function saveNok() {
    setSaving(true);
    try {
      const res = await fetch(`/api/students/${studentId}/next-of-kin`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: nok }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast.success('Next of kin saved');
      onSaved?.();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function saveEdu() {
    setSaving(true);
    try {
      const res = await fetch(`/api/students/${studentId}/education-levels`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ items: edu }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast.success('Education history saved');
      onSaved?.();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold">Extended Profile</h3>
          <button onClick={onClose} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-slate-100 dark:border-slate-800">
          {(['personal', 'family', 'kin', 'education'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg ${
                tab === t
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t === 'kin' ? 'Next of Kin' : t === 'education' ? 'Education' : t === 'family' ? 'Family Status' : 'Personal'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'personal' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Place of Birth" value={extended.place_of_birth} onChange={v => setExtended({ ...extended, place_of_birth: v })} />
              <Input label="Place of Residence" value={extended.place_of_residence} onChange={v => setExtended({ ...extended, place_of_residence: v })} />
              <Select label="District" value={String(extended.district_id || '')} onChange={v => setExtended({ ...extended, district_id: v })}
                options={lookups.districts.map((d: any) => ({ value: String(d.id), label: d.name }))} />
              <Select label="Nationality" value={String(extended.nationality_id || '')} onChange={v => setExtended({ ...extended, nationality_id: v })}
                options={lookups.nationalities.map((n: any) => ({ value: String(n.id), label: n.name }))} />
              <Input label="Previous School" value={additional.previous_school} onChange={v => setAdditional({ ...additional, previous_school: v })} />
              <Input label="Orphan Status (free text)" value={additional.orphan_status} onChange={v => setAdditional({ ...additional, orphan_status: v })} />
              <div className="sm:col-span-2">
                <Textarea label="Notes" value={additional.notes} onChange={v => setAdditional({ ...additional, notes: v })} />
              </div>
            </div>
          )}

          {tab === 'family' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Select label="Orphan Status" value={String(family.orphan_status_id || '')} onChange={v => setFamily({ ...family, orphan_status_id: v })}
                options={lookups.orphan_statuses.map((o: any) => ({ value: String(o.id), label: o.label }))} />
              <div />
              <Input label="Primary Guardian Name" value={family.primary_guardian_name} onChange={v => setFamily({ ...family, primary_guardian_name: v })} />
              <Input label="Primary Guardian Contact" value={family.primary_guardian_contact} onChange={v => setFamily({ ...family, primary_guardian_contact: v })} />
              <Input label="Primary Guardian Occupation" value={family.primary_guardian_occupation} onChange={v => setFamily({ ...family, primary_guardian_occupation: v })} />
              <div />
              <Input label="Father Name" value={family.father_name} onChange={v => setFamily({ ...family, father_name: v })} />
              <Select label="Father Living Status" value={String(family.father_living_status_id || '')} onChange={v => setFamily({ ...family, father_living_status_id: v })}
                options={lookups.living_statuses.map((l: any) => ({ value: String(l.id), label: l.label }))} />
              <Input label="Father Occupation" value={family.father_occupation} onChange={v => setFamily({ ...family, father_occupation: v })} />
              <Input label="Father Contact" value={family.father_contact} onChange={v => setFamily({ ...family, father_contact: v })} />
              <div className="sm:col-span-2">
                <Textarea label="Family Notes" value={family.notes} onChange={v => setFamily({ ...family, notes: v })} />
              </div>
            </div>
          )}

          {tab === 'kin' && (
            <div className="space-y-3">
              {nok.map((k, idx) => (
                <div key={idx} className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 relative">
                  <Input label="Name" value={k.name} onChange={v => setNok(nok.map((x, i) => i === idx ? { ...x, name: v } : x))} />
                  <Input label="Contact" value={k.contact || ''} onChange={v => setNok(nok.map((x, i) => i === idx ? { ...x, contact: v } : x))} />
                  <Input label="Occupation" value={k.occupation || ''} onChange={v => setNok(nok.map((x, i) => i === idx ? { ...x, occupation: v } : x))} />
                  <Input label="Address" value={k.address || ''} onChange={v => setNok(nok.map((x, i) => i === idx ? { ...x, address: v } : x))} />
                  <button onClick={() => setNok(nok.filter((_, i) => i !== idx))}
                    className="absolute top-2 right-2 p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => setNok([...nok, { name: '', sequence: nok.length + 1 }])}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                <Plus className="w-3.5 h-3.5" /> Add Next of Kin
              </button>
            </div>
          )}

          {tab === 'education' && (
            <div className="space-y-3">
              {edu.map((e, idx) => (
                <div key={idx} className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 relative">
                  <Select label="Type" value={e.education_type} onChange={v => setEdu(edu.map((x, i) => i === idx ? { ...x, education_type: v } : x))}
                    options={[
                      { value: 'pre_primary', label: 'Pre-Primary' },
                      { value: 'primary',     label: 'Primary'     },
                      { value: 'secondary',   label: 'Secondary'   },
                      { value: 'tertiary',    label: 'Tertiary'    },
                      { value: 'tahfiz',      label: 'Tahfiz'      },
                      { value: 'other',       label: 'Other'       },
                    ]} />
                  <Input label="Level / Class Reached" value={e.level_name} onChange={v => setEdu(edu.map((x, i) => i === idx ? { ...x, level_name: v } : x))} />
                  <Input label="Institution" value={e.institution || ''} onChange={v => setEdu(edu.map((x, i) => i === idx ? { ...x, institution: v } : x))} />
                  <Input label="Year Completed (YYYY)" value={String(e.year_completed || '')} onChange={v => setEdu(edu.map((x, i) => i === idx ? { ...x, year_completed: v ? Number(v) : null } : x))} />
                  <button onClick={() => setEdu(edu.filter((_, i) => i !== idx))}
                    className="absolute top-2 right-2 p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={() => setEdu([...edu, { education_type: 'primary', level_name: '' }])}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-dashed border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                <Plus className="w-3.5 h-3.5" /> Add Education Level
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={() => {
              if (tab === 'kin')        saveNok();
              else if (tab === 'education') saveEdu();
              else                       saveSingleton();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save {tab === 'kin' ? 'Next of Kin' : tab === 'education' ? 'Education' : 'Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">— Select —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
