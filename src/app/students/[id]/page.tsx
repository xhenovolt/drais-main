import React from 'react';
import { t } from '@/lib/i18n';
import EnrollmentTimeline from '@/components/students/EnrollmentTimeline';

const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';

async function fetchStudent(id: string) {
  if(!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`${API_BASE}/student_profile.php?id=${id}`, { cache: 'no-store' });
    if(!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
  const data = await fetchStudent(params.id);
  if(!data) return <div className="p-6">Student not found.</div>;
  const { core, profile, family, kin, education, hafz, curriculums } = data;
  return (
    <div className="py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{core.first_name} {core.last_name}</h1>
        <p className="text-sm text-gray-500">{t('students.admission_no','Admission #')}: {core.admission_no}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-white/30 dark:border-white/10 md:col-span-2 space-y-4">
          <h2 className="font-semibold text-sm tracking-wide uppercase">{t('students.profile','Profile')}</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div><span className="font-medium">{t('students.gender','Gender')}:</span> {core.gender||'-'}</div>
            <div><span className="font-medium">{t('students.dob','DOB')}:</span> {core.date_of_birth||'-'}</div>
            <div><span className="font-medium">{t('students.birth_place','Birth Place')}:</span> {profile?.place_of_birth||'-'}</div>
            <div><span className="font-medium">{t('students.residence','Residence')}:</span> {profile?.place_of_residence||'-'}</div>
            <div><span className="font-medium">{t('students.nationality','Nationality')}:</span> {profile?.nationality_id||'-'}</div>
            <div><span className="font-medium">{t('students.district','District')}:</span> {profile?.district_id||'-'}</div>
          </div>
          <h2 className="font-semibold text-sm tracking-wide uppercase pt-4">{t('students.family','Family')}</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div><span className="font-medium">{t('students.guardian','Guardian')}:</span> {family?.primary_guardian_name||'-'}</div>
            <div><span className="font-medium">{t('students.guardian_contact','Guardian Contact')}:</span> {family?.primary_guardian_contact||'-'}</div>
            <div><span className="font-medium">{t('students.father','Father')}:</span> {family?.father_name||'-'}</div>
            <div><span className="font-medium">{t('students.father_contact','Father Contact')}:</span> {family?.father_contact||'-'}</div>
          </div>
          {kin?.length>0 && (
            <div className="pt-4">
              <h2 className="font-semibold text-sm tracking-wide uppercase mb-2">{t('students.next_of_kin','Next of Kin')}</h2>
              <ul className="space-y-1 text-xs list-disc pl-4">
                {kin.map((k:any)=>(<li key={k.id}>{k.sequence}. {k.name} {k.contact && <span className="text-gray-500">({k.contact})</span>}</li>))}
              </ul>
            </div>
          )}
          {education?.length>0 && (
            <div className="pt-4">
              <h2 className="font-semibold text-sm tracking-wide uppercase mb-2">{t('students.education_levels','Education Levels')}</h2>
              <ul className="space-y-1 text-xs list-disc pl-4">
                {education.map((e:any)=>(<li key={e.id}>{e.education_type}: {e.level_name} {e.institution && <span className="text-gray-500">@ {e.institution}</span>}</li>))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-6">
          <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-white/30 dark:border-white/10">
            <h2 className="font-semibold text-sm tracking-wide uppercase mb-3">{t('students.progress','Progress')}</h2>
            <div className="text-xs"><span className="font-medium">{t('students.hafz_juz','Juz Memorized')}:</span> {hafz?.juz_memorized ?? 0}</div>
            <div className="mt-3"><span className="font-medium text-xs">{t('students.curriculums','Curriculums')}:</span>
              <div className="flex flex-wrap gap-1 mt-1">{curriculums?.map((c:any)=>(<span key={c.id} className="px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[10px] font-medium text-[var(--color-primary)]">{c.name}</span>))||<span className="text-xs">-</span>}</div>
            </div>
          </div>
          <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-white/30 dark:border-white/10">
            <h2 className="font-semibold text-sm tracking-wide uppercase mb-3">{t('common.actions','Actions')}</h2>
            <a href={`/students/list`} className="text-[var(--color-primary)] text-xs font-medium">{t('common.back_to_list','Back to list')}</a>
          </div>
        </div>
      </div>
      {/* Enrollment History Timeline — Phase 7 */}
      <EnrollmentTimeline studentId={params.id} />
    </div>
  );
}
