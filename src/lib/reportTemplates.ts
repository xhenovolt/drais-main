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
}

export interface ReportTemplate {
  id: number;
  name: string;
  description: string;
  layout_json: ReportLayoutJSON;
  is_default: boolean;
  school_id: number | null;
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
};

/** Converts a raw DB row to a typed ReportTemplate */
/** Deep-merge layout_json with DEFAULT_TEMPLATE_JSON so missing keys get defaults */
function mergeLayout(partial: Record<string, any>): ReportLayoutJSON {
  const base = structuredClone(DEFAULT_TEMPLATE_JSON) as Record<string, any>;
  for (const key of Object.keys(base)) {
    if (partial[key] && typeof partial[key] === 'object' && !Array.isArray(partial[key])) {
      base[key] = { ...base[key], ...partial[key] };
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
  };
}
