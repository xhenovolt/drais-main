/**
 * DRCE computed-field registry — Phase A.
 *
 * A computed field is a PURE function of the data context. It turns the
 * shallow `{path}` placeholder system into a real binding language without
 * editing the resolvers every time we need a new value.
 *
 * Registration is one-shot at module load (builtins.ts) and never changes
 * at runtime. The resolver is therefore a single map lookup — no I/O, no
 * mutation, no `Date.now()` inside.
 */
import type { DRCEDataContext } from '../schema';

export type ComputedValue = string | number | boolean | null | Date;

export interface ComputedField {
  /** Name used in expressions, e.g. {next_term_begins}. lowercase + underscores. */
  name:        string;
  /** Short description for editor tooltips. */
  description: string;
  /** Group label for the editor's variable picker. */
  group:       'academic' | 'attendance' | 'performance' | 'finance' | 'school' | 'student' | 'meta';
  /** Pure compute. Receives the rendering context; must NEVER perform I/O. */
  compute:     (ctx: DRCEDataContext) => ComputedValue;
}

const REGISTRY = new Map<string, ComputedField>();

export function registerComputed(field: ComputedField): void {
  if (REGISTRY.has(field.name)) {
    console.warn(`[drce/computed] overwrote ${field.name}`);
  }
  REGISTRY.set(field.name, field);
}

export function getComputed(name: string): ComputedField | undefined {
  return REGISTRY.get(name);
}

export function listComputed(): ComputedField[] {
  return [...REGISTRY.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Reset hook for tests only. */
export function __clearComputedRegistry(): void {
  REGISTRY.clear();
}
