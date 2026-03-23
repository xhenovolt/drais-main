-- ============================================================================
-- Migration 020: Dynamic Report Templates Engine
-- Creates the report_templates table and seeds two starter templates.
-- ============================================================================

-- report_templates: stores visual/layout JSON for report card rendering
CREATE TABLE IF NOT EXISTS report_templates (
  id          INT NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  layout_json LONGTEXT     NOT NULL,   -- JSON: all colors, spacing, fonts, etc.
  is_default  TINYINT(1)   NOT NULL DEFAULT 0,
  school_id   INT          NULL,       -- NULL = global (available to all schools)
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id) /*T![auto_id_cache] AUTO_ID_CACHE 1 */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Make sure only one global default exists
-- (application logic enforces this too)

-- Add unique constraint to school_settings so ON DUPLICATE KEY UPDATE works
-- for the active_report_template_id key per school.
-- Uses ALTER TABLE ... ADD IF NOT EXISTS to be idempotent.
ALTER TABLE school_settings
  ADD UNIQUE INDEX IF NOT EXISTS uq_school_settings_key (school_id, key_name);

-- Add active_report_template_id to school_settings (key/value store)
-- No schema change needed — uses existing school_settings(school_id, key_name, value_text)

-- ============================================================================
-- SEED: Template 1 — Default Template (classic green/blue/red)
-- ============================================================================
INSERT IGNORE INTO report_templates (id, name, description, is_default, school_id, layout_json)
VALUES (
  1,
  'Default Template',
  'Classic DRAIS report card: green banner, blue student info box, red values.',
  1,
  NULL,
  '{
    "page": {
      "background": "#ffffff",
      "boxShadow": "0 2px 8px #e6f0fa",
      "padding": "16px 18px",
      "borderRadius": 8,
      "maxWidth": 900,
      "margin": "0 auto 40px",
      "fontSize": 14,
      "fontFamily": "Segoe UI, sans-serif"
    },
    "header": {
      "layout": "three-column",
      "paddingBottom": 10,
      "opacity": 0.8,
      "borderBottom": "none"
    },
    "banner": {
      "backgroundColor": "rgb(34, 139, 34)",
      "color": "#ffffff",
      "textAlign": "center",
      "fontSize": 16,
      "fontWeight": "bold",
      "padding": "8px",
      "marginTop": 8,
      "marginBottom": 4,
      "borderRadius": 0,
      "letterSpacing": "0.05em",
      "textTransform": "uppercase"
    },
    "ribbon": {
      "background": "linear-gradient(to right, #d3d3d3, #a9a9a9)",
      "color": "#000000",
      "fontWeight": "bold",
      "fontSize": 18,
      "padding": "4px",
      "marginSidesPercent": "15%",
      "borderRadius": 0,
      "textAlign": "center"
    },
    "studentInfoBox": {
      "border": "2px solid #1a4be7",
      "borderRadius": 10,
      "padding": "18px 16px",
      "background": "#f8faff",
      "boxShadow": "0 1px 6px #e6f0fa",
      "margin": "18px 0"
    },
    "studentInfoContainer": {
      "flexDirection": "row",
      "borderBottom": "2px dashed #000000",
      "fontSize": 18
    },
    "studentValue": {
      "color": "#d61515",
      "fontStyle": "italic",
      "fontWeight": "bolder"
    },
    "table": {
      "fontSize": 14,
      "borderCollapse": "collapse",
      "th": {
        "background": "#f0f8ff",
        "border": "1px solid #000000",
        "padding": 6,
        "textAlign": "center",
        "color": "#000000"
      },
      "td": {
        "border": "1px solid #000000",
        "padding": 6,
        "textAlign": "center",
        "color": "#000000"
      }
    },
    "assessmentBox": {
      "border": "1px solid #000000",
      "borderRadius": 8,
      "padding": "10px 20px"
    },
    "comments": {
      "borderTop": "2px dashed #999999",
      "paddingTop": 15,
      "marginTop": 30,
      "ribbon": {
        "background": "rgb(145, 140, 140)",
        "color": "#000000",
        "borderRadius": "4px",
        "padding": "4px 18px 4px 10px"
      },
      "text": {
        "color": "#1a4be7",
        "fontStyle": "italic",
        "borderBottom": "1.5px dashed #1a4be7"
      }
    },
    "gradeTable": {
      "th": {
        "background": "#f0f0f0",
        "border": "1px solid #04081a",
        "textAlign": "center",
        "padding": 6
      },
      "td": {
        "border": "1px solid #04081a",
        "textAlign": "center",
        "padding": 6
      }
    }
  }'
);

