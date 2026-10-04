'use client';

/**
 * Self-service offline database generation (Phase 7 sub-effort 23).
 * A school admin generates their own lean .drs — no founder/developer
 * action required. The school is derived server-side from the logged-in
 * session (src/app/api/schools/offline-export/route.ts) — there is no
 * field here for "which school," because there's nothing to choose: this
 * always exports the school the signed-in user belongs to.
 *
 * Honest progress, not fake steps: the backend currently runs this as one
 * long request (observed ~3-6 minutes for an ~800-student school against
 * live TiDB) rather than a resumable multi-step job, so this page shows a
 * single truthful "generating, please wait" state instead of inventing
 * granular step indicators the backend can't actually report mid-request.
 */
import React, { useState } from 'react';
import { Database, Loader2, Download, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function OfflineExportPage() {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ totalRows: number; generatedAt: string; sizeBytes: number } | null>(null);

  const canSubmit = passphrase.length >= 8 && passphrase === confirmPassphrase && !generating;

  const generate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/schools/offline-export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Generation failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const fileNameMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch?.[1] || 'school-offline.drs';
      const totalRows = Number(res.headers.get('x-drais-export-total-rows') || 0);
      const generatedAt = res.headers.get('x-drais-export-generated-at') || new Date().toISOString();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setLastResult({ totalRows, generatedAt, sizeBytes: blob.size });
      toast.success('Offline database generated and downloaded');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Generation failed';
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30"><Database className="w-6 h-6 text-teal-600 dark:text-teal-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Offline Database</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Generate your own encrypted offline copy — no developer involved.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-teal-600" />
          <p>This generates a <strong>.drs</strong> file for <strong>your school only</strong> — students, staff, classes, enrollments, roles and accounts. Large historical data (attendance history, marks already recorded, audit/device logs) is intentionally left out to keep the file small; the structure for all of it is still present, so nothing breaks offline — those just start empty.</p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-500">Encryption passphrase (min. 8 characters)</label>
          <input
            type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Choose a passphrase to protect this file"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          />
          <label className="block text-xs font-medium text-gray-500">Confirm passphrase</label>
          <input
            type="password" value={confirmPassphrase} onChange={(e) => setConfirmPassphrase(e.target.value)}
            placeholder="Re-enter the same passphrase"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          />
          {passphrase && confirmPassphrase && passphrase !== confirmPassphrase && (
            <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Passphrases don't match.</p>
          )}
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Anyone who opens this file needs this exact passphrase. There is no recovery if it's lost — write it down somewhere safe.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={generate} disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating your offline database — this can take a few minutes, please don't close this page…</>
          ) : (
            <><Download className="w-4 h-4" /> Generate offline database</>
          )}
        </button>

        {lastResult && (
          <div className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
            Last generated {new Date(lastResult.generatedAt).toLocaleString()} — {lastResult.totalRows.toLocaleString()} rows, {(lastResult.sizeBytes / 1048576).toFixed(2)} MB.
          </div>
        )}
      </div>
    </div>
  );
}
