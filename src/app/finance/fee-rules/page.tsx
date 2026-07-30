'use client';

/**
 * Fee Rules — for a fee item, define which learners it applies to (explicit
 * classes / gender / boarding / term, optional segment amount) and PREVIEW the
 * affected learners before saving. Rules are ORed; conditions within a rule ANDed.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Plus, Loader2, Trash2, Users, Edit, X, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrency } from '@/hooks/useCurrency';

const emptyRule = { name: '', class_ids: [] as number[], gender: '', boarding: '', term_id: '', amount: '', priority: 100 };

export default function FeeRulesPage() {
  const { format } = useCurrency();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [draft, setDraft] = useState({ ...emptyRule });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ count: number; learners: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [i, c, t] = await Promise.all([
        fetch('/api/finance/fee-rules/items').then((r) => r.json()),
        fetch('/api/classes').then((r) => r.json()).catch(() => ({})),
        fetch('/api/terms').then((r) => r.json()).catch(() => ({})),
      ]);
      setItems(i.items || []);
      setClasses(c.data || []);
      setTerms(t.data || []);
      // Deep link from Fee Items' "Scope" badge (?item=<id>) — otherwise
      // default to the first item, as before.
      const fromUrl = Number(searchParams.get('item'));
      const items_: any[] = i.items || [];
      if (fromUrl && items_.some((it) => it.id === fromUrl)) setSelected(fromUrl);
      else if (items_.length) setSelected(items_[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRules = useCallback(async (itemId: number) => {
    const r = await fetch(`/api/finance/fee-rules/rules?fee_item_id=${itemId}`, { cache: 'no-store' });
    const j = await r.json();
    setRules(j.rules || []);
  }, []);
  useEffect(() => { if (selected) loadRules(selected); }, [selected, loadRules]);

  const draftPayload = useMemo(() => ({
    fee_item_id: selected,
    name: draft.name || null,
    class_ids: draft.class_ids.length ? draft.class_ids : null,
    gender: draft.gender || null,
    boarding: draft.boarding || null,
    term_id: draft.term_id ? Number(draft.term_id) : null,
    amount: draft.amount === '' ? null : Number(draft.amount),
    priority: Number(draft.priority) || 100,
  }), [draft, selected]);

  const runPreview = useCallback(async () => {
    setBusy(true);
    try { const r = await fetch('/api/finance/fee-rules/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draftPayload) }); setPreview(await r.json()); }
    finally { setBusy(false); }
  }, [draftPayload]);

  const resetDraft = useCallback(() => { setDraft({ ...emptyRule }); setEditingId(null); setPreview(null); }, []);

  const saveRule = useCallback(async () => {
    setBusy(true);
    try {
      const editing = editingId != null;
      const r = await fetch(`/api/finance/fee-rules/rules${editing ? `/${editingId}` : ''}`, {
        method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draftPayload),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Failed'); return; }
      toast.success(editing ? 'Rule updated' : 'Rule added');
      resetDraft(); if (selected) loadRules(selected);
    } finally { setBusy(false); }
  }, [draftPayload, editingId, selected, loadRules, resetDraft]);

  const editRule = useCallback((r: any) => {
    const classIds = r.class_ids ? JSON.parse(typeof r.class_ids === 'string' ? r.class_ids : JSON.stringify(r.class_ids)) : [];
    setDraft({
      name: r.name || '', class_ids: classIds || [], gender: r.gender || '', boarding: r.boarding || '',
      term_id: r.term_id ? String(r.term_id) : '', amount: r.amount != null ? String(r.amount) : '', priority: r.priority ?? 100,
    });
    setEditingId(r.id);
    setPreview(null);
  }, []);

  const delRule = useCallback(async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    await fetch(`/api/finance/fee-rules/rules/${id}`, { method: 'DELETE' });
    if (editingId === id) resetDraft();
    if (selected) loadRules(selected);
  }, [selected, loadRules, editingId, resetDraft]);

  const toggleClass = (id: number) => setDraft((d) => ({ ...d, class_ids: d.class_ids.includes(id) ? d.class_ids.filter((x) => x !== id) : [...d.class_ids, id] }));
  const classNameOf = (id: number) => classes.find((c) => c.id === id)?.name || `#${id}`;
  const item = items.find((i) => i.id === selected);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  if (!items.length) return <div className="max-w-3xl mx-auto p-6 text-sm text-gray-500">Create a fee item first on <a href="/finance/fee-items" className="text-indigo-600 underline">Fee Items</a>.</div>;

  const describe = (r: any) => [
    r.class_ids ? `classes: ${(JSON.parse(typeof r.class_ids === 'string' ? r.class_ids : JSON.stringify(r.class_ids)) || []).map(classNameOf).join(', ')}` : null,
    r.gender ? `gender: ${r.gender}` : null,
    r.boarding ? r.boarding : null,
    r.term_id ? `term ${r.term_id}` : null,
    `priority ${r.priority ?? 100}`,
  ].filter(Boolean).join(' · ') || 'all learners';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><SlidersHorizontal className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Fee Rules</h1><p className="text-sm text-gray-500 dark:text-gray-400">Who does each fee apply to?</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <button key={i.id} onClick={() => { setSelected(i.id); resetDraft(); }} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${selected === i.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>{i.name}</button>
        ))}
      </div>

      {/* Existing rules */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Rules for {item?.name} <span className="text-xs font-normal text-gray-400">(default {format(item?.default_amount)})</span></h2>
        {rules.length === 0 ? <p className="text-xs text-gray-400">No rules — this fee applies to nobody yet. Add one below.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {rules.map((r) => (
              <li key={r.id} className={`py-2 flex items-center justify-between text-sm ${editingId === r.id ? 'bg-indigo-50 dark:bg-indigo-900/10 -mx-4 px-4' : ''}`}>
                <span className="text-gray-700 dark:text-gray-300">{r.name || 'Rule'} <span className="text-xs text-gray-400">— {describe(r)}{r.amount != null ? ` · ${format(r.amount)}` : ''}</span></span>
                <span className="flex items-center gap-1">
                  <button onClick={() => editRule(r)} className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Edit this rule"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => delRule(r.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete this rule"><Trash2 className="w-4 h-4" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Rule builder */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{editingId != null ? 'Edit rule' : 'Add a rule'}</h2>
          {editingId != null && <button onClick={resetDraft} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /> Cancel edit</button>}
        </div>
        <input placeholder="Label (e.g. P1–P3 tuition)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
        <div>
          <p className="text-xs text-gray-500 mb-1">Classes (leave empty for any)</p>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {classes.map((c) => (
              <button key={c.id} onClick={() => toggleClass(c.id)} className={`px-2 py-1 rounded text-xs border ${draft.class_ids.includes(c.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"><option value="">Any gender</option><option value="male">Male</option><option value="female">Female</option></select>
          <select value={draft.boarding} onChange={(e) => setDraft({ ...draft, boarding: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"><option value="">Any residence</option><option value="boarding">Boarders</option><option value="day">Day</option></select>
          <select value={draft.term_id} onChange={(e) => setDraft({ ...draft, term_id: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"><option value="">Any term</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name || `Term ${t.id}`}</option>)}</select>
          <input type="number" placeholder={`Amount (def ${item?.default_amount ?? 0})`} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
        </div>
        <div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Priority
            <input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 100 })} className="w-24 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <span>lower runs first — when two rules both match a learner, the lowest priority number wins.</span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runPreview} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm font-medium disabled:opacity-50"><Users className="w-4 h-4" /> Preview affected learners</button>
          <button onClick={saveRule} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {editingId != null ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {editingId != null ? 'Save changes' : 'Add rule'}
          </button>
        </div>
        {preview && (
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-3 text-sm">
            <p className="font-medium text-indigo-700 dark:text-indigo-300">{preview.count} learner(s) affected</p>
            <p className="text-xs text-gray-500 mt-1">{preview.learners.map((l: any) => l.name).slice(0, 12).join(', ')}{preview.count > 12 ? '…' : ''}</p>
          </div>
        )}
      </div>
    </div>
  );
}
