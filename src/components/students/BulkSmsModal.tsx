"use client";
/**
 * Bulk SMS to the guardians of selected learners. Uses the existing
 * /api/admin/comm/broadcast endpoint with the 'learner_parents' audience
 * (school-scoped resolver → only in-tenant learners resolve). Two-step:
 * dryRun preview (recipient count) → send. School prefix is applied
 * server-side; quiet hours respected unless force.
 */
import React, { useState } from 'react';
import { X, Loader, Send, Users, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function BulkSmsModal({
  studentIds, open, onClose, onSent,
}: {
  studentIds: number[];
  open: boolean;
  onClose: () => void;
  onSent?: (count: number) => void;
}) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ count: number; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const audience = { type: 'learner_parents' as const, studentIds };

  async function doPreview() {
    setErr(''); setBusy(true); setPreview(null);
    try {
      const res = await fetch('/api/admin/comm/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, audience, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Preview failed'); return; }
      setPreview({ count: data.recipientCount ?? 0, body: data.previewBody ?? message });
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  async function doSend() {
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/admin/comm/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, audience, force }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Send failed'); return; }
      onSent?.(data.sentCount ?? preview?.count ?? 0);
      onClose();
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  const input = "w-full mt-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onMouseDown={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            <p className="text-sm font-bold text-slate-800 dark:text-white">{`${t('operations.bulkSms')} — ${studentIds.length} ${t('people.learners')}`}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          {err && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('operations.messages')}</span>
            <textarea
              value={message}
              onChange={e => { setMessage(e.target.value); setPreview(null); }}
              rows={4} maxLength={1600}
              placeholder="Type your message. The school sender prefix is added automatically."
              className={input}
            />
            <span className="text-[10px] text-slate-400">{message.length}/1600</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
            Send even during quiet hours
          </label>

          {preview && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                {preview.count} recipient{preview.count === 1 ? '' : 's'} will receive this message. Confirm to send.
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">{t('common.cancel')}</button>
          {!preview ? (
            <button onClick={doPreview} disabled={busy || !message.trim()} className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader className="w-4 h-4 animate-spin" />} {t('actions.preview')}
            </button>
          ) : (
            <button onClick={doSend} disabled={busy || preview.count === 0} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {`${t('actions.send')} — ${preview.count}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
