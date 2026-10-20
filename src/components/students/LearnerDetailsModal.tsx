import React from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Upload, Check, AlertCircle, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import clsx from 'clsx';
import { MediaImg } from '@/components/media/MediaImg';

interface LearnerDetailsModalProps {
  open: boolean;
  onClose: () => void;
  learner: any; // learner object (people + student join)
  onSaved?: () => void; // optional callback to refresh parent data
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LearnerDetailsModal: React.FC<LearnerDetailsModalProps> = ({ open, onClose, learner, onSaved }) => {
	const [local, setLocal] = React.useState<any>(null);
	const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
	const [photoBusy, setPhotoBusy] = React.useState(false);

	// New upload states
	const [uploadStatus, setUploadStatus] = React.useState<'idle' | 'pending' | 'compressing' | 'uploading' | 'success' | 'error'>('idle');
	const [uploadProgress, setUploadProgress] = React.useState<number>(0); // 0-100
	const [originalSizeBytes, setOriginalSizeBytes] = React.useState<number | null>(null);
	const [compressedSizeBytes, setCompressedSizeBytes] = React.useState<number | null>(null);
	const [thumbnailDataUrl, setThumbnailDataUrl] = React.useState<string | null>(null);
	const mountedRef = React.useRef(true);
	const [fieldStatus, setFieldStatus] = React.useState<Record<string, 'idle' | 'saving' | 'success' | 'error'>>({});
	const [fieldError, setFieldError] = React.useState<Record<string, string | null>>({});

	React.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

	React.useEffect(() => {
		if (learner) {
			setLocal({ ...learner });
			setPreviewUrl(learner.photo_url || null);
			setFieldStatus({});
			setFieldError({});
		} else {
			setLocal(null);
			setPreviewUrl(null);
		}
	}, [learner, open]);

	if (!open || !local) return null;

	const API_BASE = '/api';

	const setStatus = (field: string, status: 'idle' | 'saving' | 'success' | 'error') => {
		setFieldStatus(prev => ({ ...prev, [field]: status }));
	};
	const setError = (field: string, message: string | null) => {
		setFieldError(prev => ({ ...prev, [field]: message }));
	};

	const saveField = async (field: string, value: any) => {
		// no-op if unchanged
		const currentVal = (learner as any)[field];
		if (String(currentVal ?? '') === String(value ?? '')) {
			setStatus(field, 'idle');
			setError(field, null);
			return;
		}

		// client validation
		if (field === 'email' && value && !emailRegex.test(String(value))) {
			setError(field, 'Invalid email format');
			setStatus(field, 'error');
			return;
		}
		if ((field === 'first_name' || field === 'last_name') && String(value).trim().length === 0) {
			setError(field, 'Required');
			setStatus(field, 'error');
			return;
		}

		setStatus(field, 'saving');
		setError(field, null);

		try {
			// Determine person_id (the people record). Use learner.person_id if available, else learner.id
			const personId = (local.person_id ?? local.id);
			const payload: any = { id: personId, [field]: value };

			const res = await fetch(`${API_BASE}/people`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			const result = await res.json();
			if (res.ok && result.success) {
				setStatus(field, 'success');
				// update local and underlying learner
				setLocal((s: any) => ({ ...s, [field]: value }));
				if (onSaved) onSaved();
				// clear success after short delay
				setTimeout(() => { if (mountedRef.current) setStatus(field, 'idle'); }, 1500);
			} else {
				setStatus(field, 'error');
				setError(field, result.error || 'Save failed');
			}
		} catch (err: any) {
			setStatus(field, 'error');
			setError(field, err?.message || 'Network error');
		}
	};

	// Replace compressImageIfNeeded with enhanced version
	const compressImageIfNeeded = async (file: File): Promise<{ file: File; compressed: boolean }> => {
		const HUNDRED_MB = 100 * 1024 * 1024;
		const FIVE_MB = 5 * 1024 * 1024;
		// Reject very large files
		if (file.size > HUNDRED_MB) {
			throw new Error('File is too large — maximum allowed size is 100 MB. Please choose a smaller file.');
		}
		// If <= 5MB, no compression required
		if (file.size <= FIVE_MB) {
			return { file, compressed: false };
		}
		// Attempt client-side compression (resize and convert to webp)
		try {
			// @ts-expect-error - imageOrientation option exists in modern browsers
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
			const maxDim = 1600;
			const sw = bitmap.width;
			const sh = bitmap.height;
			const maxOrig = Math.max(sw, sh);
			const scale = maxOrig > maxDim ? maxDim / maxOrig : 1;
			const w = Math.round(sw * scale);
			const h = Math.round(sh * scale);
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) return { file, compressed: false };
			ctx.drawImage(bitmap, 0, 0, w, h);

			// Try to get webp blob
			const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
			if (!blob) return { file, compressed: false };

			const compressed = new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), { type: 'image/webp', lastModified: Date.now() });
			return { file: compressed, compressed: true };
		} catch (err) {
			// On failure, return original file
			console.warn('Compression failed, using original file', err);
			return { file, compressed: false };
		}
	};

	// Generate 200x200 center-cropped thumbnail
	const generateThumbnail = async (file: File): Promise<string | null> => {
		try {
			// create image bitmap to preserve orientation
			// @ts-expect-error - imageOrientation option exists in modern browsers
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
			const target = 200;
			const sw = bitmap.width;
			const sh = bitmap.height;
			// center crop
			const scale = Math.max(target / sw, target / sh);
			const cw = Math.round(sw * scale);
			const ch = Math.round(sh * scale);
			const canvas = document.createElement('canvas');
			canvas.width = target;
			canvas.height = target;
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;
			// draw scaled centered
			ctx.drawImage(bitmap, (target - cw) / 2, (target - ch) / 2, cw, ch);
			return canvas.toDataURL('image/png');
		} catch (err) {
			console.warn('Thumbnail generation failed', err);
			return null;
		}
	};

	// New upload function using XMLHttpRequest to report progress
	const uploadFileWithProgress = (file: File, personId: string | number) => {
		return new Promise<{ success: boolean; data?: any }>((resolve, reject) => {
			const fd = new FormData();
			fd.append('photos', file); // backend expects same field as bulk
			fd.append('person_ids', String(personId));

			const xhr = new XMLHttpRequest();
			xhr.open('POST', `${API_BASE}/students/bulk-photo-upload`, true);

			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable) {
					const pct = Math.round((ev.loaded / ev.total) * 100);
					if (mountedRef.current) setUploadProgress(pct);
				}
			};

			xhr.onload = () => {
				let parsed = null;
				try { parsed = JSON.parse(xhr.responseText); } catch (e) { parsed = null; }
				if (xhr.status >= 200 && xhr.status < 300 && parsed?.success) {
					resolve({ success: true, data: parsed });
				} else {
					reject(new Error(parsed?.error || `Upload failed with status ${xhr.status}`));
				}
			};

			xhr.onerror = () => {
				reject(new Error('Network error during upload'));
			};

			xhr.send(fd);
		});
	};

	// Replace handlePhotoChange with enhanced flow (no size limit except 100MB)
	const handlePhotoChange = async (file?: File) => {
		if (!file) return;
		setPhotoBusy(true);
		setUploadStatus('pending');
		setUploadProgress(0);
		setOriginalSizeBytes(file.size);
		setCompressedSizeBytes(null);
		setThumbnailDataUrl(null);

		try {
			// notify compressing if needed
			setUploadStatus('compressing');
			Swal.fire({ icon: 'info', title: 'Processing image', text: 'Compressing image if needed...', timer: 1200, showConfirmButton: false });

			const { file: processedFile, compressed } = await compressImageIfNeeded(file);
			setCompressedSizeBytes(processedFile.size);
			// generate thumbnail from processed file for accurate preview
			const thumb = await generateThumbnail(processedFile);
			if (mountedRef.current) setThumbnailDataUrl(thumb);

			// show user compression result if compressed
			if (compressed) {
				Swal.fire({
					icon: 'success',
					title: 'Image compressed',
					html: `Original size: ${((originalSizeBytes || file.size) / (1024*1024)).toFixed(2)} MB<br/>Compressed size: ${(processedFile.size/(1024*1024)).toFixed(2)} MB`,
					confirmButtonText: 'OK'
				});
			}

			// start upload
			setUploadStatus('uploading');
			const personId = (local.person_id ?? local.id);
			const res = await uploadFileWithProgress(processedFile, personId);
			// update UI + local preview
			if (res.success) {
				const data = res.data;
				const photoUrl =
					data?.results?.[0]?.photo_url ||
					(data?.saved?.[0]?.storedName ? `/uploads/students/${data.saved[0].storedName}` : null) ||
					null;
				if (mountedRef.current) {
					setPreviewUrl(photoUrl || URL.createObjectURL(processedFile));
					setUploadStatus('success');
					setUploadProgress(100);
					Swal.fire({ 
						icon: 'success', 
						title: 'Photo uploaded', 
						text: `Uploaded. Original ${((originalSizeBytes || file.size)/(1024*1024)).toFixed(2)}MB — Compressed ${(processedFile.size/(1024*1024)).toFixed(2)}MB`, 
						timer: 2000, 
						showConfirmButton: false 
					});
					setLocal((s: any) => ({ ...s, photo_url: photoUrl || previewUrl }));
					if (onSaved) onSaved();
				}
			} else {
				throw new Error('Upload response did not indicate success');
			}
		} catch (err: any) {
			console.error('Photo upload error', err);
			setUploadStatus('error');
			Swal.fire({ icon: 'error', title: 'Upload failed', text: err?.message || 'An unexpected error occurred' });
			// revert preview
			if (mountedRef.current) setPreviewUrl(local.photo_url || null);
		} finally {
			if (mountedRef.current) setPhotoBusy(false);
		}
	};

	return (
		<Transition show={open} as={React.Fragment}>
			<Dialog as="div" className="relative z-50" onClose={onClose}>
				<Transition.Child
					as={React.Fragment}
					enter="ease-out duration-200"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="ease-in duration-150"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
				</Transition.Child>

				<div className="fixed inset-0 overflow-y-auto p-4">
					<div className="mx-auto max-w-4xl">
						<Transition.Child
							as={React.Fragment}
							enter="ease-out duration-300"
							enterFrom="opacity-0 scale-95 translate-y-6"
							enterTo="opacity-100 scale-100 translate-y-0"
							leave="ease-in duration-200"
							leaveFrom="opacity-100 scale-100 translate-y-0"
							leaveTo="opacity-0 scale-95 translate-y-6"
						>
							<Dialog.Panel className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-hidden flex flex-col">
								<div className="flex items-start justify-between gap-4">
									<div className="flex items-center gap-4">
										<div className="relative">
											<MediaImg
												src={previewUrl || '/images/avatar-placeholder.png'}
												alt="Profile"
												className="w-20 h-20 rounded-xl object-cover shadow"
											/>
											<label className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-700 rounded-full p-1 border shadow cursor-pointer">
												<input
													type="file"
													accept="image/*"
													className="hidden"
													onChange={(e) => handlePhotoChange(e.target.files?.[0])}
													disabled={photoBusy}
												/>
												<Upload className="w-4 h-4 text-gray-600" />
											</label>

											{/* Thumbnail preview */}
											{thumbnailDataUrl && (
												<div className="mt-2">
													<img src={thumbnailDataUrl} alt="thumb" className="w-16 h-16 rounded-md object-cover border" />
												</div>
											)}

											{/* Upload status & progress */}
											<div className="mt-2 w-44">
												<div className="text-xs text-gray-500">Status: <span className="font-medium">{uploadStatus}</span></div>
												{uploadStatus === 'uploading' || uploadStatus === 'success' || uploadStatus === 'error' ? (
													<div className="mt-1 bg-gray-200 rounded-full h-2 overflow-hidden">
														<div style={{ width: `${uploadProgress}%` }} className={clsx("h-2 rounded-full transition-all", uploadStatus === 'success' ? 'bg-green-500' : 'bg-blue-500')}></div>
													</div>
												) : null}
												{originalSizeBytes !== null && (
													<div className="text-xs text-gray-500 mt-1">Original: {(originalSizeBytes/(1024*1024)).toFixed(2)} MB</div>
												)}
												{compressedSizeBytes !== null && (
													<div className="text-xs text-gray-500">Compressed: {(compressedSizeBytes/(1024*1024)).toFixed(2)} MB</div>
												)}
											</div>
										</div>

										<div>
											<h3 className="text-lg font-semibold text-gray-900 dark:text-white">
												{local.first_name} {local.last_name}
											</h3>
											<div className="text-sm text-gray-500 dark:text-gray-400">
												ID: <span className="font-mono">{local.id}</span> • Admission: <span className="font-mono">{local.admission_no || '—'}</span>
											</div>
										</div>
									</div>

									<div className="flex items-center gap-2">
										<button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
											<X className="w-5 h-5" />
										</button>
									</div>
								</div>

								<div className="mt-4 overflow-y-auto pr-2">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div className="p-4 rounded-lg bg-gray-50 dark:bg-slate-700 shadow-sm">
											<h4 className="text-sm font-semibold mb-3">Personal</h4>

											<label className="text-xs text-gray-500">First name</label>
											<div className="flex items-center gap-2">
												<input
													className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600 border border-transparent focus:border-blue-400"
													value={local.first_name || ''}
													onChange={(e) => setLocal((s:any)=>({...s, first_name: e.target.value}))}
													onBlur={(e) => saveField('first_name', e.target.value)}
												/>
												{fieldStatus['first_name'] === 'saving' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
												{fieldStatus['first_name'] === 'success' && <Check className="w-4 h-4 text-green-500" />}
												{fieldStatus['first_name'] === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
											</div>
											{fieldError['first_name'] && <p className="text-xs text-red-600 mt-1">{fieldError['first_name']}</p>}

											<label className="text-xs text-gray-500 mt-3">Last name</label>
											<div className="flex items-center gap-2">
												<input
													className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600 border border-transparent focus:border-blue-400"
													value={local.last_name || ''}
													onChange={(e) => setLocal((s:any)=>({...s, last_name: e.target.value}))}
													onBlur={(e) => saveField('last_name', e.target.value)}
												/>
												{fieldStatus['last_name'] === 'saving' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
												{fieldStatus['last_name'] === 'success' && <Check className="w-4 h-4 text-green-500" />}
												{fieldStatus['last_name'] === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
											</div>
											{fieldError['last_name'] && <p className="text-xs text-red-600 mt-1">{fieldError['last_name']}</p>}

											<label className="text-xs text-gray-500 mt-3">Gender</label>
											<select
												className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
												value={local.gender || ''}
												onChange={(e) => { setLocal((s:any)=>({...s, gender: e.target.value})); saveField('gender', e.target.value); }}
											>
												<option value="">Not specified</option>
												<option value="male">Male</option>
												<option value="female">Female</option>
												<option value="other">Other</option>
											</select>

											<label className="text-xs text-gray-500 mt-3">Date of birth</label>
											<input
												type="date"
												className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
												value={local.date_of_birth ? String(local.date_of_birth).split('T')[0] : ''}
												onChange={(e) => setLocal((s:any)=>({...s, date_of_birth: e.target.value}))}
												onBlur={(e) => saveField('date_of_birth', e.target.value)}
											/>
										</div>

										<div className="p-4 rounded-lg bg-gray-50 dark:bg-slate-700 shadow-sm">
											<h4 className="text-sm font-semibold mb-3">Contact</h4>

											<label className="text-xs text-gray-500">Phone</label>
											<div className="flex items-center gap-2">
												<input
													className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
													value={local.phone || ''}
													onChange={(e) => setLocal((s:any)=>({...s, phone: e.target.value}))}
													onBlur={(e) => saveField('phone', e.target.value)}
												/>
												{fieldStatus['phone'] === 'saving' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
												{fieldStatus['phone'] === 'success' && <Check className="w-4 h-4 text-green-500" />}
											</div>

											<label className="text-xs text-gray-500 mt-3">Email</label>
											<div className="flex items-center gap-2">
												<input
													className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
													value={local.email || ''}
													onChange={(e) => setLocal((s:any)=>({...s, email: e.target.value}))}
													onBlur={(e) => saveField('email', e.target.value)}
												/>
												{fieldStatus['email'] === 'saving' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
												{fieldStatus['email'] === 'success' && <Check className="w-4 h-4 text-green-500" />}
												{fieldStatus['email'] === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
											</div>
											{fieldError['email'] && <p className="text-xs text-red-600 mt-1">{fieldError['email']}</p>}

											<label className="text-xs text-gray-500 mt-3">Address</label>
											<textarea
												className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
												value={local.address || ''}
												onChange={(e) => setLocal((s:any)=>({...s, address: e.target.value}))}
												onBlur={(e) => saveField('address', e.target.value)}
												rows={4}
											/>
										</div>

										{/* end contact card */}
									</div>

									{/* Academic / Additional info */}
									<div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-slate-700 shadow-sm">
										<h4 className="text-sm font-semibold mb-3">Academic & Record</h4>
										<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
											<div>
												<label className="text-xs text-gray-500">Admission No</label>
												<input
													className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
													value={local.admission_no || ''}
													onChange={(e) => setLocal((s:any)=>({...s, admission_no: e.target.value}))}
													onBlur={(e) => saveField('admission_no', e.target.value)}
												/>
											</div>
											<div>
												<label className="text-xs text-gray-500">Status</label>
												<input
													className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
													value={local.status || ''}
													onChange={(e) => setLocal((s:any)=>({...s, status: e.target.value}))}
													onBlur={(e) => saveField('status', e.target.value)}
												/>
											</div>
											<div>
												<label className="text-xs text-gray-500">Notes</label>
												<input
													className="w-full px-3 py-2 rounded-md bg-white dark:bg-slate-600"
													value={local.notes || ''}
													onChange={(e) => setLocal((s:any)=>({...s, notes: e.target.value}))}
													onBlur={(e) => saveField('notes', e.target.value)}
												/>
											</div>
										</div>
									</div>

									{/* Optional context - read-only / informational */}
									<div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-slate-700 shadow-sm">
										<h4 className="text-sm font-semibold mb-3">Context</h4>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-200">
											<div>
												<div className="text-xs text-gray-500">Attendance</div>
												<div className="font-medium">{local.attendance_percentage ?? 'N/A'}%</div>
											</div>
											<div>
												<div className="text-xs text-gray-500">Enrolled Class</div>
												<div className="font-medium">{local.class_name || 'N/A'}</div>
											</div>
										</div>
									</div>
								</div>

								<div className="mt-4 flex items-center justify-end gap-3 border-t pt-3">
									<div className="text-sm text-gray-500">{/* space for messages */}</div>
									<button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-700">Close</button>
								</div>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition>
	);
};

export default LearnerDetailsModal;
