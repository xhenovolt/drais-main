'use client';
/**
 * Custom field editor surfaced on the student detail page.
 *
 * Pulls active custom field definitions and the learner's current values
 * from /api/students/:id/custom-values, renders an input per field
 * matching its declared `dataType`, and PUTs the whole map back on save.
 *
 * Empty / cleared inputs send `null` so the row is dropped server-side
 * (sparse storage). Validation is enforced server-side; surface errors
 * inline via the response message.
 */
import React, { useEffect, useState, useCallback } from 'react';
import type { CustomFieldDef, CustomFieldValue } from '@/lib/custom-fields';

interface Props {
  studentId: number;
  /** Optional callback fired after a successful save. */
  onSaved?: () => void;
}

interface Loaded {
  fields: CustomFieldDef[];
  values: Record<string, CustomFieldValue>;
}

export function CustomFieldsPanel({ studentId, onSaved }: Props) {
  const [state, setState]   = useState<Loaded | null>(null);
  const [draft, setDraft]   = useState<Record<string, CustomFieldValue>>({});
  const [loading, setLoad]  = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [okMsg, setOk]      = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoad(true);
    setError(null);
    try {
      const res  = await fetch(`/api/students/${studentId}/custom-values`);
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load');
      setState({ fields: data.fields ?? [], values: data.values ?? {} });
      setDraft({ ...(data.values ?? {}) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoad(false);
    }
  }, [studentId]);

  useEffect(() => { void load(); }, [load]);

  function setVal(code: string, v: CustomFieldValue) {
    setDraft(d => ({ ...d, [code]: v }));
  }

  async function save() {
    if (!state) return;
    setSaving(true); setError(null); setOk(null);
    try {
      const res  = await fetch(`/api/students/${studentId}/custom-values`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: draft }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Save failed');
      setOk(`Saved (${data.written} written, ${data.cleared} cleared${data.skipped?.length ? `, skipped: ${data.skipped.join(', ')}` : ''})`);
      onSaved?.();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading)        return <p className="text-xs text-gray-400">Loading custom fields…</p>;
  if (error && !state) return <p className="text-xs text-rose-500">Failed to load: {error}</p>;
  if (!state)         return null;
  if (!state.fields.length) {
    return (
      <div className="text-xs text-gray-400 italic">
        No custom fields configured for this school yet.{' '}
        <a className="text-indigo-500 hover:underline" href="/admin/custom-fields">Configure fields →</a>
      </div>
    );
  }

  const dirty = JSON.stringify(state.values) !== JSON.stringify(draft);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {state.fields.map(f => (
          <FieldInput
            key={f.id}
            field={f}
            value={draft[f.code] ?? null}
            onChange={v => setVal(f.code, v)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
        </button>
        {dirty && (
          <button
            type="button" onClick={() => setDraft({ ...state.values })}
            className="text-xs text-gray-500 hover:text-gray-700"
          >Reset</button>
        )}
        {okMsg && <span className="text-xs text-emerald-600">{okMsg}</span>}
        {error && <span className="text-xs text-rose-500">{error}</span>}
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: {
  field: CustomFieldDef;
  value: CustomFieldValue;
  onChange: (v: CustomFieldValue) => void;
}) {
  const labelEl = (
    <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">
      {field.label}{field.isRequired && <span className="text-rose-500">*</span>}
    </label>
  );
  const baseCls =
    'w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400';

  switch (field.dataType) {
    case 'long_text':
      return (
        <div className="sm:col-span-2">
          {labelEl}
          <textarea
            rows={3} value={String(value ?? '')}
            onChange={e => onChange(e.target.value || null)}
            className={baseCls}
          />
          {field.description && <p className="text-[10px] text-gray-400 mt-0.5">{field.description}</p>}
        </div>
      );
    case 'number':
      return (
        <div>
          {labelEl}
          <input
            type="number"
            value={value == null ? '' : String(value)}
            onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
            min={field.validation?.min} max={field.validation?.max}
            className={baseCls}
          />
        </div>
      );
    case 'date':
      return (
        <div>
          {labelEl}
          <input
            type="date"
            value={value ? String(value).slice(0, 10) : ''}
            onChange={e => onChange(e.target.value || null)}
            className={baseCls}
          />
        </div>
      );
    case 'boolean':
      return (
        <div className="flex items-center gap-2 pt-3">
          <input
            id={`cf-${field.id}`} type="checkbox"
            checked={Boolean(value)} onChange={e => onChange(e.target.checked)}
          />
          <label htmlFor={`cf-${field.id}`} className="text-xs text-gray-700 dark:text-gray-200">
            {field.label}
          </label>
        </div>
      );
    case 'select': {
      const opts = field.options ?? [];
      return (
        <div>
          {labelEl}
          <select
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value || null)}
            className={baseCls}
          >
            <option value="">— none —</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    }
    case 'multiselect': {
      const opts = field.options ?? [];
      const arr  = Array.isArray(value) ? value : [];
      return (
        <div className="sm:col-span-2">
          {labelEl}
          <div className="flex flex-wrap gap-1.5">
            {opts.map(o => {
              const active = arr.includes(o.value);
              return (
                <button
                  type="button" key={o.value}
                  onClick={() => {
                    const next = active ? arr.filter(x => x !== o.value) : [...arr, o.value];
                    onChange(next.length ? next : null);
                  }}
                  className={[
                    'px-2 py-0.5 text-[11px] rounded border',
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700',
                  ].join(' ')}
                >{o.label}</button>
              );
            })}
          </div>
        </div>
      );
    }
    case 'email':
    case 'phone':
    case 'url':
    default: {
      const type =
        field.dataType === 'email' ? 'email' :
        field.dataType === 'phone' ? 'tel'   :
        field.dataType === 'url'   ? 'url'   : 'text';
      return (
        <div>
          {labelEl}
          <input
            type={type}
            value={String(value ?? '')}
            onChange={e => onChange(e.target.value || null)}
            placeholder={field.defaultValue ?? ''}
            className={baseCls}
          />
        </div>
      );
    }
  }
}
