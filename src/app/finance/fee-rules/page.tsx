'use client';

/**
 * Fee Rules — for a fee item, define which learners it applies to (explicit
 * classes / gender / boarding / term, optional segment amount) and PREVIEW the
 * affected learners before saving. Rules are ORed; conditions within a rule ANDed.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, Plus, Loader2, Trash2, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrency } from '@/hooks/useCurrency';

const emptyRule = { name: '', class_ids: [] as number[], gender: '', boarding: '', term_id: '', amount: '', priority: 100 };

export default function FeeRulesPage() {
  const { format } = useCurrency();
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [draft, setDraft] = useState({ ...emptyRule });
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
      if ((i.items || []).length) setSelected(i.items[0].id);
      setLoading(false);
    })();
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
    priority: draft.priority,
  }), [draft, selected]);

  const runPreview = useCallback(async () => {
    setBusy(true);
    try { const r = await fetch('/api/finance/fee-rules/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draftPayload) }); setPreview(await r.json()); }
    finally { setBusy(false); }
  }, [draftPayload]);

  const saveRule = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/finance/fee-rules/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draftPayload) });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Failed'); return; }
      toast.success('Rule added'); setDraft({ ...emptyRule }); setPreview(null); if (selected) loadRules(selected);
    } finally { setBusy(false); }
  }, [draftPayload, selected, loadRules]);

  const delRule = useCallback(async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    await fetch(`/api/finance/fee-rules/rules/${id}`, { method: 'DELETE' });
    if (selected) loadRules(selected);
  }, [selected, loadRules]);

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
  ].filter(Boolean).join(' · ') || 'all learners';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><SlidersHorizontal className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Fee Rules</h1><p className="text-sm text-gray-500 dark:text-gray-400">Who does each fee apply to?</p></div>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <button key={i.id} onClick={() => { setSelected(i.id); setPreview(null); setDraft({ ...emptyRule }); }} className={`px-3 py-1.5 rounded-full text-sm font-medium border ${selected === i.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>{i.name}</button>
        ))}
      </div>

      {/* Existing rules */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Rules for {item?.name} <span className="text-xs font-normal text-gray-400">(default {format(item?.default_amount)})</span></h2>
        {rules.length === 0 ? <p className="text-xs text-gray-400">No rules — this fee applies to nobody yet. Add one below.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {rules.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">{r.name || 'Rule'} <span className="text-xs text-gray-400">— {describe(r)}{r.amount != null ? ` · ${format(r.amount)}` : ''}</span></span>
                <button onClick={() => delRule(r.id)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Rule builder */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Add a rule</h2>
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
        <div className="flex items-center gap-2">
          <button onClick={runPreview} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm font-medium disabled:opacity-50"><Users className="w-4 h-4" /> Preview affected learners</button>
          <button onClick={saveRule} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"><Plus className="w-4 h-4" /> Add rule</button>
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
