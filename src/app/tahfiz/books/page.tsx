'use client';

/**
 * Tahfiz Books — Book Structure Engine (Phase 2).
 * Global canonical books (enable per school), custom school books, and a live
 * Qur'an portion selector (Surah/Ayah · Page · Juz · Hizb) backed by the seeded
 * authoritative reference data.
 */
import { useEffect, useState, useCallback } from 'react';
import { BookOpen, Check, Plus, X, ToggleLeft, ToggleRight, BookMarked, Pencil, Trash2 } from 'lucide-react';

const j = (u, opts) => fetch(u, opts).then(r => r.json());

export default function TahfizBooksPage() {
  const [catalog, setCatalog] = useState(null);
  const [msg, setMsg] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selectorBook, setSelectorBook] = useState(null);

  const load = useCallback(async () => {
    const d = await j('/api/tahfiz/books/catalog').catch(() => null);
    setCatalog(d || { global: [], custom: [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(book) {
    const r = await j('/api/tahfiz/books/enable', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global_book_id: book.id, enabled: !book.enabled }) }).catch(() => null);
    setMsg(r?.success ? `${book.title_en} ${r.enabled ? 'enabled' : 'disabled'}` : (r?.error || 'Failed')); load();
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Tahfiz Books</h1>
      <p className="text-xs text-slate-400 mb-4">Enable global canonical books (shared, accurate reference data), or add your own custom books.</p>
      {msg && <div className="mb-3 text-sm rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-slate-600 dark:text-slate-300">{msg}</div>}

      {/* Global books */}
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Global books</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {!catalog ? <p className="text-sm text-slate-400">Loading…</p> : catalog.global.length === 0 ? <p className="text-sm text-slate-400">No global books.</p> :
          catalog.global.map(b => (
            <div key={b.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-800 dark:text-white">{b.title_en} {b.title_ar ? <span className="text-slate-400 font-normal">· {b.title_ar}</span> : null}</p>
                  <p className="text-[11px] text-slate-400">{b.structure_type} · {b.total_units} {b.unit_label}s · {b.source_note || ''}</p>
                </div>
                <button onClick={() => toggle(b)} title={b.enabled ? 'Disable' : 'Enable'} className="flex-shrink-0">
                  {b.enabled ? <ToggleRight className="w-8 h-8 text-emerald-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {b.enabled && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> Enabled for your school</span>}
                {b.structure_type === 'quran' && <button onClick={() => setSelectorBook(b)} className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600"><BookMarked className="w-3 h-3" /> Portion selector</button>}
              </div>
            </div>
          ))}
      </div>

      {/* Custom books */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Custom books</h2>
        <button onClick={() => setAddingCustom(true)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600"><Plus className="w-3.5 h-3.5" /> Add custom book</button>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {!catalog ? <p className="text-sm text-slate-400 p-4">Loading…</p> : catalog.custom.length === 0 ? <p className="text-sm text-slate-400 p-4">No custom books yet.</p> :
          catalog.custom.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200 min-w-0 truncate">{b.title}</span>
              <span className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[11px] text-slate-400">{b.structure_type} · {b.total_units ?? '?'} {b.unit_label}s</span>
                {/* A book you can create but never correct is a permanent typo
                    in the curriculum — plans, portions and records all hang
                    off it. */}
                <button onClick={() => setEditing(b)} title="Edit this book"
                  className="p-1 text-slate-400 hover:text-indigo-600"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setDeleting(b)} title="Remove this book"
                  className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
              </span>
            </div>
          ))}
      </div>

      {addingCustom && <AddCustom onClose={() => setAddingCustom(false)} onAdded={() => { setAddingCustom(false); setMsg('Custom book added'); load(); }} />}
      {editing && <EditCustom book={editing} onClose={() => setEditing(null)}
        onSaved={(t) => { setEditing(null); setMsg(`Saved "${t}"`); load(); }} />}
      {deleting && <DeleteCustom book={deleting} onClose={() => setDeleting(null)}
        onDone={(t) => { setDeleting(null); setMsg(`Removed "${t}"`); load(); }} />}
      {selectorBook && <QuranSelector onClose={() => setSelectorBook(null)} />}
    </div>
  );
}

function AddCustom({ onClose, onAdded }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('ordered_lessons');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true); setErr('');
    const r = await j('/api/tahfiz/books/custom', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, structure_type: type }) }).catch(() => null);
    setBusy(false);
    if (r?.success) onAdded(); else setErr(r?.error || 'Failed');
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-slate-800 dark:text-white">Add custom book</h2><button onClick={onClose} className="p-1 text-slate-400"><X className="w-5 h-5" /></button></div>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Book title (e.g. local Qaida)" className="w-full mb-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm outline-none text-slate-800 dark:text-white" />
        <select value={type} onChange={e => setType(e.target.value)} className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm">
          <option value="ordered_lessons">Ordered lessons (primer/qaida)</option>
          <option value="versed_poem">Versed poem (matn/abyat)</option>
          <option value="chaptered_text">Chaptered text</option>
        </select>
        {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}
        <button onClick={save} disabled={busy || !title.trim()} className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Create book'}</button>
      </div>
    </div>
  );
}

