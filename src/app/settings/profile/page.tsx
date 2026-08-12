"use client";
import React, { useState, useEffect, useRef } from 'react';
import { User, Save, Loader2, Upload, Camera, Lock, Eye, EyeOff, Monitor } from 'lucide-react';
import { showToast } from '@/lib/toast';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import { useI18n } from '@/components/i18n/I18nProvider';

interface ProfileData {
  id: number;
  username: string;
  email: string;
  phone: string;
  role: string;
  profilePhoto: string;
  firstName: string;
  lastName: string;
}

export default function ProfilePage() {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; user: ProfileData }>('/api/profile', swrFetcher);
  const user = data?.user;

  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', profilePhoto: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone || '',
        profilePhoto: user.profilePhoto || '',
      });
    }
  }, [user]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'drais/profiles');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm(prev => ({ ...prev, profilePhoto: data.url }));
      showToast('success', 'Photo uploaded — click Save to apply');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showToast('success', 'Profile updated successfully');
      mutate();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) {
      showToast('error', 'Passwords do not match');
      return;
    }
    if (passwords.newPassword.length < 8) {
      showToast('error', 'Password must be at least 8 characters');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password change failed');
      showToast('success', 'Password changed successfully');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      showToast('error', err.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <span className="ml-2 text-gray-500">Loading profile...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-red-500">
        <span>Failed to load profile. Please try again.</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.profile')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your account details and photo</p>
      </div>

      {/* Photo + Identity */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-6">
          {/* Avatar */}
          <div className="relative group">
            {form.profilePhoto ? (
              <img src={form.profilePhoto} alt="Profile" className="w-24 h-24 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <User className="w-10 h-10 text-indigo-500" />
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 p-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-lg"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{form.firstName} {form.lastName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">@{user?.username || 'user'}</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 capitalize">{user?.role}</span>
          </div>
        </div>
      </section>

      {/* Personal Info */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Personal Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
            <input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
            <input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </section>

      {/* Password Change */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Lock className="w-4 h-4" /> Change Password
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
            <input
              type={showCurrent ? 'text' : 'password'}
              value={passwords.currentPassword}
              onChange={e => setPasswords(p => ({ ...p, currentPassword: e.target.value }))}
              className={inputClass}
            />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2 top-8 text-gray-400 hover:text-gray-600">
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
            <input
              type={showNew ? 'text' : 'password'}
              value={passwords.newPassword}
              onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))}
              className={inputClass}
            />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-8 text-gray-400 hover:text-gray-600">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Password</label>
            <input
              type="password"
              value={passwords.confirmPassword}
              onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={handlePasswordChange}
            disabled={changingPassword || !passwords.currentPassword || !passwords.newPassword}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors text-sm font-semibold"
          >
            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </section>

      <ActiveSessions />
    </div>
  );
}

/**
 * Where you are signed in.
 *
 * The endpoints for this existed and had never worked: they read
 * `user_sessions`, a table holding 0 rows and lacking half the columns they
 * selected (including school_id), so the query threw into a catch and returned
 * 500. Real sessions are in `sessions`. Repointed, so this panel now has
 * something true to show.
 *
 * It belongs on the profile rather than only under Admin: noticing a sign-in
 * you do not recognise is something the account OWNER does, and asking an
 * administrator to check on your behalf is how it never gets checked.
 */
function ActiveSessions() {
  const { data, isLoading, mutate } = useSWR<any>('/api/auth/sessions', swrFetcher, {
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];

  const describe = (s: any) => {
    const ua = String(s.user_agent ?? '');
    const os =
      /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' :
      /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' :
      /Linux/i.test(ua) ? 'Linux' : null;
    const browser =
      /Edg\//i.test(ua) ? 'Edge' : /OPR\//i.test(ua) ? 'Opera' :
      /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' :
      /Safari\//i.test(ua) ? 'Safari' : null;
    // Derived from the user agent because that is what the row actually
    // stores — better an honest "Unknown device" than an invented label.
    return [browser, os].filter(Boolean).join(' on ') || 'Unknown device';
  };

  const endOne = async (id: number) => {
    if (!window.confirm('Sign out this device? Anyone using it will have to sign in again.')) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
      // NOTE: this module's showToast takes (type, message) — the rest of the
      // file calls it that way. Getting it backwards renders the type as the
      // message and silently drops the styling.
      showToast(r.ok ? 'success' : 'error', r.ok ? 'Signed out that device' : 'Could not sign out that device');
      if (r.ok) mutate();
    } finally { setBusy(null); }
  };

  const endOthers = async () => {
    if (!window.confirm('Sign out every other device? You will stay signed in here.')) return;
    setBusy(-1);
    try {
      const r = await fetch('/api/auth/sessions/logout-others', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      showToast(r.ok ? 'success' : 'error',
        r.ok ? `Signed out ${j?.sessions_terminated ?? 0} other device(s)` : 'Could not sign out other devices');
      if (r.ok) mutate();
    } finally { setBusy(null); }
  };

  return (
    <section className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm space-y-4">
      <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <Monitor className="w-4 h-4 text-indigo-500" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Where you are signed in
        </h2>
        {rows.length > 1 && (
          <button
            onClick={endOthers}
            disabled={busy === -1}
            className="ml-auto text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
          >
            {busy === -1 ? 'Signing out…' : 'Sign out other devices'}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500">
          No active sessions found. If you are reading this while signed in, tell an administrator — it means
          sessions are not being recorded.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                s.is_current
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-100">
                  {describe(s)}
                  {s.is_current && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      this device
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {s.ip_address || 'unknown IP'}
                  {s.last_active ? ` · last active ${new Date(s.last_active).toLocaleString()}` : ''}
                  {s.created_at ? ` · signed in ${new Date(s.created_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              {!s.is_current && (
                <button
                  onClick={() => endOne(s.id)}
                  disabled={busy === s.id}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy === s.id ? '…' : 'Sign out'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-400">
        If you do not recognise a device here, sign it out and change your password.
      </p>
    </section>
  );
}
