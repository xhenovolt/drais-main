'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, X, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface StaffLike {
  id:         number;
  first_name: string;
  last_name:  string;
  photo_url?: string | null;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  staff:     StaffLike | null;
  onUpdated?: () => void;
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const CLIENT_COMPRESS_THRESHOLD = 5 * 1024 * 1024;

/** Client-side image compression — keeps upload latency reasonable for >5MB photos. */
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
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas 2D context unavailable'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Compression failed'));
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function StaffPhotoModal({ open, onClose, staff, onUpdated }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPreviewUrl(staff?.photo_url ?? null);
    setFile(null);
  }, [staff, open]);

  if (!open) return null;

  async function handleFileSelect(f: File | null) {
    if (!f) return;
    if (f.size > MAX_UPLOAD_BYTES) {
      toast.error('Image too large (max 100MB).');
      return;
    }
    if (f.size > CLIENT_COMPRESS_THRESHOLD && f.type.startsWith('image/')) {
      try {
        const blob = await compressFile(f);
        const compressed = new File([blob], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
        setFile(compressed);
        setPreviewUrl(URL.createObjectURL(compressed));
      } catch {
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
      }
    } else {
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    }
  }

  async function handleUpload() {
    if (!staff || !file) {
      toast.error('Choose a photo first.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('staff_id', String(staff.id));
      const res = await fetch('/api/staff/photo', { method: 'POST', body: fd, credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');
      toast.success('Photo uploaded');
      onUpdated?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!staff?.photo_url) return;
    if (!confirm('Remove the staff photo? This will revert to the default placeholder.')) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/staff/photo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staff.id }),
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || 'Delete failed');
      toast.success('Photo removed');
      setPreviewUrl(null);
      setFile(null);
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const hasExistingPhoto = !!staff?.photo_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {staff?.first_name} {staff?.last_name} — Photo
          </h3>
          <button onClick={onClose} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center">
          <div className="w-48 h-48 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 flex items-center justify-center ring-1 ring-slate-200 dark:ring-slate-700">
            {previewUrl ? (
              <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-slate-400">
                <Camera className="w-10 h-10 mx-auto" />
                <div className="text-sm mt-2">No photo</div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Camera className="w-4 h-4" /> Choose Photo
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {hasExistingPhoto && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Removing…' : 'Remove Photo'}
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-3 text-center">
            Max file size 100MB. Images larger than 5MB are compressed in-browser before upload.
          </p>
        </div>
      </div>
    </div>
  );
}
