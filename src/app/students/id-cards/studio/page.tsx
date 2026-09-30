'use client';
/**
 * /students/id-cards/studio — two-sided ID card designs, artwork import and
 * Excel-based card generation. The original single-sided designer at
 * /students/id-cards is unchanged and keeps working.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Fingerprint, Save, Copy, FilePlus2, FileStack, Layers } from 'lucide-react';
import { IdCardDesigner } from '@/components/idcards/IdCardDesigner';
import { IdCardGenerate } from '@/components/idcards/IdCardGenerate';
import { starterSpec, specFromLegacyConfig, isTwoSided, type IdCardSpec, type CardRecord, type SourceKind } from '@/lib/idcards/spec';
import { ID_CARD_TEMPLATES, cloneSpec } from '@/lib/idcards/templates';
import { PLACEHOLDER_PHOTO_DATA_URI } from '@/lib/idcards/placeholder';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { showToast } from '@/lib/toast';

interface DesignRow { id: number; name: string; source_kind: string; is_active: number }

export default function IdCardStudioPage() {
  const { school } = useSchoolConfig();
  const [tab, setTab] = useState<'design' | 'generate'>('design');
  const [spec, setSpec] = useState<IdCardSpec>(() => starterSpec(true));
  const [name, setName] = useState('My ID card');
  const [designId, setDesignId] = useState<number | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind>('designed');
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraTokens, setExtraTokens] = useState<string[]>([]);

  const schoolName = school?.name ?? '';
  const logoUrl = school?.logo || undefined;

  const sample: CardRecord = {
    full_name: 'Namatovu Sarah B.', first_name: 'Namatovu', last_name: 'Sarah', admission_no: 'ADM/2026/0042',
    class: 'Senior 4 Arts', gender: 'Female', dob: '15 Mar 2009', photo_url: PLACEHOLDER_PHOTO_DATA_URI, school: schoolName || 'Your School Name',
    academic_year: '2026', valid_until: '31/12/2026', issue_date: '11/04/2026', guardian_phone: '0700 000 000',
    school_address: school?.address || 'P.O. Box 123, Your Town', school_phone: school?.phone || '0700 000 000', school_email: school?.email || '',
  };

  const loadList = useCallback(async () => {
    try {
      const j = await (await fetch('/api/id-cards/designs')).json();
      if (j.success) setDesigns(j.designs);
    } catch { /* table may not be migrated yet */ }
  }, []);

  useEffect(() => {
    loadList();
    (async () => {
      try {
        const j = await (await fetch('/api/id-cards/designs?active=1')).json();
        if (j.success && j.design) {
          setSpec(j.design.spec); setName(j.design.name); setDesignId(j.design.id); setSourceKind(j.design.sourceKind);
        }
      } catch { /* keep starter */ }
    })();
  }, [loadList]);

  const open = async (id: number) => {
    const j = await (await fetch(`/api/id-cards/designs/${id}`)).json();
    if (j.success && j.design) {
      setSpec(j.design.spec); setName(j.design.name); setDesignId(j.design.id); setSourceKind(j.design.sourceKind); setDirty(false);
    } else showToast('error', j.error || 'Could not open design');
  };

  const save = async (asNew: boolean, setActive: boolean) => {
    setSaving(true);
    try {
      const body = JSON.stringify({ name, spec, sourceKind, setActive });
      const res = designId && !asNew
        ? await fetch(`/api/id-cards/designs/${designId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/id-cards/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const j = await res.json();
      if (!res.ok || !j.success) { showToast('error', j.error || 'Save failed'); return; }
      if (j.id) setDesignId(j.id);
      setDirty(false);
      showToast('success', setActive ? 'Saved and set as the active design' : 'Design saved');
      loadList();
    } catch { showToast('error', 'Save failed'); }
    finally { setSaving(false); }
  };

  const fromLegacy = async () => {
    try {
      const j = await (await fetch('/api/id-card-templates')).json();
      setSpec(specFromLegacyConfig(j.config ?? {}));
      setName('From legacy design'); setDesignId(null); setSourceKind('legacy'); setDirty(true);
    } catch { showToast('error', 'Could not read the legacy design'); }
  };

  const change = (s: IdCardSpec) => { setSpec(s); setDirty(true); };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 text-gray-900 dark:text-gray-100">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <Fingerprint className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h1 className="text-lg font-bold m-0">ID Card Studio</h1>
        <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800">
          {isTwoSided(spec) ? 'Two-sided design' : 'Single-sided design'}
        </span>
        <span className="flex-1" />
        <Link href="/students/id-cards" className="inline-flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
          Classic single-sided designer <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        <TabButton on={tab === 'design'} onClick={() => setTab('design')}>1. Design</TabButton>
        <TabButton on={tab === 'generate'} onClick={() => setTab('generate')}>2. Generate & print</TabButton>
      </div>

      {tab === 'design' && (
        <>
          <div className="flex gap-2 items-center flex-wrap mb-3.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className={`${fieldCls} w-56`} placeholder="Design name" />
            <button className={primaryCls} disabled={saving} onClick={() => save(false, false)}>
              <Save className="w-3.5 h-3.5 inline mr-1" />{designId ? 'Save' : 'Save design'}
            </button>
            <button className={btnCls} disabled={saving} onClick={() => save(false, true)}>Save & make active</button>
            {designId && <button className={btnCls} disabled={saving} onClick={() => save(true, false)}><Copy className="w-3.5 h-3.5 inline mr-1" />Save as copy</button>}
            {dirty && <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unsaved changes</span>}
            <span className="flex-1" />
            <select className={fieldCls} value="" onChange={(e) => { if (e.target.value) open(Number(e.target.value)); }}>
              <option value="">Open saved design…</option>
              {designs.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active ? ' (active)' : ''}</option>)}
            </select>
            <button className={btnCls} onClick={() => { if (!dirty || confirm('Discard unsaved changes?')) { setSpec(starterSpec(true)); setName('New two-sided design'); setDesignId(null); setSourceKind('designed'); setDirty(false); } }}>
              <FileStack className="w-3.5 h-3.5 inline mr-1" />New two-sided
            </button>
            <button className={btnCls} onClick={() => { if (!dirty || confirm('Discard unsaved changes?')) { setSpec(starterSpec(false)); setName('New single-sided design'); setDesignId(null); setSourceKind('designed'); setDirty(false); } }}>
              <FilePlus2 className="w-3.5 h-3.5 inline mr-1" />New single-sided
            </button>
            <button className={btnCls} onClick={fromLegacy}><Layers className="w-3.5 h-3.5 inline mr-1" />Start from classic design</button>
            <select
              className={fieldCls} value="" title="Ready-made designs with your school's name, logo and details filled in automatically"
              onChange={(e) => {
                const t = ID_CARD_TEMPLATES.find((x) => x.id === e.target.value);
                if (!t) return;
                if (dirty && !confirm('Discard unsaved changes?')) return;
                setSpec(cloneSpec(t.spec)); setName(t.name); setDesignId(null); setSourceKind('imported'); setDirty(true);
              }}
            >
              <option value="">Start from a template…</option>
              {ID_CARD_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <IdCardDesigner
            spec={spec} onChange={(s) => { change(s); if (sourceKind === 'designed' && s.front.backgroundImage) setSourceKind('imported'); }}
            previewRecord={sample} logoUrl={logoUrl} extraTokens={extraTokens}
          />
        </>
      )}

      {tab === 'generate' && (
        <IdCardGenerate
          spec={spec} schoolName={schoolName} logoUrl={logoUrl} onExcelHeaders={setExtraTokens}
          schoolInfo={{ address: school?.address, phone: school?.phone, email: school?.email }}
        />
      )}
    </div>
  );
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
        on
          ? 'bg-gray-900 dark:bg-indigo-600 text-white border-gray-900 dark:border-indigo-600'
          : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

const fieldCls = 'border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 text-sm';
const btnCls = 'border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer text-sm disabled:opacity-50';
const primaryCls = `${btnCls} bg-indigo-600 dark:bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 dark:hover:bg-indigo-500`;
