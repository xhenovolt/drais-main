/**
 * GET /api/media/export — download every image of the session's school as one ZIP.
 *
 * Streamed: one image is read/fetched and written at a time, so a large library is never held in
 * memory. Each image comes from the same place the app would show it from (local copy first; the
 * original cloud URL when the policy allows it). manifest.json + manifest.csv map every file back
 * to its school, record and original DB reference, so the archive can be re-linked later; images
 * that could not be included are listed there with the reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../_auth';
import { ZipWriter } from '@/lib/media/zip';
import { inventory, resolveRef } from '@/lib/media/service';
import { classifyRef } from '@/lib/media/refs';
import { resolveInsideRoot } from '@/lib/media/safe-path';
import { sha256 } from '@/lib/media/store';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const safe = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

async function bytesFor(schoolId: number, ref: string): Promise<{ data: Buffer; ext: string } | { error: string }> {
  const r = resolveRef(schoolId, ref);
  if (r.kind === 'file') return { data: fs.readFileSync(r.absPath), ext: path.extname(r.absPath) || '.jpg' };
  if (r.kind === 'missing') return { error: r.reason };
  if (classifyRef(r.url) === 'legacy') {
    const abs = resolveInsideRoot(path.join(process.cwd(), 'public'), r.url.replace(/^\/+/, ''));
    return abs ? { data: fs.readFileSync(abs), ext: path.extname(abs) || '.jpg' } : { error: 'file_missing' };
  }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    const res = await fetch(r.url, { signal: ctl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return { error: `http_${res.status}` };
    const type = res.headers.get('content-type') ?? '';
    const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('gif') ? '.gif' : '.jpg';
    return { data: Buffer.from(await res.arrayBuffer()), ext };
  } catch (e) {
    return { error: (e as Error).name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}

export async function GET(req: NextRequest) {
  const s = await mediaSession(req, 'system.settings.manage');
  if (s instanceof NextResponse) return s;
  const { rows } = await inventory(s.schoolId);
  const withImage = rows.filter(r => r.ref && r.refKind !== 'empty' && r.refKind !== 'data');

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new ZipWriter(chunk => controller.enqueue(chunk));
      const manifest: Record<string, unknown>[] = [];
      const used = new Set<string>();
      try {
        for (const row of withImage) {
          const got = await bytesFor(s.schoolId, row.ref!);
          const base = row.role === 'school' ? 'school/logo'
            : row.role === 'staff' ? `staff/${safe(row.staffNo || '') || 'staff'}__person-${row.entityId}`
            : `students/${safe(row.admissionNo || '') || 'learner'}__person-${row.entityId}`;
          if ('error' in got) {
            manifest.push({ schoolId: s.schoolId, role: row.role, recordId: row.recordId, personId: row.entityType === 'person' ? row.entityId : null, admissionNo: row.admissionNo, staffNo: row.staffNo, name: row.displayName, sourceRef: row.ref, file: null, included: false, reason: got.error });
            continue;
          }
          let file = `${base}${got.ext}`;
          for (let i = 2; used.has(file); i++) file = `${base}_${i}${got.ext}`;
          used.add(file);
          await zip.add(file, got.data);
          manifest.push({ schoolId: s.schoolId, role: row.role, recordId: row.recordId, personId: row.entityType === 'person' ? row.entityId : null, admissionNo: row.admissionNo, staffNo: row.staffNo, name: row.displayName, sourceRef: row.ref, file, sha256: sha256(got.data), bytes: got.data.length, included: true });
        }
        const generatedAt = new Date().toISOString();
        await zip.add('manifest.json', Buffer.from(JSON.stringify({ schoolId: s.schoolId, generatedAt, images: manifest }, null, 2)));
        const cols = ['schoolId', 'role', 'recordId', 'personId', 'admissionNo', 'staffNo', 'name', 'file', 'included', 'reason', 'sha256', 'sourceRef'];
        const csv = [cols.join(','), ...manifest.map(m => cols.map(c => `"${String(m[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
        await zip.add('manifest.csv', Buffer.from('﻿' + csv, 'utf8'));
        await zip.finish();
        await logAudit({ schoolId: s.schoolId, userId: s.userId, action: 'MEDIA_EXPORTED', entityType: 'media_settings', entityId: s.schoolId, details: { included: manifest.filter(m => m.included).length, skipped: manifest.filter(m => !m.included).length } }).catch(() => {});
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="drais-photos-${s.schoolId}-${stamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
