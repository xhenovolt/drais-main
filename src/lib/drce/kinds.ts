/**
 * Canva / Office-style document-kind catalog.
 *
 * A kind is *just metadata* — the renderer never branches on it. The
 * editor surfaces it as a chip, the gallery groups by it, and a soft
 * advisory layer nudges against unusual choices (a portrait certificate,
 * an A4 ID card) without ever blocking save or print.
 *
 * The kind code is free-text in storage so schools can introduce their
 * own kinds (`prefects_badge`, `tahfiz_certificate`) via the API without
 * a schema migration. The built-ins below give the gallery a sensible
 * default lineup.
 */

export interface KindDescriptor {
  code:        string;          // canonical lowercase identifier
  label:       string;          // shown to users
  icon:        string;          // emoji for chips / palette grouping
  description: string;          // one-liner explaining what this kind is for
  /** Suggested defaults the advisory layer compares against. None of these
   *  are enforced — they only drive friendly "this looks unusual…" banners. */
  expects: {
    pageSize?:    'a3' | 'a4' | 'a5' | 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
    /** If true and the doc has zero pages with this section type, advise. */
    suggestedSections?: string[];
  };
  sortOrder: number;
}

export const BUILT_IN_KINDS: KindDescriptor[] = [
  {
    code: 'report', label: 'Report card', icon: '📄', sortOrder: 10,
    description: 'Termly academic report — subjects, scores, grades, comments.',
    expects: { pageSize: 'a4', orientation: 'portrait', suggestedSections: ['header', 'student_info', 'results_table', 'comments'] },
  },
  {
    code: 'certificate', label: 'Certificate', icon: '🏆', sortOrder: 20,
    description: 'Award, completion, recognition — typically landscape with a big title.',
    expects: { pageSize: 'a4', orientation: 'landscape', suggestedSections: ['header', 'banner'] },
  },
  {
    code: 'id_card', label: 'ID Card', icon: '🪪', sortOrder: 30,
    description: 'Student / staff identification card. ID-1 size (85.6×54 mm) is standard.',
    // ID-1 isn't a native pageSize option; the advisory layer flags A4 here
    // and suggests using a small/custom size or `a5` if the card is printed in a grid.
    expects: { pageSize: 'a5', orientation: 'landscape' },
  },
  {
    code: 'transcript', label: 'Transcript', icon: '📋', sortOrder: 40,
    description: 'Cumulative academic record — many subjects across many terms.',
    expects: { pageSize: 'a4', orientation: 'portrait', suggestedSections: ['header', 'student_info'] },
  },
  {
    code: 'letter', label: 'Letter', icon: '✉️', sortOrder: 50,
    description: 'Official correspondence — admission letters, invitations, notices.',
    expects: { pageSize: 'a4', orientation: 'portrait', suggestedSections: ['header'] },
  },
  {
    code: 'blank', label: 'Blank', icon: '📃', sortOrder: 999,
    description: 'Start from an empty document.',
    expects: {},
  },
];

export function findKind(code: string | null | undefined): KindDescriptor {
  const lookup = (code ?? '').trim().toLowerCase();
  return BUILT_IN_KINDS.find(k => k.code === lookup)
    ?? {
      code: lookup || 'custom',
      label: lookup ? (lookup[0].toUpperCase() + lookup.slice(1).replace(/_/g, ' ')) : 'Custom',
      icon: '📦',
      description: 'School-defined document kind.',
      expects: {},
      sortOrder: 500,
    };
}

/** Normalise a free-text kind to the safe identifier shape we store. */
export function normalizeKind(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 64);
}
