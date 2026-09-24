/**
 * Private Cloudinary storage for uploaded Excel workbooks (ID card jobs).
 *
 *  - Browser uploads DIRECTLY to Cloudinary with a server-signed request, so file
 *    size isn't bound by the serverless request-body limit (~4.5 MB on Vercel).
 *    The API only ever sees a public_id, never the bytes, on upload.
 *  - Assets use `type: 'authenticated'` + `resource_type: 'raw'`: there is NO public
 *    delivery URL. The only way to read one is a URL signed with the API secret,
 *    which is generated server-side, per request, and never sent to the browser.
 *  - public_ids are namespaced `drais/idcards-jobs/{schoolId}/{userId}/{uuid}.ext`.
 *    The server both mints them (signing) and re-checks the prefix when a job is
 *    registered, so one school/user cannot point a job at another's file.
 *  - Deleting a job (or expiry) destroys the Cloudinary asset.
 *
 * NOTE: the maximum file size Cloudinary accepts depends on the account plan
 * (10 MB on the free plan). Cloudinary's own error is passed through to the user.
 */
import { randomUUID } from 'node:crypto';
import cloudinary from '@/lib/cloudinary';

export const MAX_WORKBOOK_BYTES = 60 * 1024 * 1024;
const EXT_RE = /^(xlsx|xls)$/;

export const jobPrefix = (schoolId: number, userId: number) => `drais/idcards-jobs/${schoolId}/${userId}/`;

export function extensionOf(fileName: string): 'xlsx' | 'xls' | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return EXT_RE.test(ext) ? (ext as 'xlsx' | 'xls') : null;
}

export interface UploadTicket {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  type: 'authenticated';
}

/** Mint a one-shot signed upload ticket scoped to this school + user. */
export function signWorkbookUpload(schoolId: number, userId: number, ext: 'xlsx' | 'xls'): UploadTicket {
  const cfg = cloudinary.config();
  if (!cfg.cloud_name || !cfg.api_key || !cfg.api_secret) throw new Error('Cloudinary is not configured');
  const publicId = `${jobPrefix(schoolId, userId)}${randomUUID()}.${ext}`;
  const timestamp = Math.round(Date.now() / 1000);
  const type = 'authenticated' as const;
  const signature = cloudinary.utils.api_sign_request({ public_id: publicId, timestamp, type }, cfg.api_secret);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloud_name}/raw/upload`,
    apiKey: cfg.api_key, timestamp, signature, publicId, type,
  };
}

/** True only for ids this exact school+user could have been issued. */
export function ownsPublicId(publicId: string, schoolId: number, userId: number): boolean {
  const prefix = jobPrefix(schoolId, userId);
  return publicId.startsWith(prefix)
    && /^[0-9a-f-]{36}\.(xlsx|xls)$/.test(publicId.slice(prefix.length));
}

/** Server-side fetch through a signed, short-lived-by-use delivery URL. */
export async function downloadWorkbook(publicId: string): Promise<Buffer> {
  const url = cloudinary.url(publicId, { resource_type: 'raw', type: 'authenticated', sign_url: true, secure: true });
  const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`Stored workbook could not be read (${res.status})`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_WORKBOOK_BYTES) throw new Error('Workbook is too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_WORKBOOK_BYTES) throw new Error('Workbook is too large');
  return buf;
}

export async function destroyWorkbook(publicId: string | null | undefined): Promise<void> {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated', invalidate: true });
  } catch (e: any) {
    console.warn('[idcards/storage] could not delete stored workbook:', e?.message);
  }
}
