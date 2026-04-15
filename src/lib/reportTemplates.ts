// ============================================================================
// src/lib/reportTemplates.ts
// Type definitions for report layout JSON + built-in template constants
// ============================================================================

export interface ReportLayoutJSON {
  page: {
    background: string;
    boxShadow: string;
    padding: string;
    borderRadius: number;
    maxWidth: number;
    margin: string;
    fontSize: number;
    fontFamily: string;
  };
  header: {
    layout: 'three-column' | 'centered' | 'left-logo';
    paddingBottom: number;
    opacity: number;
    borderBottom: string;
  };
  banner: {
    backgroundColor: string;
    color: string;
    textAlign: 'center' | 'left' | 'right';
    fontSize: number;
    fontWeight: string;
    padding: string;
    marginTop: number;
    marginBottom: number;
    borderRadius: number;
    letterSpacing: string;
    textTransform: 'uppercase' | 'none' | 'capitalize';
  };
  ribbon: {
    background: string;
    color: string;
    fontWeight: string;
    fontSize: number;
    padding: string;
    marginSidesPercent: string;
    borderRadius: number;
    textAlign: 'center' | 'left' | 'right';
    boxShadow: string;
  };
  studentInfoBox: {
    border: string;
    borderRadius: number;
    padding: string;
    background: string;
    boxShadow: string;
    margin: string;
  };
  studentInfoContainer: {
    flexDirection: 'row' | 'column';
    borderBottom: string;
    fontSize: number;
  };
  studentValue: {
    color: string;
    fontStyle: string;
    fontWeight: string;
  };
  table: {
    fontSize: number;
    borderCollapse: 'collapse' | 'separate';
    th: {
      background: string;
      border: string;
      padding: number;
      textAlign: 'center' | 'left';
      color: string;
    };
    td: {
      border: string;
      padding: number;
      textAlign: 'center' | 'left';
      color: string;
    };
  };
  assessmentBox: {
    border: string;
    borderRadius: number;
    padding: string;
  };
  comments: {
    borderTop: string;
    paddingTop: number;
    marginTop: number;
    ribbon: {
      background: string;
      color: string;
      borderRadius: string;
      padding: string;
    };
    text: {
      color: string;
      fontStyle: string;
      borderBottom: string;
    };
  };
  gradeTable: {
    th: {
      background: string;
      border: string;
      textAlign: 'center' | 'left';
      padding: number;
    };
    td: {
      border: string;
      textAlign: 'center' | 'left';
      padding: number;
    };
  };
  pageBorder: {
    enabled: boolean;
    color: string;
    width: number;
    radius: number;
    style: 'solid' | 'double' | 'dashed' | 'none';
  };
  /** V2: Section ordering — controls which sections appear and in what order */
  sections?: SectionConfig[];
}

// ─── V2: Section system ──────────────────────────────────────────────────────

export type SectionType =
  | 'header'
  | 'banner'
  | 'student_info'
  | 'ribbon'
  | 'results_table'
  | 'assessment'
  | 'comments'
  | 'grade_table';

export interface SectionConfig {
  id: string;           // unique per template (e.g. 'header', 'banner-1')
  type: SectionType;
  label: string;        // human-readable (e.g. "School Header")
  visible: boolean;
}

/** Registry of all section types with defaults */
export const SECTION_REGISTRY: { type: SectionType; label: string; icon: string }[] = [
  { type: 'header',        label: 'School Header',   icon: 'School' },
  { type: 'banner',        label: 'Report Banner',   icon: 'Flag' },
  { type: 'student_info',  label: 'Student Info',    icon: 'User' },
  { type: 'ribbon',        label: 'Section Ribbon',  icon: 'Bookmark' },
  { type: 'results_table', label: 'Results Table',   icon: 'Table' },
  { type: 'assessment',    label: 'Assessment Box',  icon: 'Award' },
  { type: 'comments',      label: 'Comments',        icon: 'MessageSquare' },
  { type: 'grade_table',   label: 'Grade Scale',     icon: 'BarChart3' },
];

/** Default section order — used when layout_json.sections is missing */
export const DEFAULT_SECTIONS: SectionConfig[] = SECTION_REGISTRY.map(s => ({
  id: s.type,
  type: s.type,
  label: s.label,
  visible: true,
}));

export interface ReportTemplate {
  id: number;
  name: string;
  description: string;
  layout_json: ReportLayoutJSON;
  is_default: boolean;
  school_id: number | null;
  /** Identifies custom-component templates (e.g. 'northgate_official' → NorthgateReport.tsx) */
  template_key: string | null;
}

