import Link from 'next/link';
import { FileText, GraduationCap, BookOpen } from 'lucide-react';

export default function ReportCardsLandingPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileText className="w-6 h-6" /> Report Cards
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Snapshot-driven report cards. Generate once per term — preview and print without re-running heavy queries.
        </p>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link
          href="/academics/report-cards/secular"
          className="block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:shadow-md hover:border-blue-400 transition"
        >
          <GraduationCap className="w-7 h-7 text-blue-600 mb-2" />
          <div className="font-semibold text-lg">Secular Report Cards</div>
          <div className="text-sm text-slate-500 mt-1">
            Academic curriculum reports with subjects, grades, and class rankings.
          </div>
        </Link>

        <Link
          href="/academics/report-cards/theology"
          className="block rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 hover:shadow-md hover:border-emerald-400 transition"
        >
          <BookOpen className="w-7 h-7 text-emerald-600 mb-2" />
          <div className="font-semibold text-lg">Theology Report Cards</div>
          <div className="text-sm text-slate-500 mt-1">
            Theology curriculum reports with Arabic numerals and RTL layout.
          </div>
        </Link>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-sm text-slate-500">
        Coming soon: recent snapshot list and quick filters. Generate snapshots from the
        <Link href="/academics/results" className="text-blue-600 underline mx-1">Results page</Link>
        toolbar.
      </div>
    </div>
  );
}
