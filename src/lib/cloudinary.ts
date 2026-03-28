/**
 * src/lib/cloudinary.ts
 * Server-side ONLY Cloudinary helper.
 * NEVER import this in client components.
 *
 * Credentials come exclusively from server env vars (never NEXT_PUBLIC_*).
 */
import { v2 as cloudinary } from 'cloudinary';

// Validate env at module load so misconfig is caught immediately
const CLOUD_NAME  = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY     = process.env.CLOUDINARY_API_KEY;
const API_SECRET  = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('[Cloudinary] Missing env vars: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET');
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key:    API_KEY,
  api_secret: API_SECRET,
  secure:     true,
});

// ─── Size threshold ────────────────────────────────────────────────────────
const COMPRESS_THRESHOLD_BYTES = 900 * 1024; // 900 KB

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id:  string;
  bytes:      number;
  format:     string;
  width:      number;
  height:     number;
}

/**
 * Upload a single image buffer to Cloudinary.
 * Files > 900 KB are auto-compressed; smaller files upload as-is.
 *
 * @param buffer      Raw file bytes
 * @param fileSizeBytes  Original file size in bytes (for threshold check)
 * @param folder      Cloudinary folder (e.g. "drais/students")
 * @param publicId    Optional explicit public_id (omit for auto-generated)
 */
export async function uploadStudentPhoto(
  buffer: Buffer,
  fileSizeBytes: number,
  folder = 'drais/students',
  publicId?: string,
): Promise<CloudinaryUploadResult> {
  const base64Data = buffer.toString('base64');
  const mimeGuess  = 'image/jpeg'; // Cloudinary auto-detects regardless
  const dataUri    = `data:${mimeGuess};base64,${base64Data}`;

  const uploadOptions: Record<string, unknown> = {
    folder,
    resource_type: 'image',
    overwrite:     true,
  };

  if (publicId) uploadOptions.public_id = publicId;

  // Compress large files automatically
  if (fileSizeBytes > COMPRESS_THRESHOLD_BYTES) {
    uploadOptions.transformation = [
      {
        quality:      'auto',
        fetch_format: 'auto',
        width:        1000,
        crop:         'limit',
      },
    ];
  }

  const result = await cloudinary.uploader.upload(dataUri, uploadOptions);

  return {
    secure_url: result.secure_url,
    public_id:  result.public_id,
    bytes:      result.bytes,
    format:     result.format,
    width:      result.width,
    height:     result.height,
  };
}

/**
 * Delete an image from Cloudinary by its public_id.
 * Safe to call even if the image doesn't exist.
 */
export async function deleteCloudinaryPhoto(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Non-fatal — log and continue
    console.warn(`[Cloudinary] Could not delete ${publicId}`);
  }
}

export default cloudinary;
