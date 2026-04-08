"use client";
import React, { useState } from 'react';
import { Search, Plus, FileText, Download, Eye, Upload, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import AddDocumentModal from '@/components/students/AddDocumentModal';

const DocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0;
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch documents data
  const { data: documentsData, isLoading, mutate } = useSWR(
    `/api/students/documents?school_id=${schoolId}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Fetch document types
  const { data: typesData } = useSWR('/api/document-types', fetcher);

  const documents = documentsData?.data || [];
  const documentTypes = typesData?.data || [];

  // Filter documents based on search and type
  const filteredDocuments = documents.filter((doc: any) => {
    const studentName = `${doc.first_name} ${doc.last_name}`.toLowerCase();
    const fileName = doc.file_name.toLowerCase();
    const searchTerm = searchQuery.toLowerCase();
    
    const matchesSearch = !searchQuery || 
      studentName.includes(searchTerm) ||
      fileName.includes(searchTerm) ||
      doc.document_type_label.toLowerCase().includes(searchTerm);
    
    const matchesType = !typeFilter || doc.document_type_id.toString() === typeFilter;
    
    return matchesSearch && matchesType;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.includes('image/')) return '🖼️';
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('document') || mimeType?.includes('text')) return '📝';
    return '📁';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              📄 Student Documents
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {filteredDocuments.length} documents
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg px-6 py-3 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Upload className="w-5 h-5" />
            Upload Document
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students or documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Document Types</option>
              {documentTypes.map((type: any) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>

            <button
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('');
              }}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Documents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading documents...</p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredDocuments.map((doc: any, index: number) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 group"
                >
                  {/* Document Preview */}
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 mx-auto mb-3 bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-3xl">
                      {getFileIcon(doc.mime_type)}
                    </div>
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {doc.file_name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {doc.document_type_label}
                    </p>
                  </div>

                  {/* Student Info */}
                  <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                      {doc.first_name?.charAt(0)}{doc.last_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {doc.first_name} {doc.last_name}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {doc.class_name} • {doc.admission_no}
                      </p>
                    </div>
                  </div>

                  {/* Document Details */}
                  <div className="space-y-2 mb-4">
                    {doc.file_size && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Size:</span> {formatFileSize(doc.file_size)}
                      </div>
                    )}
                    {doc.issue_date && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-medium">Issued:</span> {doc.issue_date}
                      </div>
                    )}
                    {doc.uploaded_at && (
                      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(doc.file_url, '_blank')}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = doc.file_url;
                        link.download = doc.file_name;
                        link.click();
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {filteredDocuments.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No documents found</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Document Modal */}
      <AddDocumentModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          mutate();
        }}
      />
    </div>
  );
};

export default DocumentsPage;
