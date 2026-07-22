# Hardcoded Templates to DRCE Migration Guide

## Overview

All hardcoded report templates have been migrated to DRCE (DRAIS Report Composition Engine) documents. This means every template is now:

1. **Manageable** — Edit templates in the Reports Kitchen UI
2. **Customizable** — Change colors, fonts, layouts, and fields without code changes
3. **Versionable** — Templates are stored in the database with full edit history
4. **Unified** — Single rendering engine for all templates (DRCEDocumentRenderer)

## What Changed

### Before (Hardcoded Templates)
The reports page had 6 hardcoded template options:
- **Default Template** → Used `DEFAULT_TEMPLATE_JSON` from code
- **Arabic Template** → RTL variant, same rendering logic
- **Dual Curriculum** → Special React component (`DualCurriculumTemplate`)
- **Default (Clone)** → Copy of Default with slight variations
- **Arabic (Clone)** → Copy of Arabic with slight variations
- **DRCE** → Only database-backed template

Each required conditional rendering logic and was difficult to customize.

### After (DRCE Documents)
All templates are now DRCE documents stored in the `dvcf_documents` table:
- **Modern (Default)** — Default report card template (was: `DEFAULT_TEMPLATE_JSON`)
- **Arabic Template** — RTL-aware variant
- **Modern Clean** — Minimalist design
- **Northgate Classic** — Legacy Northgate format
- **Dual Curriculum** — Multi-curriculum support (landscape orientation)
- **Default (Clone)** — Copy of Modern with border styling
- **Arabic (Clone)** — Copy of Arabic template

All use the same `DRCEDocumentRenderer` component.

---

## Seed the Templates

### Option 1: API Endpoint (Recommended)

Call the migration API:

```bash
# Seed all templates
curl -X POST "http://localhost:3000/api/dvcf/migrate-templates?seed=true"

# Check available templates
curl "http://localhost:3000/api/dvcf/migrate-templates"
```

Response:
```json
{
  "success": true,
  "message": "Template migration complete",
  "results": [
    {
      "status": "created",
      "name": "Modern (Default)",
      "key": "modern_default"
    },
    {
      "status": "skipped",
      "name": "Arabic Template",
      "key": "arabic_template",
      "message": "Already exists"
    }
    // ... more templates
  ]
}
```

### Option 2: Node Script

```bash
# Make sure .env.local is configured
node scripts/migrate-hardcoded-templates-to-drce.mjs
```

**Note:** Requires database credentials in `.env.local`

---

## Template Keys (for Reference)

When selecting templates programmatically, use these keys:

| Template Name | Template Key |
|---|---|
| Modern (Default) | `modern_default` |
| Arabic Template | `arabic_template` |
| Modern Clean | `modern_clean_template` |
| Northgate Classic | `northgate_classic_template` |
| Dual Curriculum | `dual_curriculum_template` |
| Default (Clone) | `default_clone_template` |
| Arabic (Clone) | `arabic_clone_template` |

---

## Using the Templates

### In Reports Page

The reports page now dynamically loads all available DRCE templates:

```typescript
// Fetch all templates
const [availableDrceTemplates, setAvailableDrceTemplates] = useState<DRCEDocument[]>([]);
const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
const [activeDrceDoc, setActiveDrceDoc] = useState<DRCEDocument | null>(null);

// They load automatically from /api/dvcf/documents
// Template dropdown is dynamically populated
```

The template selector dropdown now shows:
```html
<select value={selectedTemplateId}>
  <option value="modern_default">Modern (Default)</option>
  <option value="arabic_template">Arabic Template</option>
  <option value="modern_clean_template">Modern Clean</option>
  <!-- ... -->
</select>
```

### Creating Custom Templates

1. Go to **Reports → Kitchen**
2. Click **"Create your first template"** (or **+** button)
3. Choose a base template to clone
4. Edit in the DRCE Editor
5. Customize:
   - Theme colors
   - Section visibility & order
   - Column definitions
   - Comment rules
   - Teacher mappings

---

## Template Structure (DRCE Document)

Each template is a `DRCEDocument` with this structure:

```typescript
{
  $schema: 'drce/v1',
  meta: {
    id: string;           // Unique ID
    name: string;         // Display name
    template_key: string; // Lookup key (e.g., 'modern_default')
    is_default: boolean;  // Auto-selected if true
    school_id: null;      // null = global, or school_id = school-specific
  },
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    baseFontSize: number;
    pagePadding: string;
    pageBackground: string;
    pageSize: 'a4' | 'letter';
    orientation: 'portrait' | 'landscape';
  },
  watermark: { /* watermark config */ },
  sections: [
    /* header, banner, student_info, results_table, assessment, comments, grade_table, etc. */
  ],
  shapes: [],
  commentRules?: [ /* auto-comment rules by score range */ ],
  teacherMappings?: [ /* map subject+class to teacher initials */ ],
}
```

---

## Migration Details

### What Was Migrated

