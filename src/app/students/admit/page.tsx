"use client";
/**
 * DRAIS Phase 5 — Admit Student Page (Simplified)
 * Admission = creating a student record ONLY.
 * Class/term assignment happens on the Enrollment page.
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import VoiceNameCapture from '@/components/admissions/VoiceNameCapture';

const fieldBase =
  'w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition';

export default function AdmitStudentPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otherName, setOtherName] = useState('');
  const [gender, setGender] = useState('female');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [admitted, setAdmitted] = useState<{ id: number; admission_no: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          other_name: otherName.trim() || null,
          gender,
          date_of_birth: dob || null,
          phone: phone.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Admission failed');
      setAdmitted({
        id: data.student_id,
        admission_no: data.admission_no ?? `#${data.student_id}`,
        name: `${firstName} ${lastName}`,
      });
      toast.success(`${firstName} ${lastName} admitted!`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      toast.error(err.message || 'Admission failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAnother = () => {
    setAdmitted(null); setError(null);
    setFirstName(''); setLastName(''); setOtherName('');
    setGender('female'); setDob(''); setPhone('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
            <UserPlus className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Admit Student</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Step 1 of 2 — Create student record</p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-sm text-blue-700 dark:text-blue-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            Admission creates a student record only. After admitting, go to{' '}
            <Link href="/students/enroll" className="font-semibold underline">Enroll Student</Link>{' '}
            to assign them to a class and term.
          </p>
        </div>

        {/* Steps */}
        <div className="flex rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white text-xs font-semibold">
            <UserPlus className="w-3.5 h-3.5" /> 1. Admit
          </div>
          <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold border-l border-slate-200 dark:border-slate-700">
            <ArrowRight className="w-3.5 h-3.5" /> 2. Enroll
          </div>
        </div>

        {/* Success */}
        {admitted ? (
          <div className="card-glass p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">Student Admitted!</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <strong>{admitted.name}</strong> — Adm. No:{' '}
                <code className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">{admitted.admission_no}</code>
              </p>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Now enroll this student into a class and term.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/students/enroll" className="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                Enroll Now <ArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={handleAnother} className="btn-secondary px-5 py-2.5 rounded-xl text-sm">Admit Another</button>
              <Link href="/students/list" className="btn-secondary px-5 py-2.5 rounded-xl text-sm text-center">View Students</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card-glass p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">First Name *</label>
                <div className="flex items-center gap-2">
                  <input required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g., Fatuma" className={fieldBase} />
                  <VoiceNameCapture label="First Name" onCapture={setFirstName} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Last Name <span className="font-normal text-slate-400">(optional)</span></label>
                <div className="flex items-center gap-2">
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g., Nakibuuka" className={fieldBase} />
                  <VoiceNameCapture label="Last Name" onCapture={setLastName} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Other Name</label>
                <input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="Middle name (optional)" className={fieldBase} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Gender</label>
                <select value={gender} onChange={e => setGender(e.target.value)} className={fieldBase}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                  <option value="not_specified">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Date of Birth</label>
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={fieldBase} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g., 0700 000 000" className={fieldBase} />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Link href="/students/list" className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">Cancel</Link>
              <button
                type="submit"
                disabled={loading || !firstName.trim()}
                className="btn-primary px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Admitting…</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Admit Student</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

