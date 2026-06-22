'use client';

/**
 * Canonical receipt view — reconstructed from the DB by receipt number, so it is
 * printable now AND retrievable later (never browser-memory dependent). Includes
 * school branding, learner + payment detail, balance before/after, QR
 * verification, and bursar signature / stamp space. Currency-aware.
 */
import { use as usePromise, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Download, ShieldCheck, Loader } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const j = (u: string) => fetch(u).then(r => r.json());

export default function ReceiptPage({ params }: { params: Promise<{ receiptNo: string }> }) {
  const { receiptNo } = usePromise(params);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    j(`/api/finance/receipts/${encodeURIComponent(receiptNo)}`)
      .then(d => { if (d?.success) setData(d.receipt); else setErr(d?.error || 'Not found'); })
      .catch(() => setErr('Failed to load receipt'));
  }, [receiptNo]);

  if (err) return <div className="p-10 text-center text-slate-500">{err}</div>;
  if (!data) return <div className="p-10 text-center text-slate-400"><Loader className="w-5 h-5 animate-spin inline" /> Loading receipt…</div>;

  const r = data;
  const money = (n: number) => formatCurrency(n, r.currency);
  const verifyUrl = `${origin}/api/finance/receipts/${encodeURIComponent(r.receipt_no)}/verify?t=${r.verify_token}`;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 py-6 print:bg-white print:py-0">
      <style>{`@media print { .no-print { display:none !important } .sheet { box-shadow:none !important; margin:0 !important } @page { size:A4; margin:14mm } }`}</style>

      <div className="no-print max-w-[800px] mx-auto mb-4 flex gap-2 px-4">
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold"><Printer className="w-4 h-4" /> Print</button>
        <a href={`/api/finance/payments/${r.payment_id}/receipt`} className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-200"><Download className="w-4 h-4" /> Download PDF</a>
      </div>

      <div className="sheet max-w-[800px] mx-auto bg-white text-slate-900 rounded-xl shadow-lg p-8 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            {r.school.logo_url ? <img src={r.school.logo_url} alt="" className="w-16 h-16 object-contain" /> : null}
            <div>
              <h1 className="text-xl font-bold">{r.school.name}</h1>
              {r.school.legal_name && r.school.legal_name !== r.school.name ? <p className="text-xs text-slate-500">{r.school.legal_name}</p> : null}
              <p className="text-xs text-slate-500">{[r.school.address, r.school.phone, r.school.email].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tracking-wide">OFFICIAL RECEIPT</p>
            <p className="text-sm font-mono text-indigo-700">{r.receipt_no}</p>
            <p className="text-xs text-slate-500">{r.paid_at ? new Date(r.paid_at).toLocaleString() : ''}</p>
          </div>
        </div>

        {/* Learner + payment */}
        <div className="grid grid-cols-2 gap-6 mt-5 text-sm">
          <div className="space-y-1">
            <Row k="Received from" v={r.learner.name} />
            <Row k="Admission No" v={r.learner.admission_no || '—'} />
            <Row k="Class / Stream" v={[r.learner.class_name, r.learner.stream_name].filter(Boolean).join(' · ') || '—'} />
            <Row k="Term / Year" v={[r.term, r.year].filter(Boolean).join(' · ') || '—'} />
          </div>
          <div className="space-y-1">
            <Row k="Payment method" v={r.method || '—'} />
            <Row k="Reference" v={r.reference || '—'} />
            <Row k="Received by" v={r.received_by || '—'} />
          </div>
        </div>

        {/* Amounts */}
        <div className="mt-5 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              <tr className="bg-slate-50"><td className="px-4 py-2 text-slate-500">Balance before</td><td className="px-4 py-2 text-right font-mono">{money(r.balance_before)}</td></tr>
              <tr className="border-t"><td className="px-4 py-2 font-semibold">Amount paid</td><td className="px-4 py-2 text-right font-mono text-lg font-bold text-emerald-700">{money(r.amount)}</td></tr>
              {r.discount ? <tr className="border-t"><td className="px-4 py-2 text-slate-500">Discount</td><td className="px-4 py-2 text-right font-mono">{money(r.discount)}</td></tr> : null}
              <tr className="border-t bg-slate-50"><td className="px-4 py-2 text-slate-500">Balance after</td><td className="px-4 py-2 text-right font-mono font-semibold">{money(r.balance_after)}</td></tr>
            </tbody>
          </table>
        </div>

        {r.notes ? <p className="mt-3 text-xs text-slate-500">Notes: {r.notes}</p> : null}

        {/* QR + verification + signatures */}
        <div className="mt-6 flex items-end justify-between gap-6">
          <div className="text-center">
            {origin ? <QRCodeSVG value={verifyUrl} size={96} /> : <div className="w-24 h-24 bg-slate-100" />}
            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 justify-center"><ShieldCheck className="w-3 h-3" /> Scan to verify</p>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-6 text-center text-xs text-slate-500">
            <div><div className="h-10 border-b border-slate-400" /><p className="mt-1">Bursar signature</p></div>
            <div><div className="h-10 border-b border-slate-400" /><p className="mt-1">School stamp</p></div>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-slate-400">
          This is a computer-generated receipt from DRAIS. Verify authenticity by scanning the QR code or visiting the verification link. Receipt No {r.receipt_no}.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex"><span className="w-32 text-slate-500">{k}:</span><span className="font-medium">{v}</span></div>;
}