-- ============================================================================
-- SEED: Template 2 — Modern Clean Template (teal/green theme, left-aligned)
-- ============================================================================
INSERT IGNORE INTO report_templates (id, name, description, is_default, school_id, layout_json)
VALUES (
  2,
  'Modern Clean Template',
  'Contemporary teal-green design: left-aligned banner, green accents, minimal borders.',
  0,
  NULL,
  '{
    "page": {
      "background": "#f8fffc",
      "boxShadow": "0 2px 12px rgba(0,128,100,0.12)",
      "padding": "20px 24px",
      "borderRadius": 4,
      "maxWidth": 900,
      "margin": "0 auto 40px",
      "fontSize": 13,
      "fontFamily": "Arial, Helvetica, sans-serif"
    },
    "header": {
      "layout": "centered",
      "paddingBottom": 14,
      "opacity": 1,
      "borderBottom": "3px solid #16a34a"
    },
    "banner": {
      "backgroundColor": "#0f6b55",
      "color": "#ffffff",
      "textAlign": "left",
      "fontSize": 14,
      "fontWeight": "bold",
      "padding": "6px 16px",
      "marginTop": 12,
      "marginBottom": 6,
      "borderRadius": 4,
      "letterSpacing": "0.1em",
      "textTransform": "uppercase"
    },
    "ribbon": {
      "background": "#dcfce7",
      "color": "#14532d",
      "fontWeight": "bold",
      "fontSize": 15,
      "padding": "6px 12px",
      "marginSidesPercent": "5%",
      "borderRadius": 4,
      "textAlign": "left"
    },
    "studentInfoBox": {
      "border": "2px solid #16a34a",
      "borderRadius": 4,
      "padding": "14px 20px",
      "background": "#f0fdf4",
      "boxShadow": "none",
      "margin": "14px 0"
    },
    "studentInfoContainer": {
      "flexDirection": "row",
      "borderBottom": "1px solid #86efac",
      "fontSize": 16
    },
    "studentValue": {
      "color": "#15803d",
      "fontStyle": "normal",
      "fontWeight": "600"
    },
    "table": {
      "fontSize": 13,
      "borderCollapse": "collapse",
      "th": {
        "background": "#dcfce7",
        "border": "1px solid #16a34a",
        "padding": 8,
        "textAlign": "left",
        "color": "#14532d"
      },
      "td": {
        "border": "1px solid #bbf7d0",
        "padding": 7,
        "textAlign": "left",
        "color": "#1a1a1a"
      }
    },
    "assessmentBox": {
      "border": "1px solid #16a34a",
      "borderRadius": 4,
      "padding": "8px 16px"
    },
    "comments": {
      "borderTop": "2px solid #16a34a",
      "paddingTop": 12,
      "marginTop": 24,
      "ribbon": {
        "background": "#0f766e",
        "color": "#ffffff",
        "borderRadius": "2px",
        "padding": "3px 14px 3px 10px"
      },
      "text": {
        "color": "#1e3a5f",
        "fontStyle": "italic",
        "borderBottom": "1px solid #93c5fd"
      }
    },
    "gradeTable": {
      "th": {
        "background": "#dcfce7",
        "border": "1px solid #16a34a",
        "textAlign": "center",
        "padding": 7
      },
      "td": {
        "border": "1px solid #bbf7d0",
        "textAlign": "center",
        "padding": 7
      }
    }
  }'
);
