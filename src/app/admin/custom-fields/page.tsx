'use client';
/**
 * Custom Fields admin — single-page CRUD for the per-school custom field
 * catalog. Lists active + archived fields, lets an authorised admin add /
 * edit / archive, and previews where each field shows up.
 *
 * Permission: requires `custom_fields.manage` for mutations. The page itself
 * is school-scoped (any signed-in user can READ the list).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, X, Type, Hash, Calendar,
  CheckSquare, List, ListChecks, Phone, Mail, Link as LinkIcon, AlignLeft,
} from 'lucide-react';
import type {
  CustomFieldDef, CustomFieldType, CustomFieldOption,
  FieldInput, CustomFieldValidation,
} from '@/lib/custom-fields';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText, showToast } from '@/lib/toast';

const TYPE_META: Record<CustomFieldType, { label: string; Icon: React.ElementType; hint: string }> = {
  text:        { label: 'Short text',  Icon: Type,        hint: 'Single line: name, code, sponsor.' },
  long_text:   { label: 'Long text',   Icon: AlignLeft,   hint: 'Multi-line: medical history, notes.' },
  number:      { label: 'Number',      Icon: Hash,        hint: 'Numeric: shoe size, weight, sibling count.' },
  date:        { label: 'Date',        Icon: Calendar,    hint: 'A calendar date (e.g. baptism date).' },
  boolean:     { label: 'Yes / No',    Icon: CheckSquare, hint: 'A simple toggle (e.g. has allergy).' },
  select:      { label: 'Single choice',Icon: List,       hint: 'Pick one from a fixed list.' },
  multiselect: { label: 'Multi choice', Icon: ListChecks, hint: 'Pick many from a fixed list.' },
  phone:       { label: 'Phone',       Icon: Phone,       hint: 'Phone number.' },
  email:       { label: 'Email',       Icon: Mail,        hint: 'Email address.' },
  url:         { label: 'URL',         Icon: LinkIcon,    hint: 'Web link.' },
};

export default function CustomFieldsAdminPage() {
  const { t, rich } = useI18n();
  const [fields, setFields]   = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomFieldDef | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/custom-fields?active_only=${showArchived ? '0' : '1'}`);
      const d   = await res.json();
      if (!res.ok || !d.success) throw new Error(d?.error || '');
      setFields(Array.isArray(d.fields) ? d.fields : []);
    } catch (e) { const m = (e as Error).message; setError((m && !(uiIsArabic() && isEnglishText(m)) ? m : t('customFields.page.loadFailed', "Failed to load"))); }
    finally { setLoading(false); }
  }, [showArchived]);
  useEffect(() => { void load(); }, [load]);

  async function archive(id: number) {
    if (!confirm(t('customFields.page.confirmArchive', "Archive this field? Existing student values stay in the database but the field stops appearing on forms and reports."))) return;
    const res = await fetch(`/api/admin/custom-fields/${id}`, { method: 'DELETE' });
    if (res.ok) load(); else showToast('error', t('customFields.page.archiveFailed', "Failed to archive"));
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('customFields.customFields')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {rich('customFields.page.intro', { code: <code dir="ltr" className="text-[11px] px-1 bg-slate-100 dark:bg-slate-800 rounded">{'{student.custom.<code>}'}</code> })}
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 shadow-sm"
        >
          <Plus size={14} /> {t('customFields.addField')}
        </button>
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
        {t('common.archived')}
      </label>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="animate-spin" size={14} /> {t('common.loading')}</div>
      ) : error ? (
        <div className="p-3 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm rounded">{error}</div>
      ) : !fields.length ? (
        <div className="p-10 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 text-sm">
          {t('common.nothingHere')} — <strong>{t('customFields.addField')}</strong>.
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {fields.map(f => {
            const T = TYPE_META[f.dataType];
            const Icon = T?.Icon ?? Type;
            return (
              <div key={f.id} className={`flex items-center gap-3 p-3 ${!f.isActive ? 'opacity-60' : ''}`}>
                <Icon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{f.label}</span>
                    <code dir="ltr" className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500">student.custom.{f.code}</code>
                    {f.isRequired && <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded">{t('customFields.page.required', "required")}</span>}
                    {!f.isActive   && <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 rounded">{t('customFields.page.archived', "archived")}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{T ? t(`customFields.page.type.${f.dataType}`, T.label) : ''}{f.description ? ` — ${f.description}` : ''}</p>
                </div>
                <button onClick={() => setEditing(f)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500" title={t('customFields.page.edit', "Edit")} aria-label={t('customFields.page.edit', "Edit")}><Pencil size={14} /></button>
                {f.isActive && (
                  <button onClick={() => archive(f.id)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded text-rose-500" title={t('customFields.page.archive', "Archive")} aria-label={t('customFields.page.archive', "Archive")}><Trash2 size={14} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing !== null && (
        <FieldEditorModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function FieldEditorModal({
  initial, onClose, onSaved,
}: {
  initial: CustomFieldDef | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, rich } = useI18n();
  const [label, setLabel]               = useState(initial?.label ?? '');
  const [code, setCode]                 = useState(initial?.code ?? '');
  const [codeTouched, setCodeTouched]   = useState(Boolean(initial));
  const [description, setDescription]   = useState(initial?.description ?? '');
  const [dataType, setDataType]         = useState<CustomFieldType>(initial?.dataType ?? 'text');
  const [options, setOptions]           = useState<CustomFieldOption[]>(initial?.options ?? []);
  const [isRequired, setIsRequired]     = useState(initial?.isRequired ?? false);
  const [isSearchable, setIsSearchable] = useState(initial?.isSearchable ?? true);
  const [defaultValue, setDefaultValue] = useState(initial?.defaultValue ?? '');
  const [displayOrder, setDisplayOrder] = useState(initial?.displayOrder ?? 100);
  const [validation, setValidation]     = useState<CustomFieldValidation>(initial?.validation ?? {});
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);

  // Auto-derive code from label until the user edits the code field manually.
  useEffect(() => {
    if (codeTouched) return;
    setCode(label.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''));
  }, [label, codeTouched]);

  const needsOptions = dataType === 'select' || dataType === 'multiselect';

  async function submit() {
    setSaving(true); setError(null);
    const payload: FieldInput = {
      code, label, description: description || null,
      dataType,
      options: needsOptions ? options.filter(o => o.value && o.label) : null,
      validation: Object.keys(validation).length ? validation : null,
      defaultValue: defaultValue || null,
      isRequired, isSearchable,
      displayOrder: Number(displayOrder) || 100,
      isActive: true,
    };
    try {
      const res = await fetch(
        initial ? `/api/admin/custom-fields/${initial.id}` : '/api/admin/custom-fields',
        { method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d?.error || '');
      onSaved();
    } catch (e) {
      const m = (e as Error).message;
      setError((m && !(uiIsArabic() && isEnglishText(m)) ? m : t('customFields.page.saveFailed', "Save failed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-slate-800 dark:text-white">{initial ? t('customFields.page.editTitle', "Edit field") : t('customFields.page.newTitle', "New custom field")}</h2>
          <button onClick={onClose} title={t('customFields.page.close', "Close")} aria-label={t('customFields.page.close', "Close")} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <Row label={t('customFields.page.label', "Label")}>
            <input value={label} onChange={e => setLabel(e.target.value)} className={inputCls} placeholder={t('customFields.page.labelPh', "Bus Route")} />
          </Row>
          <Row label={t('customFields.page.code', "Code")}>
            <input
              value={code}
              onChange={e => { setCode(e.target.value); setCodeTouched(true); }}
              onBlur={() => setCodeTouched(true)}
              className={inputCls + ' font-mono'}
              dir="ltr"
              placeholder="bus_route"
              disabled={Boolean(initial)}
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              {rich('customFields.page.codeHelp', { binding: <code dir="ltr">student.custom.{code || '<code>'}</code> })}
            </p>
          </Row>
          <Row label={t('customFields.page.typeLabel', "Type")}>
            <select value={dataType} onChange={e => setDataType(e.target.value as CustomFieldType)} className={inputCls}>
              {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{t(`customFields.page.type.${k}`, v.label)}</option>)}
            </select>
            <p className="text-[10px] text-slate-400 mt-0.5">{t(`customFields.page.hint.${dataType}`, TYPE_META[dataType].hint)}</p>
          </Row>
          <Row label={t('customFields.page.description', "Description")}>
            <input value={description ?? ''} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder={t('customFields.page.descPh', "Shown under the field in the form.")} />
          </Row>

          {needsOptions && (
            <Row label={t('customFields.page.options', "Options")}>
              <div className="space-y-1.5">
                {options.map((o, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input value={o.value} onChange={e => {
                      const next = [...options]; next[i] = { ...next[i], value: e.target.value }; setOptions(next);
                    }} placeholder={t('customFields.page.optValuePh', "value")} className={inputCls + ' font-mono w-1/3'} />
                    <input value={o.label} onChange={e => {
                      const next = [...options]; next[i] = { ...next[i], label: e.target.value }; setOptions(next);
                    }} placeholder={t('customFields.page.optLabelPh', "Label")} className={inputCls + ' flex-1'} />
                    <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} title={t('customFields.page.removeOption', "Remove option")} aria-label={t('customFields.page.removeOption', "Remove option")} className="px-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"><Trash2 size={12} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setOptions([...options, { value: '', label: '' }])} className="text-indigo-600 text-[11px] hover:underline">{t('customFields.page.addOption', "+ add option")}</button>
              </div>
            </Row>
          )}

          {(dataType === 'number' || dataType === 'text' || dataType === 'long_text') && (
            <Row label={t('customFields.page.validation', "Validation")}>
              <div className="grid grid-cols-2 gap-2">
                {dataType === 'number' ? (
                  <>
                    <input type="number" value={validation.min ?? ''} onChange={e => setValidation(v => ({ ...v, min: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder={t('customFields.page.min', "min")} className={inputCls} />
                    <input type="number" value={validation.max ?? ''} onChange={e => setValidation(v => ({ ...v, max: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder={t('customFields.page.max', "max")} className={inputCls} />
                  </>
                ) : (
                  <>
                    <input type="number" value={validation.minLength ?? ''} onChange={e => setValidation(v => ({ ...v, minLength: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder={t('customFields.page.minLength', "min length")} className={inputCls} />
                    <input type="number" value={validation.maxLength ?? ''} onChange={e => setValidation(v => ({ ...v, maxLength: e.target.value === '' ? undefined : Number(e.target.value) }))} placeholder={t('customFields.page.maxLength', "max length")} className={inputCls} />
                  </>
                )}
              </div>
            </Row>
          )}

          <Row label={t('customFields.page.default', "Default")}>
            <input value={defaultValue ?? ''} onChange={e => setDefaultValue(e.target.value)} className={inputCls} placeholder={t('customFields.page.defaultPh', "Optional default value")} />
          </Row>
          <Row label={t('customFields.page.order', "Display order")}>
            <input type="number" value={displayOrder} onChange={e => setDisplayOrder(Number(e.target.value) || 100)} className={inputCls} />
          </Row>

          <div className="flex items-center gap-4 pt-2">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} /> {t('customFields.page.isRequired', "Required")}</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={isSearchable} onChange={e => setIsSearchable(e.target.checked)} /> {t('customFields.page.searchable', "Searchable")}</label>
          </div>

          {error && <div className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">{t('customFields.page.cancel', "Cancel")}</button>
          <button onClick={submit} disabled={saving || !label.trim() || !code} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40">
            {saving ? t('customFields.page.saving', "Saving…") : initial ? t('customFields.page.save', "Save changes") : t('customFields.page.create', "Create field")}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</label>
      {children}
    </div>
  );
}
