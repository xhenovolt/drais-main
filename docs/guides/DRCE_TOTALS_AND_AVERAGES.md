# DRCE Totals & Averages Feature

**Date Implemented:** April 28, 2026  
**Status:** ✅ Complete and Ready for Use

---

## Overview

Every DRCE report template now automatically displays **totals and averages** at the end of the results table. This works for all templates across all schools without any modification needed.

**Features:**
- ✅ **Automatic total calculation** for all numeric columns
- ✅ **Average calculation** per subject across all students  
- ✅ **Configurable per template** (can enable/disable or customize)
- ✅ **Works with all schools** (Albayan, Northgate, etc.)
- ✅ **No database migration required** (uses existing schema)

---

## How It Works

### **What Gets Calculated**

For each numeric column (score/marks), the system automatically:

1. **Totals** - Sums all numeric values in the column
2. **Averages** - Divides total by number of subjects/rows

### **Example**

```
Student: John Doe

Subject         Score   Grade   Teacher
─────────────────────────────────────────
Mathematics      85      A       M.S
English          90      A       N.Z
Science          78      B       N.P
Social Studies   88      A       K.M
ICT              92      A       N.M
─────────────────────────────────────────
TOTAL           433      -       -
AVERAGE         86.6     -       -
```

---

## Default Behavior

### **Automatically Detects:**
1. **Score columns** - Any column with "score", "marks", "total", or "grade_points" in the name
2. **Label column** - Usually the "Subject" column (displays "TOTAL" and "AVERAGE" labels)

### **Default Configuration:**
- ✅ Totals row **enabled** by default
- ✅ Average row **enabled** by default  
- ✅ "TOTAL" label in first column
- ✅ "AVERAGE" label in average row
- ✅ Subtle background styling for distinction

---

## Schema Configuration

### **Type Definition**

```typescript
interface DRCEResultsTableTotalsConfig {
  enabled: boolean;                    // Show totals row
  labelColumnId: string;               // Column for label (e.g., 'subject_name')
  labelText: string;                   // Text to display ("TOTAL")
  sumColumnIds: string[];              // Column IDs to sum
  showAverage: boolean;                // Show average row
  averageLabelColumnId?: string;       // Column for average label
  averageLabelText?: string;           // Average label text
  rowStyle?: DRCEColumnStyle;          // Custom styling
}
```

### **In Template JSON**

```json
{
  "sections": [
    {
      "type": "results_table",
      "columns": [...],
      "totalsConfig": {
        "enabled": true,
        "labelColumnId": "subject_id",
        "labelText": "TOTAL",
        "sumColumnIds": ["score_id", "grade_points_id"],
        "showAverage": true,
        "averageLabelColumnId": "subject_id",
        "averageLabelText": "AVERAGE",
        "rowStyle": {
          "fontWeight": "bold",
          "background": "rgba(0, 0, 0, 0.05)"
        }
      }
    }
  ]
}
```

---

## Enabling on Existing Templates

### **Option 1: API Endpoint (Recommended)**

**Enable totals on a template:**
```bash
curl -X PATCH /api/drce/templates/{templateId}/enable-totals \
  -H "Content-Type: application/json" \
  -d {
    "labelColumnId": "subject_id",
    "sumColumnIds": ["score_id"],
    "showAverage": true,
    "labelText": "TOTAL",
    "averageLabelText": "AVERAGE"
  }
```

**Disable totals:**
```bash
curl -X PATCH /api/drce/templates/{templateId}/enable-totals \
  -H "Content-Type: application/json" \
  -d { "enabled": false }
```

**Get current configuration:**
```bash
curl -X GET /api/drce/templates/{templateId}/enable-totals
```

### **Option 2: Script (Batch Update)**

Enable totals on **all templates** at once:
```bash
node scripts/enable-drce-totals.mjs
```

Output:
```
📋 Found 12 DRCE templates

✅ Template 1: Totals enabled (2 score columns)
✅ Template 2: Totals enabled (3 score columns)
⏭️  Template 3: Already has totals enabled, skipping
...

Summary:
  ✅ Updated:  9
  ⏭️  Skipped:  3
  ❌ Failed:   0
```

---

## Customization

### **Customize Labels**

```bash
curl -X PATCH /api/drce/templates/123/enable-totals \
  -d {
    "labelText": "TOTAL SCORE",
    "averageLabelText": "CLASS AVERAGE"
  }
```

### **Select Specific Columns to Sum**

```bash
curl -X PATCH /api/drce/templates/123/enable-totals \
  -d {
    "sumColumnIds": ["mid_term_score", "end_term_score"]
  }
```

