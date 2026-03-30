'use client';
import React, { useEffect, useState, useRef } from 'react';
import { Search, Upload, BookOpen, X, Loader2, Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Learner {
  id: number;
  person_id: number;
  admission_no: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  class_id: number | null;
  status: string;
  photo_url?: string | null;
}

interface ClassOption {
  id: number;
  name: string;
}

interface StudyMode {
  id: number;
  name: string;
}

export default function LearnersPage() {
  const [learners, setLearners] = useState<Learner[]>([]);
  const [filtered, setFiltered] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Photo upload state
  const [photoTarget, setPhotoTarget] = useState<Learner | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enroll modal state
  const [enrollTarget, setEnrollTarget] = useState<Learner | null>(null);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [studyModes, setStudyModes] = useState<StudyMode[]>([]);
  const [enrollClassId, setEnrollClassId] = useState('');
  const [enrollStudyModeId, setEnrollStudyModeId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    fetchLearners();
    fetchClasses();
    fetchStudyModes();
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      learners.filter(l =>
        `${l.first_name} ${l.last_name}`.toLowerCase().includes(q) ||
        (l.admission_no ?? '').toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q),
      ),
    );
  }, [search, learners]);

  async function fetchLearners() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tahfiz/learners');
      if (!res.ok) throw new Error('Failed to fetch learners');
      const data = await res.json();
      // API returns array directly
      setLearners(Array.isArray(data) ? data : (data.data ?? []));
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchClasses() {
    try {
      const res = await fetch('/api/classes?type=tahfiz');
      if (!res.ok) return;
      const data = await res.json();
      setClasses(data.data ?? data ?? []);
    } catch { /* non-fatal */ }
  }

  async function fetchStudyModes() {
    try {
      const res = await fetch('/api/study-modes');
      if (!res.ok) return;
      const data = await res.json();
      setStudyModes(data.data ?? data ?? []);
    } catch { /* non-fatal */ }
  }

  // ── Photo upload ──────────────────────────────────────────
  function openPhotoModal(learner: Learner) {
    setPhotoTarget(learner);
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  function closePhotoModal() {
    setPhotoTarget(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Only JPG, PNG or WEBP images are allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be under 10 MB');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submitPhoto() {
    if (!photoTarget || !photoFile) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photos', photoFile);
      formData.append('person_ids', String(photoTarget.person_id));

      const res = await fetch('/api/students/bulk-photo-upload', {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Upload failed');

      toast.success('Photo uploaded successfully');
      closePhotoModal();
      fetchLearners();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingPhoto(false);
    }
  }

  // ── Enrollment ────────────────────────────────────────────
  function openEnrollModal(learner: Learner) {
    setEnrollTarget(learner);
    setEnrollClassId('');
    setEnrollStudyModeId(studyModes[0] ? String(studyModes[0].id) : '');
  }

  function closeEnrollModal() {
    setEnrollTarget(null);
    setEnrollClassId('');
    setEnrollStudyModeId('');
  }

  async function submitEnrollment() {
    if (!enrollTarget || !enrollClassId || !enrollStudyModeId) {
      toast.error('Select both a class and a study mode');
      return;
    }
    setEnrolling(true);
    try {
      const res = await fetch('/api/enrollments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id:    enrollTarget.id,
          class_id:      Number(enrollClassId),
          study_mode_id: Number(enrollStudyModeId),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Enrollment failed');

      toast.success(`${enrollTarget.first_name} enrolled successfully`);
      closeEnrollModal();
      fetchLearners();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEnrolling(false);
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Tahfiz Learners</h1>
        <span className="text-sm text-gray-500">{filtered.length} learner{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, admission no or email..."
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 py-8">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading learners…</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-500 py-4">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={fetchLearners} className="ml-2 text-sm underline text-blue-600">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No learners found{search ? ` for "${search}"` : ''}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Photo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Admission No</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Class</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    {l.photo_url ? (
                      <img
                        src={l.photo_url}
                        alt={`${l.first_name} ${l.last_name}`}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                        <Camera className="w-4 h-4" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {l.first_name} {l.last_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{l.admission_no ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{l.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {l.class_id ? `Class ${l.class_id}` : <span className="text-amber-600 text-xs font-medium">Not enrolled</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                      ${l.status === 'active' ? 'bg-green-100 text-green-700' :
                        l.status === 'graduated' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'}`}>
                      {l.status ?? 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openPhotoModal(l)}
                        title="Upload photo"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 transition"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Photo
                      </button>
                      <button
                        onClick={() => openEnrollModal(l)}
                        title="Enroll in class"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-blue-300 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Enroll
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Photo Upload Modal ── */}
      {photoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Upload Photo</h2>
              <button onClick={closePhotoModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              {photoTarget.first_name} {photoTarget.last_name}
            </p>

            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="w-32 h-32 rounded-full object-cover mx-auto border-2 border-blue-200" />
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 rounded-full bg-gray-100 flex flex-col items-center justify-center mx-auto border-2 border-dashed border-gray-300 cursor-pointer hover:bg-gray-50"
              >
                <Camera className="w-8 h-8 text-gray-400" />
                <span className="text-xs text-gray-400 mt-1">Click to select</span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex gap-2 justify-end">
              {photoPreview && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Change
                </button>
              )}
              <button
                onClick={closePhotoModal}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitPhoto}
                disabled={!photoFile || uploadingPhoto}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                {uploadingPhoto ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enroll Modal ── */}
      {enrollTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Enroll Learner</h2>
              <button onClick={closeEnrollModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Enrolling: <strong>{enrollTarget.first_name} {enrollTarget.last_name}</strong>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Class *</label>
                <select
                  value={enrollClassId}
                  onChange={e => setEnrollClassId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select class…</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Study Mode *</label>
                <select
                  value={enrollStudyModeId}
                  onChange={e => setEnrollStudyModeId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select study mode…</option>
                  {studyModes.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={closeEnrollModal}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitEnrollment}
                disabled={!enrollClassId || !enrollStudyModeId || enrolling}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                {enrolling ? 'Enrolling…' : 'Enroll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

