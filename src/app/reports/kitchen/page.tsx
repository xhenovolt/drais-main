'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ChefHat, Eye, Check, Copy, Plus, Trash2, Paintbrush,
  LayoutTemplate, Sparkles, ArrowLeft, RefreshCw, Save, FileText,
} from 'lucide-react';
import type { ReportTemplate, ReportLayoutJSON } from '@/lib/reportTemplates';

// ============================================================================
// /reports/kitchen  — Template management dashboard
// ============================================================================

interface SampleStudent {
  student_id: number;
  first_name: string;
  last_name: string;
  admission_no: string;
  class_name: string;
  gender: string;
  stream_name: string;
  photo: string | null;
  position: number;
  totalInClass: number;
  results: Array<{
    subject_name: string;
    midTermScore: number;
    endTermScore: number;
    grade: string;
    comment: string;
    initials: string;
  }>;
}

const SAMPLE_STUDENT: SampleStudent = {
  student_id: 1001,
  first_name: 'Fatima',
  last_name: 'Al-Rashidi',
  admission_no: 'ADM-2024-001',
  class_name: 'Primary 5',
  gender: 'Female',
  stream_name: 'A',
  photo: null,
  position: 3,
  totalInClass: 28,
  results: [
    { subject_name: 'Mathematics', midTermScore: 78, endTermScore: 82, grade: 'C3', comment: 'Very good score, but aim at excellency.', initials: 'JM' },
    { subject_name: 'English Language', midTermScore: 85, endTermScore: 88, grade: 'D2', comment: 'Very good performance.', initials: 'SA' },
    { subject_name: 'Science', midTermScore: 70, endTermScore: 75, grade: 'C3', comment: 'Satisfactory performance.', initials: 'RK' },
    { subject_name: 'Social Studies', midTermScore: 62, endTermScore: 68, grade: 'C4', comment: 'Needs improvement.', initials: 'TM' },
    { subject_name: 'Islamic Studies', midTermScore: 91, endTermScore: 94, grade: 'D1', comment: 'Excellent results!', initials: 'AA' },
  ],
};

const SAMPLE_SCHOOL = {
  name: 'DRAIS Model School',
  address: 'Plot 1, School Road, Kampala',
  contact: '+256 700 000 000',
  center_no: 'CEN-001',
  registration_no: 'REG-2020',
  arabic_name: 'مدرسة درايس النموذجية',
  arabic_address: 'كمبالا، أوغندا',
  logo_url: '/uploads/logo.png',
};

