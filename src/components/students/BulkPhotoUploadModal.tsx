"use client";
import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Camera, Check, AlertCircle, Trash2, User, Image as ImageIcon, Users, Search, Filter } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import Swal from 'sweetalert2';

interface Student {
  id: number;
  person_id: number;
  first_name: string;
  last_name: string;
  admission_no?: string;
  photo_url?: string;
}

interface PhotoUpload {
  id: string;
  file: File;                     // compressed full file (or original if small)
  fullPreview?: string;           // objectURL for full compressed image
  thumbnailFile?: File;           // thumbnail file (200x200)
  thumbnailPreview?: string;      // objectURL for thumbnail
  studentId?: number;
  personId?: number;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'compressing';
  progress: number;
  error?: string;
}

interface BulkPhotoUploadModalProps {
  open: boolean;
  onClose: () => void;
  students: Student[];
  onUploadComplete: () => void;
}

export const BulkPhotoUploadModal: React.FC<BulkPhotoUploadModalProps> = ({
  open,
  onClose,
  students = [], // Add default empty array
  onUploadComplete,
}) => {
  const [photos, setPhotos] = useState<PhotoUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null); // full image viewer
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add safety check for students prop
  const safeStudents = Array.isArray(students) ? students : [];
  
  const filteredStudents = safeStudents.filter(student =>
    `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.admission_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.id.toString().includes(searchTerm)
  );

  // Helper: detect browser webp support quickly
  const supportsWebP = (() => {
    try {
      const c = document.createElement('canvas');
      if (!c.getContext) return false;
      return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch {
      return false;
    }
  })();

  // compress image (returns compressed File and creates preview later)
  const compressImage = async (file: File, onProgress?: (p: number) => void): Promise<File> => {
    // If small enough, return original (no compression needed for <= 100MB)
    if (file.size <= 100 * 1024 * 1024) return file;

    const outputMime = supportsWebP ? 'image/webp' : 'image/jpeg';
    const quality = file.size > 12 * 1024 * 1024 ? 0.7 : 0.82;
    const maxDim = 1600;

    let bitmap: ImageBitmap;
    try {
      // @ts-expect-error - imageOrientation option exists in modern browsers
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file);
    }

    const origW = bitmap.width;
    const origH = bitmap.height;
    const maxOrig = Math.max(origW, origH);
    const scale = maxOrig > maxDim ? maxDim / maxOrig : 1;
    const width = Math.round(origW * scale);
    const height = Math.round(origH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    ctx.drawImage(bitmap, 0, 0, width, height);

    if (onProgress) onProgress(30);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outputMime, quality);
    });

    if (onProgress) onProgress(95);

    if (!blob) throw new Error('Compression failed');

    const ext = outputMime === 'image/webp' ? 'webp' : 'jpg';
    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, `.${ext}`), {
      type: outputMime,
      lastModified: Date.now(),
    });

    if (onProgress) onProgress(100);
    return compressedFile;
  };

  // generate a 200x200 center-cropped thumbnail File + preview
  const generateThumbnail = async (file: File): Promise<{ thumbnailFile: File, thumbnailPreview: string }> => {
    // Create ImageBitmap honoring orientation if possible
    let bitmap: ImageBitmap;
    try {
      // @ts-expect-error - imageOrientation option exists in modern browsers
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file);
    }

    const target = 200;
    const sw = bitmap.width;
    const sh = bitmap.height;

    // compute center-crop source rectangle (cover)
    const srcRatio = sw / sh;
    const targetRatio = 1; // square

    let sx = 0, sy = 0, sWidth = sw, sHeight = sh;
    if (srcRatio > targetRatio) {
      // source wider -> crop sides
      sHeight = sh;
      sWidth = Math.round(sh * targetRatio);
      sx = Math.round((sw - sWidth) / 2);
    } else {
      // source taller -> crop top/bottom
      sWidth = sw;
      sHeight = Math.round(sw / targetRatio);
      sy = Math.round((sh - sHeight) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available for thumbnail');

    ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, target, target);

    const outputMime = supportsWebP ? 'image/webp' : 'image/jpeg';
    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), outputMime, 0.8);
    });

    if (!blob) throw new Error('Thumbnail generation failed');

    const ext = outputMime === 'image/webp' ? 'webp' : 'jpg';
    const thumbnailFile = new File([blob], `thumb_${file.name.replace(/\.[^/.]+$/, `.${ext}`)}`, {
      type: outputMime,
      lastModified: Date.now(),
    });

    const thumbnailPreview = URL.createObjectURL(thumbnailFile);
    return { thumbnailFile, thumbnailPreview };
  };

  // Updated onDrop: compress and create thumbnail for large images, keep original for small ones
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPhotos: PhotoUpload[] = acceptedFiles.map(file => {
      const id = Math.random().toString(36).substr(2, 9);
      const preview = URL.createObjectURL(file); // temporary preview until thumbnail ready
      const isLarge = file.size > 100 * 1024 * 1024;
      return {
        id,
        file,
        fullPreview: preview,
        thumbnailFile: undefined,
        thumbnailPreview: undefined,
        status: isLarge ? 'compressing' : 'pending',
        progress: isLarge ? 75 : 0,
      } as PhotoUpload;
    });

    setPhotos(prev => [...prev, ...newPhotos]);

    newPhotos.forEach(photo => {
      // If not large, create a small thumbnail immediately (fast path)
      if (photo.file.size <= 100 * 1024 * 1024) {
        generateThumbnail(photo.file)
          .then(({ thumbnailFile, thumbnailPreview }) => {
            setPhotos(prev => prev.map(p => p.id === photo.id ? {
              ...p,
              thumbnailFile,
              thumbnailPreview,
              fullPreview: p.fullPreview || URL.createObjectURL(p.file),
              status: 'pending',
              progress: 0
            } : p));
          })
          .catch((err) => {
            console.warn('Thumbnail generation failed for small file', err);
            setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status: 'pending', progress: 0 } : p));
          });
        return;
      }

      // Large file path: compress -> generate thumbnail -> update entry
      let interval: number | null = window.setInterval(() => {
        setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, progress: Math.min(90, (p.progress || 0) + 8) } : p));
      }, 350);

      compressImage(photo.file, (p) => {
        setPhotos(prev => prev.map(x => x.id === photo.id ? { ...x, progress: p } : x));
      })
        .then(async (compressedFile) => {
          const fullPreview = URL.createObjectURL(compressedFile);
          const { thumbnailFile, thumbnailPreview } = await generateThumbnail(compressedFile);

          setPhotos(prev => prev.map(p => {
            if (p.id !== photo.id) return p;
            // revoke old preview
            try { if (p.fullPreview) URL.revokeObjectURL(p.fullPreview); } catch {}
            return {
              ...p,
              file: compressedFile,
              fullPreview,
              thumbnailFile,
              thumbnailPreview,
              status: 'pending',
              progress: 0,
            };
          }));
        })
        .catch((err) => {
          console.error('Compression/thumbnail failed', err);
          setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, status: 'error', error: 'Compression/thumbnail failed', progress: 0 } : p));
          Swal.fire({
            title: 'Compression Failed',
            text: `Failed to compress ${photo.file.name}. Upload of this file will be skipped.`,
            icon: 'error',
            customClass: { popup: 'rounded-2xl' }
          });
        })
        .finally(() => {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        });
    });
  }, []);

  // dropzone: no maxSize so big files are accepted and compressed client-side
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    multiple: true,
  });

  const removePhoto = (photoId: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === photoId);
      if (photo) {
        try { if (photo.fullPreview) URL.revokeObjectURL(photo.fullPreview); } catch {}
        try { if (photo.thumbnailPreview) URL.revokeObjectURL(photo.thumbnailPreview); } catch {}
      }
      return prev.filter(p => p.id !== photoId);
    });
  };

  const assignStudent = (photoId: string, studentId: number, personId: number) => {
    setPhotos(prev => prev.map(photo =>
      photo.id === photoId 
        ? { ...photo, studentId, personId } 
        : photo
    ));
  };

  const unassignPhoto = (photoId: string) => {
    setPhotos(prev => prev.map(photo =>
      photo.id === photoId 
        ? { ...photo, studentId: undefined, personId: undefined }
        : photo
    ));
  };

  const uploadPhotos = async () => {
    // upload only photos assigned to a student (personId preferred, studentId as fallback)
    const photosToUpload = photos.filter(p => (p.personId || p.studentId) && p.status !== 'error');

    if (photosToUpload.length === 0) {
      Swal.fire({
        title: 'No Photos to Upload',
        text: 'Please assign students to photos before uploading.',
        icon: 'warning',
        customClass: {
          popup: 'rounded-2xl'
        }
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < photosToUpload.length; i++) {
      const photo = photosToUpload[i];

      try {
        setPhotos(prev => prev.map(p =>
          p.id === photo.id ? { ...p, status: 'uploading', progress: 0 } : p
        ));

        const formData = new FormData();
        // append compressed full image
        formData.append('photos', photo.file);
        // append thumbnail if available
        if (photo.thumbnailFile) {
          formData.append('thumbnails', photo.thumbnailFile);
        } else {
          // generate a small thumbnail fallback synchronously (rare)
          // Not blocking: server can accept missing thumbnail
        }
        // prefer person_id (people.id); fall back to student_id which the backend resolves internally
        if (photo.personId) {
          formData.append('person_ids', photo.personId.toString());
        } else if (photo.studentId) {
          formData.append('student_ids', photo.studentId.toString());
        }

        // progress simulation
        const progressInterval = setInterval(() => {
          setPhotos(prev => prev.map(p =>
            p.id === photo.id && p.progress < 90
              ? { ...p, progress: p.progress + 15 }
              : p
          ));
        }, 200);

        const response = await fetch('/api/students/bulk-photo-upload', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);

        const result = await response.json();

        if (result.success) {
          setPhotos(prev => prev.map(p =>
            p.id === photo.id
              ? { ...p, status: 'success', progress: 100 }
              : p
          ));
          successCount++;
        } else {
          setPhotos(prev => prev.map(p =>
            p.id === photo.id
              ? { ...p, status: 'error', progress: 0, error: result.error }
              : p
          ));
          errorCount++;
        }
      } catch (error) {
        setPhotos(prev => prev.map(p =>
          p.id === photo.id
            ? { ...p, status: 'error', progress: 0, error: 'Upload failed' }
            : p
        ));
        errorCount++;
      }

      setUploadProgress(Math.round(((i + 1) / photosToUpload.length) * 100));
    }

    setIsUploading(false);

    // Show completion message
    if (errorCount === 0) {
      await Swal.fire({
        title: 'Upload Complete!',
        text: `All ${successCount} photos uploaded successfully.`,
        icon: 'success',
        timer: 3000,
        showConfirmButton: false,
        customClass: {
          popup: 'rounded-2xl'
        }
      });
      onUploadComplete();
    } else {
      await Swal.fire({
        title: 'Upload Complete',
        html: `
          <div class="text-center space-y-2">
            <p><span class="text-green-600 font-semibold">${successCount}</span> photos uploaded successfully</p>
            <p><span class="text-red-600 font-semibold">${errorCount}</span> photos failed to upload</p>
          </div>
        `,
        icon: 'warning',
        customClass: {
          popup: 'rounded-2xl'
        }
      });
    }
  };

  const handleClose = () => {
    photos.forEach(photo => {
      try { if (photo.fullPreview) URL.revokeObjectURL(photo.fullPreview); } catch {}
      try { if (photo.thumbnailPreview) URL.revokeObjectURL(photo.thumbnailPreview); } catch {}
    });
    setPhotos([]);
    setSearchTerm('');
    setUploadProgress(0);
    setViewerUrl(null);
    onClose();
  };

  if (!open) return null;

  const assignedCount = photos.filter(p => p.personId).length;
  const totalPhotos = photos.length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Enhanced Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-slate-700 dark:to-slate-600 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Bulk Photo Upload
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upload multiple student photos and assign them efficiently
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all duration-200 hover:scale-110"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Upload Progress Bar (when uploading) */}
          {isUploading && (
            <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Uploading photos...
                </span>
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Main Content Area - Now with proper flex layout */}
          <div className="flex flex-1 min-h-0">
            {/* Left Panel - Photo Upload */}
            <div className="w-1/2 p-6 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload Photos
                </h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {assignedCount}/{totalPhotos} assigned
                </span>
              </div>

              {/* Enhanced Dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 flex-shrink-0 mb-6 ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-105'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                }`}
              >
                <input {...getInputProps()} />
                <motion.div
                  animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
                  className="space-y-3"
                >
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                      {isDragActive ? 'Drop photos here' : 'Drag & drop photos here'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      or click to browse files
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Supports: JPG, PNG, GIF, WebP (Max 100MB each) — large images will be compressed automatically
                    </p>
                  </div>
                </motion.div>
              </div>

              {/* Photo List */}
              {photos.length > 0 && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <h4 className="text-md font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3 flex-shrink-0">
                    <ImageIcon className="w-4 h-4" />
                    Uploaded Photos ({photos.length})
                  </h4>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="space-y-2 pr-2">
                      {photos.map((photo) => {
                        const assignedStudent = students.find(s => s.id === photo.studentId);
                        const thumbSrc = photo.thumbnailPreview || photo.fullPreview;
                        return (
                          <motion.div
                            key={photo.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-600 transition-all duration-200"
                          >
                            <img
                              src={thumbSrc}
                              alt="Preview"
                              onClick={() => { if (photo.fullPreview) setViewerUrl(photo.fullPreview); else setViewerUrl(photo.fullPreview || photo.thumbnailPreview || undefined); }}
                              className="w-12 h-12 rounded-lg object-cover shadow-md flex-shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {photo.file.name}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{(photo.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                {assignedStudent && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                                    <User className="w-3 h-3" />
                                    {assignedStudent.first_name} {assignedStudent.last_name}
                                  </span>
                                )}
                              </div>

                              {photo.status === 'compressing' && (
                                <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
                                  Compressing... {photo.progress ? `${photo.progress}%` : ''}
                                </div>
                              )}
                              {photo.status === 'uploading' && (
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                  <div
                                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${photo.progress}%` }}
                                  />
                                </div>
                              )}
                              {photo.status === 'error' && photo.error && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                  {photo.error}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {photo.status === 'success' && (
                                <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                                </div>
                              )}
                              {photo.status === 'error' && (
                                <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                </div>
                              )}
                              {photo.personId && (
                                <button
                                  onClick={() => unassignPhoto(photo.id)}
                                  className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded text-blue-600 dark:text-blue-400 transition-all duration-200"
                                  title="Unassign student"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => removePhoto(photo.id)}
                                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-600 dark:text-red-400 transition-all duration-200"
                                disabled={photo.status === 'uploading'}
                                title="Remove photo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel - Student Assignment */}
            <div className="w-1/2 p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Assign to Students
                </h3>
                <div className="flex items-center gap-2">
                  {photos.filter(p => p.studentId && students.find(s => s.id === p.studentId)?.photo_url).length > 0 && (
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      {photos.filter(p => p.studentId && students.find(s => s.id === p.studentId)?.photo_url).length} replacing
                    </span>
                  )}
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {filteredStudents.length} students
                  </span>
                </div>
              </div>

              {/* Enhanced Search */}
              <div className="relative mb-4 flex-shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search students by name, ID, or admission number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                />
              </div>

              {/* Student List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {(() => {
                  const withPhoto    = filteredStudents.filter(s => Boolean(s.photo_url));
                  const withoutPhoto = filteredStudents.filter(s => !s.photo_url);
                  const unassignedPhotos = photos.filter(p => !p.studentId);

                  const renderStudent = (student: Student) => {
                    const assignedPhoto = photos.find(p => p.studentId === student.id);
                    const hasPhoto = Boolean(student.photo_url);

                    return (
                      <motion.div
                        key={student.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`rounded-xl border-2 transition-all duration-200 overflow-hidden ${
                          assignedPhoto && hasPhoto
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-md'
                            : assignedPhoto
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                            : hasPhoto
                            ? 'border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-900/10 hover:border-amber-400'
                            : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-700 hover:border-gray-300'
                        }`}
                      >
                        {/* Top row: student info + action */}
                        <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            {hasPhoto ? (
                              <div className="relative flex-shrink-0">
                                <img
                                  src={student.photo_url!}
                                  alt={`${student.first_name} ${student.last_name}`}
                                  className={`w-11 h-11 rounded-xl object-cover shadow-md ${
                                    assignedPhoto ? 'opacity-50 ring-2 ring-red-300' : ''
                                  }`}
                                />
                                {!assignedPhoto && (
                                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-md" title="Has existing photo">
                                    <Camera className="w-3 h-3 text-white" />
                                  </div>
                                )}
                                {assignedPhoto && (
                                  <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/20">
                                    <span className="text-white text-xs font-bold">OLD</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-md flex-shrink-0">
                                <span className="text-sm font-semibold text-white">
                                  {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
                                </span>
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                                {student.first_name} {student.last_name}
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-gray-400">{student.admission_no ?? `ID ${student.id}`}</span>
                                {hasPhoto && !assignedPhoto && (
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
                                    ⚠ Has photo
                                  </span>
                                )}
                                {hasPhoto && assignedPhoto && (
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">
                                    ✓ Will replace
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action */}
                          {assignedPhoto ? (
                            <button
                              onClick={() => unassignPhoto(assignedPhoto.id)}
                              className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                              title="Remove assignment"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          ) : (
                            <select
                              onChange={(e) => {
                                const photoId = e.target.value;
                                if (photoId) {
                                  assignStudent(photoId, student.id, student.person_id);
                                  e.target.value = '';
                                }
                              }}
                              className={`text-xs border rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 transition-all flex-shrink-0 ${
                                hasPhoto
                                  ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100'
                                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-600 text-gray-900 dark:text-white'
                              }`}
                              disabled={unassignedPhotos.length === 0}
                            >
                              <option value="">
                                {unassignedPhotos.length === 0
                                  ? 'No photos uploaded'
                                  : hasPhoto ? '↺ Choose replacement...' : '+ Assign photo...'}
                              </option>
                              {unassignedPhotos.map(photo => (
                                <option key={photo.id} value={photo.id}>
                                  {photo.file.name.length > 22
                                    ? `${photo.file.name.substring(0, 22)}…`
                                    : photo.file.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Replacement preview — shown only when replacing an existing photo */}
                        {assignedPhoto && hasPhoto && (
                          <div className="px-3 pb-3 flex items-center gap-2">
                            <div className="flex-1 flex flex-col items-center gap-1">
                              <span className="text-xs font-semibold text-red-500 uppercase tracking-wide">Current</span>
                              <img
                                src={student.photo_url!}
                                alt="Current photo"
                                className="w-16 h-16 rounded-xl object-cover ring-2 ring-red-300 opacity-70"
                              />
                            </div>
                            <div className="flex flex-col items-center gap-1 px-1">
                              <span className="text-lg text-gray-400">→</span>
                              <span className="text-xs text-gray-400">replaced by</span>
                            </div>
                            <div className="flex-1 flex flex-col items-center gap-1">
                              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">New</span>
                              <img
                                src={assignedPhoto.thumbnailPreview || assignedPhoto.fullPreview}
                                alt="New photo"
                                className="w-16 h-16 rounded-xl object-cover ring-2 ring-emerald-400 shadow-md"
                              />
                            </div>
                          </div>
                        )}

                        {/* Assignment preview — new photo (no existing) */}
                        {assignedPhoto && !hasPhoto && (
                          <div className="px-3 pb-3 flex items-center gap-2">
                            <img
                              src={assignedPhoto.thumbnailPreview || assignedPhoto.fullPreview}
                              alt="New photo"
                              className="w-14 h-14 rounded-xl object-cover ring-2 ring-blue-400 shadow-md"
                            />
                            <p className="text-xs text-blue-600 dark:text-blue-300 font-medium">
                              {assignedPhoto.file.name}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    );
                  };

                  return (
                    <div className="space-y-1 pr-2">
                      {/* Students WITH existing photos — flagged for replacement */}
                      {withPhoto.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 pt-1 pb-2 sticky top-0 bg-white dark:bg-slate-900/80 backdrop-blur-sm z-10">
                            <div className="h-px flex-1 bg-amber-300 dark:bg-amber-700" />
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                              <Camera className="w-3 h-3" /> {withPhoto.length} with existing photo
                            </span>
                            <div className="h-px flex-1 bg-amber-300 dark:bg-amber-700" />
                          </div>
                          <div className="space-y-2">
                            {withPhoto.map(renderStudent)}
                          </div>
                        </>
                      )}

                      {/* Students WITHOUT photos */}
                      {withoutPhoto.length > 0 && (
                        <>
                          <div className="flex items-center gap-2 pt-3 pb-2 sticky top-0 bg-white dark:bg-slate-900/80 backdrop-blur-sm z-10">
                            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <User className="w-3 h-3" /> {withoutPhoto.length} no photo yet
                            </span>
                            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                          </div>
                          <div className="space-y-2">
                            {withoutPhoto.map(renderStudent)}
                          </div>
                        </>
                      )}

                      {filteredStudents.length === 0 && (
                        <div className="py-10 text-center text-sm text-gray-400">No students match your search</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Enhanced Footer - Fixed at bottom */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 flex-shrink-0">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{assignedCount}</span> photos ready to upload
              {totalPhotos > 0 && (
                <span className="ml-2">• {totalPhotos - assignedCount} unassigned</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-xl transition-all duration-200 font-medium"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                onClick={uploadPhotos}
                disabled={isUploading || assignedCount === 0}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200 flex items-center gap-2 font-medium shadow-lg hover:shadow-xl"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload {assignedCount} Photos
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.7);
        }
      `}</style>
    </AnimatePresence>
  );
};