### **Disable Averages**

```bash
curl -X PATCH /api/drce/templates/123/enable-totals \
  -d {
    "showAverage": false
  }
```

### **Disable Totals Entirely**

```bash
curl -X PATCH /api/drce/templates/123/enable-totals \
  -d {
    "enabled": false
  }
```

---

## Component Implementation

### **Location**
`src/components/drce/sections/ResultsTableSection.tsx`

### **Key Functions**

```typescript
// Calculate totals for columns
function calculateTotals(results, sumColumnIds, ctx): Record<string, number>

// Calculate averages
function calculateAverages(results, sumColumnIds, ctx): Record<string, number>
```

### **Utilities**
`src/lib/drce/totalsCalculator.ts` provides:
- `generateDefaultTotalsConfig()` - Auto-detect score columns
- `calculateColumnTotals()` - Get totals
- `calculateColumnAverages()` - Get averages
- `getReportSummary()` - Overall stats
- `formatNumber()` - Format with decimals

---

## Albayan Report Example

### **Primary Two Report with Totals**

```
Albayan Quran Memorization Center
Report Card - Primary Two - Term 1, 2026

Student: Ahmed Hassan
Admission No: ALB-2026-0456

┌─────────────────────┬───────┬──────┬─────────────┐
│ Subject             │ Score │ Grade│ Teacher     │
├─────────────────────┼───────┼──────┼─────────────┤
│ Mathematics         │  82   │  A   │ M.S         │
│ English             │  88   │  A   │ N.Z         │
│ Literacy One        │  85   │  A   │ K.Z         │
│ Literacy Two        │  80   │  B   │ N.V         │
├─────────────────────┼───────┼──────┼─────────────┤
│ TOTAL               │ 335   │  -   │  -          │
│ AVERAGE             │ 83.75 │  A   │  -          │
└─────────────────────┴───────┴──────┴─────────────┘

✅ Notice: ICT is NOT shown (not allocated to Primary 2)
✅ Totals automatically calculated
✅ Average per subject shown
```

---

## Display Styling

### **Totals Row**
- **Background:** Light gray (`rgba(0, 0, 0, 0.05)`)
- **Font Weight:** Bold
- **Font Style:** Normal

### **Average Row**
- **Background:** Very light gray (`rgba(0, 0, 0, 0.02)`)
- **Font Style:** Italic
- **Font Weight:** Normal

---

## Technical Details

### **Database Changes**
None! Uses existing `drce_documents.schema` JSON field.

### **Files Added**
- `src/lib/drce/totalsCalculator.ts` - Calculation utilities
- `src/app/api/drce/templates/[id]/enable-totals/route.ts` - API endpoint
- `scripts/enable-drce-totals.mjs` - Batch enablement script

### **Files Modified**
- `src/lib/drce/schema.ts` - Added `DRCEResultsTableTotalsConfig` type
- `src/components/drce/sections/ResultsTableSection.tsx` - Renders totals rows

### **API Endpoints**
- `PATCH /api/drce/templates/{id}/enable-totals` - Update config
- `GET /api/drce/templates/{id}/enable-totals` - Get config

---

## Troubleshooting

### **Q: Totals not showing**
A: Check that `totalsConfig.enabled` is `true` in template schema

### **Q: Wrong columns being summed**
A: Use API to specify exact `sumColumnIds` you want

### **Q: Average showing wrong value**
A: Ensure column binding correctly resolves to numeric value

### **Q: Styling looks odd**
A: Customize `rowStyle` property in totalsConfig

---

## Performance Notes

- ✅ **No significant impact** - totals calculated client-side during render
- ✅ **Efficient** - single pass through data for each column
- ✅ **Memory safe** - no additional storage in database

---

## Future Enhancements

- [ ] Weighted averages support
- [ ] Custom formula columns (e.g., (T1 + T2) / 2)
- [ ] Class-level comparisons (class average vs student)
- [ ] Grade distribution percentages
- [ ] Statistical analysis (min/max/median)
- [ ] Conditional styling based on thresholds

---

## Deployment Checklist

- ✅ Code review complete
- ✅ Type-safe TypeScript
- ✅ No database migrations
- ✅ Backward compatible
- ✅ All schools supported
- ✅ Ready for production

---

## Support

**For issues:**
1. Check template schema for `totalsConfig` object
2. Verify column IDs in `sumColumnIds` array
3. Test API endpoint to get/set configuration
4. Check browser console for calculation errors

---

**Status:** ✅ Complete and Live
