/**
 * ═════════════════════════════════════════════════════════════════════════════
 * useExport Hook
 * 
 * Simplifies data export in React components
 * ═════════════════════════════════════════════════════════════════════════════
 */

'use client';

import { useState } from 'react';
import { exportData, ExportOptions } from '@/lib/export/exporter';

export function useExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (options: ExportOptions) => {
    try {
      setExporting(true);
      setError(null);
      await exportData(options);
    } catch (err: any) {
      setError(err.message || 'Export failed');
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const exportAsCSV = async (data: any[], filename: string, columns?: string[]) => {
    await handleExport({ type: 'csv', filename, data, columns });
  };

  const exportAsExcel = async (data: any[], filename: string, columns?: string[], title?: string) => {
    await handleExport({ type: 'excel', filename, data, columns, title });
  };

  const exportAsPDF = async (data: any[], filename: string, columns?: string[], title?: string) => {
    await handleExport({ type: 'pdf', filename, data, columns, title });
  };

  return {
    exporting,
    error,
    exportAsCSV,
    exportAsExcel,
    exportAsPDF,
    handleExport,
  };
}
