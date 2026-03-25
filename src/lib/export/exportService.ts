/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EXPORT SERVICE - Central Export Engine
 * 
 * Handles CSV, Excel, and PDF exports with consistent error handling
 * and data validation. Used across all modules.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/**
 * Download CSV File
 */
export function downloadCSV(csvContent: string, filename: string): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export Data to CSV
 */
export function exportCSV(
  data: any[],
  filename: string = 'export',
  columns?: string[]
): string {
  if (!data || data.length === 0) {
    console.warn('[exportCSV] No data to export');
    return '';
  }

  // Determine columns from first row if not provided
  const headers = columns || Object.keys(data[0]);

  // Build CSV
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '""';
      }
      const strValue = String(value).replace(/"/g, '""');
      return `"${strValue}"`;
    });
    csvRows.push(values.join(','));
  }

  const csv = csvRows.join('\n');
  downloadCSV(csv, filename);
  return csv;
}

/**
 * Download Excel File (client-side using xlsx)
 */
export async function exportExcel(
  data: any[],
  filename: string = 'export',
  columns?: string[]
): Promise<void> {
  if (!data || data.length === 0) {
    console.warn('[exportExcel] No data to export');
    return;
  }

  try {
    // Dynamically import xlsx (optional dependency)
    const XLSX = (await import('xlsx')).default;

    const headers = columns || Object.keys(data[0]);
    const excelData = [headers, ...data.map(row => headers.map(col => row[col] ?? ''))];

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');

    // Set column widths
    const colWidths = headers.map(h => Math.min(Math.max(String(h).length + 2, 12), 50));
    ws['!cols'] = colWidths.map(w => ({ wch: w }));

    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  } catch (error) {
    console.error('[exportExcel] Error:', error);
    // Fallback to CSV
    console.warn('[exportExcel] xlsx not available, falling back to CSV');
    exportCSV(data, filename, columns);
  }
}

/**
 * Download PDF File (client-side using jsPDF)
 */
export async function exportPDF(
  data: any[],
  filename: string = 'export',
  columns?: string[]
): Promise<void> {
  if (!data || data.length === 0) {
    console.warn('[exportPDF] No data to export');
    return;
  }

  try {
    // Dynamically import jsPDF and autoTable (optional dependencies)
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    const headers = columns || Object.keys(data[0]);
    const tableData = data.map(row => headers.map(col => row[col] ?? ''));

    autoTable(doc, {
      head: [headers],
      body: tableData,
      margin: 10,
      theme: 'striped',
      styles: {
        font: 'helvetica',
        fontSize: 10,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
      },
    });

    doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
  } catch (error) {
    console.error('[exportPDF] Error:', error);
    // Fallback to CSV
    console.warn('[exportPDF] jsPDF not available, falling back to CSV');
    exportCSV(data, filename, columns);
  }
}

/**
 * Batch Export - Export same data in multiple formats
 */
export async function exportMultiple(
  data: any[],
  filename: string = 'export',
  formats: Array<'csv' | 'excel' | 'pdf'> = ['csv'],
  columns?: string[]
): Promise<void> {
  for (const format of formats) {
    try {
      if (format === 'csv') {
        exportCSV(data, `${filename}_${format}`, columns);
      } else if (format === 'excel') {
        await exportExcel(data, `${filename}_${format}`, columns);
      } else if (format === 'pdf') {
        await exportPDF(data, `${filename}_${format}`, columns);
      }
    } catch (error) {
      console.error(`[exportMultiple] Error exporting ${format}:`, error);
    }
  }
}
