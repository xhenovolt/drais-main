'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, Search, Filter, Upload, Eye, FileText,
  Users, Target, Calendar, MoreVertical, Edit, Trash2,
  Download, Image as ImageIcon, Award, TrendingUp, X
} from 'lucide-react';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import AssignPortionModal from '@/components/tahfiz/AssignPortionModal';
import { useAuth } from '@/contexts/AuthContext';

interface TahfizBook {
  id: number;
  school_id: number;
  title: string;
  description: string;
  total_units: number;
  unit_type: 'verse' | 'page' | 'surah' | 'chapter';
  cover_image?: string;
  pdf_file?: string;
  created_at: string;
  updated_at: string;
  // Stats from linked data
  total_portions?: number;
  active_learners?: number;
  completion_rate?: number;
}

function TahfizBooksContent() {
  const [books, setBooks] = useState<TahfizBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0;
  const { showToast } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<TahfizBook | null>(null);

  // Add Book Form State
  const [bookForm, setBookForm] = useState({
    title: '',
    description: '',
    total_units: '',
    unit_type: 'verse'
  });
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Add refs for file inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchBooks();
  }, [schoolId]);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tahfiz/books?school_id=${schoolId}&include_stats=true`);
      const data = await response.json();

      if (data.success) {
        setBooks(data.data);
      } else {
        showToast('Error fetching books', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Failed to fetch books', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('school_id', schoolId.toString());
      formData.append('title', bookForm.title);
      formData.append('description', bookForm.description);
      formData.append('total_units', bookForm.total_units);
      formData.append('unit_type', bookForm.unit_type);
      
      if (coverImage) formData.append('cover_image', coverImage);
      if (pdfFile) formData.append('pdf_file', pdfFile);

      const response = await fetch('/api/tahfiz/books', {
        method: 'POST',
        body: formData
        // Don't set Content-Type header - let browser set it with boundary for FormData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        showToast('Book added successfully', 'success');
        fetchBooks();
        resetForm();
        setShowAddModal(false);
      } else {
        showToast(data.message || 'Failed to add book', 'error');
      }
    } catch (error) {
      console.error('Error adding book:', error);
      showToast(error instanceof Error ? error.message : 'Failed to add book', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBook = async (bookId: number) => {
    if (!confirm('Are you sure you want to delete this book? This will also remove all associated portions.')) return;

    try {
      const response = await fetch(`/api/tahfiz/books?id=${bookId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        showToast('Book deleted successfully', 'success');
        fetchBooks();
      } else {
        showToast(data.message || 'Failed to delete book', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Failed to delete book', 'error');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setCoverImage(file);
      const reader = new FileReader();
      reader.onload = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
    }
  };

  const removeCoverImage = () => {
    setCoverImage(null);
    setCoverPreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removePdfFile = () => {
    setPdfFile(null);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const resetForm = () => {
    setBookForm({ title: '', description: '', total_units: '', unit_type: 'verse' });
    setCoverImage(null);
    setPdfFile(null);
    setCoverPreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const getUnitTypeLabel = (type: string) => {
    const labels = {
      verse: 'Verse-based',
      page: 'Page-based',
      surah: 'Surah-based',
      chapter: 'Chapter-based'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getUnitTypeColor = (type: string) => {
    const colors = {
      verse: 'bg-emerald-100 text-emerald-700',
      page: 'bg-blue-100 text-blue-700',
      surah: 'bg-purple-100 text-purple-700',
      chapter: 'bg-amber-100 text-amber-700'
    };
    return colors[type as keyof typeof colors] || 'bg-slate-100 text-slate-700';
  };

  const filteredAndSortedBooks = books
    .filter(book =>
      book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      book.description.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'total_units':
          return b.total_units - a.total_units;
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const stats = {
    totalBooks: books.length,
    totalPortions: books.reduce((sum, book) => sum + (book.total_portions || 0), 0),
    activeLearners: books.reduce((sum, book) => sum + (book.active_learners || 0), 0),
    avgCompletion: books.length > 0 ? Math.round(books.reduce((sum, book) => sum + (book.completion_rate || 0), 0) / books.length) : 0
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Stats */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Tahfiz Books</h1>
            <p className="text-slate-600 mt-1">Manage memorization books and track learning progress</p>
          </div>
          <motion.button
            onClick={() => setShowAddModal(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Add Book</span>
          </motion.button>
        </div>

        {/* Stats Cards */}
        {books.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Books</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalBooks}</p>
                </div>
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Portions</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.totalPortions}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Active Learners</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.activeLearners}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Avg. Completion</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.avgCompletion}%</p>
                </div>
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search books by title or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              >
                <option value="created_at">Sort by Date</option>
                <option value="title">Sort by Title</option>
                <option value="total_units">Sort by Units</option>
              </select>
            </div>
          </div>
        </div>

        {/* Books Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredAndSortedBooks.map((book, index) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 group overflow-hidden"
              >
                {/* Book Cover */}
                <div className="relative h-48 bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  {book.cover_image ? (
                    <img 
                      src={book.cover_image} 
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-white">
                      <BookOpen className="w-16 h-16 mx-auto mb-2 opacity-80" />
                      <p className="font-semibold text-lg">{book.title}</p>
                    </div>
                  )}
                  
                  {/* Actions Overlay */}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center space-x-2">
                    <motion.button
                      onClick={() => {
                        setSelectedBook(book);
                        setShowDetailsModal(true);
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors"
                    >
                      <Eye className="w-5 h-5" />
                    </motion.button>
                    {book.pdf_file && (
                      <motion.a
                        href={book.pdf_file}
                        target="_blank"
                        rel="noopener noreferrer"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="p-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors"
                      >
                        <FileText className="w-5 h-5" />
                      </motion.a>
                    )}
                  </div>
                </div>

                {/* Book Info */}
                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="font-bold text-lg text-slate-800">{book.title}</h3>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{book.description}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getUnitTypeColor(book.unit_type)}`}>
                      {getUnitTypeLabel(book.unit_type)}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">
                      {book.total_units} units
                    </span>
                  </div>

                  {/* Stats */}
                  {(book.total_portions || book.active_learners) ? (
                    <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                      <div className="text-center">
                        <p className="font-semibold text-slate-700">{book.total_portions || 0}</p>
                        <p>Portions</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-slate-700">{book.active_learners || 0}</p>
                        <p>Learners</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-slate-700">{book.completion_rate || 0}%</p>
                        <p>Complete</p>
                      </div>
                    </div>
                  ) : null}

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setSelectedBook(book);
                        setShowAssignModal(true);
                      }}
                      className="flex-1 px-4 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center space-x-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Assign</span>
                    </button>
                    <div className="relative group/menu">
                      <button className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <MoreVertical className="w-4 h-4 text-slate-600" />
                      </button>
                      <div className="absolute right-0 bottom-full mb-2 w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-2 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-200 z-10">
                        <button
                          onClick={() => {
                            setSelectedBook(book);
                            setShowDetailsModal(true);
                          }}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors text-sm"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View Details</span>
                        </button>
                        {book.pdf_file && (
                          <a
                            href={book.pdf_file}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-2 w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors text-sm"
                          >
                            <Download className="w-4 h-4" />
                            <span>Open PDF</span>
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteBook(book.id)}
                          className="flex items-center space-x-2 w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 transition-colors text-sm"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {!loading && filteredAndSortedBooks.length === 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 shadow-lg border border-white/20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">No books found</h3>
            <p className="text-slate-600 mb-6">
              {books.length === 0
                ? "Start building your Tahfiz library by adding your first book."
                : "No books match your current search criteria."
              }
            </p>
            {books.length === 0 && (
              <motion.button
                onClick={() => setShowAddModal(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2 mx-auto"
              >
                <Plus className="w-5 h-5" />
                <span>Add First Book</span>
              </motion.button>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden animate-pulse">
                <div className="h-48 bg-slate-200" />
                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <div className="h-5 bg-slate-200 rounded w-3/4" />
                    <div className="h-4 bg-slate-200 rounded w-full" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-6 bg-slate-200 rounded w-20" />
                    <div className="h-6 bg-slate-200 rounded w-16" />
                  </div>
                  <div className="h-10 bg-slate-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Book Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Add New Book</h2>
                    <p className="text-sm text-slate-600">Add a new book to your Tahfiz library</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleAddBook} className="p-6 space-y-6">
                {/* Cover Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <ImageIcon className="w-4 h-4 inline mr-1" />
                    Book Cover
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
                    {coverPreview ? (
                      <div className="relative inline-block">
                        <img 
                          src={coverPreview} 
                          alt="Cover preview" 
                          className="w-32 h-40 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={removeCoverImage}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                        <p className="text-slate-600 mb-2">Upload book cover image</p>
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                        >
                          Choose Image
                        </button>
                      </div>
                    )}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Basic Info */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Book Title *
                    </label>
                    <input
                      type="text"
                      value={bookForm.title}
                      onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                      placeholder="e.g., The Holy Quran, Tuhfat Al-Atfal"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={bookForm.description}
                      onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                      placeholder="Brief description of the book content..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 resize-none"
                    />
                  </div>
                </div>

                {/* Units Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Total Units *
                    </label>
                    <input
                      type="number"
                      value={bookForm.total_units}
                      onChange={(e) => setBookForm({ ...bookForm, total_units: e.target.value })}
                      placeholder="e.g., 114, 604"
                      min="1"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Unit Type *
                    </label>
                    <select
                      value={bookForm.unit_type}
                      onChange={(e) => setBookForm({ ...bookForm, unit_type: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    >
                      <option value="verse">Verse</option>
                      <option value="page">Page</option>
                      <option value="surah">Surah</option>
                      <option value="chapter">Chapter</option>
                    </select>
                  </div>
                </div>

                {/* PDF Upload */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    <FileText className="w-4 h-4 inline mr-1" />
                    PDF File (Optional)
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
                    {pdfFile ? (
                      <div className="flex items-center justify-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-8 h-8 text-red-500" />
                          <div className="text-left">
                            <p className="font-medium text-slate-800">{pdfFile.name}</p>
                            <p className="text-sm text-slate-500">
                              {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={removePdfFile}
                          className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                        <p className="text-slate-600 mb-2">Upload PDF file for digital reference</p>
                        <button
                          type="button"
                          onClick={() => pdfInputRef.current?.click()}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                          Choose PDF
                        </button>
                      </div>
                    )}
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfChange}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {uploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : (
                      <>
                        <BookOpen className="w-4 h-4" />
                        <span>Add Book</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Book Details Modal - placeholder for now */}
      {/* Assign Portion Modal */}
      <AssignPortionModal
        isOpen={showAssignModal}
        onClose={() => {
          setShowAssignModal(false);
          setSelectedBook(null);
        }}
        onSuccess={fetchBooks}
        schoolId={schoolId}
        preselectedBook={selectedBook}
      />
    </div>
  );
}

export default function TahfizBooks() {
  return (
    <ToastProvider>
      <TahfizBooksContent />
    </ToastProvider>
  );
}
