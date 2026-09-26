'use client';
/**
 * /students/id-cards/studio — two-sided ID card designs, artwork import and
 * Excel-based card generation. The original single-sided designer at
 * /students/id-cards is unchanged and keeps working.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { IdCardDesigner } from '@/components/idcards/IdCardDesigner';
import { IdCardGenerate } from '@/components/idcards/IdCardGenerate';
import { starterSpec, specFromLegacyConfig, isTwoSided, type IdCardSpec, type CardRecord, type SourceKind } from '@/lib/idcards/spec';
import { ID_CARD_TEMPLATES, cloneSpec } from '@/lib/idcards/templates';
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
    class: 'Senior 4 Arts', gender: 'Female', dob: '15 Mar 2009', photo_url: '', school: schoolName || 'Your School Name',
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
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: 16, color: '#0f172a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>ID Card Studio</h1>
        <span style={{ fontSize: 12, color: '#64748b' }}>{isTwoSided(spec) ? 'Two-sided design' : 'Single-sided design'}</span>
        <span style={{ flex: 1 }} />
        <Link href="/students/id-cards" style={{ fontSize: 13, color: '#1d4ed8' }}>Classic single-sided designer →</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button style={tabStyle(tab === 'design')} onClick={() => setTab('design')}>1. Design</button>
        <button style={tabStyle(tab === 'generate')} onClick={() => setTab('generate')}>2. Generate & print</button>
      </div>

      {tab === 'design' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} style={{ ...field, width: 220 }} placeholder="Design name" />
            <button style={primary} disabled={saving} onClick={() => save(false, false)}>{designId ? 'Save' : 'Save design'}</button>
            <button style={btn} disabled={saving} onClick={() => save(false, true)}>Save & make active</button>
            {designId && <button style={btn} disabled={saving} onClick={() => save(true, false)}>Save as copy</button>}
            {dirty && <span style={{ fontSize: 12, color: '#b45309' }}>Unsaved changes</span>}
            <span style={{ flex: 1 }} />
            <select style={field} value="" onChange={(e) => { if (e.target.value) open(Number(e.target.value)); }}>
              <option value="">Open saved design…</option>
              {designs.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active ? ' (active)' : ''}</option>)}
            </select>
            <button style={btn} onClick={() => { if (!dirty || confirm('Discard unsaved changes?')) { setSpec(starterSpec(true)); setName('New two-sided design'); setDesignId(null); setSourceKind('designed'); setDirty(false); } }}>New two-sided</button>
            <button style={btn} onClick={() => { if (!dirty || confirm('Discard unsaved changes?')) { setSpec(starterSpec(false)); setName('New single-sided design'); setDesignId(null); setSourceKind('designed'); setDirty(false); } }}>New single-sided</button>
            <button style={btn} onClick={fromLegacy}>Start from classic design</button>
            <select
              style={field} value="" title="Ready-made designs with your school's name, logo and details filled in automatically"
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

const field: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', background: '#fff', color: '#0f172a', fontSize: 13 };
const btn: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 12px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontSize: 13 };
const primary: React.CSSProperties = { ...btn, background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' };
const tabStyle = (on: boolean): React.CSSProperties => ({ ...btn, background: on ? '#0f172a' : '#fff', color: on ? '#fff' : '#0f172a', borderColor: on ? '#0f172a' : '#cbd5e1', fontWeight: 600 });
