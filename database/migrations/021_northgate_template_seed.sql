-- ============================================================================
-- Migration 021: Northgate Official Template + template_key column
--
-- Adds template_key to report_templates so custom-component templates
-- (like the pixel-accurate NorthgateReport.tsx) can be identified and
-- routed to their dedicated React component instead of the generic
-- JSON-driven renderer.
--
-- Seeds the Northgate Official template scoped exclusively to school_id = 6.
-- Other schools will NEVER see this template (enforced at API level by
-- WHERE school_id IS NULL OR school_id = :current_school_id).
-- ============================================================================

-- 1. Add template_key column (idempotent)
ALTER TABLE report_templates
  ADD COLUMN IF NOT EXISTS template_key VARCHAR(50) NULL DEFAULT NULL AFTER school_id;

-- 2. Seed: Northgate Official (school_id = 6, template_key = 'northgate_official')
--    layout_json = Northgate colour palette — used for kitchen thumbnail preview only.
--    Actual rendering uses src/components/reports/NorthgateReport.tsx.
INSERT IGNORE INTO report_templates
  (id, name, description, is_default, school_id, template_key, layout_json)
VALUES (
  100,
  'Northgate Official',
  'Official Northgate School report card — pixel-accurate layout matching the original printed report. Blue banner, deep-maroon student values, grey down-arrow section ribbons, SVG barcode. Exclusive to Northgate School.',
  0,
  6,
  'northgate_official',
  '{
    "page": {
      "background": "#ffffff",
      "boxShadow": "0 0 10px rgba(0,0,0,0.5)",
      "padding": "40px",
      "borderRadius": 0,
      "maxWidth": 800,
      "margin": "0 auto 40px",
      "fontSize": 14,
      "fontFamily": "Arial, sans-serif"
    },
    "header": {
      "layout": "three-column",
      "paddingBottom": 10,
      "opacity": 1,
      "borderBottom": "none"
    },
    "banner": {
      "backgroundColor": "#0000FF",
      "color": "#ffffff",
      "textAlign": "center",
      "fontSize": 15,
      "fontWeight": "bold",
      "padding": "5px",
      "marginTop": 10,
      "marginBottom": 15,
      "borderRadius": 0,
      "letterSpacing": "0",
      "textTransform": "uppercase"
    },
    "ribbon": {
      "background": "#D9D9D9",
      "color": "#000000",
      "fontWeight": "bold",
      "fontSize": 14,
      "padding": "5px 10px",
      "marginSidesPercent": "0",
      "borderRadius": 0,
      "textAlign": "center",
      "boxShadow": "none"
    },
    "studentInfoBox": {
      "border": "1px dashed #999999",
      "borderRadius": 0,
      "padding": "6px 8px",
      "background": "#ffffff",
      "boxShadow": "none",
      "margin": "0 0 10px 0"
    },
    "studentInfoContainer": {
      "flexDirection": "row",
      "borderBottom": "none",
      "fontSize": 14
    },
    "studentValue": {
      "color": "#B22222",
      "fontStyle": "normal",
      "fontWeight": "bold"
    },
    "table": {
      "fontSize": 12,
      "borderCollapse": "collapse",
      "th": {
        "background": "#f2f2f2",
        "border": "1px solid #333333",
        "padding": 4,
        "textAlign": "center",
        "color": "#000000"
      },
      "td": {
        "border": "1px solid #333333",
        "padding": 4,
        "textAlign": "center",
        "color": "#000000"
      }
    },
    "assessmentBox": {
      "border": "1px solid #333333",
      "borderRadius": 0,
      "padding": "4px 6px"
    },
    "comments": {
      "borderTop": "none",
      "paddingTop": 0,
      "marginTop": 20,
      "ribbon": {
        "background": "#D9D9D9",
        "color": "#000000",
        "borderRadius": "0px",
        "padding": "5px 10px 5px 10px"
      },
      "text": {
        "color": "#0000FF",
        "fontStyle": "italic",
        "borderBottom": "1px dashed #cccccc"
      }
    },
    "gradeTable": {
      "th": {
        "background": "#f2f2f2",
        "border": "1px solid #000000",
        "textAlign": "center",
        "padding": 3
      },
      "td": {
        "border": "1px solid #000000",
        "textAlign": "center",
        "padding": 3
      }
    },
    "pageBorder": {
      "enabled": false,
      "color": "#000000",
      "width": 0,
      "radius": 0,
      "style": "none"
    }
  }'
);

-- 3. Seed: Northgate Classic (rpt.html clone) — template_key = 'northgate_rpt_clone'
--    A SECOND, distinct Northgate template.
--    This is a pixel-accurate JSX clone of backup/rpt.html:
--      • table-based layout (not flex/grid)
--      • bwip-js API <img> barcode (not SVG bars)
--      • concave-down arrow SVG ribbons (exact polygon from source HTML)
--      • right-arrow SVG comment labels
--      • separate heading colour scheme (#000080 school name, #0000FF banner)
--    Rendered by: src/components/reports/NorthgateClassicTemplate.tsx
INSERT IGNORE INTO report_templates
  (id, name, description, is_default, school_id, template_key, layout_json)
VALUES (
  101,
  'Northgate Classic (rpt.html)',
  'Pixel-accurate clone of the original rpt.html file. Table-based layout, bwip-js API barcode image, concave-arrow SVG section ribbons, right-arrow comment labels. A second distinct layout option exclusive to Northgate School.',
  0,
  6,
  'northgate_rpt_clone',
  '{"source":"rpt.html","note":"Rendered by NorthgateClassicTemplate.tsx — no JSON theming applied"}'
);
