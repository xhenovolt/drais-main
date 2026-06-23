'use client';

/**
 * Create / edit a single student fee item (charge).
 * - New: search a learner, pick a term, enter item + amount → POST.
 * - Edit: item + amount + discount → PATCH (learner/term fixed).
 * Posts to /api/finance/student_fee_items.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface FeeItem {
  id: number; student_id: number; term_id: number; item: string;
  amount: number; discount: number; student_name?: string;
}

export default function FeeItemModal({
  item, onClose, onSaved,
}: { item: FeeItem | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item;
  const [terms, setTerms] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [studentId, setStudentId] = useState<number | null>(item?.student_id ?? null);
  const [studentName, setStudentName] = useState<string>(item?.student_name ?? '');
  const [termId, setTermId] = useState<string>(item ? String(item.term_id) : '');
  const [name, setName] = useState(item?.item ?? '');
  const [amount, setAmount] = useState<number>(item?.amount ?? 0);
  const [discount, setDiscount] = useState<number>(item?.discount ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) return;
    fetch('/api/terms').then((r) => r.json()).then((j) => setTerms(j.data || j.terms || j || [])).catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    if (isEdit || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/students/full?q=${encodeURIComponent(q)}&limit=8`); const j = await r.json(); setResults(j.data || j.students || []); }
      catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q, isEdit]);

  const save = async () => {
    setError(null);
    if (!name.trim()) { setError('Item name is required'); return; }
    if (!(amount > 0)) { setError('Amount must be positive'); return; }
    if (!isEdit && (!studentId || !termId)) { setError('Pick a learner and a term'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/finance/student_fee_items', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { id: item!.id, item: name.trim(), amount, discount }
            : { student_id: studentId, term_id: Number(termId), item: name.trim(), amount, discount },
        ),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Save failed'); return; }
      toast.success(isEdit ? 'Fee item updated' : 'Fee item added');
      onSaved();
    } catch { setError('Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isEdit ? 'Edit fee item' : 'Add fee item'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {isEdit ? (
          <p className="text-xs text-gray-500">{item!.student_name || `Learner #${item!.student_id}`}</p>
        ) : (
          <div className="relative">
            {studentId ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm">
                <span>{studentName || `Learner #${studentId}`}</span>
                <button onClick={() => { setStudentId(null); setStudentName(''); }} className="text-xs text-indigo-600">change</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"><Search className="w-4 h-4 text-gray-400" /><input autoFocus placeholder="Search learner…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" /></div>
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow max-h-48 overflow-y-auto">
                    {results.map((s: any) => (
                      <button key={s.id} onClick={() => { setStudentId(s.id); setStudentName(s.full_name || s.name); setResults([]); setQ(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{s.full_name || s.name} <span className="text-xs text-gray-400">{s.admission_no}</span></button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!isEdit && (
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
            <option value="">Select term…</option>
            {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name || `Term ${t.id}`}</option>)}
          </select>
        )}

        <input placeholder="Item (e.g. Tuition Fee)" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Amount" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
          <input type="number" placeholder="Discount" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}
