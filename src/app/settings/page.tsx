"use client";
import { SettingsManager } from '@/components/general/SettingsManager';
import ModuleIntroCard from '@/components/onboarding/ModuleIntroCard';

export default function SettingsPage() {
  return (
    <div className="p-6" data-tour="settings">
      <ModuleIntroCard
        moduleId="settings"
        icon="⚙️"
        title="Settings"
        description="Configure your school — name, logo, academic year, late-arrival cutoff time, SMS notifications, device connections, and user roles. Start by completing your school profile."
        actions={[
          { label: 'School Profile', href: '/settings', primary: true },
        ]}
        learnMoreHref="/documentation/getting-started"
        tip="Complete the school profile first. Many features depend on your academic year, term configuration, and SMS provider settings."
      />
      <SettingsManager />
    </div>
  );
}