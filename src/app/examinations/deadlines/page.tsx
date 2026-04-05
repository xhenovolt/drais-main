'use client';
import { AlarmClock } from 'lucide-react';

export default function ExaminationDeadlinesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
      <AlarmClock className="w-10 h-10" />
      <p className="text-sm font-medium">Examination Deadlines — coming soon</p>
    </div>
  );
}
