/**
 * ═════════════════════════════════════════════════════════════════════════════
 * useExport Hook - React wrapper for export service
 * 
 * Simplifies data export in React components with error handling
 * ═════════════════════════════════════════════════════════════════════════════
 */

'use client';

import { useState } from 'react';
import { exportCSV, exportExcel, exportPDF } from '@/lib/export/exportService';
import toast from 'react-hot-toast';

export function useExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportAsCSV = async (data: any[], filename: string, columns?: string[]) => {
    try {
      setExporting(true);
      setError(null);
      exportCSV(data, filename, columns);
      toast.success('CSV exported successfully');
    } catch (err: any) {
      const msg = err.message || 'Export failed';
      setError(msg);
      toast.error(msg);
      console.error('CSV export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const exportAsExcel = async (data: any[], filename: string, columns?: string[], title?: string) => {
    try {
      setExporting(true);
      setError(null);
      await exportExcel(data, filename, columns);
      toast.success('Excel exported successfully');
    } catch (err: any) {
      const msg = err.message || 'Export failed';
      setError(msg);
      toast.error(msg);
      console.error('Excel export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const exportAsPDF = async (data: any[], filename: string, columns?: string[], title?: string) => {
    try {
      setExporting(true);
      setError(null);
      await exportPDF(data, filename, columns);
      toast.success('PDF exported successfully');
    } catch (err: any) {
      const msg = err.message || 'Export failed';
      setError(msg);
      toast.error(msg);
      console.error('PDF export error:', err);
    } finally {
      setExporting(false);
    }
  };

  return {
    exporting,
    error,
    exportAsCSV,
    exportAsExcel,
    exportAsPDF,
  };
}