| Old | New | Status |
|---|---|---|
| `DEFAULT_TEMPLATE_JSON` | Modern (Default) DRCE | ✅ Created |
| Arabic variant (RTL) | Arabic Template DRCE | ✅ Created |
| `MODERN_CLEAN_TEMPLATE_JSON` | Modern Clean DRCE | ✅ Created |
| `NORTHGATE_TEMPLATE_JSON` | Northgate Classic DRCE | ✅ Created |
| `DualCurriculumTemplate` | Dual Curriculum DRCE | ✅ Created (simplified) |
| Clone variants | Default/Arabic Clone DRCE | ✅ Created |

### Code Changes

**Reports page** (`src/app/academics/reports/page.tsx`):
- Removed hardcoded `templateRegistry` object
- Added dynamic `availableDrceTemplates` state
- Changed template selection to use `selectedTemplateId` (template_key)
- Simplified rendering: Always use `DRCEDocumentRenderer` (no more conditional branches for 'default', 'arabic', 'dual', etc.)
- Fetch templates from `/api/dvcf/documents` on mount

**New files**:
- `scripts/migrate-hardcoded-templates-to-drce.mjs` — Node script to seed templates
- `src/app/api/dvcf/migrate-templates/route.ts` — API endpoint to seed templates

**Removed**:
- Hardcoded template rendering logic for 'default', 'arabic', 'dual', 'default-clone', 'arabic-clone'
- Direct use of `DEFAULT_TEMPLATE_JSON`, `MODERN_CLEAN_TEMPLATE_JSON` in page rendering

---

## Backward Compatibility

### Old Code Still Works

The old template system is still available:
- `/api/report-templates/active` — still returns the kitchen template
- `DEFAULT_TEMPLATE_JSON` — still exported from `src/lib/reportTemplates.ts`

**However**, the reports page no longer uses them. If you have other code that depends on `DEFAULT_TEMPLATE_JSON`, it still works, but the reports page won't use it.

### Migration Path for Custom Templates

If you have custom templates created in the old Reports Kitchen:
1. The old templates are NOT automatically migrated
2. You can manually recreate them in the new DRCE Kitchen
3. Or use the `migrateKitchenLayout()` function in the database link endpoint

---

## Editing Templates

### In Reports Kitchen UI

1. Go to **Reports → Kitchen**
2. Click on a template card to **view** or **edit**
3. Use the **3-panel editor**:
   - **Left**: Document tree + properties
   - **Center**: Live preview
   - **Right**: JSON editor (advanced)

### Programmatically

Edit templates via API:

```typescript
// Get a template
GET /api/dvcf/documents/:id

// Update a template
PUT /api/dvcf/documents/:id
Body: {
  name: string;
  description: string;
  schema_json: JSON.stringify(DRCEDocument);
}

// Duplicate a template
POST /api/dvcf/documents/:id/duplicate

// Delete a template
DELETE /api/dvcf/documents/:id
```

---

## Troubleshooting

### Templates Not Showing in Dropdown

**Issue**: The template selector shows "Loading templates..." 

**Solution**: 
1. Check if `/api/dvcf/documents` returns templates
2. Verify that `dvcf_documents` table has `schema_version = 1`
3. Call the migration API: `POST /api/dvcf/migrate-templates?seed=true`

### Missing Template Styles

**Issue**: Template renders but colors/fonts are wrong

**Solution**:
1. Check the template's `theme` section in JSON
2. Edit the template in the Kitchen UI
3. Update colors/fonts and save

### Old Hardcoded Rendering Still Used

**Issue**: Changes to templates don't appear

**Solution**:
1. The page now only uses DRCE documents
2. Clear browser cache: `Ctrl+Shift+Del`
3. Hard refresh: `Ctrl+Shift+R`

---

## Quick Reference

### Load Templates
```typescript
// Automatic on page load
const [availableDrceTemplates, setAvailableDrceTemplates] = useState<DRCEDocument[]>([]);

useEffect(() => {
  fetch('/api/dvcf/documents')
    .then(r => r.json())
    .then(data => setAvailableDrceTemplates(data.documents));
}, []);
```

### Render Template
```typescript
<DRCEDocumentRenderer
  document={activeDrceDoc}
  dataCtx={drceData}
  renderCtx={drceRenderCtx}
/>
```

### Seed All Templates
```bash
curl -X POST "http://localhost:3000/api/dvcf/migrate-templates?seed=true"
```

---

## Benefits

✅ **No Code Changes** — Modify templates via UI
✅ **Faster Customization** — Real-time preview in Kitchen
✅ **Consistent Rendering** — All templates use same engine
✅ **Easier Maintenance** — Single DRCE schema, not multiple JSON objects
✅ **Full Audit Trail** — Database tracks template changes
✅ **School-Specific** — Each school can have custom templates
✅ **Version Control** — Rollback to previous template versions

---

## Next Steps

1. **Seed the templates**: `POST /api/dvcf/migrate-templates?seed=true`
2. **Test the reports**: Generate a report and verify all templates render correctly
3. **Customize**: Use the Kitchen UI to modify any template
4. **Remove old code**: Once fully migrated, remove `DEFAULT_TEMPLATE_JSON`, `MODERN_CLEAN_TEMPLATE_JSON`, and the old rendering logic

---

**Status**: ✅ Migration Complete — All hardcoded templates now managed as DRCE documents
