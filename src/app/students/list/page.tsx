"use client";
import React from 'react';
import StudentTable from '@/components/students/StudentTable';
import ModuleIntroCard from '@/components/onboarding/ModuleIntroCard';
import HelpButton from '@/components/onboarding/HelpButton';

const StudentsListPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 pt-6">
        {/* Phase 22: Module intro card (shown on first visit only) */}
        <ModuleIntroCard
          moduleId="students"
          icon="👩‍🎓"
          title="Students Module"
          description="Here you admit and manage all students in your school. Every student must be registered before attendance can be tracked. After registering students, enrol their fingerprints using the fingerprint device."
          actions={[
            { label: 'Admit First Student', href: '/students/admit', primary: true },
            { label: 'View All Students', href: '/students/list', primary: false },
          ]}
          learnMoreHref="/documentation/admitting-students"
          tip="Admit students before setting up attendance. The fingerprint device uses each student's enrolled print to record arrivals automatically."
        />
      </div>

      <StudentTable />
    </div>
  );
};

export default StudentsListPage;
