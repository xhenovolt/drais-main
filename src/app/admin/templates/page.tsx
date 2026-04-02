'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChefHat, Eye, Check, Copy, Plus, Trash2, Paintbrush, Save, Undo2, Redo,
  LayoutTemplate, Sparkles, ArrowLeft, RefreshCw, GripVertical, ChevronDown,
  ChevronRight, EyeOff, Settings, Type, Palette, Table, BookmarkIcon,
  School, Flag, User, Award, MessageSquare, BarChart3, History,
  PanelLeftClose, PanelRightClose, Maximize2, Minimize2, X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReportTemplate, ReportLayoutJSON, SectionConfig, SectionType } from '@/lib/reportTemplates';
import { DEFAULT_SECTIONS, SECTION_REGISTRY } from '@/lib/reportTemplates';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const SECTION_ICONS: Record<SectionType, React.ReactNode> = {
  header:        <School size={14} />,
  banner:        <Flag size={14} />,
  student_info:  <User size={14} />,
  ribbon:        <BookmarkIcon size={14} />,
  results_table: <Table size={14} />,
  assessment:    <Award size={14} />,
  comments:      <MessageSquare size={14} />,
  grade_table:   <BarChart3 size={14} />,
};

const SAMPLE_STUDENT = {
  student_id: 1001, first_name: 'Fatima', last_name: 'Al-Rashidi',
  admission_no: 'ADM-2024-001', class_name: 'Primary 5', gender: 'Female',
  stream_name: 'A', photo: null, position: 3, totalInClass: 28,
  results: [
    { subject_name: 'Mathematics', midTermScore: 78, endTermScore: 82, grade: 'C3', comment: 'Very good score, but aim at excellency.', initials: 'JM' },
    { subject_name: 'English Language', midTermScore: 85, endTermScore: 88, grade: 'D2', comment: 'Very good performance.', initials: 'SA' },
    { subject_name: 'Science', midTermScore: 70, endTermScore: 75, grade: 'C3', comment: 'Satisfactory performance.', initials: 'RK' },
    { subject_name: 'Social Studies', midTermScore: 62, endTermScore: 68, grade: 'C4', comment: 'Needs improvement.', initials: 'TM' },
    { subject_name: 'Islamic Studies', midTermScore: 91, endTermScore: 94, grade: 'D1', comment: 'Excellent results!', initials: 'AA' },
  ],
};

const SAMPLE_SCHOOL = {
  name: 'DRAIS Model School', address: 'Plot 1, School Road, Kampala',
  contact: '+256 700 000 000', center_no: 'CEN-001', registration_no: 'REG-2020',
  arabic_name: 'مدرسة درايس النموذجية', arabic_address: 'كمبالا، أوغندا', logo_url: '/uploads/logo.png',
};

const RIBBON_PRESETS = [
  { label: 'Flat', value: { background: 'linear-gradient(to right, #d3d3d3, #a9a9a9)', borderRadius: 0, boxShadow: 'none' } },
  { label: 'Rounded', value: { background: 'linear-gradient(to right, #6366f1, #8b5cf6)', borderRadius: 8, boxShadow: 'none' } },
  { label: 'OneUI Curved', value: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 16, boxShadow: '0 4px 12px rgba(102,126,234,0.4)' } },
  { label: 'Shadow', value: { background: '#1e293b', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' } },
  { label: 'Emerald', value: { background: 'linear-gradient(to right, #059669, #10b981)', borderRadius: 6, boxShadow: '0 2px 8px rgba(16,185,129,0.3)' } },
];

const PAGE_BORDER_PRESETS = [
  { label: 'None', value: { enabled: false, color: '#000', width: 0, radius: 0, style: 'none' as const } },
  { label: 'Simple', value: { enabled: true, color: '#000000', width: 1, radius: 0, style: 'solid' as const } },
  { label: 'Rounded', value: { enabled: true, color: '#334155', width: 2, radius: 8, style: 'solid' as const } },
  { label: 'Double Classic', value: { enabled: true, color: '#1e3a5f', width: 4, radius: 0, style: 'double' as const } },
  { label: 'Elegant Double', value: { enabled: true, color: '#4f46e5', width: 4, radius: 12, style: 'double' as const } },
];

const FONT_OPTIONS = [
  'Segoe UI, sans-serif', 'Arial, Helvetica, sans-serif', 'Georgia, serif',
  'Times New Roman, serif', 'Courier New, monospace', 'Inter, sans-serif',
  'Verdana, sans-serif', 'Tahoma, sans-serif',
];

// ─── Color Picker (inline, no extra deps) ────────────────────────────────────

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="color"
        value={toHex(value)}
        onChange={e => onChange(e.target.value)}
        className="w-6 h-6 rounded border cursor-pointer p-0"
      />
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
    </label>
  );
}

