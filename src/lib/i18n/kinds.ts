/**
 * Document-kind display names (report card, certificate, …). Built-in kinds read drce.kind.* /
 * drce.kindPlural.* / drce.kindDesc.*; a school's own custom kind keeps the name derived from its code.
 */
import type { KindDescriptor } from '@/lib/drce/kinds';

type T = (key: string, fallback?: string) => string;
const BUILT_IN = ['report', 'certificate', 'id_card', 'transcript', 'letter', 'blank', 'custom'];

export function kindLabel(t: T, k: Pick<KindDescriptor, 'code' | 'label'>): string {
  return BUILT_IN.includes(k.code) ? t(`drce.kind.${k.code}`, k.label) : k.label;
}

export function kindPlural(t: T, k: Pick<KindDescriptor, 'code' | 'label'>): string {
  return BUILT_IN.includes(k.code) && k.code !== 'custom' ? t(`drce.kindPlural.${k.code}`, `${k.label}s`) : `${kindLabel(t, k)}`;
}

export function kindDescription(t: T, k: Pick<KindDescriptor, 'code' | 'description'>): string {
  const d = (k as { description?: string }).description ?? '';
  return BUILT_IN.includes(k.code) && d ? t(`drce.kindDesc.${k.code}`, d) : d;
}