// ============================================================================
// BUILT-IN TEMPLATES (also seeded in DB via migration 020)
// Used as fallbacks when DB is unavailable.
// ============================================================================
export const DEFAULT_TEMPLATE_JSON: ReportLayoutJSON = {
  page: {
    background: '#ffffff',
    boxShadow: '0 2px 8px #e6f0fa',
    padding: '16px 18px',
    borderRadius: 8,
    maxWidth: 900,
    margin: '0 auto 40px',
    fontSize: 14,
    fontFamily: 'Segoe UI, sans-serif',
  },
  header: {
    layout: 'three-column',
    paddingBottom: 10,
    opacity: 0.8,
    borderBottom: 'none',
  },
  banner: {
    backgroundColor: 'rgb(34, 139, 34)',
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    padding: '8px',
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 0,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  ribbon: {
    background: 'linear-gradient(to right, #d3d3d3, #a9a9a9)',
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 18,
    padding: '4px',
    marginSidesPercent: '15%',
    borderRadius: 0,
    textAlign: 'center',
    boxShadow: 'none',
  },
  studentInfoBox: {
    border: '2px solid #1a4be7',
    borderRadius: 10,
    padding: '18px 16px',
    background: '#f8faff',
    boxShadow: '0 1px 6px #e6f0fa',
    margin: '18px 0',
  },
  studentInfoContainer: {
    flexDirection: 'row',
    borderBottom: '2px dashed #000000',
    fontSize: 18,
  },
  studentValue: {
    color: '#d61515',
    fontStyle: 'italic',
    fontWeight: 'bolder',
  },
  table: {
    fontSize: 14,
    borderCollapse: 'collapse',
    th: {
      background: '#f0f8ff',
      border: '1px solid #000000',
      padding: 6,
      textAlign: 'center',
      color: '#000000',
    },
    td: {
      border: '1px solid #000000',
      padding: 6,
      textAlign: 'center',
      color: '#000000',
    },
  },
  assessmentBox: {
    border: '1px solid #000000',
    borderRadius: 8,
    padding: '10px 20px',
  },
  comments: {
    borderTop: '2px dashed #999999',
    paddingTop: 15,
    marginTop: 30,
    ribbon: {
      background: 'rgb(145, 140, 140)',
      color: '#000000',
      borderRadius: '4px',
      padding: '4px 18px 4px 10px',
    },
    text: {
      color: '#1a4be7',
      fontStyle: 'italic',
      borderBottom: '1.5px dashed #1a4be7',
    },
  },
  gradeTable: {
    th: {
      background: '#f0f0f0',
      border: '1px solid #04081a',
      textAlign: 'center',
      padding: 6,
    },
    td: {
      border: '1px solid #04081a',
      textAlign: 'center',
      padding: 6,
    },
  },
  pageBorder: {
    enabled: false,
    color: '#000000',
    width: 2,
    radius: 0,
    style: 'solid',
  },
};

export const MODERN_CLEAN_TEMPLATE_JSON: ReportLayoutJSON = {
  page: {
    background: '#f8fffc',
    boxShadow: '0 2px 12px rgba(0,128,100,0.12)',
    padding: '20px 24px',
    borderRadius: 4,
    maxWidth: 900,
    margin: '0 auto 40px',
    fontSize: 13,
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  header: {
    layout: 'centered',
    paddingBottom: 14,
    opacity: 1,
    borderBottom: '3px solid #16a34a',
  },
  banner: {
    backgroundColor: '#0f6b55',
    color: '#ffffff',
    textAlign: 'left',
    fontSize: 14,
    fontWeight: 'bold',
    padding: '6px 16px',
    marginTop: 12,
    marginBottom: 6,
    borderRadius: 4,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  ribbon: {
    background: '#dcfce7',
    color: '#14532d',
    fontWeight: 'bold',
    fontSize: 15,
    padding: '6px 12px',
    marginSidesPercent: '5%',
    borderRadius: 4,
    textAlign: 'left',
    boxShadow: 'none',
  },
  studentInfoBox: {
    border: '2px solid #16a34a',
    borderRadius: 4,
    padding: '14px 20px',
    background: '#f0fdf4',
    boxShadow: 'none',
    margin: '14px 0',
  },
  studentInfoContainer: {
    flexDirection: 'row',
    borderBottom: '1px solid #86efac',
    fontSize: 16,
  },
  studentValue: {
    color: '#15803d',
    fontStyle: 'normal',
    fontWeight: '600',
  },
  table: {
    fontSize: 13,
    borderCollapse: 'collapse',
    th: {
      background: '#dcfce7',
      border: '1px solid #16a34a',
      padding: 8,
      textAlign: 'left',
      color: '#14532d',
    },
    td: {
      border: '1px solid #bbf7d0',
      padding: 7,
      textAlign: 'left',
      color: '#1a1a1a',
    },
  },
  assessmentBox: {
    border: '1px solid #16a34a',
    borderRadius: 4,
    padding: '8px 16px',
  },
  comments: {
    borderTop: '2px solid #16a34a',
    paddingTop: 12,
    marginTop: 24,
    ribbon: {
      background: '#0f766e',
      color: '#ffffff',
      borderRadius: '2px',
      padding: '3px 14px 3px 10px',
    },
    text: {
      color: '#1e3a5f',
      fontStyle: 'italic',
      borderBottom: '1px solid #93c5fd',
    },
  },
  gradeTable: {
    th: {
      background: '#dcfce7',
      border: '1px solid #16a34a',
      textAlign: 'center',
      padding: 7,
    },
    td: {
      border: '1px solid #bbf7d0',
      textAlign: 'center',
      padding: 7,
    },
  },
  pageBorder: {
    enabled: false,
    color: '#16a34a',
    width: 2,
    radius: 4,
    style: 'solid',
  },
};

export const NORTHGATE_TEMPLATE_JSON: ReportLayoutJSON = {
  page: {
    background: '#ffffff',
    boxShadow: '0 0 10px rgba(0,0,0,0.5)',
    padding: '40px',
    borderRadius: 0,
    maxWidth: 800,
    margin: '0 auto 40px',
    fontSize: 14,
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    layout: 'three-column',
    paddingBottom: 10,
    opacity: 1,
    borderBottom: 'none',
  },
  banner: {
    backgroundColor: '#0000FF',
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 'bold',
    padding: '5px',
    marginTop: 10,
    marginBottom: 15,
    borderRadius: 0,
    letterSpacing: '0',
    textTransform: 'uppercase',
  },
  ribbon: {
    background: '#D9D9D9',
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 14,
    padding: '5px 10px',
    marginSidesPercent: '0',
    borderRadius: 0,
    textAlign: 'center',
    boxShadow: 'none',
  },
  studentInfoBox: {
    border: '1px solid #000000',
    borderRadius: 0,
    padding: '10px 12px',
    background: '#f0f0f0',
    boxShadow: 'none',
    margin: '0 0 20px 0',
  },
  studentInfoContainer: {
    flexDirection: 'row',
    borderBottom: '1px dotted #000000',
    fontSize: 14,
  },
  studentValue: {
    color: '#800000',
    fontStyle: 'normal',
    fontWeight: 'bold',
  },
  table: {
    fontSize: 13,
    borderCollapse: 'collapse',
    th: {
      background: '#ffffff',
      border: '1px solid #000000',
      padding: 5,
      textAlign: 'left',
      color: '#000000',
    },
    td: {
      border: '1px solid #000000',
      padding: 5,
      textAlign: 'left',
      color: '#000000',
    },
  },
  assessmentBox: {
    border: '1px solid #000000',
    borderRadius: 0,
    padding: '5px 10px',
  },
  comments: {
    borderTop: 'none',
    paddingTop: 0,
    marginTop: 30,
    ribbon: {
      background: '#D9D9D9',
      color: '#000000',
      borderRadius: '0',
      padding: '5px 10px',
    },
    text: {
      color: '#0000FF',
      fontStyle: 'italic',
      borderBottom: '1px dotted #000000',
    },
  },
  gradeTable: {
    th: {
      background: '#ffffff',
      border: '1px solid #000000',
      textAlign: 'center',
      padding: 5,
    },
    td: {
      border: '1px solid #000000',
      textAlign: 'center',
      padding: 5,
    },
  },
  pageBorder: {
    enabled: false,
    color: '#002060',
    width: 2,
    radius: 0,
    style: 'solid',
  },
};

/** Converts a raw DB row to a typed ReportTemplate */
/** Deep-merge layout_json with DEFAULT_TEMPLATE_JSON so missing keys get defaults */
function mergeLayout(partial: Record<string, any>): ReportLayoutJSON {
  const base = structuredClone(DEFAULT_TEMPLATE_JSON) as Record<string, any>;
  for (const key of Object.keys(base)) {
    if (partial[key] && typeof partial[key] === 'object' && !Array.isArray(partial[key])) {
      base[key] = { ...base[key] };
      for (const sub of Object.keys(base[key])) {
        if (partial[key][sub] !== undefined) {
          if (typeof base[key][sub] === 'object' && typeof partial[key][sub] === 'object' && !Array.isArray(base[key][sub])) {
            base[key][sub] = { ...base[key][sub], ...partial[key][sub] };
          } else {
            base[key][sub] = partial[key][sub];
          }
        }
      }
      // Copy keys from partial that don't exist in base
      for (const sub of Object.keys(partial[key])) {
        if (base[key][sub] === undefined) {
          base[key][sub] = partial[key][sub];
        }
      }
    } else if (partial[key] !== undefined) {
      base[key] = partial[key];
    }
  }
  return base as ReportLayoutJSON;
}

export function parseTemplateRow(row: any): ReportTemplate {
  let raw: Record<string, any>;
  try {
    raw = typeof row.layout_json === 'string'
      ? JSON.parse(row.layout_json)
      : row.layout_json;
  } catch {
    raw = {};
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    layout_json: mergeLayout(raw ?? {}),
    is_default: Boolean(row.is_default),
    school_id: row.school_id ?? null,
    template_key: row.template_key ?? null,
  };
}
