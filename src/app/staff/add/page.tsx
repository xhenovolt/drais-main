"use client";
import React, { useState } from 'react';
import { UserPlus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import AddStaffModal from '@/components/staff/AddStaffModal';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/i18n/I18nProvider';

const AddStaffPage: React.FC = () => {
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(true);
  const router = useRouter();

  const handleClose = () => {
    setModalOpen(false);
    router.back();
  };

  const handleSuccess = () => {
    router.push('/staff/list');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/staff"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('common.back')}
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            👤 {t('nav.staff.add')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('common.details')}
          </p>
        </div>

        {/* Modal */}
        <AddStaffModal
          open={modalOpen}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  );
};

export default AddStaffPage;
