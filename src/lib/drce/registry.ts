/**
 * DRCE template registry — Phase 2 (category-driven).
 *
 * The registry merges two sources into a single, deterministic catalog:
 *
 *   1. Database-backed DRCE documents (`dvcf_documents`). Each row carries
 *      an explicit `template_category` ENUM column that the registry route
 *      surfaces verbatim — no name-based detection at runtime.
 *   2. Built-in templates shipped as static HTML in `backup/`. Each entry
 *      below declares its category explicitly.
 *
 * Two orthogonal axes:
 *
 *   category  — taxonomy the user understands
 *               (standard / emergency / legacy_rpt / drce / arabic / custom)
 *   renderer  — engine that turns bytes into a report
 *               (drce  → DRCEDocumentRenderer / dvcf_documents.schema_json)
 *               (emergency_html → static-HTML placeholder substitution via
 *                                 the `/print` route's renderer)
 *
 * Adding a template means writing one entry below (for built-ins) or
 * inserting a row into `dvcf_documents` with the right `template_category`.
 */
import type { SnapshotType } from '@/lib/snapshots/types';

/**
 * Phase 2 canonical category set. Mirrors the dvcf_documents.template_category
 * MySQL ENUM exactly. Adding a category requires migrating the ENUM and
 * updating this union together.
 */
export type TemplateCategory =
  | 'standard'
  | 'emergency'
  | 'legacy_rpt'
  | 'drce'
  | 'arabic'
  | 'custom';

export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = [
  'standard', 'emergency', 'legacy_rpt', 'drce', 'arabic', 'custom',
] as const;

/**
 * Type guard. Use this at every API boundary that accepts a category from
 * untrusted input. Pairs with the matching MySQL ENUM constraint so an
 * invalid value can never reach the database.
 */
export function isTemplateCategory(v: unknown): v is TemplateCategory {
  return typeof v === 'string'
    && (TEMPLATE_CATEGORIES as readonly string[]).includes(v);
}

export type TemplateRenderer = 'drce' | 'emergency_html';

export interface RegistryEntry {
  /** Stable id. Numeric string for DRCE documents, kebab-case for built-ins. */
  id:               string;
  /** Display name for selection UIs. */
  name:             string;
  /** Short description shown next to the name. */
  description:      string;
  /** Phase 2 category — single source of truth. */
  category:         TemplateCategory;
  /** Rendering engine. Independent of category. */
  renderer:         TemplateRenderer;
  /**
   * For renderer='emergency_html', the static template file shipped under
   * `backup/`. For renderer='drce', undefined.
   */
  engineRef?:       string;
  /** Document type (matches dvcf_documents.document_type). */
  documentType:     'report_card' | 'id_card' | 'transcript';
  /** Curriculum compatibility — restricts which snapshot types it accepts. */
  supportedTypes:   SnapshotType[];
  /** True for templates designed for RTL / Arabic numerals. */
  supportsArabic:   boolean;
  supportsTheology: boolean;
  /** True if the school owns this entry exclusively (not a shared default). */
  isCustom:         boolean;
  /** Marks the entry as the school's default for its document_type. */
  isDefault:        boolean;
  /** ISO timestamp of last update; null for built-ins. */
  updatedAt:        string | null;
}

/**
 * Built-in templates. These ship with the codebase and are available to
 * every school. They are not stored in `dvcf_documents`.
 *
 * Each entry declares its category EXPLICITLY. No inference, no fallback.
 */
export const BUILT_IN_TEMPLATES: readonly RegistryEntry[] = [
  {
    id:               'emergency-secular',
    name:             'Secular — Emergency',
    description:      'Lightweight, deterministic secular report card for fast bulk printing.',
    category:         'emergency',
    renderer:         'emergency_html',
    engineRef:        'secular-emergency-template.html',
    documentType:     'report_card',
    supportedTypes:   ['secular', 'mixed'],
    supportsArabic:   false,
    supportsTheology: false,
    isCustom:         false,
    isDefault:        false,
    updatedAt:        null,
  },
  {
    id:               'emergency-theology',
    name:             'Theology — Emergency (Arabic)',
    description:      'RTL Arabic-numeral theology report card for fast bulk printing.',
    category:         'arabic',
    renderer:         'emergency_html',
    engineRef:        'theology-emergency-template.html',
    documentType:     'report_card',
    supportedTypes:   ['theology'],
    supportsArabic:   true,
    supportsTheology: true,
    isCustom:         false,
    isDefault:        false,
    updatedAt:        null,
  },
  {
    id:               'legacy-rpt',
    name:             'Legacy rpt.html',
    description:      'Pre-DRCE single-page report layout. Preserved for schools migrating off legacy print stacks.',
    category:         'legacy_rpt',
    renderer:         'emergency_html',
    engineRef:        'legacy-rpt-template.html',
    documentType:     'report_card',
    supportedTypes:   ['secular', 'mixed'],
    supportsArabic:   false,
    supportsTheology: false,
    isCustom:         false,
    isDefault:        false,
    updatedAt:        null,
  },

  // ── Phase 3.3 — DRCE-native counterparts ─────────────────────────────────
  // These entries render through DRCEDocumentRenderer and therefore honour
  // the per-report override layer. Their visual style mirrors the
  // emergency_html templates above. The two paths coexist during the
  // transition; emergency_html is sunset in Phase 3.4 once parity is
  // verified across all schools.
  {
    id:               'drce-emergency-secular',
    name:             'Secular Emergency (DRCE)',
    description:      'Override-aware DRCE counterpart of the secular emergency template.',
    category:         'emergency',
    renderer:         'drce',
    documentType:     'report_card',
    supportedTypes:   ['secular', 'mixed'],
    supportsArabic:   false,
    supportsTheology: false,
    isCustom:         false,
    isDefault:        false,
    updatedAt:        null,
  },
  {
    id:               'drce-emergency-theology',
    name:             'Theology Emergency (DRCE)',
    description:      'Override-aware DRCE counterpart of the RTL Arabic theology emergency template.',
    category:         'arabic',
    renderer:         'drce',
    documentType:     'report_card',
    supportedTypes:   ['theology'],
    supportsArabic:   true,
    supportsTheology: true,
    isCustom:         false,
    isDefault:        false,
    updatedAt:        null,
  },
  {
    id:               'drce-legacy-rpt',
    name:             'Legacy rpt.html (DRCE)',
    description:      'Override-aware DRCE counterpart of the legacy rpt.html layout.',
    category:         'legacy_rpt',
    renderer:         'drce',
    documentType:     'report_card',
    supportedTypes:   ['secular', 'mixed'],
    supportsArabic:   false,
    supportsTheology: false,
    isCustom:         false,
    isDefault:        false,
    updatedAt:        null,
  },
] as const;

/**
 * Backwards-compat alias for code that imported the previous narrower name.
 * The two arrays now hold the same shape (Phase 2 unified registry); we
 * keep both exports so external callers continue to work.
 */
export const BUILT_IN_EMERGENCY_TEMPLATES: readonly RegistryEntry[] =
  BUILT_IN_TEMPLATES;

/**
 * Resolve a registry id to its built-in entry. Returns null when the id
 * belongs to a `dvcf_documents` row (numeric id) — those are looked up via
 * the registry route directly.
 */
export function getBuiltInTemplate(id: string): RegistryEntry | null {
  return BUILT_IN_TEMPLATES.find(t => t.id === id) ?? null;
}

/** Backwards-compat alias. */
export const getBuiltInEmergencyTemplate = getBuiltInTemplate;
