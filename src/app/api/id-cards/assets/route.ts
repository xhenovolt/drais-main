/**
 * POST /api/id-cards/assets — upload card artwork (PNG / JPEG / WebP).
 *
 * Unlike /api/upload this never recompresses (print artwork must stay sharp),
 * checks the real file signature rather than the client MIME, rejects SVG, and
 * forces a tenant-namespaced folder — the client cannot choose one.
 *
 * Formats NOT accepted here: PSD, Publisher (.pub), PDF. See the import panel
 * for the export instructions shown to users.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import '@/lib/cloudinary'; // configures the SDK from server env
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const MAX_BYTES = 4 * 1024 * 1024;

function sniff(b: Buffer): 'png' | 'jpeg' | 'webp' | 'pdf' | 'psd' | 'ole' | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('ascii', 0, 4) === '%PDF') return 'pdf';
  if (b.toString('ascii', 0, 4) === '8BPS') return 'psd';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole'; // Publisher (.pub) is OLE/CFB
  return null;
}

export async function POST(req: NextRequest) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Expected a multipart upload' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image is too large (max 4 MB). Export at 300 DPI for the card size, not larger.' }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (kind === 'pdf' || kind === 'psd' || kind === 'ole') {
    const what = kind === 'pdf' ? 'PDF' : kind === 'psd' ? 'Photoshop (PSD)' : 'Publisher/Office';
    return NextResponse.json({
      error: `${what} files can't be imported directly. Export each side as a PNG or JPEG (300 DPI, card size) from the design program and upload that.`,
      code: 'UNSUPPORTED_FORMAT',
    }, { status: 415 });
  }
  if (kind !== 'png' && kind !== 'jpeg' && kind !== 'webp') {
    return NextResponse.json({ error: 'Only PNG, JPEG or WebP images are supported', code: 'UNSUPPORTED_FORMAT' }, { status: 415 });
  }

  try {
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `drais/idcards/${s.schoolId}`,
          public_id: randomBytes(12).toString('hex'),
          resource_type: 'image',
          overwrite: false,
        },
        (err, r) => (err ? reject(err) : resolve(r)),
      ).end(buf);
    });
    await logAudit({
      schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_ASSET_UPLOADED', entityType: 'id_card_asset',
      entityId: result.public_id, details: { bytes: result.bytes, width: result.width, height: result.height },
    });
    return NextResponse.json({ success: true, url: result.secure_url, width: result.width, height: result.height, bytes: result.bytes });
  } catch (e: any) {
    console.error('[id-cards/assets] upload failed:', e?.message);
    return NextResponse.json({ error: 'Image upload failed. Try again.' }, { status: 502 });
  }
}
