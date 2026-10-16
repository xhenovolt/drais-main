'use client';
import React, { useState, useMemo, useEffect } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import {
  MessageSquare, Settings as SettingsIcon, FileText, Workflow, Activity,
  Loader2, Send, RotateCcw, AlertCircle, CheckCircle2, Clock, Ban, ShieldAlert, Eye,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

/** A server sentence for a toast: as sent in English, a general Arabic message in Arabic (pages translate what they know). */
const serverMsg = (m: unknown, fallback: string) => {
  const s = typeof m === 'string' && m ? m : '';
  if (!s) return fallback;
  return uiIsArabic() && isEnglishText(s) ? fallback : s;
};

/** An event code (learner.attendance.absent) as shown: the code in English, its Arabic name in Arabic. */
const eventName = (t: (k: string, f?: string) => string, code: string) =>
  code ? t(`commPages.admin.evt.${String(code).replace(/\./g, '_')}`, code) : code;

const fetcher = async (u: string) => {
  const r = await fetch(u, { credentials: 'same-origin' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(b?.error || `HTTP ${r.status}`);
    (e as any).status = r.status;
    throw e;
  }
  return b;
};

type Tab = 'settings' | 'templates' | 'rules' | 'log' | 'broadcast';

export default function CommunicationsAdminPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('broadcast');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <MessageSquare className="w-6 h-6 text-indigo-500" />
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">{t('nav.communication._')}</h1>
          <p className="text-xs text-slate-400">{t('commPages.admin.subtitle')}</p>
        </div>
        <SmsQuotaBadge />
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <TabBtn active={tab==='broadcast'} onClick={() => setTab('broadcast')} icon={Send}>{t('actions.send')}</TabBtn>
        <TabBtn active={tab==='settings'}  onClick={() => setTab('settings')}  icon={SettingsIcon}>{t('settings.settings')}</TabBtn>
        <TabBtn active={tab==='templates'} onClick={() => setTab('templates')} icon={FileText}>{t('drce.templates')}</TabBtn>
        <TabBtn active={tab==='rules'}     onClick={() => setTab('rules')}     icon={Workflow}>{t('cafe.promotionRules')}</TabBtn>
        <TabBtn active={tab==='log'}       onClick={() => setTab('log')}       icon={Activity}>{t('operations.auditTrail')}</TabBtn>
      </div>

      {tab === 'broadcast' && <BroadcastPanel />}
      {tab === 'settings'  && <SettingsPanel />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'rules'     && <RulesPanel />}
      {tab === 'log'       && <DispatchLogPanel />}
    </div>
  );
}

