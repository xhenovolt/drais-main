"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import { showToast } from '@/lib/toast';
import {
  Save, Loader2, ArrowLeft, Eye, GripVertical, ChevronDown, ChevronRight,
  EyeOff, Type, Palette as PaletteIcon, AlignLeft, AlignCenter, AlignRight,
  Square, Circle, Minus, Bold
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReportLayoutJSON, SectionConfig } from '@/lib/reportTemplates';
import { DEFAULT_SECTIONS, SECTION_REGISTRY } from '@/lib/reportTemplates';
import Link from 'next/link';

// ─── Sortable Section Item ──────────────────────────────────────────────────
function SortableSection({
  section,
  isOpen,
  onToggle,
  onVisibilityToggle,
  children,
}: {
  section: SectionConfig;
  isOpen: boolean;
  onToggle: () => void;
  onVisibilityToggle: () => void;
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
          <GripVertical className="w-4 h-4" />
        </button>
        <button onClick={onVisibilityToggle} className={`p-1 rounded ${section.visible ? 'text-green-600' : 'text-gray-400'}`}>
          {section.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 text-left">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{section.label}</span>
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
        </button>
      </div>
      {isOpen && children && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Control Helpers ────────────────────────────────────────────────────────
function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{label}</label>
      <div className="flex items-center gap-1.5 flex-1">
        <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded border border-gray-200 dark:border-gray-600 cursor-pointer" />
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} className="flex-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs" />
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{label}</label>
      <input type="number" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} min={min} max={max} step={step || 1} className="flex-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs" />
    </div>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="flex-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">Align</label>
      <div className="flex gap-1">
        {[{ v: 'left', I: AlignLeft }, { v: 'center', I: AlignCenter }, { v: 'right', I: AlignRight }].map(({ v, I }) => (
          <button key={v} onClick={() => onChange(v)} className={`p-1.5 rounded ${value === v ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <I className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Editor ────────────────────────────────────────────────────────────
export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;
  const isNew = templateId === 'new';

  const { data, isLoading } = useSWR(
    isNew ? null : `/api/report-templates/${templateId}`,
    swrFetcher
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [layout, setLayout] = useState<ReportLayoutJSON | null>(null);
  const [sections, setSections] = useState<SectionConfig[]>(DEFAULT_SECTIONS);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Load template data
  useEffect(() => {
    if (isNew) {
      // Import default template for new
      import('@/lib/reportTemplates').then(m => {
        setLayout(JSON.parse(JSON.stringify(m.DEFAULT_TEMPLATE_JSON)));
        setName('New Template');
        setDescription('');
        setSections(m.DEFAULT_SECTIONS);
      });
    } else if (data?.template) {
      const t = data.template;
      setName(t.name);
      setDescription(t.description || '');
      const lj = typeof t.layout_json === 'string' ? JSON.parse(t.layout_json) : t.layout_json;
      setLayout(lj);
      setSections(lj.sections || DEFAULT_SECTIONS);
    }
  }, [data, isNew]);

  // Deep update helper
  const updateLayout = useCallback((path: string, value: any) => {
    setLayout(prev => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  }, []);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setSections(prev => {
        const oldIndex = prev.findIndex(s => s.id === active.id);
        const newIndex = prev.findIndex(s => s.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const toggleVisibility = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  };

  const handleSave = async () => {
    if (!layout || !name.trim()) {
      showToast('error', 'Template name is required');
      return;
    }
    setSaving(true);
    try {
      const finalLayout = { ...layout, sections };
      const payload = {
        name: name.trim(),
        description: description.trim(),
        layout_json: finalLayout,
      };

      const url = isNew ? '/api/report-templates' : `/api/report-templates/${templateId}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Save failed');
      showToast('success', isNew ? 'Template created' : 'Template saved');
      if (isNew && result.id) {
        router.push(`/settings/templates/${result.id}/edit`);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !layout) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ─── Section Controls Mapping ─────────────────────────────────────────────
  const sectionControls: Record<string, React.ReactNode> = {
    header: (
      <div className="space-y-2">
        <SelectInput label="Layout" value={layout.header.layout} onChange={v => updateLayout('header.layout', v)} options={[
          { label: 'Three Column', value: 'three-column' },
          { label: 'Centered', value: 'centered' },
          { label: 'Left Logo', value: 'left-logo' },
        ]} />
        <NumberInput label="Padding Bottom" value={layout.header.paddingBottom} onChange={v => updateLayout('header.paddingBottom', v)} min={0} max={50} />
        <NumberInput label="Opacity" value={layout.header.opacity} onChange={v => updateLayout('header.opacity', v)} min={0} max={1} step={0.1} />
      </div>
    ),
    banner: (
      <div className="space-y-2">
        <ColorInput label="Background" value={layout.banner.backgroundColor} onChange={v => updateLayout('banner.backgroundColor', v)} />
        <ColorInput label="Text Color" value={layout.banner.color} onChange={v => updateLayout('banner.color', v)} />
        <NumberInput label="Font Size" value={layout.banner.fontSize} onChange={v => updateLayout('banner.fontSize', v)} min={10} max={30} />
        <SelectInput label="Font Weight" value={layout.banner.fontWeight} onChange={v => updateLayout('banner.fontWeight', v)} options={[
          { label: 'Normal', value: '400' }, { label: 'Semi-Bold', value: '600' }, { label: 'Bold', value: '700' }, { label: 'Extra Bold', value: '900' },
        ]} />
        <AlignButtons value={layout.banner.textAlign} onChange={v => updateLayout('banner.textAlign', v)} />
        <NumberInput label="Border Radius" value={layout.banner.borderRadius} onChange={v => updateLayout('banner.borderRadius', v)} min={0} max={20} />
        <SelectInput label="Text Transform" value={layout.banner.textTransform} onChange={v => updateLayout('banner.textTransform', v)} options={[
          { label: 'Uppercase', value: 'uppercase' }, { label: 'Capitalize', value: 'capitalize' }, { label: 'None', value: 'none' },
        ]} />
      </div>
    ),
    student_info: (
      <div className="space-y-2">
        <ColorInput label="Background" value={layout.studentInfoBox.background} onChange={v => updateLayout('studentInfoBox.background', v)} />
        <NumberInput label="Border Radius" value={layout.studentInfoBox.borderRadius} onChange={v => updateLayout('studentInfoBox.borderRadius', v)} min={0} max={20} />
        <NumberInput label="Font Size" value={layout.studentInfoContainer.fontSize} onChange={v => updateLayout('studentInfoContainer.fontSize', v)} min={10} max={20} />
        <SelectInput label="Direction" value={layout.studentInfoContainer.flexDirection} onChange={v => updateLayout('studentInfoContainer.flexDirection', v)} options={[
          { label: 'Row', value: 'row' }, { label: 'Column', value: 'column' },
        ]} />
        <ColorInput label="Value Color" value={layout.studentValue.color} onChange={v => updateLayout('studentValue.color', v)} />
        <SelectInput label="Value Weight" value={layout.studentValue.fontWeight} onChange={v => updateLayout('studentValue.fontWeight', v)} options={[
          { label: 'Normal', value: 'normal' }, { label: 'Semi-Bold', value: '600' }, { label: 'Bold', value: 'bold' },
        ]} />
      </div>
    ),
    ribbon: (
      <div className="space-y-2">
        <ColorInput label="Background" value={layout.ribbon.background} onChange={v => updateLayout('ribbon.background', v)} />
        <ColorInput label="Text Color" value={layout.ribbon.color} onChange={v => updateLayout('ribbon.color', v)} />
        <NumberInput label="Font Size" value={layout.ribbon.fontSize} onChange={v => updateLayout('ribbon.fontSize', v)} min={10} max={24} />
        <SelectInput label="Font Weight" value={layout.ribbon.fontWeight} onChange={v => updateLayout('ribbon.fontWeight', v)} options={[
          { label: 'Normal', value: '400' }, { label: 'Semi-Bold', value: '600' }, { label: 'Bold', value: '700' },
        ]} />
        <AlignButtons value={layout.ribbon.textAlign} onChange={v => updateLayout('ribbon.textAlign', v)} />
        <NumberInput label="Border Radius" value={layout.ribbon.borderRadius} onChange={v => updateLayout('ribbon.borderRadius', v)} min={0} max={30} />
      </div>
    ),
    results_table: (
      <div className="space-y-2">
        <NumberInput label="Font Size" value={layout.table.fontSize} onChange={v => updateLayout('table.fontSize', v)} min={8} max={18} />
        <ColorInput label="Header BG" value={layout.table.th.background} onChange={v => updateLayout('table.th.background', v)} />
        <ColorInput label="Header Color" value={layout.table.th.color} onChange={v => updateLayout('table.th.color', v)} />
        <NumberInput label="Header Padding" value={layout.table.th.padding} onChange={v => updateLayout('table.th.padding', v)} min={2} max={16} />
        <ColorInput label="Cell Border" value={layout.table.td.border.replace(/[^#a-fA-F0-9]/g, '').slice(0, 7) || '#000000'} onChange={v => updateLayout('table.td.border', `1px solid ${v}`)} />
        <ColorInput label="Cell Color" value={layout.table.td.color} onChange={v => updateLayout('table.td.color', v)} />
        <NumberInput label="Cell Padding" value={layout.table.td.padding} onChange={v => updateLayout('table.td.padding', v)} min={2} max={16} />
        <AlignButtons value={layout.table.th.textAlign} onChange={v => { updateLayout('table.th.textAlign', v); updateLayout('table.td.textAlign', v); }} />
      </div>
    ),
    assessment: (
      <div className="space-y-2">
        <NumberInput label="Border Radius" value={layout.assessmentBox.borderRadius} onChange={v => updateLayout('assessmentBox.borderRadius', v)} min={0} max={20} />
      </div>
    ),
    comments: (
      <div className="space-y-2">
        <ColorInput label="Ribbon BG" value={layout.comments.ribbon.background} onChange={v => updateLayout('comments.ribbon.background', v)} />
        <ColorInput label="Ribbon Color" value={layout.comments.ribbon.color} onChange={v => updateLayout('comments.ribbon.color', v)} />
        <ColorInput label="Text Color" value={layout.comments.text.color} onChange={v => updateLayout('comments.text.color', v)} />
      </div>
    ),
    grade_table: (
      <div className="space-y-2">
        <ColorInput label="Header BG" value={layout.gradeTable.th.background} onChange={v => updateLayout('gradeTable.th.background', v)} />
        <NumberInput label="Header Padding" value={layout.gradeTable.th.padding} onChange={v => updateLayout('gradeTable.th.padding', v)} min={2} max={16} />
        <NumberInput label="Cell Padding" value={layout.gradeTable.td.padding} onChange={v => updateLayout('gradeTable.td.padding', v)} min={2} max={16} />
      </div>
    ),
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 h-14 flex items-center gap-3 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <Link href="/settings/templates" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </Link>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="text-lg font-semibold bg-transparent border-none focus:outline-none text-gray-900 dark:text-white flex-1 min-w-0"
          placeholder="Template Name"
        />
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            showPreview ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Preview
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-semibold"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>

      {/* Main body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Section list + controls */}
        <div className="w-80 flex-shrink-0 overflow-y-auto bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 p-3 space-y-2">
          {/* Description */}
          <div className="mb-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full mt-1 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs" placeholder="Template description" />
          </div>

          {/* Page-level settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Page</h3>
            <NumberInput label="Font Size" value={layout.page.fontSize} onChange={v => updateLayout('page.fontSize', v)} min={10} max={20} />
            <SelectInput label="Font Family" value={layout.page.fontFamily} onChange={v => updateLayout('page.fontFamily', v)} options={[
              { label: 'Segoe UI', value: 'Segoe UI, sans-serif' },
              { label: 'Inter', value: 'Inter, sans-serif' },
              { label: 'Arial', value: 'Arial, sans-serif' },
              { label: 'Times New Roman', value: 'Times New Roman, serif' },
            ]} />
            <ColorInput label="Background" value={layout.page.background} onChange={v => updateLayout('page.background', v)} />
            <NumberInput label="Border Radius" value={layout.page.borderRadius} onChange={v => updateLayout('page.borderRadius', v)} min={0} max={24} />
          </div>

          {/* Page Border */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Page Border</h3>
              <button
                onClick={() => updateLayout('pageBorder.enabled', !layout.pageBorder.enabled)}
                className={`relative w-9 h-5 rounded-full transition-colors ${layout.pageBorder.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${layout.pageBorder.enabled ? 'translate-x-4' : ''}`} />
              </button>
            </div>
            {layout.pageBorder.enabled && (
              <>
                <ColorInput label="Color" value={layout.pageBorder.color} onChange={v => updateLayout('pageBorder.color', v)} />
                <NumberInput label="Width" value={layout.pageBorder.width} onChange={v => updateLayout('pageBorder.width', v)} min={1} max={8} />
                <SelectInput label="Style" value={layout.pageBorder.style} onChange={v => updateLayout('pageBorder.style', v)} options={[
                  { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' }, { label: 'Double', value: 'double' }, { label: 'None', value: 'none' },
                ]} />
                <NumberInput label="Radius" value={layout.pageBorder.radius} onChange={v => updateLayout('pageBorder.radius', v)} min={0} max={24} />
              </>
            )}
          </div>

          {/* Sections drag/drop */}
          <div className="mt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Sections</h3>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {sections.map(section => (
                    <SortableSection
                      key={section.id}
                      section={section}
                      isOpen={openSection === section.id}
                      onToggle={() => setOpenSection(openSection === section.id ? null : section.id)}
                      onVisibilityToggle={() => toggleVisibility(section.id)}
                    >
                      {sectionControls[section.type]}
                    </SortableSection>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Right panel: Preview */}
        <div className="flex-1 overflow-y-auto bg-gray-200 dark:bg-gray-900 p-8 flex justify-center">
          {showPreview ? (
            <div
              className="bg-white shadow-xl"
              style={{
                maxWidth: layout.page.maxWidth,
                width: '100%',
                padding: layout.page.padding,
                borderRadius: layout.page.borderRadius,
                fontFamily: layout.page.fontFamily,
                fontSize: layout.page.fontSize,
                background: layout.page.background,
                border: layout.pageBorder.enabled
                  ? `${layout.pageBorder.width}px ${layout.pageBorder.style} ${layout.pageBorder.color}`
                  : 'none',
              }}
            >
              {sections.filter(s => s.visible).map(section => (
                <div key={section.id} className="mb-4">
                  {section.type === 'header' && (
                    <div style={{ paddingBottom: layout.header.paddingBottom, borderBottom: layout.header.borderBottom, opacity: layout.header.opacity }} className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">Logo</div>
                      <div className="flex-1 text-center">
                        <div className="text-lg font-bold">School Name</div>
                        <div className="text-xs text-gray-500">Address • Phone</div>
                      </div>
                      <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-400">Badge</div>
                    </div>
                  )}
                  {section.type === 'banner' && (
                    <div style={{
                      backgroundColor: layout.banner.backgroundColor,
                      color: layout.banner.color,
                      textAlign: layout.banner.textAlign as any,
                      fontSize: layout.banner.fontSize,
                      fontWeight: layout.banner.fontWeight,
                      padding: layout.banner.padding,
                      borderRadius: layout.banner.borderRadius,
                      letterSpacing: layout.banner.letterSpacing,
                      textTransform: layout.banner.textTransform as any,
                      marginTop: layout.banner.marginTop,
                      marginBottom: layout.banner.marginBottom,
                    }}>
                      END OF TERM REPORT CARD
                    </div>
                  )}
                  {section.type === 'student_info' && (
                    <div style={{
                      background: layout.studentInfoBox.background,
                      borderRadius: layout.studentInfoBox.borderRadius,
                      padding: layout.studentInfoBox.padding,
                      border: layout.studentInfoBox.border,
                    }}>
                      <div style={{ display: 'flex', flexDirection: layout.studentInfoContainer.flexDirection as any, gap: 8, fontSize: layout.studentInfoContainer.fontSize, flexWrap: 'wrap' }}>
                        {['Name: John Doe', 'Class: P6', 'Term: 1', 'Year: 2026'].map(item => (
                          <div key={item} style={{ flex: '1 1 180px' }}>
                            <span className="text-gray-600">{item.split(':')[0]}:</span>{' '}
                            <span style={{ color: layout.studentValue.color, fontWeight: layout.studentValue.fontWeight, fontStyle: layout.studentValue.fontStyle }}>{item.split(':')[1]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {section.type === 'ribbon' && (
                    <div style={{
                      background: layout.ribbon.background,
                      color: layout.ribbon.color,
                      fontWeight: layout.ribbon.fontWeight,
                      fontSize: layout.ribbon.fontSize,
                      padding: layout.ribbon.padding,
                      borderRadius: layout.ribbon.borderRadius,
                      textAlign: layout.ribbon.textAlign as any,
                      boxShadow: layout.ribbon.boxShadow,
                    }}>
                      Academic Results
                    </div>
                  )}
                  {section.type === 'results_table' && (
                    <table style={{ width: '100%', fontSize: layout.table.fontSize, borderCollapse: layout.table.borderCollapse }}>
                      <thead>
                        <tr>
                          {['Subject', 'Score', 'Grade', 'Comment'].map(h => (
                            <th key={h} style={{
                              background: layout.table.th.background,
                              border: layout.table.th.border,
                              padding: layout.table.th.padding,
                              textAlign: layout.table.th.textAlign as any,
                              color: layout.table.th.color,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[['Mathematics', '85', 'D1', 'Excellent'], ['English', '72', 'D2', 'Very Good'], ['Science', '68', 'C3', 'Good']].map(row => (
                          <tr key={row[0]}>
                            {row.map((cell, i) => (
                              <td key={i} style={{
                                border: layout.table.td.border,
                                padding: layout.table.td.padding,
                                textAlign: layout.table.td.textAlign as any,
                                color: layout.table.td.color,
                              }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {section.type === 'comments' && (
                    <div style={{ borderTop: layout.comments.borderTop, paddingTop: layout.comments.paddingTop, marginTop: layout.comments.marginTop }}>
                      <div style={{
                        background: layout.comments.ribbon.background,
                        color: layout.comments.ribbon.color,
                        borderRadius: layout.comments.ribbon.borderRadius,
                        padding: layout.comments.ribbon.padding,
                        marginBottom: 8,
                      }}>Teacher&apos;s Comment</div>
                      <div style={{ color: layout.comments.text.color, fontStyle: layout.comments.text.fontStyle, borderBottom: layout.comments.text.borderBottom, paddingBottom: 4 }}>
                        A hardworking student with great potential.
                      </div>
                    </div>
                  )}
                  {section.type === 'grade_table' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                      <thead>
                        <tr>
                          {['Grade', 'Range', 'Interpretation'].map(h => (
                            <th key={h} style={{
                              background: layout.gradeTable.th.background,
                              border: layout.gradeTable.th.border,
                              padding: layout.gradeTable.th.padding,
                              textAlign: layout.gradeTable.th.textAlign as any,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[['D1', '90-100', 'Distinction'], ['D2', '80-89', 'Very Good'], ['C3', '70-79', 'Good']].map(r => (
                          <tr key={r[0]}>
                            {r.map((c, i) => (
                              <td key={i} style={{
                                border: layout.gradeTable.td.border,
                                padding: layout.gradeTable.td.padding,
                                textAlign: layout.gradeTable.td.textAlign as any,
                              }}>{c}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {section.type === 'assessment' && (
                    <div style={{
                      border: layout.assessmentBox.border,
                      borderRadius: layout.assessmentBox.borderRadius,
                      padding: layout.assessmentBox.padding,
                    }}>
                      <div className="text-xs text-gray-500">Assessment / Conduct: <strong>Excellent</strong></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <Eye className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Click &quot;Preview&quot; to see a live preview of your template</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
