"use client";

import React, { useState, useEffect } from 'react';
import { Settings, Clock, Save, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import LivePopupSettings from '@/components/attendance/LivePopupSettings';
import AttendanceSmsPolicies from '@/components/attendance/AttendanceSmsPolicies';
import DeviceTimePolicySettings from '@/components/attendance/DeviceTimePolicySettings';

interface AttendanceRule {
  id: number;
  rule_name: string;
  rule_description: string | null;
  arrival_start_time: string | null;
  arrival_end_time: string | null;
  late_threshold_minutes: number;
  absence_cutoff_time: string | null;
  closing_time: string | null;
  applies_to: 'students' | 'teachers' | 'all';
  applies_to_classes: string | null;
  ignore_duplicate_scans_within_minutes: number;
  weekday_mask: number | null;
}

type AppliesTo = 'students' | 'teachers' | 'all';

interface FormState {
  rule_name: string;
  rule_description: string;
  arrival_start_time: string;
  arrival_end_time: string;
  late_threshold_minutes: number;
  absence_cutoff_time: string;
  closing_time: string;
  applies_to: AppliesTo;
  applies_to_classes: string;
  ignore_duplicate_scans_within_minutes: number;
  weekday_mask: number;
}

const defaultForm: FormState = {
  rule_name: 'Default',
  rule_description: '',
  arrival_start_time: '07:00',
  arrival_end_time: '08:30',
  late_threshold_minutes: 15,
  absence_cutoff_time: '10:00',
  closing_time: '17:00',
  applies_to: 'students' as AppliesTo,
  applies_to_classes: '',
  ignore_duplicate_scans_within_minutes: 2,
  weekday_mask: 31, // Mon–Fri
};

function formatTimeForInput(t: string | null): string {
  if (!t) return '';
  // "HH:MM:SS" → "HH:MM"
  return t.substring(0, 5);
}

const SCOPE_LABEL: Record<AppliesTo, string> = {
  students: 'Learners',
  teachers: 'Staff',
  all: 'Everyone',
};

/** Build a form state from a saved rule (or the defaults for a given scope). */
function formFromRule(rule: AttendanceRule | null, scope: AppliesTo): FormState {
  if (!rule) {
    return {
      ...defaultForm,
      applies_to: scope,
      rule_name: scope === 'students' ? 'Learners' : scope === 'teachers' ? 'Staff' : 'Everyone',
    };
  }
  return {
    rule_name: rule.rule_name || SCOPE_LABEL[scope],
    rule_description: rule.rule_description || '',
    arrival_start_time: formatTimeForInput(rule.arrival_start_time),
    arrival_end_time: formatTimeForInput(rule.arrival_end_time),
    late_threshold_minutes: rule.late_threshold_minutes ?? 15,
    absence_cutoff_time: formatTimeForInput(rule.absence_cutoff_time),
    closing_time: formatTimeForInput(rule.closing_time),
    applies_to: scope,
    applies_to_classes: rule.applies_to_classes || '',
    ignore_duplicate_scans_within_minutes: rule.ignore_duplicate_scans_within_minutes ?? 2,
    weekday_mask: rule.weekday_mask ?? 31,
  };
}

export default function AttendanceSettingsPage() {
  const [scope, setScope] = useState<AppliesTo>('students');
  const [rulesByScope, setRulesByScope] = useState<Partial<Record<AppliesTo, AttendanceRule>>>({});
  const [form, setForm] = useState<FormState>(() => formFromRule(null, 'students'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [existingId, setExistingId] = useState<number | null>(null);

  // Load existing settings (all scopes)
  useEffect(() => {
    fetch('/api/attendance/settings')
      .then((r) => r.json())
      .then((data) => {
        const rules: Partial<Record<AppliesTo, AttendanceRule>> = data.rules || {};
        setRulesByScope(rules);
        // Default to the first configured scope, else learners.
        const initial: AppliesTo = rules.students ? 'students' : rules.teachers ? 'teachers' : rules.all ? 'all' : 'students';
        setScope(initial);
        setForm(formFromRule(rules[initial] || null, initial));
        setExistingId(rules[initial]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Switch which person-group's window is being edited.
  const switchScope = (next: AppliesTo) => {
    setScope(next);
    setForm(formFromRule(rulesByScope[next] || null, next));
    setExistingId(rulesByScope[next]?.id ?? null);
    setToast(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);

    try {
      const res = await fetch('/api/attendance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, applies_to: scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setExistingId(data.rule_id);
      // Remember this scope as configured so the badge + switching reflect it.
      setRulesByScope((prev) => ({
        ...prev,
        [scope]: { ...(prev[scope] || {}), id: data.rule_id, ...form, applies_to: scope } as AttendanceRule,
      }));
      setToast({ type: 'success', msg: `${SCOPE_LABEL[scope]} window saved` });
    } catch (err: any) {
      setToast({ type: 'error', msg: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          <Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Attendance Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure arrival times, late thresholds, and attendance policies
          </p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Scope selector — configure each person group separately */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Who are you configuring?</h2>
        <p className="text-xs text-gray-500">
          Each group has its own arrival/presence window. Configure <strong>Learners</strong> and <strong>Staff</strong> separately,
          or set an <strong>Everyone</strong> default. A group-specific window always overrides the Everyone default.
        </p>
        <div className="flex flex-wrap gap-3">
          {(['students', 'teachers', 'all'] as const).map((opt) => {
            const configured = !!rulesByScope[opt];
            const active = scope === opt;
            return (
              <button
                key={opt}
                onClick={() => switchScope(opt)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                }`}
              >
                {SCOPE_LABEL[opt]}
                {configured && (
                  <CheckCircle className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-green-500'}`} />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          {rulesByScope[scope]
            ? `Editing the saved ${SCOPE_LABEL[scope]} window.`
            : `No ${SCOPE_LABEL[scope]} window yet — fill the fields below and save to create one.`}
        </p>
      </div>

      {/* Time Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-500" />
          Time Configuration — {SCOPE_LABEL[scope]}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Arrival Start Time
            </label>
            <input
              type="time"
              value={form.arrival_start_time}
              onChange={(e) => set('arrival_start_time', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">When attendance tracking begins each day</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Arrival End Time (On-time cutoff)
            </label>
            <input
              type="time"
              value={form.arrival_end_time}
              onChange={(e) => set('arrival_end_time', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">After this time, learners are marked late</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Late Threshold (minutes)
            </label>
            <input
              type="number"
              min={0}
              max={120}
              value={form.late_threshold_minutes}
              onChange={(e) => set('late_threshold_minutes', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Grace period after arrival end time before marking &quot;late&quot;
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Absence Cutoff Time
            </label>
            <input
              type="time"
              value={form.absence_cutoff_time}
              onChange={(e) => set('absence_cutoff_time', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              After this time, anyone who hasn&apos;t checked in is marked absent
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              School Closing Time
            </label>
            <input
              type="time"
              value={form.closing_time}
              onChange={(e) => set('closing_time', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">End of school day — departure scans expected around this time</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Duplicate Scan Window (minutes)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={form.ignore_duplicate_scans_within_minutes}
              onChange={(e) => set('ignore_duplicate_scans_within_minutes', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Ignore repeated scans from the same person within this window</p>
          </div>
        </div>
      </div>

      {/* School days */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">School Days</h2>
        <p className="text-xs text-gray-500">Days the school operates. Punches on non-school days are recorded as &quot;weekend/closed&quot; and don&apos;t count as present/late or trigger parent SMS. Schools that teach on Saturday/Sunday should enable those days.</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Mon', bit: 1 }, { label: 'Tue', bit: 2 }, { label: 'Wed', bit: 4 },
            { label: 'Thu', bit: 8 }, { label: 'Fri', bit: 16 }, { label: 'Sat', bit: 32 }, { label: 'Sun', bit: 64 },
          ].map((d) => {
            const on = (form.weekday_mask & d.bit) !== 0;
            return (
              <button
                key={d.bit}
                type="button"
                onClick={() => set('weekday_mask', on ? (form.weekday_mask & ~d.bit) : (form.weekday_mask | d.bit))}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  on
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        {form.weekday_mask === 0 && <p className="text-xs text-red-600">Select at least one school day.</p>}
      </div>

      {/* Rule label (this scope) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{SCOPE_LABEL[scope]} Rule Details</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Rule Name
          </label>
          <input
            type="text"
            value={form.rule_name}
            onChange={(e) => set('rule_name', e.target.value)}
            placeholder="e.g. Term 1 2026 Schedule"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description (optional)
          </label>
          <textarea
            value={form.rule_description}
            onChange={(e) => set('rule_description', e.target.value)}
            rows={2}
            placeholder="Brief note about this rule set..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Save (time + scope rules) */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : existingId ? `Update ${SCOPE_LABEL[scope]} Window` : `Save ${SCOPE_LABEL[scope]} Window`}
        </button>
      </div>

      {/* Device time policy (own save) */}
      <DeviceTimePolicySettings />

      {/* Live popup configuration (own save) */}
      <LivePopupSettings />

      {/* Attendance SMS / notification policies (own CRUD) */}
      <AttendanceSmsPolicies />
    </div>
  );
}
