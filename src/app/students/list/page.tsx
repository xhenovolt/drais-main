"use client";
import React from 'react';
import EnrolledStudentTable from '@/components/students/EnrolledStudentTable';
import ModuleIntroCard from '@/components/onboarding/ModuleIntroCard';

const StudentsListPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 pt-6">
        <ModuleIntroCard
          moduleId="students"
          icon="👩‍🎓"
          title="Students Module"
          description="Manage students by term. Admit new students, enroll them into classes each term, track their history, and promote them at year-end."
          actions={[
            { label: 'Admit Student', href: '/students/admit', primary: true },
            { label: 'Enroll Student', href: '/students/enroll', primary: false },
          ]}
          learnMoreHref="/documentation/admitting-students"
          tip="Admit a student once, then enroll them each term. The list below shows students enrolled in the current term."
        />
      </div>
      <EnrolledStudentTable />
    </div>
  );
};

export default StudentsListPage;
