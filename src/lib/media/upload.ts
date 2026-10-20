/**
 * Store an uploaded image for a person (learner/staff) or the school logo — the single entry point
 * for image uploads.
 *
 *   online database          → Cloudinary (unchanged behaviour; returns the secure URL)
 *   local MySQL / SQLite     → this machine's media store (returns a media:// reference)
 *
 * Callers save the returned `url` into the DB column exactly as before. Before this existed every
 * upload route called Cloudinary directly, so uploading a photo in an offline install failed.
 */
import { uploadStudentPhoto } from '@/lib/cloudinary';
import { storeUploadLocally, uploadsGoLocal } from './service';

export interface StoredImage { url: string; provider: 'cloudinary' | 'local'; publicId?: string }

export async function storeImage(opts: {
  schoolId: number;
  entityType: 'person' | 'school_logo';
  entityId: number | string;
  data: Buffer;
  fileName?: string;
  /** Cloudinary folder, e.g. 'drais/students'. Its last segment also names the local sub-folder. */
  folder: string;
  /** Cloudinary public id (online only). */
  publicId?: string;
}): Promise<StoredImage> {
  if (uploadsGoLocal()) {
    const sub = opts.folder.split('/').filter(Boolean).pop() || 'images';
    const url = await storeUploadLocally(Number(opts.schoolId), opts.entityType, Number(opts.entityId), opts.data, opts.fileName ?? 'image.jpg', sub);
    return { url, provider: 'local' };
  }
  const r = await uploadStudentPhoto(opts.data, opts.data.length, opts.folder, opts.publicId);
  return { url: r.secure_url, provider: 'cloudinary', publicId: r.public_id };
}