/** The school's own SMS position — so they always see how many they have left. */
function SmsQuotaBadge() {
  const { t, formatNumber } = useI18n();
  const { data } = useSWR<any>('/api/sms/quota', fetcher, { refreshInterval: 60_000 });
  if (!data?.success) return null;
  const nf = (n: any) => formatNumber(Number(n || 0));
  const blocked = data.can_send === false;
  const label = data.quota == null
    ? (blocked ? t('commPages.admin.quota.unavailable') : t('commPages.admin.quota.unlimited'))
    : t('commPages.admin.quota.left', { n: nf(data.remaining ?? 0) });
  const tone = blocked
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    : (data.quota != null && data.remaining != null && data.remaining < 50)
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  return (
    <span className={`ms-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tone}`}
      title={blocked
        ? (data.reason === 'PLATFORM_BALANCE_DEPLETED' ? t('commPages.admin.quota.depleted') : t('commPages.admin.quota.exhausted'))
        : (data.quota != null ? t('commPages.admin.quota.used', { used: nf(data.used), quota: nf(data.quota) }) : t('commPages.admin.quota.noCap'))}>
      <MessageSquare className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 ${
        active
          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}>
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}

// ─── Broadcast ────────────────────────────────────────────────────────────────
function BroadcastPanel() {
  const { t, rich, digits } = useI18n();
  const fail = t('commPages.admin.failed');
  const { data: classesRes } = useSWR<any>('/api/classes',          fetcher);
  const { data: settingsRes } = useSWR<any>('/api/admin/comm/settings', fetcher);
  const classes: any[] = (classesRes as any)?.data ?? classesRes ?? [];
  const settings = settingsRes?.settings;

  const [audienceType, setAudienceType] = useState<'paste'|'all_parents'|'class_parents'|'all_staff'|'all_teachers'|'class_teachers'>('paste');
  const [classId,      setClassId]      = useState('');
  const [paste,        setPaste]        = useState('');
  const [message,      setMessage]      = useState('');
  const [preview,      setPreview]      = useState<any | null>(null);
  const [busy,         setBusy]         = useState<'preview' | 'send' | null>(null);

  function parsePastedPhones(): { phone: string; name?: string }[] {
    return paste
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => {
        // accept "+256... Name" or "+256..." or "Name <+256...>"
        const m = s.match(/^([^\s,]+)\s+(.+)$/) || s.match(/^(.+?)\s*<([^>]+)>$/);
        if (!m) return { phone: s };
        return s.includes('<')
          ? { phone: (m[2] ?? '').trim(), name: (m[1] ?? '').trim() }
          : { phone: (m[1] ?? '').trim(), name: (m[2] ?? '').trim() };
      })
      .filter(p => p.phone);
  }

  function buildAudience() {
    switch (audienceType) {
      case 'paste':          return { type: 'paste', phones: parsePastedPhones() };
      case 'class_parents':  return { type: 'class_parents', classId: Number(classId) };
      default:               return { type: audienceType };
    }
  }

  async function doPreview() {
    if (!message.trim())                                 { toast.error(t('commPages.admin.bc.messageRequired')); return; }
    if (audienceType === 'paste'  && !paste.trim())       { toast.error(t('commPages.admin.bc.pasteOne')); return; }
    if (audienceType === 'class_parents' && !classId)     { toast.error(t('commPages.admin.bc.pickClass')); return; }
    setBusy('preview');
    try {
      const r = await fetch('/api/admin/comm/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, audience: buildAudience(), dryRun: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Preview failed');
      setPreview(j);
    } catch (e: any) { toast.error(serverMsg(e?.message, fail)); }
    finally { setBusy(null); }
  }

  async function doSend() {
    if (!preview) { await doPreview(); return; }
    if (preview.recipientCount === 0) { toast.error(t('commPages.admin.bc.noRecipients')); return; }
    const cost = preview.smsNeeded != null
      ? (preview.smsRemaining != null ? t('commPages.admin.bc.costLeft', { n: preview.smsNeeded, left: preview.smsRemaining }) : t('commPages.admin.bc.cost', { n: preview.smsNeeded }))
      : '';
    if (!confirm(t('commPages.admin.bc.confirm', { count: preview.recipientCount, cost }))) return;
    setBusy('send');
    try {
      const r = await fetch('/api/admin/comm/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, audience: buildAudience() }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Send failed');
      toast.success(`${t('commPages.admin.bc.sent', { sent: j.sent, failed: j.failed })}${j.queued ? t('commPages.admin.bc.queued', { n: j.queued }) : ''}${j.remaining != null ? t('commPages.admin.bc.left', { n: j.remaining }) : ''}`);
      globalMutate('/api/sms/quota');
      setPreview(null);
      setMessage('');
      setPaste('');
    } catch (e: any) { toast.error(serverMsg(e?.message, fail)); }
    finally { setBusy(null); }
  }

  const previewBody = settings?.prefix && !message.startsWith(settings.prefix)
    ? `${settings.prefix}\n${message}`
    : message;
  const charCount = previewBody.length;
  const smsCount  = Math.max(1, Math.ceil(charCount / 160));

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Compose */}
      <div className="space-y-4">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('commPages.admin.bc.audience')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <AudienceBtn current={audienceType} value="paste"          onSelect={setAudienceType}>{t('commPages.admin.aud.paste')}</AudienceBtn>
            <AudienceBtn current={audienceType} value="all_parents"    onSelect={setAudienceType}>{t('commPages.admin.aud.all_parents')}</AudienceBtn>
            <AudienceBtn current={audienceType} value="class_parents"  onSelect={setAudienceType}>{t('commPages.admin.aud.class_parents')}</AudienceBtn>
            <AudienceBtn current={audienceType} value="all_staff"      onSelect={setAudienceType}>{t('commPages.admin.aud.all_staff')}</AudienceBtn>
            <AudienceBtn current={audienceType} value="all_teachers"   onSelect={setAudienceType}>{t('commPages.admin.aud.all_teachers')}</AudienceBtn>
            <AudienceBtn current={audienceType} value="class_teachers" onSelect={setAudienceType}>{t('commPages.admin.aud.class_teachers')}</AudienceBtn>
          </div>
          {audienceType === 'class_parents' && (
            <select value={classId} onChange={e => setClassId(e.target.value)}
              className={inputCls}>
              <option value="">{t('commPages.admin.bc.selectClass')}</option>
              {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {audienceType === 'paste' && (
            <div>
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={6}
                placeholder={t('commPages.admin.bc.pastePh')}
                className={inputCls + ' font-mono text-xs'} />
              <p className="text-[10px] text-slate-400 mt-1">
                {t('commPages.admin.bc.pasteHelp')}
              </p>
            </div>
          )}
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('commPages.admin.bc.message')}</h2>
          <textarea value={message} onChange={e => { setMessage(e.target.value); setPreview(null); }}
            rows={5}
            placeholder={t('commPages.admin.bc.messagePh')}
            className={inputCls} />
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {settings?.prefix
                ? rich('commPages.admin.bc.prefix', { prefix: <code className="font-mono text-indigo-600 dark:text-indigo-400">{settings.prefix}</code> })
                : <span>{t('commPages.admin.bc.noPrefix')}</span>}
            </span>
            <span>{t('commPages.admin.bc.chars', { chars: charCount, count: smsCount })}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={doPreview} disabled={busy !== null}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50">
            {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {t('commPages.admin.bc.previewBtn')}
          </button>
          <button onClick={doSend} disabled={busy !== null || !preview || preview.recipientCount === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t('commPages.admin.bc.send')}
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('commPages.admin.bc.preview')}</h2>
        {!preview ? (
          <div className="text-center py-10 text-sm text-slate-400">
            {rich('commPages.admin.bc.previewHint', { btn: <b>{t('commPages.admin.bc.previewBtn')}</b> })}
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">{t('commPages.admin.bc.body')}</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono">{preview.previewBody}</p>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {t('commPages.admin.bc.recipients', { count: preview.recipientCount })}
              </span>
              {preview.recipientCount > preview.recipients.length && (
                <span className="text-slate-400">{t('commPages.admin.bc.showingFirst', { n: preview.recipients.length })}</span>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <tr className="text-start text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-start">{t('commPages.admin.bc.phone')}</th>
                    <th className="px-3 py-2 text-start">{t('commPages.admin.bc.name')}</th>
                    <th className="px-3 py-2 text-start">{t('commPages.admin.bc.role')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.recipients.map((r: any, i: number) => (
                    <tr key={i} className="bg-white dark:bg-slate-900">
                      <td className="px-3 py-1.5 font-mono" dir="ltr">{r.phone}</td>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 text-slate-400">{r.meta ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AudienceBtn({
  current, value, onSelect, children,
}: {
  current: string; value: string; onSelect: (v: any) => void; children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button onClick={() => onSelect(value)}
      className={`px-3 py-2 text-xs font-semibold rounded-lg border transition ${
        active
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}>
      {children}
    </button>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsPanel() {
  const { t, rich, lang, formatNumber } = useI18n();
  const { data, mutate, isLoading, error } = useSWR<any>('/api/admin/comm/settings', fetcher);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [waTestPhone, setWaTestPhone] = useState('');
  const [waTesting, setWaTesting] = useState(false);

  async function sendTest() {
    if (!testPhone.trim()) { toast.error(t('commPages.admin.st.enterPhone', "Enter a phone number")); return; }
    setTesting(true);
    try {
      const res = await fetch('/api/admin/comm/test-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone.trim() }),
      });
      const j = await res.json();
      if (j.success) toast.success(serverMsg(j.message, t('commPages.admin.st.testSmsSent', "Test SMS sent")));
      else toast.error(serverMsg(j.error, t('commPages.admin.st.testSmsFailed', "Test SMS failed")));
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.st.testSmsFailed', "Test SMS failed"))); }
    finally { setTesting(false); }
  }
  async function sendWaTest() {
    if (!waTestPhone.trim()) { toast.error(t('commPages.admin.st.enterPhone', "Enter a phone number")); return; }
    setWaTesting(true);
    try {
      const res = await fetch('/api/admin/comm/test-whatsapp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: waTestPhone.trim() }),
      });
      const j = await res.json();
      if (j.success) toast.success(serverMsg(j.message, t('commPages.admin.st.testWaSent', "Test WhatsApp message sent")));
      else toast.error(serverMsg(j.error, t('commPages.admin.st.testWaFailed', "Test WhatsApp message failed")));
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.st.testWaFailed', "Test WhatsApp message failed"))); }
    finally { setWaTesting(false); }
  }
  const [form, setForm] = useState({
    senderName: '', prefix: '', autoMode: false, defaultProvider: 'africas_talking',
    quietHoursStart: '', quietHoursEnd: '', retryAttempts: 1, retryDelaySecs: 60,
    providerUsername: '', providerApiKey: '',
    whatsappEnabled: false, whatsappProvider: 'infobip_whatsapp', whatsappSender: '',
    whatsappProviderBaseUrl: '', whatsappProviderApiKey: '',
    deliveryAlertPhone: '', deliveryAlertMode: 'failed',
  });

  React.useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setForm({
        senderName:      s.senderName ?? '',
        prefix:          s.prefix ?? '',
        autoMode:        !!s.autoMode,
        defaultProvider: s.defaultProvider ?? 'africas_talking',
        quietHoursStart: s.quietHoursStart ?? '',
        quietHoursEnd:   s.quietHoursEnd ?? '',
        retryAttempts:   s.retryAttempts ?? 1,
        retryDelaySecs:  s.retryDelaySecs ?? 60,
        providerUsername: s.providerUsername ?? '',
        providerApiKey:   s.providerApiKey ?? '', // server sends '********' if set
        whatsappEnabled:         !!s.whatsappEnabled,
        whatsappProvider:        s.whatsappProvider ?? 'infobip_whatsapp',
        whatsappSender:          s.whatsappSender ?? '',
        whatsappProviderBaseUrl: s.whatsappProviderBaseUrl ?? '',
        whatsappProviderApiKey:  s.whatsappProviderApiKey ?? '', // server sends '********' if set
        deliveryAlertPhone:      s.deliveryAlertPhone ?? '',
        deliveryAlertMode:       s.deliveryAlertMode ?? 'failed',
      });
    }
  }, [data]);

  const alertCap: number = Number(data?.deliveryAlertHourlyCap ?? 20);
  const alertPrice: string | null = data?.smsPriceUgx != null ? String(Math.round(Number(data.smsPriceUgx))) : null;

  async function save() {
    // Turning paid alerts on (or widening them) must be a deliberate choice, in plain words.
    const before = data?.settings ?? {};
    const wasOn = !!before.deliveryAlertPhone && (before.deliveryAlertMode ?? 'failed') !== 'off';
    const wasAll = wasOn && before.deliveryAlertMode === 'all';
    const willBeOn = !!form.deliveryAlertPhone.trim() && form.deliveryAlertMode !== 'off';
    const willBeAll = willBeOn && form.deliveryAlertMode === 'all';
    if ((willBeOn && !wasOn) || (willBeAll && !wasAll)) {
      const each = alertPrice ? t('commPages.admin.st.eachPrice', { price: alertPrice }) : '';
      const msg = willBeAll
        ? t('commPages.admin.st.confirmAll', { each, phone: form.deliveryAlertPhone.trim(), cap: alertCap })
        : t('commPages.admin.st.confirmFailed', { each, phone: form.deliveryAlertPhone.trim(), cap: alertCap });
      if (!window.confirm(msg)) return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/comm/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          prefix:          form.prefix          || null,
          quietHoursStart: form.quietHoursStart || null,
          quietHoursEnd:   form.quietHoursEnd   || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(t('commPages.admin.st.saved', "Settings saved"));
      mutate();
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.st.failed', "Failed"))); }
    finally { setSaving(false); }
  }

  if (isLoading) return <Skeleton lines={8} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('commPages.admin.st.identity', "School Identity")}</h2>
        <F label={t('commPages.admin.st.senderId', "Sender ID (max 11 chars — leave blank if not registered)")}>
          <input value={form.senderName} maxLength={11}
            onChange={e => setForm({ ...form, senderName: e.target.value })}
            className={inputCls} placeholder={t('commPages.admin.st.senderPh', "(blank uses provider default)")} />
          <p className="text-[10px] text-slate-400 mt-1">
            {t('commPages.admin.st.senderHelp', "Alphanumeric sender IDs must be pre-registered with the SMS provider. Passing an unregistered ID causes rejection. Leave blank unless you've registered one.")}
          </p>
        </F>
        <F label={t('commPages.admin.st.prefixLabel', "Prefix (e.g. [ALBAYAN])")}>
          <input value={form.prefix}
            onChange={e => setForm({ ...form, prefix: e.target.value })}
            className={inputCls} placeholder="[ALBAYAN]" />
          <p className="text-[10px] text-slate-400 mt-1">{t('commPages.admin.st.prefixHelp', "Prepended to every outgoing SMS. Leave blank to disable.")}</p>
        </F>
        {data?.effectiveRoute && (
          <div className={`text-xs rounded-lg p-2.5 ${
            data.effectiveRoute.kind === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
          }`}>
            {data.effectiveRoute.kind === 'central' && rich('commPages.admin.st.routeCentral', { cc: <strong>{t('commPages.admin.st.ccName', 'DRAIS Control Center')}</strong>, provider: <strong>{data.effectiveRoute.providerName}</strong> })}
            {data.effectiveRoute.kind === 'own' && rich('commPages.admin.st.routeOwn', { own: <strong>{t('commPages.admin.st.ownAccount', 'its own account')}</strong> })}
            {data.effectiveRoute.kind === 'error' && t('commPages.admin.st.routeError', "Control Center's SMS routing for this school has a problem — contact support.")}
            {data.effectiveRoute.kind === 'legacy' && t('commPages.admin.st.routeLegacy', "No central SMS provider is active in Control Center right now — the fields below are being used as a fallback.")}
          </div>
        )}
        <F label={t('commPages.admin.st.providerLabel', "SMS Provider")}>
          <div className={`${inputCls} flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 cursor-default`}>
            <span className="font-medium truncate">
              {data?.effectiveRoute?.kind === 'error' ? t('commPages.admin.st.misconfigured', "Misconfigured — contact support") : (data?.effectiveRoute?.providerName ?? '—')}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
              {data?.effectiveRoute?.kind === 'central' ? (data.effectiveRoute.explicit ? t('commPages.admin.st.assignedCc', "Assigned in Control Center") : t('commPages.admin.st.platformDefault', "Platform default")) : data?.effectiveRoute?.kind === 'error' ? '' : t('commPages.admin.st.fallback', "Fallback")}
            </span>
          </div>
          {(data?.providers ?? []).length > 0 && (
            <p className="text-[10px] text-slate-400 mt-1">
              {t('commPages.admin.st.providersAvail', { list: (data.providers as any[]).map((p) => p.name + (p.isActive ? t('commPages.admin.st.platformDefaultSuffix', ' (platform default)') : '')).join(lang === 'ar' ? '، ' : ', ') })}
            </p>
          )}
        </F>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('commPages.admin.st.fallbackCreds', "Fallback Credentials (Africa's Talking)")}</h3>
          <p className="text-[10px] text-slate-400 mb-2">
            {t('commPages.admin.st.fallbackHelp', "Used only as a last resort (see the banner above) — not while Control Center has this school routed to a central provider.")}
          </p>
          <F label={t('commPages.admin.st.username', "Username")}>
            <input value={form.providerUsername}
              onChange={e => setForm({ ...form, providerUsername: e.target.value })}
              className={inputCls} placeholder={t('commPages.admin.st.usernamePh', "e.g. albayan or sandbox")} autoComplete="off" />
          </F>
          <F label={t('commPages.admin.st.apiKey', "API Key")}>
            <input type="password" value={form.providerApiKey}
              onChange={e => setForm({ ...form, providerApiKey: e.target.value })}
              className={inputCls} placeholder={data?.settings?.hasApiKey ? t('commPages.admin.st.savedPh', "•••••••• (saved — type to replace)") : 'atsk_...'} autoComplete="off" />
            <p className="text-[10px] text-slate-400 mt-1">
              {t('commPages.admin.st.apiKeyHelp', "Stored per school. Without it, SMS falls back to server env vars (and fails if none are set). Leave blank to keep the saved key.")}
            </p>
          </F>

          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('commPages.admin.st.testDelivery', "Test delivery")}</h3>
            <p className="text-[10px] text-slate-400 mb-2">{rich('commPages.admin.st.testHelp', { provider: data?.effectiveRoute?.providerName ? <> (<strong>{data.effectiveRoute.providerName}</strong>)</> : null })}</p>
            <div className="flex gap-2">
              <input value={testPhone} onChange={e => setTestPhone(e.target.value)} className={inputCls} placeholder={t('commPages.admin.st.phonePh', "e.g. +2567...")} autoComplete="off" />
              <button onClick={sendTest} disabled={testing}
                className="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
                {testing ? t('commPages.admin.st.sending', "Sending…") : t('commPages.admin.st.sendTestSms', "Send test SMS")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('commPages.admin.st.automation', "Automation")}</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.autoMode}
            onChange={e => setForm({ ...form, autoMode: e.target.checked })} />
          <span className="text-sm">
            <span className="font-semibold">{t('commPages.admin.st.autoMode', "Auto mode")}</span>
            <span className="block text-[11px] text-slate-400">{t('commPages.admin.st.autoModeHelp', "When on, events with auto_send rules fire immediately. When off, every message is staged for manual approval.")}</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <F label={t('commPages.admin.st.quietStart', "Quiet hours start")}>
            <input type="time" value={form.quietHoursStart}
              onChange={e => setForm({ ...form, quietHoursStart: e.target.value })} className={inputCls} />
          </F>
          <F label={t('commPages.admin.st.quietEnd', "Quiet hours end")}>
            <input type="time" value={form.quietHoursEnd}
              onChange={e => setForm({ ...form, quietHoursEnd: e.target.value })} className={inputCls} />
          </F>
        </div>
        <p className="text-[10px] text-slate-400">{t('commPages.admin.st.quietHelp', "During quiet hours, auto messages are queued instead of sent.")}</p>
        <div className="grid grid-cols-2 gap-3">
          <F label={t('commPages.admin.st.retryAttempts', "Retry attempts")}>
            <input type="number" value={form.retryAttempts} min={0} max={5}
              onChange={e => setForm({ ...form, retryAttempts: Number(e.target.value) })} className={inputCls} />
          </F>
          <F label={t('commPages.admin.st.retryDelay', "Retry delay (sec)")}>
            <input type="number" value={form.retryDelaySecs} min={10}
              onChange={e => setForm({ ...form, retryDelaySecs: Number(e.target.value) })} className={inputCls} />
          </F>
        </div>
      </div>

      <div className="md:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('commPages.admin.st.alertsTitle', "Delivery status alerts by SMS (optional)")}</h2>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {rich('commPages.admin.st.alertsIntro', { outbox: <strong>{t('commPages.admin.st.outbox', 'SMS Outbox')}</strong>, text: <strong>{t('commPages.admin.st.textOnPhone', 'text message on a phone')}</strong> })}
        </p>
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {t('commPages.admin.st.costWarning', "This costs extra SMS — please read before turning it on")}</p>
          <ul className="list-disc ps-5 space-y-1">
            <li>{rich('commPages.admin.st.li1', { second: <strong>{t('commPages.admin.st.secondSms', 'a second SMS that your school pays for')}</strong>, price: alertPrice ? rich('commPages.admin.st.aboutEach', { amount: <strong>{t('commPages.admin.st.ugx', { n: alertPrice })}</strong> }) : null })}</li>
            <li>{rich('commPages.admin.st.li2', { choice: <strong>{t('commPages.admin.st.quoteFailed', '“Only messages that were not delivered”')}</strong> })}</li>
            <li>{rich('commPages.admin.st.li3', { choice: <strong>{t('commPages.admin.st.quoteAll', '“Every delivery report”')}</strong> })}</li>
            <li>{rich('commPages.admin.st.li4', { cap: <strong>{t('commPages.admin.st.capStrong', { n: alertCap })}</strong>, perHour: alertPrice ? t('commPages.admin.st.perHourMax', { amount: lang === 'ar' ? formatNumber(alertCap * Number(alertPrice)) : (alertCap * Number(alertPrice)).toLocaleString() }) : null })}</li>
          </ul>
        </div>
        <div className="grid md:grid-cols-2 gap-x-5 gap-y-3">
          <F label={t('commPages.admin.st.alertPhone', "Phone number to receive the alerts")}>
            <input value={form.deliveryAlertPhone}
              onChange={e => setForm({ ...form, deliveryAlertPhone: e.target.value })}
              className={inputCls} placeholder={t('commPages.admin.st.alertPhonePh', "e.g. 0741341483 — leave blank to keep this off")} autoComplete="off" />
          </F>
          <F label={t('commPages.admin.st.alertWhat', "What to send alerts about")}>
            <select value={form.deliveryAlertMode}
              onChange={e => setForm({ ...form, deliveryAlertMode: e.target.value })} className={inputCls}>
              <option value="failed">{t('commPages.admin.st.optFailed', "Only messages that were not delivered (recommended)")}</option>
              <option value="all">{t('commPages.admin.st.optAll', "Every delivery report — delivered and not delivered (can double SMS cost)")}</option>
              <option value="off">{t('commPages.admin.st.optOff', "Nothing — turn alerts off")}</option>
            </select>
          </F>
        </div>
        <p className="text-[11px] text-slate-500">
          {!form.deliveryAlertPhone.trim() || form.deliveryAlertMode === 'off'
            ? t('commPages.admin.st.stOff', "Alerts are OFF. No extra SMS will be sent.")
            : form.deliveryAlertMode === 'all'
              ? t('commPages.admin.st.stAll', { n: Math.min(100, alertCap) })
              : t('commPages.admin.st.stFailed', "Alerts are ON for messages that were not delivered only.")}
        </p>
      </div>

      <div className="md:col-span-2 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('commPages.admin.st.waTitle', "WhatsApp (Infobip)")}</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.whatsappEnabled}
              onChange={e => setForm({ ...form, whatsappEnabled: e.target.checked })} />
            <span className="text-xs font-semibold">{t('commPages.admin.st.enabled', "Enabled")}</span>
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-x-5">
          <div className="space-y-3">
            <F label={t('commPages.admin.st.waSender', "Business sender / number")}>
              <input value={form.whatsappSender}
                onChange={e => setForm({ ...form, whatsappSender: e.target.value })}
                className={inputCls} placeholder={t('commPages.admin.st.waSenderPh', "e.g. 256700000000")} autoComplete="off" />
              <p className="text-[10px] text-slate-400 mt-1">{t('commPages.admin.st.waSenderHelp', "The WhatsApp Business number registered with Infobip. Required to send.")}</p>
            </F>
            <F label={t('commPages.admin.st.provider', "Provider")}>
              <select value={form.whatsappProvider}
                onChange={e => setForm({ ...form, whatsappProvider: e.target.value })} className={inputCls}>
                <option value="infobip_whatsapp">infobip_whatsapp</option>
              </select>
            </F>
          </div>
          <div className="space-y-3">
            <F label={t('commPages.admin.st.waBaseUrl', "API base URL (blank = use platform default)")}>
              <input value={form.whatsappProviderBaseUrl}
                onChange={e => setForm({ ...form, whatsappProviderBaseUrl: e.target.value })}
                className={inputCls} placeholder="xxxxxx.api.infobip.com" autoComplete="off" />
            </F>
            <F label={t('commPages.admin.st.waApiKey', "API key (blank = use platform default)")}>
              <input type="password" value={form.whatsappProviderApiKey}
                onChange={e => setForm({ ...form, whatsappProviderApiKey: e.target.value })}
                className={inputCls} placeholder={data?.settings?.hasWhatsappApiKey ? t('commPages.admin.st.savedPh', "•••••••• (saved — type to replace)") : t('commPages.admin.st.waKeyPh', "(platform Infobip account is used by default)")} autoComplete="off" />
            </F>
          </div>
        </div>
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t('commPages.admin.st.testDelivery', "Test delivery")}</h3>
          <p className="text-[10px] text-slate-400 mb-2">
            {t('commPages.admin.st.waTestHelp', "Save your sender number first. A WhatsApp test message only delivers if this number has messaged your business number within the last 24h — a failed test can mean that, not misconfiguration.")}
          </p>
          <div className="flex gap-2">
            <input value={waTestPhone} onChange={e => setWaTestPhone(e.target.value)} className={inputCls} placeholder={t('commPages.admin.st.phonePh', "e.g. +2567...")} autoComplete="off" />
            <button onClick={sendWaTest} disabled={waTesting}
              className="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
              {waTesting ? t('commPages.admin.st.sending', "Sending…") : t('commPages.admin.st.sendTestWa', "Send test WhatsApp")}
            </button>
          </div>
        </div>
      </div>

      <div className="md:col-span-2 flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {t('commPages.admin.st.saveSettings', "Save Settings")}
        </button>
      </div>
    </div>
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────
function TemplatesPanel() {
  const { t } = useI18n();
  const { data, mutate, isLoading, error } = useSWR<any>('/api/admin/comm/templates', fetcher);
  const [editing, setEditing] = useState<any | null>(null);
  const [draft, setDraft] = useState({ body: '', description: '' });

  function startEdit(tpl: any) {
    setEditing(tpl);
    setDraft({ body: tpl.body, description: tpl.description ?? '' });
  }
  function cancel() { setEditing(null); setDraft({ body: '', description: '' }); }

  async function saveOverride() {
    if (!editing) return;
    try {
      const res = await fetch('/api/admin/comm/templates', {
        method: editing.school_id === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing.school_id === null
            ? { event_type: editing.event_type, channel: editing.channel, language: editing.language, body: draft.body, description: draft.description }
            : { id: editing.id, body: draft.body, description: draft.description },
        ),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(editing.school_id === null ? t('commPages.admin.tp.overrideCreated', "Override created") : t('commPages.admin.tp.updated', "Template updated"));
      cancel(); mutate();
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.x.failed', "Failed"))); }
  }

  if (isLoading) return <Skeleton lines={10} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  // Group: prefer school override; otherwise global.
  const templates: any[] = data?.templates ?? [];
  const grouped = new Map<string, { global?: any; override?: any }>();
  for (const tpl of templates) {
    const key = `${tpl.event_type}::${tpl.channel}::${tpl.language}`;
    const cur = grouped.get(key) ?? {};
    if (tpl.school_id === null) cur.global = tpl; else cur.override = tpl;
    grouped.set(key, cur);
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([key, { global, override }]) => {
        const active = override ?? global;
        if (!active) return null;
        return (
          <div key={key} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300">{eventName(t, active.event_type)}</code>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{t(`commPages.admin.x.channel.${active.channel}`, active.channel)}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{t(`commPages.admin.x.lang.${active.language}`, active.language)}</span>
                  {override && (
                    <span className="text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      {t('commPages.admin.tp.schoolOverride', "School override")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 mt-2 whitespace-pre-wrap">{active.body}</p>
                {active.description && <p className="text-[11px] text-slate-400 mt-1">{active.description}</p>}
              </div>
              <button onClick={() => startEdit(active)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                {override ? t('commPages.admin.tp.edit', "Edit") : t('commPages.admin.tp.override', "Override")}
              </button>
            </div>
          </div>
        );
      })}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={cancel} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-3">
            <h3 className="text-lg font-semibold">
              {editing.school_id === null ? t('commPages.admin.tp.createOverride', "Create school override") : t('commPages.admin.tp.editTemplate', "Edit template")}
            </h3>
            <p className="text-xs text-slate-500">
              <code className="font-mono">{eventName(t, editing.event_type)}</code> · {t(`commPages.admin.x.channel.${editing.channel}`, editing.channel)} · {t(`commPages.admin.x.lang.${editing.language}`, editing.language)}
            </p>
            <F label={t('commPages.admin.tp.body', "Body")}>
              <textarea value={draft.body} rows={5}
                onChange={e => setDraft({ ...draft, body: e.target.value })}
                className={inputCls + ' font-mono text-xs'} />
              <p className="text-[10px] text-slate-400 mt-1">
                {t('commPages.admin.tp.placeholders', { list: '{{studentName}}, {{time}}, {{date}}, {{amount}}' })}
              </p>
            </F>
            <F label={t('commPages.admin.tp.description', "Description (optional)")}>
              <input value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })} className={inputCls} />
            </F>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={cancel} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">{t('commPages.admin.x.cancel', "Cancel")}</button>
              <button onClick={saveOverride} className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{t('commPages.admin.x.save', "Save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rules ────────────────────────────────────────────────────────────────────
function RulesPanel() {
  const { t } = useI18n();
  const { data, mutate, isLoading, error } = useSWR<any>('/api/admin/comm/rules', fetcher);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    event_type: '', channel: 'sms', audience: 'parents', auto_send: true, notes: '',
  });

  async function create() {
    if (!form.event_type) { toast.error(t('commPages.admin.rl.pickEvent', "Pick an event")); return; }
    try {
      const res = await fetch('/api/admin/comm/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(t('commPages.admin.rl.created', "Rule created"));
      setCreating(false);
      setForm({ event_type: '', channel: 'sms', audience: 'parents', auto_send: true, notes: '' });
      mutate();
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.x.failed', "Failed"))); }
  }

  async function toggle(rule: any, field: 'auto_send' | 'is_active') {
    try {
      const res = await fetch('/api/admin/comm/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, [field]: !rule[field] }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      mutate();
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.x.failed', "Failed"))); }
  }

  async function remove(id: number) {
    if (!confirm(t('commPages.admin.rl.confirmDelete', "Delete this rule?"))) return;
    try {
      const res = await fetch(`/api/admin/comm/rules?id=${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(t('commPages.admin.rl.deleted', "Deleted")); mutate();
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.x.failed', "Failed"))); }
  }

  if (isLoading) return <Skeleton lines={6} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  const rules = data?.rules ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(c => !c)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          {creating ? t('commPages.admin.x.cancel', "Cancel") : t('commPages.admin.rl.newRule', "+ New Rule")}
        </button>
      </div>

      {creating && (
        <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/10 grid sm:grid-cols-5 gap-3">
          <F label={t('commPages.admin.rl.event', "Event")}>
            <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} className={inputCls}>
              <option value="">{t('commPages.admin.rl.select', "— Select —")}</option>
              {(data?.eventTypes ?? []).map((et: string) => <option key={et} value={et}>{eventName(t, et)}</option>)}
            </select>
          </F>
          <F label={t('commPages.admin.rl.channel', "Channel")}>
            <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className={inputCls}>
              <option value="sms">{t('commPages.admin.x.channel.sms', "SMS")}</option>
              <option value="whatsapp">{t('commPages.admin.x.channel.whatsapp', "WhatsApp")}</option>
            </select>
          </F>
          <F label={t('commPages.admin.rl.audience', "Audience")}>
            <select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} className={inputCls}>
              <option value="parents">{t('commPages.admin.rl.aud.parents', "Parents")}</option>
              <option value="guardians">{t('commPages.admin.rl.aud.guardians', "Guardians")}</option>
              <option value="class_teacher">{t('commPages.admin.rl.aud.class_teacher', "Class teacher")}</option>
              <option value="headteacher">{t('commPages.admin.rl.aud.headteacher', "Headteacher")}</option>
              <option value="directors">{t('commPages.admin.rl.aud.directors', "Directors")}</option>
              <option value="self">{t('commPages.admin.rl.aud.self', "Self (the subject)")}</option>
            </select>
          </F>
          <label className="flex items-center gap-2 mt-5">
            <input type="checkbox" checked={form.auto_send}
              onChange={e => setForm({ ...form, auto_send: e.target.checked })} />
            <span className="text-sm">{t('commPages.admin.rl.autoSend', "Auto-send")}</span>
          </label>
          <button onClick={create} className="mt-5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            {t('commPages.admin.rl.create', "Create")}
          </button>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">{t('commPages.admin.rl.none', "No rules configured. Events fire but nothing is sent.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="text-start">
                <th className="px-3 py-2">{t('commPages.admin.rl.event', "Event")}</th>
                <th className="px-3 py-2">{t('commPages.admin.rl.channel', "Channel")}</th>
                <th className="px-3 py-2">{t('commPages.admin.rl.audience', "Audience")}</th>
                <th className="px-3 py-2">{t('commPages.admin.rl.autoSend', "Auto-send")}</th>
                <th className="px-3 py-2">{t('commPages.admin.rl.active', "Active")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rules.map((r: any) => (
                <tr key={r.id} className="bg-white dark:bg-slate-900">
                  <td className="px-3 py-2"><code className="text-xs font-mono">{eventName(t, r.event_type)}</code></td>
                  <td className="px-3 py-2 text-slate-500">{t(`commPages.admin.x.channel.${r.channel}`, r.channel)}</td>
                  <td className="px-3 py-2">{t(`commPages.admin.rl.aud.${r.audience}`, r.audience)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggle(r, 'auto_send')}
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        r.auto_send ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                      {r.auto_send ? t('commPages.admin.rl.auto', "Auto") : t('commPages.admin.rl.manual', "Manual")}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggle(r, 'is_active')}
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        r.is_active ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                      {r.is_active ? t('commPages.admin.rl.on', "On") : t('commPages.admin.rl.off', "Off")}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-end">
                    <button onClick={() => remove(r.id)} className="text-rose-500 hover:text-rose-700 text-xs">{t('commPages.admin.x.delete', "Delete")}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Dispatch Log ─────────────────────────────────────────────────────────────
function DispatchLogPanel() {
  const { t, lang, digits } = useI18n();
  const [filter, setFilter] = useState<string>('');
  const url = useMemo(() => {
    const sp = new URLSearchParams({ page: '1', per_page: '50' });
    if (filter) sp.set('status', filter);
    return `/api/admin/comm/dispatch-log?${sp.toString()}`;
  }, [filter]);

  const { data, mutate, isLoading, error } = useSWR<any>(url, fetcher);
  // Provider delivery reports (pushed by the navbar's live stream) refresh the log at once.
  useEffect(() => {
    const h = () => { void mutate(); };
    window.addEventListener('drais:sms-delivery', h);
    return () => window.removeEventListener('drais:sms-delivery', h);
  }, [mutate]);

  async function sendNow(id: number) {
    try {
      const res = await fetch('/api/admin/comm/dispatch-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId: id }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(t('commPages.admin.lg.sent', "Sent")); mutate();
    } catch (e: any) { toast.error(serverMsg(e?.message, t('commPages.admin.x.failed', "Failed"))); }
  }

  if (isLoading) return <Skeleton lines={10} />;
  if (error) return <ErrorPanel error={error} retry={mutate} />;

  const counts: any[] = data?.counts ?? [];
  const countOf = (s: string) => Number(counts.find(c => c.status === s)?.n ?? 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[
          { code: '',        label: t('commPages.admin.lg.all', "All") },
          { code: 'sent',    label: t('commPages.admin.lg.sent', "Sent"),    n: countOf('sent') },
          { code: 'queued',  label: t('commPages.admin.lg.queued', "Queued"),  n: countOf('queued') },
          { code: 'failed',  label: t('commPages.admin.lg.failed', "Failed"),  n: countOf('failed') },
          { code: 'skipped', label: t('commPages.admin.lg.skipped', "Skipped"), n: countOf('skipped') },
        ].map(f => (
          <button key={f.code} onClick={() => setFilter(f.code)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
              filter === f.code ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
            }`}>
            {f.label}{f.n !== undefined ? ` (${digits(f.n)})` : ''}
          </button>
        ))}
      </div>

      {(data?.data ?? []).length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">{t('commPages.admin.lg.none', "No dispatch entries match.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="text-start">
                <th className="px-3 py-2">{t('commPages.admin.lg.when', "When")}</th>
                <th className="px-3 py-2">{t('commPages.admin.rl.event', "Event")}</th>
                <th className="px-3 py-2">{t('commPages.admin.lg.recipient', "Recipient")}</th>
                <th className="px-3 py-2">{t('commPages.admin.lg.status', "Status")}</th>
                <th className="px-3 py-2">{t('commPages.admin.lg.message', "Message")}</th>
                <th className="px-3 py-2">{t('commPages.admin.lg.source', "Source")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.data.map((r: any) => (
                <tr key={r.id} className="bg-white dark:bg-slate-900 align-top">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {lang === 'ar' ? digits(new Date(r.created_at).toLocaleString('ar')) : new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2"><code className="text-xs">{eventName(t, r.event_type)}</code></td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.recipient_name ?? r.recipient_phone ?? '—'}</p>
                    {r.recipient_phone && <p dir="ltr" className="text-[10px] text-slate-400 font-mono text-end">{digits(r.recipient_phone)}</p>}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300 max-w-[300px]">
                    <p className="whitespace-pre-wrap break-words">{r.message_body || '—'}</p>
                    {r.error_message && <p className="text-rose-500 mt-1 text-[10px]" title={r.error_message}>{serverMsg(r.error_message, t('commPages.admin.lg.sendError', "Not sent — the provider returned an error"))}</p>}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">{r.source ? t(`commPages.admin.lg.src.${r.source}`, r.source) : ''}</td>
                  <td className="px-3 py-2 text-end">
                    {r.status === 'queued' && (
                      <button onClick={() => sendNow(r.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                        <Send className="w-3 h-3" /> {t('commPages.admin.lg.sendNow', "Send now")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { tone: string; Icon: any }> = {
    // sent = the provider accepted it; delivered = the provider confirmed it reached the phone.
    sent:    { tone: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300', Icon: Send },
    delivered: { tone: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', Icon: CheckCircle2 },
    read:    { tone: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', Icon: CheckCircle2 },
    queued:  { tone: 'bg-amber-100   dark:bg-amber-900/40   text-amber-700   dark:text-amber-300',   Icon: Clock },
    failed:  { tone: 'bg-rose-100    dark:bg-rose-900/40    text-rose-700    dark:text-rose-300',    Icon: AlertCircle },
    skipped: { tone: 'bg-slate-100   dark:bg-slate-800       text-slate-500',                         Icon: Ban },
  };
  const m = map[status] ?? map.skipped;
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded ${m.tone}`}>
      <Icon className="w-3 h-3" /> {t(`commPages.admin.status.${status}`, status)}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Skeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ))}
    </div>
  );
}

function ErrorPanel({ error, retry }: { error: any; retry: () => void }) {
  const { t } = useI18n();
  const status = error?.status as number | undefined;
  const isAuth = status === 401 || status === 403;
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 flex items-start gap-3">
      {isAuth ? <ShieldAlert className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
      <div className="flex-1">
        <p className="font-semibold">{isAuth ? t('commPages.admin.st.accessDenied', "Access denied") : t('commPages.admin.st.failedToLoad', "Failed to load")}</p>
        <p className="text-xs opacity-90">{serverMsg(error?.message, isAuth ? t('commPages.admin.st.accessDenied', "Access denied") : t('commPages.admin.st.failedToLoad', "Failed to load"))}</p>
        <button onClick={retry}
          className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40">
          <RotateCcw className="w-3 h-3" /> {t('commPages.admin.st.retry', "Retry")}
        </button>
      </div>
    </div>
  );
}
