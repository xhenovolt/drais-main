import Link from 'next/link';
import { BookOpen, ArrowLeft } from 'lucide-react';

export default function TheologyReportCardsPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Link
        href="/academics/report-cards"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" /> Report Cards
      </Link>

      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-emerald-600" /> Theology Report Cards
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Snapshot-driven theology reports with Arabic numerals and RTL layout. Mirrors the proven emergency-route strategy.
        </p>
      </header>

      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm text-slate-500">
        Coming soon: snapshot list and Generate button. Wired up in the next milestone.
      </div>
    </div>
  );
}
