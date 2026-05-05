/**
 * DRCE template registry — single source of truth for every report-card
 * template available to a school.
 *
 * The registry merges two sources:
 *
 *   1. Database-backed DRCE documents (`dvcf_documents`) authored in the
 *      DRCE editor. These render via DRCEDocumentRenderer.
 *   2. Built-in *emergency* templates shipped as static HTML in `backup/`.
 *      These render via the deterministic `/print` route which substitutes
 *      `{{school_*}}` placeholders from the snapshot meta — no tenant
 *      leakage and no live DB access at render time.
 *
 * Both kinds of template appear in the same template-selection UIs and are
 * compatible with the snapshot pipeline (regenerate, flush, force, etc.).
 */
import type { SnapshotType } from '@/lib/snapshots/types';

export type TemplateCategory = 'standard' | 'emergency' | 'compact' | 'detailed';
export type TemplateRenderer = 'drce' | 'emergency_html';

export interface RegistryEntry {
  /** Stable id. Numeric for DRCE documents, string for built-in emergency. */
  id:               string;
  /** Display name for selection UIs. */
  name:             string;
  /** Short description shown next to the name. */
  description:      string;
  category:         TemplateCategory;
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
  /** True for renderer='emergency_html' entries — convenience flag. */
  isEmergency:      boolean;
  /** ISO timestamp of last update; null for built-ins. */
  updatedAt:        string | null;
}

/**
 * Built-in emergency templates. These ship with the codebase and are
 * available to every school. They are not stored in `dvcf_documents`.
 *
 * Adding a new emergency template is a one-line edit here plus a static
 * HTML file in `backup/` using the `{{school_*}}` placeholder set produced
 * by `snapshotToTemplateMap`.
 */
export const BUILT_IN_EMERGENCY_TEMPLATES: RegistryEntry[] = [
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
    isEmergency:      true,
    updatedAt:        null,
  },
  {
    id:               'emergency-theology',
    name:             'Theology — Emergency (Arabic)',
    description:      'RTL Arabic-numeral theology report card for fast bulk printing.',
    category:         'emergency',
    renderer:         'emergency_html',
    engineRef:        'theology-emergency-template.html',
    documentType:     'report_card',
    supportedTypes:   ['theology'],
    supportsArabic:   true,
    supportsTheology: true,
    isCustom:         false,
    isDefault:        false,
    isEmergency:      true,
    updatedAt:        null,
  },
];

/**
 * Resolve a registry id to its built-in entry (emergency templates only).
 * Database-backed entries are looked up directly via dvcf_documents.id.
 */
export function getBuiltInEmergencyTemplate(id: string): RegistryEntry | null {
  return BUILT_IN_EMERGENCY_TEMPLATES.find(t => t.id === id) ?? null;
}