const TYPE_OPTIONS = [
  ['ordered_lessons', 'Ordered lessons (primer/qaida)'],
  ['versed_poem', 'Versed poem (matn/abyat)'],
  ['chaptered_text', 'Chaptered text'],
];

/** Correct a custom book in place. Only changed fields are sent. */
function EditCustom({ book, onClose, onSaved }) {
  const [title, setTitle] = useState(book.title ?? '');
  const [type, setType] = useState(book.structure_type ?? 'ordered_lessons');
  const [unitLabel, setUnitLabel] = useState(book.unit_label ?? '');
  const [totalUnits, setTotalUnits] = useState(book.total_units ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    const r = await j(`/api/tahfiz/books/${book.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        structure_type: type,
        unit_label: unitLabel,
        total_units: totalUnits === '' ? null : Number(totalUnits),
      }),
    }).catch(() => null);
    setBusy(false);
    // Show what the server said. "Failed" on its own leaves nobody able to act.
    if (r?.success) onSaved(r.book?.title ?? title);
    else setErr(r?.error || 'Could not save — the server did not respond.');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 dark:text-white">Edit book</h2>
          <button onClick={onClose} className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <label className="block mb-2">
          <span className="text-[11px] text-slate-400">Title</span>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm outline-none text-slate-800 dark:text-white" />
        </label>

        <label className="block mb-2">
          <span className="text-[11px] text-slate-400">Structure</span>
          <select value={type} onChange={e => setType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white">
            {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <span className="text-[11px] text-slate-400">Unit label</span>
            <input value={unitLabel} onChange={e => setUnitLabel(e.target.value)} placeholder="lesson"
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-400">Total units</span>
            <input type="number" min={0} value={totalUnits} onChange={e => setTotalUnits(e.target.value)} placeholder="—"
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white" />
          </label>
        </div>

        {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}
        <button onClick={save} disabled={busy || !title.trim()}
          className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

/** Retire a custom book. Refused by the server while it is still in use. */
function DeleteCustom({ book, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function remove() {
    setBusy(true); setErr('');
    const r = await j(`/api/tahfiz/books/${book.id}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' })
      .catch(() => null);
    setBusy(false);
    if (r?.success) onDone(r.deleted ?? book.title);
    else setErr(r?.error || 'Could not remove — the server did not respond.');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 dark:text-white">Remove “{book.title}”?</h2>
          <button onClick={onClose} className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          The book stops appearing in pickers. Existing plans and records keep their history, and
          this is refused outright if the book is still being taught from.
        </p>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional, recorded)"
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white" />
        {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={remove} disabled={busy}
            className="flex-1 rounded-lg bg-rose-600 text-white py-2.5 text-sm font-semibold disabled:opacity-50">
            {busy ? 'Removing…' : 'Remove book'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Live Qur'an portion selector — Surah/Ayah · Page · Juz · Hizb. */
function QuranSelector({ onClose }) {
  const [ref, setRef] = useState(null);
  const [mode, setMode] = useState('surah');
  const [fromSurah, setFromSurah] = useState(1);
  const [fromAyah, setFromAyah] = useState(1);
  const [toSurah, setToSurah] = useState(1);
  const [toAyah, setToAyah] = useState(7);
  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(2);
  const [juz, setJuz] = useState(1);
  const [hizb, setHizb] = useState(1);

  useEffect(() => { j('/api/tahfiz/quran/reference').then(setRef).catch(() => {}); }, []);
  const surahs = ref?.surahs ?? [];
  const sName = (n) => surahs.find(s => s.number === Number(n))?.name_translit || `Surah ${n}`;
  const sAyahs = (n) => surahs.find(s => s.number === Number(n))?.ayah_count || 1;

  let address = '';
  if (mode === 'surah') address = `${sName(fromSurah)} ${fromSurah}:${fromAyah} → ${sName(toSurah)} ${toSurah}:${toAyah}`;
  else if (mode === 'page') address = `Pages ${fromPage}–${toPage}`;
  else if (mode === 'juz') address = `Juzʾ ${juz}` + (ref ? ` (from ${sName(ref.juz[juz-1]?.start_surah)} ${ref.juz[juz-1]?.start_ayah}, p${ref.juz[juz-1]?.start_page})` : '');
  else if (mode === 'hizb') address = `Ḥizb ${hizb}` + (ref ? ` (from ${sName(ref.hizb[hizb-1]?.start_surah)} ${ref.hizb[hizb-1]?.start_ayah}, p${ref.hizb[hizb-1]?.start_page})` : '');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-slate-800 dark:text-white">Qur'an portion selector</h2><button onClick={onClose} className="p-1 text-slate-400"><X className="w-5 h-5" /></button></div>
        {!ref ? <p className="text-sm text-slate-400">Loading reference…</p> : (
          <>
            <div className="flex gap-1 mb-3">
              {['surah','page','juz','hizb'].map(m => (
                <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${mode===m?'bg-indigo-600 text-white':'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{m === 'surah' ? 'Surah/Ayah' : m}</button>
              ))}
            </div>
            {mode === 'surah' && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Sel label="From surah" value={fromSurah} onChange={setFromSurah} opts={surahs.map(s => [s.number, `${s.number}. ${s.name_translit}`])} />
                <Num label={`From ayah (1–${sAyahs(fromSurah)})`} value={fromAyah} onChange={setFromAyah} max={sAyahs(fromSurah)} />
                <Sel label="To surah" value={toSurah} onChange={setToSurah} opts={surahs.map(s => [s.number, `${s.number}. ${s.name_translit}`])} />
                <Num label={`To ayah (1–${sAyahs(toSurah)})`} value={toAyah} onChange={setToAyah} max={sAyahs(toSurah)} />
              </div>
            )}
            {mode === 'page' && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Num label="From page (1–604)" value={fromPage} onChange={setFromPage} max={604} />
                <Num label="To page (1–604)" value={toPage} onChange={setToPage} max={604} />
              </div>
            )}
            {mode === 'juz' && <div className="mb-3"><Num label="Juzʾ (1–30)" value={juz} onChange={setJuz} max={30} /></div>}
            {mode === 'hizb' && <div className="mb-3"><Num label="Ḥizb (1–60)" value={hizb} onChange={setHizb} max={60} /></div>}
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 text-sm text-indigo-800 dark:text-indigo-200">
              <span className="text-[11px] uppercase tracking-wide text-indigo-400 block">Selected portion</span>{address}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">This selector will drive portion assignment in the daily register (Phase 4).</p>
          </>
        )}
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, opts }) {
  return <label className="block"><span className="text-[11px] text-slate-400">{label}</span>
    <select value={value} onChange={e => onChange(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-sm">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select></label>;
}
function Num({ label, value, onChange, max }) {
  return <label className="block"><span className="text-[11px] text-slate-400">{label}</span>
    <input type="number" min={1} max={max} value={value} onChange={e => onChange(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-sm" />
  </label>;
}
