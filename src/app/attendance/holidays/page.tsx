'use client';

/**
 * /attendance/holidays — operator surface for the Phase 3 holidays
 * table. Populating this table is what makes the attendance rule
 * evaluator's holiday verdict actually fire (instead of marking
 * Independence Day as absent for every learner).
 */
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  CalendarDays, Plus, Trash2, Loader2, Globe2, School, Save, X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Holiday {
  id: number;
  school_id: number | null;
  holiday_date: string;          // YYYY-MM-DD
  name: string;
  scope: 'national' | 'school' | 'class';
  applies_to_classes: string | null;
  created_at: string;
}

interface FormState {
  holiday_date: string;
  name: string;
  scope: 'school' | 'class';   // national requires super-admin; default schoolyear
}

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function HolidaysPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const { data, mutate, isLoading } = useSWR<{ holidays: Holiday[] }>(
    `/api/admin/holidays?year=${year}`,
    fetcher,
  );
  const holidays = data?.holidays ?? [];

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>({
    holiday_date: todayIso(),
    name: '',
    scope: 'school',
  });
  const [saving, setSaving] = useState(false);

  // Group by month for tidy display.
  const grouped = useMemo(() => {
    const buckets: Record<string, Holiday[]> = {};
    for (const h of holidays) {
      const month = h.holiday_date.slice(0, 7);
      (buckets[month] ??= []).push(h);
    }
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
  }, [holidays]);

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/holidays', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          holiday_date: form.holiday_date,
          name: form.name.trim(),
          scope: form.scope,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to create');
      toast.success('Holiday added');
      setForm({ holiday_date: todayIso(), name: '', scope: 'school' });
      setCreating(false);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (h: Holiday) => {
    if (!confirm(`Remove "${h.name}" on ${h.holiday_date}?`)) return;
    try {
      const r = await fetch(`/api/admin/holidays/${h.id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Delete failed');
      toast.success('Holiday removed');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
            Holidays
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Days listed here are skipped by the attendance engine — no
            late/absent verdict fires for learners or staff. National
            entries (school-wide) come from the Ministry of Education
            calendar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            {[year - 1, year, year + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setCreating(c => !c)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {creating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {creating ? 'Cancel' : 'Add holiday'}
          </button>
        </div>
      </div>

      {creating && (
        <form
          onSubmit={submitNew}
          className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
        >
          <Field label="Date">
            <input
              type="date"
              value={form.holiday_date}
              onChange={e => setForm(f => ({ ...f, holiday_date: e.target.value }))}
              required
              className={inputCls}
            />
          </Field>
          <Field label="Name">
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Independence Day"
              required
              className={inputCls}
            />
          </Field>
          <Field label="Scope">
            <select
              value={form.scope}
              onChange={e => setForm(f => ({ ...f, scope: e.target.value as FormState['scope'] }))}
              className={inputCls}
            >
              <option value="school">This school</option>
              <option value="class">Specific class(es)</option>
            </select>
          </Field>
          <div className="sm:col-span-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : holidays.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <CalendarDays className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            No holidays for {year}. Add one to skip the attendance verdict on that day.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([month, entries]) => (
            <section
              key={month}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
            >
              <header className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 dark:border-gray-700">
                {new Date(`${month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </header>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {entries.map(h => (
                  <li key={h.id} className="px-4 py-2.5 flex items-center gap-3">
                    <div className="w-14 text-center">
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {parseInt(h.holiday_date.slice(8, 10), 10)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500">
                        {new Date(h.holiday_date).toLocaleDateString('default', { weekday: 'short' })}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {h.name}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                        {h.school_id === null
                          ? <><Globe2 className="w-3 h-3" /> National</>
                          : <><School className="w-3 h-3" /> {h.scope === 'class' ? `Classes: ${h.applies_to_classes ?? '—'}` : 'School-wide'}</>}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(h)}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