// ============================================================================
// Mini report preview — rendered inline from a template JSON
// ============================================================================
function TemplatePreview({ layout, school }: { layout: ReportLayoutJSON; school: typeof SAMPLE_SCHOOL }) {
  const s = SAMPLE_STUDENT;
  const tl = layout;
  const totalMid = s.results.reduce((a, r) => a + r.midTermScore, 0);
  const totalEnd = s.results.reduce((a, r) => a + r.endTermScore, 0);

  const headerContent = (
    <>
      {tl.header.layout === 'three-column' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: tl.header.paddingBottom, opacity: tl.header.opacity, borderBottom: tl.header.borderBottom }}>
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
        <div style={{ textAlign: 'center', paddingBottom: tl.header.paddingBottom, borderBottom: tl.header.borderBottom }}>
          <div style={{ width: 64, height: 64, borderRadius: 4, background: '#e0e7ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666', margin: '0 auto 6px' }}>LOGO</div>
          <div style={{ fontWeight: 'bold', fontSize: (tl.page.fontSize ?? 14) + 2 }}>{school.name}</div>
          <div style={{ fontSize: tl.page.fontSize - 1 }}>{school.address} · {school.contact}</div>
        </div>
      )}
    </>
  );

  return (
    <div style={{
      background: tl.page.background,
      boxShadow: tl.page.boxShadow,
      padding: tl.page.padding,
      borderRadius: tl.page.borderRadius,
      fontSize: tl.page.fontSize,
      fontFamily: tl.page.fontFamily,
      maxWidth: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      {headerContent}

      {/* Banner */}
      <div style={{
        backgroundColor: tl.banner.backgroundColor,
        color: tl.banner.color,
        textAlign: tl.banner.textAlign,
        fontSize: tl.banner.fontSize,
        fontWeight: tl.banner.fontWeight,
        padding: tl.banner.padding,
        marginTop: tl.banner.marginTop,
        marginBottom: tl.banner.marginBottom,
        borderRadius: tl.banner.borderRadius,
        letterSpacing: tl.banner.letterSpacing,
        textTransform: tl.banner.textTransform,
      }}>
        END OF TERM REPORT
      </div>

      {/* Student Info Box */}
      <div style={{
        border: tl.studentInfoBox.border,
        borderRadius: tl.studentInfoBox.borderRadius,
        padding: tl.studentInfoBox.padding,
        background: tl.studentInfoBox.background,
        boxShadow: tl.studentInfoBox.boxShadow,
        margin: tl.studentInfoBox.margin,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            {[
              ['Name', `${s.first_name} ${s.last_name}`],
              ['Gender', s.gender],
              ['Class', s.class_name],
              ['Stream', s.stream_name],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex',
                borderBottom: tl.studentInfoContainer.borderBottom,
                fontSize: Math.min(tl.studentInfoContainer.fontSize, 14),
                padding: '2px 0',
                marginBottom: 2,
              }}>
                <span style={{ fontWeight: 'bold', marginRight: 6, color: '#000', minWidth: 70 }}>{label}:</span>
                <span style={{ color: tl.studentValue.color, fontStyle: tl.studentValue.fontStyle as any, fontWeight: tl.studentValue.fontWeight }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            {[
              ['Student No', String(s.student_id)],
              ['Adm No', s.admission_no],
              ['Term', 'Term 2'],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex',
                borderBottom: tl.studentInfoContainer.borderBottom,
                fontSize: Math.min(tl.studentInfoContainer.fontSize, 14),
                padding: '2px 0',
                marginBottom: 2,
              }}>
                <span style={{ fontWeight: 'bold', marginRight: 6, color: '#000', minWidth: 80 }}>{label}:</span>
                <span style={{ color: tl.studentValue.color, fontStyle: tl.studentValue.fontStyle as any, fontWeight: tl.studentValue.fontWeight }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ribbon */}
      <div style={{
        background: tl.ribbon.background,
        color: tl.ribbon.color,
        fontWeight: tl.ribbon.fontWeight,
        fontSize: Math.min(tl.ribbon.fontSize, 14),
        padding: tl.ribbon.padding,
        borderRadius: tl.ribbon.borderRadius,
        textAlign: tl.ribbon.textAlign,
        marginLeft: tl.ribbon.marginSidesPercent,
        marginRight: tl.ribbon.marginSidesPercent,
        marginBottom: 8,
      }}>
        Marks attained in each subject
      </div>

      {/* Subjects Table */}
      <table style={{ borderCollapse: tl.table.borderCollapse, width: '100%', fontSize: tl.table.fontSize }}>
        <thead>
          <tr>
            {['SUBJECT', 'MT', 'EOT', 'GRADE', 'COMMENT', 'INIT'].map(h => (
              <th key={h} style={{
                background: tl.table.th.background,
                border: tl.table.th.border,
                padding: tl.table.th.padding,
                textAlign: tl.table.th.textAlign,
                color: tl.table.th.color,
              }}>{h}</th>
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
            <td colSpan={3} style={{ border: tl.table.td.border, padding: tl.table.td.padding }}>
              AVERAGE: {Math.round(totalEnd / s.results.length)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Assessment Box */}
      <div style={{ marginTop: 12, fontSize: tl.page.fontSize }}>
        <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 6 }}>General Assessment</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...tl.assessmentBox as any }}>
          <div>
            <p><strong>Aggregates:</strong> 14</p>
            <p><strong>Division:</strong> Division 2</p>
          </div>
          <div style={tl.assessmentBox as any}>Promoted to next class</div>
        </div>
      </div>

      {/* Comments */}
      <div style={{ borderTop: tl.comments.borderTop, paddingTop: tl.comments.paddingTop, marginTop: tl.comments.marginTop, fontSize: tl.page.fontSize - 1 }}>
        {[
          ["Class Teacher's Comment", 'Promising results, keep more focused.'],
          ['DOS Comment', 'Very good performance, keep it up.'],
          ["Headteacher's Comment", 'You are a first grade material.'],
        ].map(([label, text]) => (
          <div key={label} style={{ marginBottom: 6 }}>
            <span style={{
              display: 'inline-block',
              background: tl.comments.ribbon.background,
              color: tl.comments.ribbon.color,
              borderRadius: tl.comments.ribbon.borderRadius,
              padding: tl.comments.ribbon.padding,
              marginRight: 10,
              fontSize: tl.page.fontSize - 1,
            }}>{label}:</span>
            <span style={{
              color: tl.comments.text.color,
              fontStyle: tl.comments.text.fontStyle as any,
              borderBottom: tl.comments.text.borderBottom,
            }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Grade Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: tl.page.fontSize - 1 }}>
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
    </div>
  );
}

// ============================================================================
// MAIN: Kitchen Page
// ============================================================================
export default function ReportsKitchen() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

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
      showMsg('error', 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleActivate = async (id: number) => {
    setSaving(true);
    try {
      const res = await fetch('/api/report-templates/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: id }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveId(id);
        showMsg('success', 'Active template updated! Reports will now use this template.');
      } else {
        showMsg('error', data.error || 'Failed to activate');
      }
    } catch {
      showMsg('error', 'Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (id: number, sourceName: string) => {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/report-templates/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${sourceName} (Custom)` }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', `Duplicated as "${data.name}"`);
        fetchData();
      } else {
        showMsg('error', data.error || 'Failed to duplicate');
      }
    } catch {
      showMsg('error', 'Network error');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/report-templates/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'Template deleted');
        fetchData();
      } else {
        showMsg('error', data.error || 'Cannot delete this template');
      }
    } catch {
      showMsg('error', 'Network error');
    }
  };

  const handleCreateNew = async () => {
    if (!newName.trim()) return;
    // Create a duplicate of template 1 with the new name
    const base = templates.find(t => t.id === 1) || templates[0];
    if (!base) return showMsg('error', 'No base template available');
    try {
      const res = await fetch('/api/report-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: 'Custom template',
          layout_json: base.layout_json,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg('success', `Template "${newName}" created`);
        setNewName('');
        setShowNewForm(false);
        fetchData();
      } else {
        showMsg('error', data.error || 'Failed to create');
      }
    } catch {
      showMsg('error', 'Network error');
    }
  };

  const previewTemplate = templates.find(t => t.id === previewId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/academics/reports')}
              className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm"
            >
              <ArrowLeft size={16} /> Back to Reports
            </button>
            <div className="h-4 w-px bg-gray-300" />
            <ChefHat size={22} className="text-amber-600" />
            <h1 className="text-lg font-bold text-gray-800">Reports Kitchen</h1>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Template Engine</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700"
            >
              <Plus size={14} /> New Template
            </button>
          </div>
        </div>
      </div>

      {/* Toast message */}
      {message && (
        <div className={`fixed top-16 right-4 z-50 px-4 py-2 rounded shadow-lg text-white text-sm ${message.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {message.text}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Intro banner */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Sparkles size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-amber-800">Template Engine</h2>
              <p className="text-sm text-amber-700 mt-0.5">
                Choose a design for your report cards. The <strong>active template</strong> is used automatically when printing reports.
                Switch at any time — changes apply instantly.
              </p>
            </div>
          </div>
        </div>

        {/* New template form */}
        {showNewForm && (
          <div className="bg-white border rounded-lg p-4 mb-6 shadow-sm">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus size={16} /> Create New Template</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Template name..."
                className="flex-1 border rounded px-3 py-1.5 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
              />
              <button
                onClick={handleCreateNew}
                disabled={!newName.trim()}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={14} className="inline mr-1" />Create
              </button>
              <button
                onClick={() => { setShowNewForm(false); setNewName(''); }}
                className="text-sm text-gray-500 px-3 py-1.5 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">New template starts as a copy of the Default Template. You can customize colors via JSON editing.</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            Loading templates...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {templates.map(template => {
              const isActive = template.id === activeId;
              const isPreviewing = template.id === previewId;
              const isDuplicating = duplicatingId === template.id;
              const isGlobal = template.school_id === null;

              return (
                <div
                  key={template.id}
                  className={`bg-white rounded-xl border-2 overflow-hidden shadow-sm transition-all ${
                    isActive ? 'border-green-500 shadow-green-100' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Mini preview */}
                  <div
                    className="relative overflow-hidden cursor-pointer"
                    style={{ height: 240, background: template.layout_json.page.background || '#fff' }}
                    onClick={() => setPreviewId(prev => prev === template.id ? null : template.id)}
                  >
                    <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: '238%', pointerEvents: 'none' }}>
                      <TemplatePreview layout={template.layout_json} school={SAMPLE_SCHOOL} />
                    </div>
                    <div className="absolute inset-0 bg-transparent hover:bg-black/5 transition-colors flex items-end p-2">
                      <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100">
                        Click to {isPreviewing ? 'close' : 'preview'}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                        <Check size={10} /> Active
                      </div>
                    )}
                  </div>

                  {/* Card footer */}
                  <div className="p-3 border-t">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <h3 className="font-semibold text-sm text-gray-800">{template.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {isGlobal && (
                          <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Built-in</span>
                        )}
                        {!isGlobal && (template as any).template_key && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">Official</span>
                        )}
                        {!isGlobal && !(template as any).template_key && (
                          <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">Custom</span>
                        )}
                      </div>
                    </div>

                    {/* Color swatches */}
                    <div className="flex gap-1.5 my-2">
                      {[
                        template.layout_json.banner.backgroundColor,
                        template.layout_json.studentInfoBox.border.split(' ').pop() || '#ccc',
                        template.layout_json.studentValue.color,
                        template.layout_json.table.th.background,
                        template.layout_json.comments.ribbon.background,
                      ].map((color, i) => (
                        <div
                          key={i}
                          title={color}
                          style={{ width: 16, height: 16, borderRadius: 3, background: color, border: '1px solid rgba(0,0,0,0.1)' }}
                        />
                      ))}
                      <span className="text-xs text-gray-400 ml-1 self-center">Color palette</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => setPreviewId(prev => prev === template.id ? null : template.id)}
                        className="flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-gray-50"
                      >
                        <Eye size={12} /> {isPreviewing ? 'Close' : 'Preview'}
                      </button>

                      <button
                        onClick={() => handleActivate(template.id)}
                        disabled={isActive || saving}
                        className={`flex items-center gap-1 text-xs rounded px-2 py-1 ${
                          isActive
                            ? 'bg-green-100 text-green-700 cursor-default'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        <Check size={12} /> {isActive ? 'Active' : 'Use This'}
                      </button>

                      <button
                        onClick={() => handleDuplicate(template.id, template.name)}
                        disabled={isDuplicating}
                        className="flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-gray-50"
                        title="Duplicate this template to create a custom version"
                      >
                        <Copy size={12} /> {isDuplicating ? '...' : 'Duplicate'}
                      </button>

                      {!isGlobal && template.id !== activeId && (
                        <button
                          onClick={() => handleDelete(template.id, template.name)}
                          className="flex items-center gap-1 text-xs border border-red-200 text-red-500 rounded px-2 py-1 hover:bg-red-50 ml-auto"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      {(template as any).template_key === 'northgate_official' && (
                        <button
                          onClick={() => router.push('/reports/northgate')}
                          className="flex items-center gap-1 text-xs bg-amber-600 text-white rounded px-2 py-1 hover:bg-amber-700 ml-auto"
                          title="Open Northgate report card generator"
                        >
                          <FileText size={12} /> Generate Reports
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full Preview Panel */}
        {previewTemplate && (
          <div className="mt-8 bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-blue-500" />
                <span className="font-semibold text-sm">Preview: <span className="text-blue-600">{previewTemplate.name}</span></span>
              </div>
              <div className="flex items-center gap-2">
                {previewTemplate.id !== activeId && (
                  <button
                    onClick={() => handleActivate(previewTemplate.id)}
                    disabled={saving}
                    className="bg-green-600 text-white text-sm px-3 py-1 rounded hover:bg-green-700"
                  >
                    <Check size={13} className="inline mr-1" />Use This Template
                  </button>
                )}
                {previewTemplate.id === activeId && (
                  <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                    <Check size={14} /> Currently Active
                  </span>
                )}
                <button
                  onClick={() => setPreviewId(null)}
                  className="text-sm text-gray-500 hover:text-gray-800 border rounded px-2 py-1"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <div style={{ minWidth: 600, maxWidth: 900, margin: '0 auto' }}>
                <TemplatePreview layout={previewTemplate.layout_json} school={SAMPLE_SCHOOL} />
              </div>
            </div>
          </div>
        )}

        {/* Template comparison side-by-side */}
        {templates.length >= 2 && !previewId && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <LayoutTemplate size={18} /> Side-by-Side Comparison
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {templates.slice(0, 2).map(t => (
                <div key={t.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className={`px-3 py-2 text-sm font-semibold flex items-center justify-between ${t.id === activeId ? 'bg-green-50 text-green-800 border-b border-green-200' : 'bg-gray-50 border-b'}`}>
                    <span className="flex items-center gap-2">
                      <Paintbrush size={14} />
                      {t.name}
                    </span>
                    {t.id === activeId && <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded">Active</span>}
                  </div>
                  <div className="p-3 overflow-x-auto">
                    <div style={{ transform: 'scale(0.75)', transformOrigin: 'top left', width: '133%' }}>
                      <TemplatePreview layout={t.layout_json} school={SAMPLE_SCHOOL} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
