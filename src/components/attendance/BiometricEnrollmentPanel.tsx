"use client";
/**
 * Biometric Enrollment Panel — view & manage a person's biometric identity
 * (hardening Parts 4 & 5, exposing what the model already supports):
 *   • multiple fingerprints (biometric_templates.finger_index)
 *   • a card (biometric_enrollments.card_number)
 *   • PIN + status
 * Card edit and finger removal are data ops done here; ADDING a finger needs
 * a real capture on the enrollment station, so that routes to the device —
 * we never fabricate a template.
 */
import React, { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Fingerprint, CreditCard, Search, Trash2, Plus, Loader2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function BiometricEnrollmentPanel() {
  const [role, setRole] = useState<'staff' | 'student'>('staff');
  const [q, setQ] = useState('');
  const [person, setPerson] = useState<{ id: number; person_id: number; name: string } | null>(null);

  const { data: staffData } = useSWR<any>(role === 'staff' && q.length > 1 ? `/api/staff?search=${encodeURIComponent(q)}&limit=8` : null);
  const { data: stuData } = useSWR<any>(role === 'student' && q.length > 1 ? `/api/students/enrolled?search=${encodeURIComponent(q)}&limit=8` : null);
  const results = useMemo(() => {
    const rows = (role === 'staff' ? staffData?.data : stuData?.data) || [];
    return rows.map((s: any) => ({ id: s.id, person_id: s.person_id ?? s.id, name: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.display_name }));
  }, [role, staffData, stuData]);

  const { data, mutate, isLoading } = useSWR<any>(person ? `/api/biometric/enrollment-status?person_id=${person.person_id}&role=${role}` : null, fetcher);

  const [cardEdit, setCardEdit] = useState('');
  const setCard = useCallback(async () => {
    if (!data?.enrollment?.id) return;
    await apiFetch('/api/biometric/enrollment-status', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_card', enrollment_id: data.enrollment.id, card_number: cardEdit.trim() }), successMessage: 'Card updated' });
    setCardEdit(''); mutate();
  }, [data, cardEdit, mutate]);
  const removeFinger = useCallback(async (fi: number) => {
    if (!data?.enrollment?.id) return;
    await apiFetch('/api/biometric/enrollment-status', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_finger', enrollment_id: data.enrollment.id, finger_index: fi }), successMessage: 'Finger removed' });
    mutate();
  }, [data, mutate]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
        <ShieldCheck className="w-4 h-4 text-indigo-500" /> Biometric enrollment lookup
      </p>

      {/* person search */}
      <div className="flex gap-2">
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
          {(['staff', 'student'] as const).map(r => (
            <button key={r} onClick={() => { setRole(r); setPerson(null); }} className={`px-2.5 py-1.5 ${role === r ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{r === 'staff' ? 'Staff' : 'Learner'}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 flex-1">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a person…" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
      </div>
      {!person && results.length > 0 && (
        <div className="max-h-32 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-100 dark:border-gray-700">
          {results.map((r: any) => (
            <button key={r.id} onClick={() => { setPerson(r); setQ(r.name); }} className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{r.name}</button>
          ))}
        </div>
      )}

      {person && (
        <div className="space-y-3">
          {isLoading && <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />}
          {data && !data.enrolled && <p className="text-sm text-gray-400">{person.name} has no biometric enrollment yet — enrol on the station.</p>}
          {data?.enrolled && (
            <>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>PIN <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">{data.enrollment.pin}</span></span>
                <span className={`px-1.5 py-0.5 rounded ${data.methods.fingerprint ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-500'}`}>{data.fingers.length} finger(s)</span>
                <span className={`px-1.5 py-0.5 rounded ${data.methods.card ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-gray-100 text-gray-500'}`}>{data.methods.card ? 'card ✓' : 'no card'}</span>
              </div>

              {/* fingers */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1 flex items-center gap-1"><Fingerprint className="w-3 h-3" /> Fingerprints</p>
                {data.fingers.length === 0 ? <p className="text-xs text-gray-400">None enrolled.</p> : (
                  <div className="space-y-1">
                    {data.fingers.map((f: any) => (
                      <div key={f.finger_index} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 dark:text-gray-200">{f.name}{f.quality ? <span className="text-gray-400"> · q{f.quality}</span> : ''}{f.device ? <span className="text-gray-400"> · {f.device}</span> : ''}</span>
                        <button onClick={() => removeFinger(f.finger_index)} className="text-rose-500 hover:text-rose-600" title="Remove this finger"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <a href="/attendance/enrollment" className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"><Plus className="w-3 h-3" /> Add a finger (capture on the enrollment station)</a>
              </div>

              {/* card */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Card</p>
                <div className="flex items-center gap-2">
                  <input value={cardEdit} onChange={(e) => setCardEdit(e.target.value)} placeholder={data.enrollment.card_number || 'Card number / UID'} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" />
                  <button onClick={setCard} disabled={!cardEdit.trim()} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-50">Save</button>
                </div>
                {data.enrollment.card_number && <p className="text-[10px] text-gray-400 mt-1">Current: <span className="font-mono">{data.enrollment.card_number}</span> — this person can check in by fingerprint or card.</p>}
              </div>
            </>
          )}
          <button onClick={() => { setPerson(null); setQ(''); }} className="text-[11px] text-gray-400 hover:underline">← look up another person</button>
        </div>
      )}
    </div>
  );
}