function toHex(c: string): string {
  if (c.startsWith('#') && (c.length === 4 || c.length === 7)) return c;
  if (c.startsWith('rgb')) {
    const m = c.match(/\d+/g);
    if (m && m.length >= 3) {
      return '#' + [m[0], m[1], m[2]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }
  }
  return '#000000';
}

function NumberInput({ value, onChange, label, min, max, step }: {
  value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-gray-600 dark:text-gray-400 min-w-[80px]">{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step ?? 1}
        className="w-16 px-1.5 py-1 border rounded text-xs bg-white dark:bg-slate-700 dark:border-slate-600"
      />
    </label>
  );
}

function SelectInput({ value, onChange, label, options }: {
  value: string; onChange: (v: string) => void; label: string; options: {label: string; value: string}[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-gray-600 dark:text-gray-400 min-w-[80px]">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 px-1.5 py-1 border rounded text-xs bg-white dark:bg-slate-700 dark:border-slate-600"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ─── Sortable Section Item ───────────────────────────────────────────────────

function SortableSectionItem({ section, isSelected, onSelect, onToggle }: {
  section: SectionConfig; isSelected: boolean;
  onSelect: () => void; onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
        isSelected
          ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700'
          : 'hover:bg-gray-50 dark:hover:bg-slate-700 border border-transparent'
      } ${!section.visible ? 'opacity-50' : ''}`}
      onClick={onSelect}
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-gray-400 hover:text-gray-600">
        <GripVertical size={12} />
      </button>
      <span className="text-gray-500">{SECTION_ICONS[section.type]}</span>
      <span className="flex-1 truncate font-medium text-gray-700 dark:text-gray-300">{section.label}</span>
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        className={`p-0.5 rounded ${section.visible ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}`}
        title={section.visible ? 'Hide section' : 'Show section'}
      >
        {section.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
    </div>
  );
}

// ─── Live Preview Renderer ───────────────────────────────────────────────────

const LivePreview = React.memo(function LivePreview({ layout, sections }: {
  layout: ReportLayoutJSON; sections: SectionConfig[];
}) {
  const tl = layout;
  const s = SAMPLE_STUDENT;
  const school = SAMPLE_SCHOOL;
  const totalMid = s.results.reduce((a, r) => a + r.midTermScore, 0);
  const totalEnd = s.results.reduce((a, r) => a + r.endTermScore, 0);

  const visible = useMemo(() => {
    const visSet = new Set(sections.filter(s => s.visible).map(s => s.type));
    return (type: SectionType) => visSet.has(type);
  }, [sections]);

  const orderedSections = sections.filter(s => s.visible);

  const pageBorder = tl.pageBorder ?? { enabled: false, color: '#000', width: 0, radius: 0, style: 'none' };

  const renderSection = (sec: SectionConfig) => {
    switch (sec.type) {
      case 'header':
        return tl.header.layout === 'three-column' ? (
          <div key={sec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: tl.header.paddingBottom, opacity: tl.header.opacity, borderBottom: tl.header.borderBottom }}>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 'bold', fontSize: (tl.page.fontSize ?? 14) + 2 }}>{school.name}</div>
              <div style={{ fontSize: tl.page.fontSize - 1 }}>{school.address}</div>
              <div style={{ fontSize: tl.page.fontSize - 1 }}>{school.contact}</div>
            </div>
            <div style={{ flex: 'none', margin: '0 12px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 4, background: '#e0e7ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666' }}>LOGO</div>
            </div>
            <div style={{ flex: 1, textAlign: 'right', direction: 'rtl' }}>
              <div style={{ fontWeight: 'bold', fontSize: (tl.page.fontSize ?? 14) + 2 }}>{school.arabic_name}</div>
              <div style={{ fontSize: tl.page.fontSize - 1 }}>{school.arabic_address}</div>
            </div>
          </div>
        ) : (
          <div key={sec.id} style={{ textAlign: 'center', paddingBottom: tl.header.paddingBottom, borderBottom: tl.header.borderBottom }}>
            <div style={{ width: 64, height: 64, borderRadius: 4, background: '#e0e7ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666', margin: '0 auto 6px' }}>LOGO</div>
            <div style={{ fontWeight: 'bold', fontSize: (tl.page.fontSize ?? 14) + 2 }}>{school.name}</div>
            <div style={{ fontSize: tl.page.fontSize - 1 }}>{school.address} · {school.contact}</div>
          </div>
        );

      case 'banner':
        return (
          <div key={sec.id} style={{
            backgroundColor: tl.banner.backgroundColor, color: tl.banner.color,
            textAlign: tl.banner.textAlign, fontSize: tl.banner.fontSize, fontWeight: tl.banner.fontWeight,
            padding: tl.banner.padding, marginTop: tl.banner.marginTop, marginBottom: tl.banner.marginBottom,
            borderRadius: tl.banner.borderRadius, letterSpacing: tl.banner.letterSpacing, textTransform: tl.banner.textTransform,
          }}>
            END OF TERM REPORT
          </div>
        );

      case 'student_info':
        return (
          <div key={sec.id} style={{
            border: tl.studentInfoBox.border, borderRadius: tl.studentInfoBox.borderRadius,
            padding: tl.studentInfoBox.padding, background: tl.studentInfoBox.background,
            boxShadow: tl.studentInfoBox.boxShadow, margin: tl.studentInfoBox.margin,
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                {[['Name', `${s.first_name} ${s.last_name}`], ['Gender', s.gender], ['Class', s.class_name], ['Stream', s.stream_name]].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex', borderBottom: tl.studentInfoContainer.borderBottom,
                    fontSize: Math.min(tl.studentInfoContainer.fontSize, 14), padding: '2px 0', marginBottom: 2,
                  }}>
                    <span style={{ fontWeight: 'bold', marginRight: 6, color: '#000', minWidth: 70 }}>{label}:</span>
                    <span style={{ color: tl.studentValue.color, fontStyle: tl.studentValue.fontStyle as any, fontWeight: tl.studentValue.fontWeight }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                {[['Student No', String(s.student_id)], ['Adm No', s.admission_no], ['Term', 'Term 2']].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex', borderBottom: tl.studentInfoContainer.borderBottom,
                    fontSize: Math.min(tl.studentInfoContainer.fontSize, 14), padding: '2px 0', marginBottom: 2,
                  }}>
                    <span style={{ fontWeight: 'bold', marginRight: 6, color: '#000', minWidth: 80 }}>{label}:</span>
                    <span style={{ color: tl.studentValue.color, fontStyle: tl.studentValue.fontStyle as any, fontWeight: tl.studentValue.fontWeight }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'ribbon':
        return (
          <div key={sec.id} style={{
            background: tl.ribbon.background, color: tl.ribbon.color, fontWeight: tl.ribbon.fontWeight,
            fontSize: Math.min(tl.ribbon.fontSize, 14), padding: tl.ribbon.padding,
            borderRadius: tl.ribbon.borderRadius, textAlign: tl.ribbon.textAlign,
            marginLeft: tl.ribbon.marginSidesPercent, marginRight: tl.ribbon.marginSidesPercent,
            marginBottom: 8, boxShadow: tl.ribbon.boxShadow ?? 'none',
          }}>
            Marks attained in each subject
          </div>
        );

      case 'results_table':
        return (
          <table key={sec.id} style={{ borderCollapse: tl.table.borderCollapse, width: '100%', fontSize: tl.table.fontSize }}>
            <thead>
              <tr>
                {['SUBJECT', 'MT', 'EOT', 'GRADE', 'COMMENT', 'INIT'].map(h => (
                  <th key={h} style={{ background: tl.table.th.background, border: tl.table.th.border, padding: tl.table.th.padding, textAlign: tl.table.th.textAlign, color: tl.table.th.color }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.results.map((r, i) => (
                <tr key={i}>
                  <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: tl.table.td.textAlign }}>{r.subject_name}</td>
                  <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: tl.table.td.textAlign }}>{r.midTermScore}</td>
                  <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: tl.table.td.textAlign }}>{r.endTermScore}</td>
                  <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: tl.table.td.textAlign }}>{r.grade}</td>
                  <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: tl.table.td.textAlign, fontSize: tl.table.fontSize - 1 }}>{r.comment}</td>
                  <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: tl.table.td.textAlign }}>{r.initials}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 'bold' }}>
                <td style={{ border: tl.table.td.border, padding: tl.table.td.padding }}>TOTAL MARKS</td>
                <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: 'center' }}>{totalMid}</td>
                <td style={{ border: tl.table.td.border, padding: tl.table.td.padding, textAlign: 'center' }}>{totalEnd}</td>
                <td colSpan={3} style={{ border: tl.table.td.border, padding: tl.table.td.padding }}>AVERAGE: {Math.round(totalEnd / s.results.length)}</td>
              </tr>
            </tbody>
          </table>
        );

      case 'assessment':
        return (
          <div key={sec.id} style={{ marginTop: 12, fontSize: tl.page.fontSize }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 6 }}>General Assessment</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', ...tl.assessmentBox as any }}>
              <div><p><strong>Aggregates:</strong> 14</p><p><strong>Division:</strong> Division 2</p></div>
              <div style={tl.assessmentBox as any}>Promoted to next class</div>
            </div>
          </div>
        );

      case 'comments':
        return (
          <div key={sec.id} style={{ borderTop: tl.comments.borderTop, paddingTop: tl.comments.paddingTop, marginTop: tl.comments.marginTop, fontSize: tl.page.fontSize - 1 }}>
            {[["Class Teacher's Comment", 'Promising results, keep more focused.'], ['DOS Comment', 'Very good performance, keep it up.'], ["Headteacher's Comment", 'You are a first grade material.']].map(([label, text]) => (
              <div key={label} style={{ marginBottom: 6 }}>
                <span style={{ display: 'inline-block', background: tl.comments.ribbon.background, color: tl.comments.ribbon.color, borderRadius: tl.comments.ribbon.borderRadius, padding: tl.comments.ribbon.padding, marginRight: 10, fontSize: tl.page.fontSize - 1 }}>{label}:</span>
                <span style={{ color: tl.comments.text.color, fontStyle: tl.comments.text.fontStyle as any, borderBottom: tl.comments.text.borderBottom }}>{text}</span>
              </div>
            ))}
          </div>
        );

      case 'grade_table':
        return (
          <table key={sec.id} style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: tl.page.fontSize - 1 }}>
            <tbody>
              <tr>
                {['GRADE', 'D1', 'D2', 'C3', 'C4', 'C5', 'C6', 'P7', 'P8', 'F9'].map(h => (
                  <th key={h} style={{ background: tl.gradeTable.th.background, border: tl.gradeTable.th.border, textAlign: tl.gradeTable.th.textAlign, padding: tl.gradeTable.th.padding }}>{h}</th>
                ))}
              </tr>
              <tr>
                {['RANGE', '90-100', '80-89', '70-79', '60-69', '50-59', '44-49', '40-43', '34-39', '0-33'].map(v => (
                  <td key={v} style={{ border: tl.gradeTable.td.border, textAlign: tl.gradeTable.td.textAlign, padding: tl.gradeTable.td.padding }}>{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{
      background: tl.page.background, boxShadow: tl.page.boxShadow, padding: tl.page.padding,
      borderRadius: tl.page.borderRadius, fontSize: tl.page.fontSize, fontFamily: tl.page.fontFamily,
      maxWidth: '100%', overflow: 'hidden', color: '#000',
      ...(pageBorder.enabled ? {
        border: `${pageBorder.width}px ${pageBorder.style} ${pageBorder.color}`,
        borderRadius: pageBorder.radius,
      } : {}),
    }}>
      {orderedSections.map(renderSection)}
    </div>
  );
});

// ─── Property Panels ─────────────────────────────────────────────────────────

function PageSettingsPanel({ layout, onChange }: { layout: ReportLayoutJSON; onChange: (l: ReportLayoutJSON) => void }) {
  const upd = (path: string, value: any) => {
    const next = structuredClone(layout);
    const keys = path.split('.');
    let obj: any = next;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Page Settings</h4>
      <ColorInput value={layout.page.background} onChange={v => upd('page.background', v)} label="Background" />
      <NumberInput value={layout.page.borderRadius} onChange={v => upd('page.borderRadius', v)} label="Corners" min={0} max={24} />
      <NumberInput value={layout.page.maxWidth} onChange={v => upd('page.maxWidth', v)} label="Max Width" min={600} max={1200} step={10} />
      <SelectInput value={layout.page.fontFamily} onChange={v => upd('page.fontFamily', v)} label="Font"
        options={FONT_OPTIONS.map(f => ({ label: f.split(',')[0], value: f }))} />
      <NumberInput value={layout.page.fontSize} onChange={v => upd('page.fontSize', v)} label="Base Font" min={10} max={20} />

      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4">Page Border</h4>
      <div className="flex flex-wrap gap-1.5">
        {PAGE_BORDER_PRESETS.map(p => (
          <button key={p.label} onClick={() => upd('pageBorder', p.value)}
            className={`text-[10px] px-2 py-1 rounded border ${layout.pageBorder?.style === p.value.style && layout.pageBorder?.width === p.value.width ? 'bg-indigo-100 border-indigo-300 dark:bg-indigo-900/40' : 'hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {layout.pageBorder?.enabled && (
        <>
          <ColorInput value={layout.pageBorder.color} onChange={v => upd('pageBorder.color', v)} label="Border Color" />
          <NumberInput value={layout.pageBorder.width} onChange={v => upd('pageBorder.width', v)} label="Width" min={1} max={8} />
          <NumberInput value={layout.pageBorder.radius} onChange={v => upd('pageBorder.radius', v)} label="Radius" min={0} max={24} />
          <SelectInput value={layout.pageBorder.style} onChange={v => upd('pageBorder.style', v)} label="Style"
            options={[{label:'Solid',value:'solid'},{label:'Double',value:'double'},{label:'Dashed',value:'dashed'}]} />
        </>
      )}
    </div>
  );
}

function TypographyPanel({ layout, onChange }: { layout: ReportLayoutJSON; onChange: (l: ReportLayoutJSON) => void }) {
  const upd = (path: string, value: any) => {
    const next = structuredClone(layout);
    const keys = path.split('.');
    let obj: any = next;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Header</h4>
      <SelectInput value={layout.header.layout} onChange={v => upd('header.layout', v)} label="Layout"
        options={[{label:'Three Column',value:'three-column'},{label:'Centered',value:'centered'},{label:'Left Logo',value:'left-logo'}]} />
      <NumberInput value={layout.header.paddingBottom} onChange={v => upd('header.paddingBottom', v)} label="Bottom Pad" min={0} max={40} />
      <NumberInput value={layout.header.opacity} onChange={v => upd('header.opacity', v)} label="Opacity" min={0} max={1} step={0.1} />

      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4">Banner</h4>
      <ColorInput value={layout.banner.backgroundColor} onChange={v => upd('banner.backgroundColor', v)} label="Background" />
      <ColorInput value={layout.banner.color} onChange={v => upd('banner.color', v)} label="Text Color" />
      <NumberInput value={layout.banner.fontSize} onChange={v => upd('banner.fontSize', v)} label="Font Size" min={10} max={24} />
      <NumberInput value={layout.banner.borderRadius} onChange={v => upd('banner.borderRadius', v)} label="Radius" min={0} max={16} />
      <SelectInput value={layout.banner.textTransform} onChange={v => upd('banner.textTransform', v)} label="Transform"
        options={[{label:'UPPER',value:'uppercase'},{label:'None',value:'none'},{label:'Title',value:'capitalize'}]} />

      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4">Student Info</h4>
      <ColorInput value={layout.studentValue.color} onChange={v => upd('studentValue.color', v)} label="Value Color" />
      <SelectInput value={layout.studentValue.fontStyle} onChange={v => upd('studentValue.fontStyle', v)} label="Style"
        options={[{label:'Italic',value:'italic'},{label:'Normal',value:'normal'}]} />
      <SelectInput value={layout.studentValue.fontWeight} onChange={v => upd('studentValue.fontWeight', v)} label="Weight"
        options={[{label:'Bold',value:'bolder'},{label:'Semi-bold',value:'600'},{label:'Normal',value:'normal'}]} />
      <ColorInput value={layout.studentInfoBox.background} onChange={v => upd('studentInfoBox.background', v)} label="Box Bg" />
      <NumberInput value={layout.studentInfoBox.borderRadius} onChange={v => upd('studentInfoBox.borderRadius', v)} label="Box Radius" min={0} max={20} />
    </div>
  );
}

function TableStylesPanel({ layout, onChange }: { layout: ReportLayoutJSON; onChange: (l: ReportLayoutJSON) => void }) {
  const upd = (path: string, value: any) => {
    const next = structuredClone(layout);
    const keys = path.split('.');
    let obj: any = next;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Results Table</h4>
      <NumberInput value={layout.table.fontSize} onChange={v => upd('table.fontSize', v)} label="Font Size" min={10} max={18} />
      <ColorInput value={layout.table.th.background} onChange={v => upd('table.th.background', v)} label="Header Bg" />
      <ColorInput value={layout.table.th.color} onChange={v => upd('table.th.color', v)} label="Header Text" />
      <NumberInput value={layout.table.th.padding} onChange={v => upd('table.th.padding', v)} label="Header Pad" min={2} max={16} />
      <ColorInput value={layout.table.td.color} onChange={v => upd('table.td.color', v)} label="Cell Text" />
      <NumberInput value={layout.table.td.padding} onChange={v => upd('table.td.padding', v)} label="Cell Pad" min={2} max={16} />

      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4">Grade Table</h4>
      <ColorInput value={layout.gradeTable.th.background} onChange={v => upd('gradeTable.th.background', v)} label="Header Bg" />
      <NumberInput value={layout.gradeTable.th.padding} onChange={v => upd('gradeTable.th.padding', v)} label="Padding" min={2} max={16} />
    </div>
  );
}

function RibbonStylesPanel({ layout, onChange }: { layout: ReportLayoutJSON; onChange: (l: ReportLayoutJSON) => void }) {
  const upd = (path: string, value: any) => {
    const next = structuredClone(layout);
    const keys = path.split('.');
    let obj: any = next;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    onChange(next);
  };
  const applyPreset = (preset: typeof RIBBON_PRESETS[0]['value']) => {
    const next = structuredClone(layout);
    next.ribbon.background = preset.background;
    next.ribbon.borderRadius = preset.borderRadius;
    next.ribbon.boxShadow = preset.boxShadow;
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ribbon Presets</h4>
      <div className="flex flex-wrap gap-1.5">
        {RIBBON_PRESETS.map(p => (
          <button key={p.label} onClick={() => applyPreset(p.value)}
            className="text-[10px] px-2 py-1 rounded border hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
            <div className="w-10 h-2 rounded mb-0.5" style={{ background: p.value.background, borderRadius: p.value.borderRadius }} />
            {p.label}
          </button>
        ))}
      </div>
      <ColorInput value={layout.ribbon.color} onChange={v => upd('ribbon.color', v)} label="Text Color" />
      <NumberInput value={layout.ribbon.fontSize} onChange={v => upd('ribbon.fontSize', v)} label="Font Size" min={10} max={24} />
      <NumberInput value={layout.ribbon.borderRadius} onChange={v => upd('ribbon.borderRadius', v)} label="Radius" min={0} max={24} />

      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4">Comment Ribbons</h4>
      <ColorInput value={layout.comments.ribbon.background} onChange={v => upd('comments.ribbon.background', v)} label="Background" />
      <ColorInput value={layout.comments.ribbon.color} onChange={v => upd('comments.ribbon.color', v)} label="Text" />
      <ColorInput value={layout.comments.text.color} onChange={v => upd('comments.text.color', v)} label="Comment Text" />
    </div>
  );
}

// ─── Properties Panel Tabs ───────────────────────────────────────────────────

const PROPERTY_TABS = [
  { id: 'page', label: 'Page', icon: <Settings size={14} /> },
  { id: 'typography', label: 'Typography', icon: <Type size={14} /> },
  { id: 'tables', label: 'Tables', icon: <Table size={14} /> },
  { id: 'ribbons', label: 'Ribbons', icon: <BookmarkIcon size={14} /> },
] as const;

type PropertyTab = typeof PROPERTY_TABS[number]['id'];

// ─── Version History Modal ───────────────────────────────────────────────────

function VersionHistoryModal({ templateId, onRevert, onClose }: {
  templateId: number; onRevert: (json: ReportLayoutJSON) => void; onClose: () => void;
}) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/report-templates/${templateId}/versions`)
      .then(r => r.json())
      .then(data => { setVersions(data.versions ?? []); setLoading(false); })
      .catch(() => { toast.error('Failed to load versions'); setLoading(false); });
  }, [templateId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold flex items-center gap-2"><History size={16} /> Version History</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-400 py-8"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading...</div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No saved versions yet. Versions are created each time you save.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg border hover:bg-gray-50 dark:hover:bg-slate-700">
                  <div>
                    <div className="font-medium text-sm">Version {v.version}</div>
                    <div className="text-xs text-gray-500">{v.change_note || 'No note'} · {new Date(v.created_at).toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => {
                      const parsed = typeof v.layout_json === 'string' ? JSON.parse(v.layout_json) : v.layout_json;
                      onRevert(parsed);
                      toast.success(`Reverted to version ${v.version}`);
                      onClose();
                    }}
                    className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                  >
                    <Undo2 size={12} className="inline mr-1" />Revert
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: Template Builder Page
// ═════════════════════════════════════════════════════════════════════════════

export default function TemplateBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  // State
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [propertyTab, setPropertyTab] = useState<PropertyTab>('page');
  const [showVersions, setShowVersions] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [previewScale, setPreviewScale] = useState(0.55);

  // Section reordering state
  const [sections, setSections] = useState<SectionConfig[]>(DEFAULT_SECTIONS);

  // Editing state — a deep clone of the selected template's layout
  const [editLayout, setEditLayout] = useState<ReportLayoutJSON | null>(null);

  // Undo/Redo
  const [history, setHistory] = useState<ReportLayoutJSON[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Debounce timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ── Fetch templates ────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, aRes] = await Promise.all([
        fetch('/api/report-templates'),
        fetch('/api/report-templates/active'),
      ]);
      const tData = await tRes.json();
      const aData = await aRes.json();
      if (tData.templates) setTemplates(tData.templates);
      if (aData.template?.id) setActiveId(aData.template.id);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-select template from URL param
  useEffect(() => {
    if (editId && templates.length > 0) {
      const id = parseInt(editId);
      const found = templates.find(t => t.id === id);
      if (found) {
        selectTemplate(found);
      }
    }
  }, [editId, templates]);

  // ── Select template for editing ────────────────────────────────────────

  const selectTemplate = useCallback((t: ReportTemplate) => {
    const cloned = structuredClone(t.layout_json);
    setSelectedId(t.id);
    setEditLayout(cloned);
    setSections(cloned.sections ?? DEFAULT_SECTIONS);
    setHistory([cloned]);
    setHistoryIndex(0);
    setDirty(false);
  }, []);

  // ── Layout change handler (debounced + tracked in undo history) ──────

  const handleLayoutChange = useCallback((newLayout: ReportLayoutJSON) => {
    setEditLayout(newLayout);
    setDirty(true);

    // Debounce history snapshot
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setHistory(prev => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, structuredClone(newLayout)].slice(-30); // keep last 30 states
      });
      setHistoryIndex(prev => Math.min(prev + 1, 29));
    }, DEBOUNCE_MS);
  }, [historyIndex]);

  // ── Undo / Redo ────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setEditLayout(structuredClone(history[newIdx]));
      setDirty(true);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setEditLayout(structuredClone(history[newIdx]));
      setDirty(true);
    }
  }, [history, historyIndex]);

  // ── Save template ──────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!selectedId || !editLayout) return;
    setSaving(true);
    try {
      // Attach section order into layout_json
      const layoutToSave = { ...editLayout, sections };

      const res = await fetch(`/api/report-templates/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templates.find(t => t.id === selectedId)?.name,
          description: templates.find(t => t.id === selectedId)?.description,
          layout_json: layoutToSave,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Template saved!');
        setDirty(false);
        fetchData(); // refresh list
      } else {
        toast.error(data.error || 'Save failed');
      }
    } catch {
      toast.error('Network error — could not save');
    } finally {
      setSaving(false);
    }
  }, [selectedId, editLayout, sections, templates, fetchData]);

  // ── Clone template → open in editor ────────────────────────────────────

  const handleClone = useCallback(async (template: ReportTemplate) => {
    try {
      const res = await fetch(`/api/report-templates/${template.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${template.name} (Custom)` }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Cloned as "${data.name}" — now editing`);
        await fetchData();
        // Auto-select the new clone
        router.push(`/admin/templates?edit=${data.id}`);
      } else {
        toast.error(data.error || 'Clone failed');
      }
    } catch {
      toast.error('Network error');
    }
  }, [fetchData, router]);

  // ── Activate template ──────────────────────────────────────────────────

  const handleActivate = useCallback(async (id: number) => {
    try {
      const res = await fetch('/api/report-templates/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: id }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveId(id);
        toast.success('Active template updated');
      } else {
        toast.error(data.error || 'Failed to activate');
      }
    } catch {
      toast.error('Network error');
    }
  }, []);

  // ── Delete template ────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/report-templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Template deleted');
        if (selectedId === id) { setSelectedId(null); setEditLayout(null); }
        fetchData();
      } else {
        toast.error(data.error || 'Cannot delete');
      }
    } catch {
      toast.error('Network error');
    }
  }, [selectedId, fetchData]);

  // ── Drag end (reorder sections) ────────────────────────────────────────

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSections(prev => {
      const oldIndex = prev.findIndex(s => s.id === active.id);
      const newIndex = prev.findIndex(s => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  }, []);

  const toggleSectionVisibility = useCallback((sectionId: string) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, visible: !s.visible } : s));
    setDirty(true);
  }, []);

  // ── Keyboard shortcut: Ctrl+S ──────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty && selectedId) handleSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dirty, selectedId, handleSave, undo, redo]);

  const selectedTemplate = templates.find(t => t.id === selectedId);

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-slate-900 overflow-hidden">
      {/* ─── Top Bar ────────────────────────────────────────────────────── */}
      <div className="flex-none bg-white dark:bg-slate-800 border-b dark:border-slate-700 px-4 py-2 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/reports/kitchen')} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1 text-sm">
            <ArrowLeft size={16} /> Kitchen
          </button>
          <div className="h-4 w-px bg-gray-300 dark:bg-slate-600" />
          <ChefHat size={20} className="text-amber-600" />
          <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100">Template Builder</h1>
          <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">V2</span>
        </div>

        <div className="flex items-center gap-2">
          {selectedId && (
            <>
              <button onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30"><Undo2 size={14} /></button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Shift+Z)"
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30"><Redo size={14} /></button>
              <div className="h-4 w-px bg-gray-300 dark:bg-slate-600" />
              <button onClick={() => setShowVersions(true)} className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 flex items-center gap-1">
                <History size={13} /> Versions
              </button>
              <button onClick={handleSave} disabled={!dirty || saving}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-semibold transition-colors ${
                  dirty ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-400 dark:bg-slate-700'
                }`}>
                <Save size={13} /> {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── 3-Panel Layout ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Template List ──────────────────────────────────────────── */}
        <div className={`flex-none bg-white dark:bg-slate-800 border-r dark:border-slate-700 flex flex-col transition-all duration-200 ${leftCollapsed ? 'w-10' : 'w-64'}`}>
          <div className="flex items-center justify-between px-3 py-2 border-b dark:border-slate-700">
            {!leftCollapsed && <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Templates</span>}
            <button onClick={() => setLeftCollapsed(!leftCollapsed)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700">
              <PanelLeftClose size={14} className={leftCollapsed ? 'rotate-180' : ''} />
            </button>
          </div>

          {!leftCollapsed && (
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="text-center py-6 text-gray-400"><RefreshCw size={16} className="animate-spin mx-auto" /></div>
              ) : templates.map(t => {
                const isActive = t.id === activeId;
                const isSelected = t.id === selectedId;
                const isGlobal = t.school_id === null;
                return (
                  <div
                    key={t.id}
                    className={`rounded-lg p-2 cursor-pointer transition-all border ${
                      isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' :
                      'hover:bg-gray-50 dark:hover:bg-slate-700 border-transparent'
                    }`}
                    onClick={() => selectTemplate(t)}
                  >
                    {/* Mini preview stripe */}
                    <div className="h-8 rounded mb-1.5 overflow-hidden" style={{ background: t.layout_json.banner.backgroundColor }}>
                      <div className="h-full flex items-center justify-center text-[8px] text-white/70 font-bold uppercase tracking-widest">
                        {t.name}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{t.name}</span>
                        {isActive && <span className="flex-none w-2 h-2 rounded-full bg-green-500" title="Active" />}
                      </div>
                    </div>

                    <div className="flex gap-1 mt-1.5">
                      {isGlobal ? (
                        <button onClick={e => { e.stopPropagation(); handleClone(t); }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 flex items-center gap-0.5">
                          <Copy size={9} /> Clone & Edit
                        </button>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); selectTemplate(t); }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 flex items-center gap-0.5">
                          <Paintbrush size={9} /> Edit
                        </button>
                      )}
                      {!isActive && (
                        <button onClick={e => { e.stopPropagation(); handleActivate(t.id); }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-0.5">
                          <Check size={9} /> Use
                        </button>
                      )}
                      {!isGlobal && !isActive && (
                        <button onClick={e => { e.stopPropagation(); handleDelete(t.id, t.name); }}
                          className="text-[10px] px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto">
                          <Trash2 size={9} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── CENTER: Live Preview ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-200 dark:bg-slate-900">
          {editLayout && selectedTemplate ? (
            <>
              {/* Preview toolbar */}
              <div className="flex-none flex items-center justify-between px-4 py-1.5 bg-gray-100 dark:bg-slate-800 border-b dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Eye size={14} className="text-gray-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Editing: <strong>{selectedTemplate.name}</strong>
                    {dirty && <span className="ml-1 text-amber-500">• unsaved</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">{Math.round(previewScale * 100)}%</span>
                  <button onClick={() => setPreviewScale(s => Math.max(0.3, s - 0.05))} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"><Minimize2 size={12} /></button>
                  <button onClick={() => setPreviewScale(s => Math.min(1, s + 0.05))} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"><Maximize2 size={12} /></button>
                </div>
              </div>

              {/* Section reorder bar */}
              <div className="flex-none bg-white dark:bg-slate-800 border-b dark:border-slate-700 px-3 py-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <GripVertical size={12} className="text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sections — drag to reorder</span>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="grid grid-cols-4 gap-1">
                      {sections.map(sec => (
                        <SortableSectionItem
                          key={sec.id}
                          section={sec}
                          isSelected={false}
                          onSelect={() => {}}
                          onToggle={() => toggleSectionVisibility(sec.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              {/* Scrollable preview area */}
              <div className="flex-1 overflow-auto p-6">
                <div style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top center',
                  maxWidth: editLayout.page.maxWidth,
                  margin: '0 auto',
                }}>
                  <LivePreview layout={editLayout} sections={sections} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <LayoutTemplate size={48} className="text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                <h2 className="text-lg font-semibold text-gray-500 dark:text-gray-400 mb-2">Select a Template</h2>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Choose a template from the left panel to start customizing. Clone a built-in template to create your own version.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Properties Panel ────────────────────────────────────── */}
        <div className={`flex-none bg-white dark:bg-slate-800 border-l dark:border-slate-700 flex flex-col transition-all duration-200 ${rightCollapsed ? 'w-10' : 'w-72'}`}>
          <div className="flex items-center justify-between px-3 py-2 border-b dark:border-slate-700">
            {!rightCollapsed && <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Properties</span>}
            <button onClick={() => setRightCollapsed(!rightCollapsed)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700">
              <PanelRightClose size={14} className={rightCollapsed ? 'rotate-180' : ''} />
            </button>
          </div>

          {!rightCollapsed && editLayout && (
            <>
              {/* Tab bar */}
              <div className="flex-none flex border-b dark:border-slate-700">
                {PROPERTY_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setPropertyTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      propertyTab === tab.id
                        ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden xl:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-3">
                {propertyTab === 'page' && <PageSettingsPanel layout={editLayout} onChange={handleLayoutChange} />}
                {propertyTab === 'typography' && <TypographyPanel layout={editLayout} onChange={handleLayoutChange} />}
                {propertyTab === 'tables' && <TableStylesPanel layout={editLayout} onChange={handleLayoutChange} />}
                {propertyTab === 'ribbons' && <RibbonStylesPanel layout={editLayout} onChange={handleLayoutChange} />}
              </div>
            </>
          )}

          {!rightCollapsed && !editLayout && (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-xs text-gray-400 text-center">Select a template to see properties</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Version history modal ──────────────────────────────────────── */}
      {showVersions && selectedId && (
        <VersionHistoryModal
          templateId={selectedId}
          onRevert={(json) => {
            setEditLayout(json);
            setSections(json.sections ?? DEFAULT_SECTIONS);
            setDirty(true);
          }}
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
  );
}
