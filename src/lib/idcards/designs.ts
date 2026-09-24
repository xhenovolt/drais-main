import { sanitizeSpec, type IdCardSpec } from './spec';

export function hydrateDesign(row: { id: number; name: string; spec_json: string; source_kind: string }):
  { id: number; name: string; sourceKind: string; spec: IdCardSpec } | null {
  try {
    return { id: row.id, name: row.name, sourceKind: row.source_kind, spec: sanitizeSpec(JSON.parse(row.spec_json)) };
  } catch { return null; }
}
