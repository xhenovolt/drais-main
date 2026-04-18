'use client';
/**
 * /students/id-cards — ID Card Design & Preview System
 *
 * LEFT:  Customisation controls (colors, typography, field toggles, images)
 * RIGHT: Live preview — updates instantly on every config change
 *
 * ALSO: bulk-select learners → open /students/id-cards/print
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Palette, Type, LayoutTemplate, Image as ImageIcon, Save,
  Loader2, Check, ChevronDown, ChevronUp, Printer, Users,
  X, Search, CheckSquare, Square, Sliders, RefreshCw,
  Eye, ArrowLeft,
} from 'lucide-react';
import { IDCardPreview, IDCardStudent, IDCardMeta } from '@/components/students/IDCardPreview';
import { IDCardConfig, DEFAULT_ID_CARD_CONFIG } from '@/lib/idCardConfig';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { showToast } from '@/lib/toast';

// ─── Demo student (used when no real student is selected for preview) ─────────
const DEMO_STUDENT: IDCardStudent = {
  id: 0,
  first_name: 'Namatovu',
  last_name: 'Sarah',
  other_name: 'B.',
  admission_no: 'ADM/2026/0042',
  class_name: 'Senior 4',
  stream_name: 'Arts',
  gender: 'female',
  date_of_birth: '2009-03-15',
  photo_url: '',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Section { key: string; label: string; icon: React.ReactNode; open: boolean; }

// ─── Helper colours used by the control panel ────────────────────────────────
const presetPalettes: { label: string; bgColor: string; accentColor: string; textColor: string; footerBgColor: string }[] = [
  { label: 'Navy & Gold',    bgColor: '#1a3a6b', accentColor: '#d4a017', textColor: '#ffffff', footerBgColor: '#0e2447' },
  { label: 'Forest & Cream', bgColor: '#1b4332', accentColor: '#ffd60a', textColor: '#f1f1e6', footerBgColor: '#0d2b22' },
  { label: 'Maroon & White', bgColor: '#6d0e21', accentColor: '#ffffff', textColor: '#ffffff', footerBgColor: '#4a091a' },
  { label: 'Midnight Blue',  bgColor: '#0a0f2c', accentColor: '#4a9eff', textColor: '#e8f0fe', footerBgColor: '#05071a' },
  { label: 'Teal & Silver',  bgColor: '#066b6b', accentColor: '#c0c0c0', textColor: '#f0fafa', footerBgColor: '#034343' },
  { label: 'Dark Purple',    bgColor: '#2d1b69', accentColor: '#f0c040', textColor: '#f5f0ff', footerBgColor: '#1a0f3a' },
  { label: 'Slate & Amber',  bgColor: '#334155', accentColor: '#f59e0b', textColor: '#f8fafc', footerBgColor: '#1e293b' },
  { label: 'Classic Black',  bgColor: '#1a1a1a', accentColor: '#e5c46c', textColor: '#ffffff', footerBgColor: '#000000' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function IDCardsPage() {
  const { school, isLoading: schoolLoading } = useSchoolConfig();

  const [config, setConfig]             = useState<IDCardConfig>(DEFAULT_ID_CARD_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [templateId, setTemplateId]     = useState<number | null>(null);

  // Learner selection for bulk print
  const [learners, setLearners]         = useState<IDCardStudent[]>([]);
  const [learnersLoading, setLearnersLoading] = useState(true);
  const [learnersError, setLearnersError] = useState('');
  const [search, setSearch]             = useState('');
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set());
  const [previewStudent, setPreviewStudent] = useState<IDCardStudent>(DEMO_STUDENT);

  // Panel sections collapsed state
  const [sections, setSections] = useState<Section[]>([
    { key: 'palette',  label: 'Colours',    icon: <Palette className="w-4 h-4" />,        open: true  },
    { key: 'typo',     label: 'Typography', icon: <Type className="w-4 h-4" />,            open: false },
    { key: 'layout',   label: 'Fields',     icon: <LayoutTemplate className="w-4 h-4" />,  open: true  },
    { key: 'images',   label: 'Images',     icon: <ImageIcon className="w-4 h-4" />,       open: false },
  ]);

  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Load saved template ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/id-card-templates');
        const json = await res.json();
        if (json.success && json.config) {
          setConfig(json.config);
          setTemplateId(json.id);
        }
      } catch {}
      setConfigLoading(false);
    })();
  }, []);

  // ── Load learners ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/students/enrolled?status=active');
        const json = await res.json();
        const rows: IDCardStudent[] = ((json.students || json.data || json.enrolled || []) as any[])
          .map((s: any) => ({
            id:             s.id,
            first_name:     s.first_name  || '',
            last_name:      s.last_name   || '',
            other_name:     s.other_name  || '',
            admission_no:   s.admission_no || '',
            class_name:     s.class_name  || '',
            stream_name:    s.stream_name || '',
            gender:         s.gender      || '',
            date_of_birth:  s.date_of_birth || '',
            photo_url:      s.photo_url   || '',
          }));
        setLearners(rows);
        if (rows.length > 0) setPreviewStudent(rows[0]);
      } catch (e: any) {
        setLearnersError('Could not load learners');
      }
      setLearnersLoading(false);
    })();
  }, []);

  // ── Config helpers ─────────────────────────────────────────────────────────
  const set = useCallback(<K extends keyof IDCardConfig>(key: K, value: IDCardConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const applyPalette = (p: typeof presetPalettes[0]) => {
    setConfig(prev => ({
      ...prev,
      bgColor:       p.bgColor,
      accentColor:   p.accentColor,
      textColor:     p.textColor,
      footerBgColor: p.footerBgColor,
    }));
    setSaved(false);
  };

  const toggleSection = (key: string) =>
    setSections(s => s.map(sec => sec.key === key ? { ...sec, open: !sec.open } : sec));

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/id-card-templates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: 'Default', config }),
      });
      const json = await res.json();
      if (json.success) {
        setTemplateId(json.id);
        setSaved(true);
        showToast('success', 'Template saved');
        setTimeout(() => setSaved(false), 2500);
      } else {
        showToast('error', json.error || 'Save failed');
      }
    } catch {
      showToast('error', 'Save failed');
    }
    setSaving(false);
  };

  // ── Logo upload ────────────────────────────────────────────────────────────
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { if (ev.target?.result) set('schoolLogoUrl', ev.target.result as string); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Learner selection ──────────────────────────────────────────────────────
  const filteredLearners = learners.filter(l =>
    search.trim()
      ? `${l.first_name} ${l.last_name} ${l.admission_no}`.toLowerCase().includes(search.toLowerCase())
      : true
  );

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const s = new Set(prev); if (s.has(id)) { s.delete(id); } else { s.add(id); } return s; });

  const selectAll   = () => setSelectedIds(new Set(filteredLearners.map(l => l.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // Store config + selected IDs in sessionStorage so print page can read them
  const openPrint = () => {
    const ids = selectedIds.size > 0
      ? Array.from(selectedIds)
      : filteredLearners.map(l => l.id);
    sessionStorage.setItem('id_card_config',   JSON.stringify(config));
    sessionStorage.setItem('id_card_ids',       JSON.stringify(ids));
    sessionStorage.setItem('id_card_learners',  JSON.stringify(learners));
    sessionStorage.setItem('id_card_meta',      JSON.stringify({
      schoolName:  school.name,
      schoolLogo:  school.logo,
      academicYear: '',
    }));
    window.open('/students/id-cards/print', '_blank');
  };

  // ── Meta for preview ───────────────────────────────────────────────────────
  const resolvedMeta: IDCardMeta = {
    schoolName:  school.name,
    schoolLogo:  config.schoolLogoUrl || school.logo,
    academicYear: '',
  };

  if (configLoading || schoolLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 min-h-0 overflow-hidden">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/students/list" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
            <LayoutTemplate className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">ID Card Designer</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">Design · Preview · Print</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setConfig(DEFAULT_ID_CARD_CONFIG); setSaved(false); }}
            title="Reset to default"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
          <button
            onClick={openPrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print {selectedIds.size > 0 ? selectedIds.size : filteredLearners.length}
          </button>
        </div>
      </header>

      {/* ── Main 3-column layout ─────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ══ LEFT: Controls ═══════════════════════════════════════════════ */}
        <aside className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto flex flex-col">
          <div className="p-4 space-y-2">

            {sections.map(sec => (
              <div key={sec.key} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection(sec.key)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-750 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <span className="flex items-center gap-2">{sec.icon} {sec.label}</span>
                  {sec.open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {sec.open && (
                  <div className="p-4 space-y-3 text-sm">

                    {/* ── COLOURS ─────────────────────────────────────── */}
                    {sec.key === 'palette' && (
                      <>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Presets</p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {presetPalettes.map(p => (
                              <button
                                key={p.label}
                                title={p.label}
                                onClick={() => applyPalette(p)}
                                className="h-7 rounded-lg border-2 border-transparent hover:border-indigo-400 transition-all overflow-hidden shadow-sm"
                                style={{ background: `linear-gradient(135deg, ${p.bgColor} 60%, ${p.accentColor})` }}
                              />
                            ))}
                          </div>
                        </div>

                        <ColorRow label="Background" value={config.bgColor}       onChange={v => set('bgColor', v)} />
                        <ColorRow label="Accent"     value={config.accentColor}    onChange={v => set('accentColor', v)} />
                        <ColorRow label="Text"       value={config.textColor}      onChange={v => set('textColor', v)} />
                        <ColorRow label="Label"      value={config.labelColor}     onChange={v => set('labelColor', v)} />
                        <ColorRow label="Footer Bg"  value={config.footerBgColor}  onChange={v => set('footerBgColor', v)} />
                        <ColorRow label="Footer Text" value={config.footerTextColor} onChange={v => set('footerTextColor', v)} />

                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Corner Radius</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min={0} max={24} step={1}
                              value={config.borderRadius}
                              onChange={e => set('borderRadius', Number(e.target.value))}
                              className="flex-1"
                            />
                            <span className="text-xs text-slate-500 w-8 text-right">{config.borderRadius}px</span>
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── TYPOGRAPHY ───────────────────────────────────── */}
                    {sec.key === 'typo' && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Base Font Size</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range" min={8} max={16} step={1}
                              value={config.fontSize}
                              onChange={e => set('fontSize', Number(e.target.value))}
                              className="flex-1"
                            />
                            <span className="text-xs text-slate-500 w-8 text-right">{config.fontSize}px</span>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Font Weight</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {['400', '500', '600', '700'].map(w => (
                              <button
                                key={w}
                                onClick={() => set('fontWeight', w)}
                                className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                                  config.fontWeight === w
                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold'
                                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                                style={{ fontWeight: w }}
                              >
                                {w}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── FIELDS ───────────────────────────────────────── */}
                    {sec.key === 'layout' && (
                      <>
                        <ToggleRow label="Date of Birth"   checked={config.showDob}          onChange={v => set('showDob', v)} />
                        <ToggleRow label="Gender"          checked={config.showGender}        onChange={v => set('showGender', v)} />
                        <ToggleRow label="Class"           checked={config.showClass}         onChange={v => set('showClass', v)} />
                        <ToggleRow label="Admission No."   checked={config.showAdmissionNo}   onChange={v => set('showAdmissionNo', v)} />
                        <ToggleRow label="Signature Line"  checked={config.showSignatureLine} onChange={v => set('showSignatureLine', v)} />
                        <ToggleRow label="Footer"          checked={config.showFooter}        onChange={v => set('showFooter', v)} />

                        {config.showFooter && (
                          <div>
                            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">Footer Text</label>
                            <input
                              type="text"
                              value={config.footerText}
                              onChange={e => set('footerText', e.target.value)}
                              placeholder="Property of {schoolName}"
                              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                            <p className="text-[10px] text-slate-400 mt-0.5">{'{schoolName}'} is replaced with the school name.</p>
                          </div>
                        )}
                      </>
                    )}

                    {/* ── IMAGES ───────────────────────────────────────── */}
                    {sec.key === 'images' && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block mb-1">School Logo Override</label>
                          <p className="text-[10px] text-slate-400 mb-2">
                            Leave blank to use the logo from School Config.
                          </p>
                          <div className="flex items-center gap-2">
                            {config.schoolLogoUrl && (
                              <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 dark:border-slate-600 flex-shrink-0">
                                <img src={config.schoolLogoUrl} alt="" className="w-full h-full object-cover" />
                              </div>
                            )}
                            <button
                              onClick={() => logoInputRef.current?.click()}
                              className="flex-1 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg py-2 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-center"
                            >
                              {config.schoolLogoUrl ? 'Replace logo' : 'Upload logo'}
                            </button>
                            {config.schoolLogoUrl && (
                              <button
                                onClick={() => set('schoolLogoUrl', '')}
                                className="p-1 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoUpload}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ══ CENTER: Live Preview ══════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col items-center justify-start gap-6 p-8 overflow-y-auto bg-slate-100 dark:bg-slate-900">
          {/* Preview label */}
          <div className="flex items-center gap-2 self-stretch">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Live Preview</span>
            {previewStudent.id !== 0 && (
              <span className="text-xs text-slate-400">
                — {previewStudent.first_name} {previewStudent.last_name}
              </span>
            )}
          </div>

          {/* ID card — front */}
          <div className="flex flex-col items-center gap-3">
            <div
              style={{
                /* Scale up the 85.6mm card for screens */
                transform:       'scale(1.9)',
                transformOrigin: 'top center',
                marginBottom: '100px',
              }}
            >
              <IDCardPreview
                student={previewStudent}
                meta={resolvedMeta}
                config={config}
              />
            </div>

            <p className="text-[10px] text-slate-400 mt-1 text-center">
              Actual print size: 85.6 × 54 mm (credit card)
            </p>
          </div>
        </main>

        {/* ══ RIGHT: Learner selector ═══════════════════════════════════════ */}
        <aside className="w-72 flex-shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <Users className="w-4 h-4 text-indigo-500" />
              Learners
              <span className="text-xs font-normal text-slate-400">({filteredLearners.length})</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={selectedIds.size === filteredLearners.length ? deselectAll : selectAll}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {selectedIds.size === filteredLearners.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search learners…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {learnersLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            )}
            {learnersError && (
              <p className="text-xs text-red-500 px-4 py-3">{learnersError}</p>
            )}
            {!learnersLoading && !learnersError && filteredLearners.length === 0 && (
              <p className="text-xs text-slate-400 px-4 py-3 italic">No learners found</p>
            )}
            {filteredLearners.map(learner => {
              const selected   = selectedIds.has(learner.id);
              const isPreviewed = previewStudent.id === learner.id;
              return (
                <div
                  key={learner.id}
                  className={`flex items-center gap-2.5 px-3 py-2 border-b border-slate-100 dark:border-slate-700/50 cursor-pointer transition-colors ${
                    isPreviewed
                      ? 'bg-indigo-50 dark:bg-indigo-900/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                  onClick={() => setPreviewStudent(learner)}
                >
                  {/* Select checkbox */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleSelect(learner.id); }}
                    className="flex-shrink-0"
                  >
                    {selected
                      ? <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      : <Square      className="w-4 h-4 text-slate-300 dark:text-slate-600" />}
                  </button>

                  {/* Avatar */}
                  {learner.photo_url
                    ? <img src={learner.photo_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200 dark:ring-slate-600" />
                    : <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">
                          {learner.first_name[0]}{learner.last_name[0]}
                        </span>
                      </div>
                  }

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${isPreviewed ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                      {learner.first_name} {learner.last_name}
                    </p>
                    {learner.class_name && (
                      <p className="text-[10px] text-slate-400 truncate">{learner.class_name}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom action */}
          {selectedIds.size > 0 && (
            <div className="flex-shrink-0 px-3 py-2.5 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={openPrint}
                className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print {selectedIds.size} card{selectedIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Mini controls ────────────────────────────────────────────────────────────

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-slate-600 dark:text-slate-400 flex-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-600 p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
          className="w-20 border border-slate-200 dark:border-slate-600 rounded-md px-1.5 py-1 text-xs font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between py-1.5 px-0 group"
    >
      <span className="text-xs text-slate-700 dark:text-slate-300">{label}</span>
      <div className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}
