/**
 * GET /issuance/batches/:id/print — concatenates rendered HTML for every
 * issued item in the batch into one printable A4 document.
 *
 * Permission: issuance.print.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getBatch, getItems, markPrinted } from '@/lib/issuance/engine';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'issuance.print', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const batchId = Number(id);
  if (!Number.isFinite(batchId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const batch = await getBatch(batchId, session.schoolId);
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const items = await getItems(batchId);
  const issued = items.filter(i => i.status === 'issued' || i.status === 'reprinted');
  if (!issued.length) {
    return NextResponse.json({ error: 'Nothing to print — generate the batch first' }, { status: 400 });
  }

  const body = issued
    .map((it, i) => `<section class="issuance-item" data-item-id="${it.id}" style="page-break-after:${i < issued.length - 1 ? 'always' : 'auto'}">${it.renderedHtml ?? ''}</section>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(batch.name)}</title>
  <style>
    *,*::before,*::after { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: Arial, sans-serif; background: #fff; }
    @page { size: A4; margin: 1cm; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
    }
    .issuance-toolbar {
      position: sticky; top: 0; background: #fff; padding: 8px 16px;
      border-bottom: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: center;
    }
    .issuance-toolbar button {
      background: #4f46e5; color: #fff; padding: 6px 12px; border: 0; border-radius: 6px;
      font-size: 12px; font-weight: 600; cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="issuance-toolbar no-print">
    <strong style="flex:1">${escapeHtml(batch.name)} — ${issued.length} document${issued.length === 1 ? '' : 's'}</strong>
    <button onclick="window.print()">Print</button>
  </div>
  ${body}
</body>
</html>`;

  // Best-effort: mark the batch as printed for audit. Failure is non-fatal.
  void markPrinted(batchId, session.userId ?? null).catch(() => undefined);

  return new NextResponse(html, {
    status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch] as string);
}
