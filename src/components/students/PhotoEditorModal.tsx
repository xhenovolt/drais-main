import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import Swal from 'sweetalert2';
import { Camera, Trash2, X } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface Student {
  id: number;
  first_name: string;
  last_name: string;
  photo_url?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  learner: Student | null;
  onUpdated?: () => void;
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
const CLIENT_COMPRESSION_THRESHOLD = 5 * 1024 * 1024; // 5MB
const SERVER_COMPRESSION_THRESHOLD = 10 * 1024 * 1024; // 10MB

// Client-side image compression helper using canvas
async function compressFile(file: File, maxWidth = 1920, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Compression failed'));
            return;
          }
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function PhotoEditorModal({ open, onClose, learner, onUpdated }: Props) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (learner?.photo_url) {
      setPreviewUrl(learner.photo_url);
    } else {
      setPreviewUrl(null);
    }
    setFile(null);
  }, [learner, open]);

  if (!open) return null;

  const handleFileSelect = async (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      Swal.fire(t('students.learner.photo.tooLargeTitle'), t('students.learner.photo.tooLargeBody'), 'error');
      return;
    }
    // If large, compress client-side if above threshold
    if (f.size > CLIENT_COMPRESSION_THRESHOLD && f.type.startsWith('image/')) {
      try {
        const compressedBlob = await compressFile(f);
        const compressedFile = new File([compressedBlob], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        setFile(compressedFile);
        setPreviewUrl(URL.createObjectURL(compressedFile));
      } catch (err) {
        console.error(err);
        Swal.fire('Compression failed', 'Could not compress the image locally. Upload will proceed with original file.', 'warning');
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
      }
    } else {
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    }
  };

  const onChooseFile = () => inputRef.current?.click();

  const handleUpload = async () => {
    if (!learner) return;
    if (!file) {
      Swal.fire('No file', 'Please choose an image to upload.', 'warning');
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('student_id', String(learner.id));
      // Server will perform additional compression if needed
      const res = await fetch('/api/students/photo', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        Swal.fire('Uploaded', 'Photo uploaded successfully.', 'success');
        onUpdated?.();
      } else {
        Swal.fire(t('students.learner.photo.uploadFailedTitle'), json.error || t('students.learner.photo.uploadFailedBody'), 'error');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Upload error', 'An unexpected error occurred.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!learner) return;
    const confirm = await Swal.fire({
      title: t('students.learner.photo.deleteTitle'),
      text: t('students.learner.photo.deleteBody'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('students.learner.photo.deleteConfirm'),
      cancelButtonText: t('students.learner.photo.cancel'),
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch('/api/students/photo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: learner.id }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        Swal.fire('Deleted', 'Learner photo removed.', 'success');
        onUpdated?.();
      } else {
        Swal.fire(t('students.learner.photo.deleteFailedTitle'), json.error || t('students.learner.photo.deleteFailedBody'), 'error');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Delete error', 'An unexpected error occurred.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{`${t('actions.edit')} — ${t('fields.photo')}`}</h3>
          <button onClick={onClose} className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="flex flex-col items-center">
            <div className="w-48 h-48 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
              {previewUrl ? (
                <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-gray-400">
                  <Camera className="w-10 h-10 mx-auto" />
                  <div className="text-sm mt-2">{t('students.learner.photo.none')}</div>
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files ? e.target.files[0] : null)}
              />
              <button onClick={onChooseFile} className="btn-primary gap-2">
                <Camera className="w-4 h-4" /> {t('students.learner.photo.choose')}
              </button>
              <button onClick={handleUpload} disabled={uploading} className={clsx('btn-secondary gap-2', uploading && 'opacity-50 cursor-not-allowed')}>
                {uploading ? t('students.learner.photo.uploading') : t('students.learner.photo.upload')}
              </button>
              {previewUrl && learner?.photo_url && (
                <button onClick={handleDelete} className="btn-danger gap-2">
                  <Trash2 className="w-4 h-4" /> {t('students.learner.photo.delete')}
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-2 text-center">
              {t('students.learner.photo.limits')}
            </p>
          </div>

          <div className="text-sm text-gray-700 dark:text-gray-300">
            <p><strong>{learner?.first_name} {learner?.last_name}</strong></p>
            <p className="mt-2">{t('students.learner.photo.tips')}</p>
            <ul className="list-disc ms-5 mt-2 space-y-1">
              <li>{t('students.learner.photo.tip1')}</li>
              <li>{t('students.learner.photo.tip2')}</li>
              <li>{t('students.learner.photo.tip3')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
