'use client';

import { useState } from 'react';

interface ImportStep {
  status: 'idle' | 'uploading' | 'preview' | 'importing' | 'complete' | 'error';
  message?: string;
  preview?: any;
  result?: any;
}

export default function BulkImportPage() {
  const [step, setStep] = useState<ImportStep>({ status: 'idle' });
  const [file, setFile] = useState<File | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStep({ status: 'idle' });
    }
  };

  const handlePreview = async () => {
    if (!file) return;

    setStep({ status: 'uploading', message: 'Analyzing file...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'preview');

      const response = await fetch('/api/students/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        setStep({
          status: 'error',
          message: error.error || 'Failed to preview file'
        });
        return;
      }

      const data = await response.json();
      setStep({
        status: 'preview',
        message: `Ready to import ${data.total} students`,
        preview: data
      });
    } catch (err) {
      setStep({
        status: 'error',
        message: (err as Error).message
      });
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setStep({ status: 'importing', message: 'Importing students...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'import');

      const response = await fetch('/api/students/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        setStep({
          status: 'error',
          message: error.error || 'Import failed'
        });
        return;
      }

      const data = await response.json();
      setStep({
        status: 'complete',
        message: data.message,
        result: data
      });
    } catch (err) {
      setStep({
        status: 'error',
        message: (err as Error).message
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Bulk Import Students</h1>
          <p className="text-gray-600">
            Upload a CSV file to quickly import multiple students
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-lg border p-8">
          {step.status === 'idle' && (
            <div className="space-y-6">
              {/* File Upload */}
              <div>
                <label className="block mb-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 cursor-pointer">
                    <div className="text-4xl mb-2">📁</div>
                    <p className="font-medium mb-1">Click to select file</p>
                    <p className="text-sm text-gray-600">or drag and drop</p>
                    <p className="text-xs text-gray-500 mt-2">CSV or Excel</p>
                  </div>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>

                {file && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded">
                    <span>✓</span>
                    <span className="text-sm font-medium">{file.name}</span>
                    <button
                      onClick={() => setFile(null)}
                      className="ml-auto text-sm text-gray-600 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={handlePreview}
                  disabled={!file}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:bg-gray-300"
                >
                  Preview
                </button>
                <button
                  onClick={() => setShowTemplate(!showTemplate)}
                  className="px-4 py-3 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200"
                >
                  {showTemplate ? 'Hide' : 'Show'} Template
                </button>
              </div>

              {/* Template */}
              {showTemplate && (
                <div className="bg-gray-50 p-4 rounded border text-sm">
                  <p className="font-medium mb-2">CSV Template:</p>
                  <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
                    name,reg_no,class,stream,balance_fees{'\n'}
                    John Doe,ADM-001,Primary 1,Standard,0{'\n'}
                    Jane Smith,ADM-002,Primary 1,Standard,500{'\n'}
                    Ahmed Hassan,ADM-003,Primary 2,Standard,1000
                  </pre>
                </div>
              )}
            </div>
          )}

          {step.status === 'uploading' && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin text-2xl mb-2">⏳</div>
              <p className="text-gray-600">{step.message}</p>
            </div>
          )}

          {step.status === 'preview' && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="font-medium text-blue-900">{step.message}</p>
              </div>

              {step.preview?.warnings && step.preview.warnings.length > 0 && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="font-medium text-yellow-900 mb-2">Warnings:</p>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    {step.preview.warnings.map((w: string, i: number) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {step.preview?.preview && step.preview.preview.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Preview (first 5 rows):</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead className="bg-gray-100">
                        <tr>
                          {Object.keys(step.preview.preview[0]).map((key) => (
                            <th key={key} className="px-3 py-2 text-left">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {step.preview.preview.map((row: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            {Object.values(row).map((val: any, i: number) => (
                              <td key={i} className="px-3 py-2">
                                {String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setStep({ status: 'idle' })}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!step.preview?.readyToImport}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:bg-gray-300"
                >
                  Import {step.preview?.total} Students
                </button>
              </div>
            </div>
          )}

          {step.status === 'importing' && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin text-2xl mb-2">⏳</div>
              <p className="text-gray-600">{step.message}</p>
            </div>
          )}

          {step.status === 'complete' && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded">
                <p className="font-medium text-green-900">✓ {step.message}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded border">
                  <p className="text-sm text-gray-600">Imported</p>
                  <p className="text-2xl font-bold">{step.result?.imported}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded border">
                  <p className="text-sm text-gray-600">Skipped</p>
                  <p className="text-2xl font-bold">{step.result?.skipped}</p>
                </div>
              </div>

              {step.result?.errors && step.result.errors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded">
                  <p className="font-medium text-red-900 mb-2">Errors:</p>
                  <ul className="text-sm text-red-800 space-y-1 max-h-40 overflow-y-auto">
                    {step.result.errors.map((err: string, i: number) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={() => {
                  setStep({ status: 'idle' });
                  setFile(null);
                }}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
              >
                Import Another File
              </button>
            </div>
          )}

          {step.status === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded">
                <p className="font-medium text-red-900">Error</p>
                <p className="text-red-800 text-sm mt-1">{step.message}</p>
              </div>

              <button
                onClick={() => setStep({ status: 'idle' })}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
