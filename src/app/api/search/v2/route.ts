/**
 * GET /api/search/v2?q=...&types=student,staff
 *
 * Global command search. Tenant-scoped, RBAC-filtered, ranked. Returns results
 * grouped by entity type for the command palette.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getUserPermissions } from '@/lib/rbac';
import { permittedEntityTypes, SEARCH_ENTITIES, type SearchEntityType } from '@/lib/search/entities';
import { runSearch } from '@/lib/search/query';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 1) return NextResponse.json({ success: true, q, groups: [] });

  const perms = session.isSuperAdmin ? [] : await getUserPermissions(session.userId, session.schoolId);
  let types = permittedEntityTypes(perms, session.isSuperAdmin);

  // Optional caller-supplied type filter (intersect with permitted — never widen).
  const requested = url.searchParams.get('types');
  if (requested) {
    const wanted = requested.split(',').map(s => s.trim()) as SearchEntityType[];
    types = types.filter(t => wanted.includes(t));
  }

  const hits = await runSearch({ schoolId: session.schoolId, q, types, limit: 24 });

  // Group by entity type, preserving rank order within each group.
  const groupMap = new Map<SearchEntityType, typeof hits>();
  for (const h of hits) {
    if (!groupMap.has(h.entity_type)) groupMap.set(h.entity_type, []);
    groupMap.get(h.entity_type)!.push(h);
  }
  const groups = [...groupMap.entries()].map(([type, items]) => ({
    type,
    label: SEARCH_ENTITIES[type].label,
    icon:  SEARCH_ENTITIES[type].icon,
    items: items.map(({ entity_id, title, subtitle, url_path, metadata }) => ({
      id: entity_id, title, subtitle, url_path, metadata,
    })),
  }));

  return NextResponse.json({ success: true, q, total: hits.length, groups });
}
