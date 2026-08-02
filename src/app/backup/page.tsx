'use client';

import React from 'react';
import { BackupCenter } from '@/components/backup/BackupCenter';

export default function SchoolBackupPage() {
  return <BackupCenter apiBase="/api/backup" canGenerate />;
}
