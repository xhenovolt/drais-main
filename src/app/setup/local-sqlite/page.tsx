'use client';

/**
 * /setup/local-sqlite — first-run local database setup (Phase 7 sub-effort 41).
 *
 * Reached from the login screen's connection picker when switching to
 * "Local Server (SQLite)" for the first time (DbModeBadge.tsx checks
 * GET /api/db-mode's `sqliteFileExists` before sending the user here
 * instead of just switching — a returning user with an already-set-up
 * install never sees this page). Deliberately public (see
 * src/lib/routes/auth-scope.ts and middleware.ts's PUBLIC_ROUTES) — this
 * is what BOOTSTRAPS the local install, so no session can exist yet.
 *
 * Two paths, matching what `npm run dist:win` can produce:
 *   Automatic  — one-click install of a school `scripts/build/
 *                prepare-drs-bundle.mjs` baked into this build.
 *   Customize  — pick a different .drs from disk and type its passphrase.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface BundledSchool { schoolId: number; schoolName: string; createdAt: string }

export default function LocalSqliteSetupPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<BundledSchool[] | null>(null);
  const [tab, setTab] = useState<'automatic' | 'customize'>('automatic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsForce, setNeedsForce] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [lastBundledAttempt, setLastBundledAttempt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/desktop/drs-bundle', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((j) => { if (!cancelled) { setSchools(j.schools || []); if (!j.schools?.length) setTab('customize'); } })
      .catch(() => { if (!cancelled) { setSchools([]); setTab('customize'); } });
    return () => { cancelled = true; };
  }, []);

  async function finishAndGoToLogin() {
    // import-drs already persisted DRAIS_DB_MODE=local-sqlite server-side —
    // nothing left to do but land on the login screen it now applies to.
    router.push('/login');
  }

  async function installBundled(schoolId: number, force = false) {
    setBusy(true); setError(null); setNeedsForce(false); setLastBundledAttempt(schoolId);
    try {
      const r = await fetch('/api/desktop/import-drs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bundledSchoolId: schoolId, force }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.code === 'TARGET_EXISTS') setNeedsForce(true);
        setError(j.error || 'Setup failed');
        return;
      }
      await finishAndGoToLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  async function installCustom(force = false) {
    if (!file) { setError('Choose a .drs file first.'); return; }
    if (!passphrase) { setError('Enter the .drs passphrase.'); return; }
    setBusy(true); setError(null); setNeedsForce(false);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('passphrase', passphrase);
      if (force) form.set('force', 'true');
      const r = await fetch('/api/desktop/import-drs', { method: 'POST', body: form });
      const j = await r.json();
      if (!r.ok) {
        if (j.code === 'TARGET_EXISTS') setNeedsForce(true);
        setError(j.error || 'Import failed');
        return;
      }
      await finishAndGoToLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Set up local DRAIS</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            This machine has no local database yet. Choose how to set it up.
          </p>
        </div>

        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          {(['automatic', 'customize'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(null); setNeedsForce(false); }}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400'
              }`}
            >
              {t === 'automatic' ? 'Automatic' : 'Customize'}
            </button>
          ))}
        </div>

        {tab === 'automatic' && (
          <div className="space-y-3">
            {schools === null ? (
              <p className="text-sm text-gray-400">Checking for bundled school data…</p>
            ) : schools.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No school data was bundled with this installer. Use the Customize tab to import a .drs file.
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Is this computer being set up for one of these schools?
                </p>
                {schools.map((s) => (
                  <button
                    key={s.schoolId}
                    type="button"
                    disabled={busy}
                    onClick={() => installBundled(s.schoolId)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 disabled:opacity-50"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{s.schoolName}</div>
                    <div className="text-xs text-gray-400">exported {new Date(s.createdAt).toLocaleDateString()}</div>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'customize' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">.drs file</label>
              <input
                type="file"
                accept=".drs"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600 dark:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Passphrase</label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent text-sm"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => installCustom(false)}
              className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Setting up…' : 'Import and set up'}
            </button>
          </div>
        )}

        {needsForce && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3 text-sm">
            <p className="text-amber-800 dark:text-amber-200">
              A local database already exists on this machine. Replacing it discards whatever is currently there.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => (tab === 'automatic' && lastBundledAttempt !== null ? installBundled(lastBundledAttempt, true) : installCustom(true))}
              className="mt-2 text-amber-700 dark:text-amber-300 font-medium underline disabled:opacity-50"
            >
              Replace it anyway
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <p className="text-xs text-gray-400">
          Prefer to skip this and start with an empty local database?{' '}
          <button type="button" onClick={() => router.push('/login')} className="underline">
            Skip for now
          </button>
        </p>
      </div>
    </div>
  );
}
