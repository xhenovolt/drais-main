# DRCE Totals & Averages - Quick Reference

**Implementation:** April 28, 2026

## For Everyone

Every report template now shows:
- **TOTAL row** - Sum of all subject scores
- **AVERAGE row** - Average score per subject

Example:
```
Subject             Score
─────────────────────────
Mathematics          85
English              90
Science              78
─────────────────────────
TOTAL               253
AVERAGE            84.3
```

---

## For Administrators

### **Enable on All Templates**
```bash
node scripts/enable-drce-totals.mjs
```

### **Enable on Specific Template**
```bash
curl -X PATCH /api/drce/templates/{id}/enable-totals \
  -d { "showAverage": true, "labelText": "TOTAL" }
```

### **Disable Totals**
```bash
curl -X PATCH /api/drce/templates/{id}/enable-totals \
  -d { "enabled": false }
```

---

## For Developers

### **Key Files**
| File | Purpose |
|------|---------|
| `src/lib/drce/schema.ts` | Schema types with `DRCEResultsTableTotalsConfig` |
| `src/components/drce/sections/ResultsTableSection.tsx` | Renders totals rows |
| `src/lib/drce/totalsCalculator.ts` | Calculation utilities |
| `src/app/api/drce/templates/[id]/enable-totals/route.ts` | API for config |

### **Quick Integration**
```typescript
import { calculateColumnTotals, calculateColumnAverages } from '@/lib/drce/totalsCalculator';

const totals = calculateColumnTotals(results, ['score_id'], ctx);
const averages = calculateColumnAverages(results, ['score_id'], ctx);
```

### **API Usage**
```javascript
// Get config
const res = await fetch(`/api/drce/templates/123/enable-totals`);
const { totalsConfig, columns } = await res.json();

// Update config
await fetch(`/api/drce/templates/123/enable-totals`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sumColumnIds: ['score_id'],
    labelText: 'TOTAL',
    showAverage: true
  })
});
```

---

## Template JSON Example

```json
{
  "type": "results_table",
  "columns": [
    { "id": "subject", "header": "Subject", "binding": "name" },
    { "id": "score", "header": "Score", "binding": "score" },
    { "id": "grade", "header": "Grade", "binding": "grade" }
  ],
  "totalsConfig": {
    "enabled": true,
    "labelColumnId": "subject",
    "labelText": "TOTAL",
    "sumColumnIds": ["score"],
    "showAverage": true,
    "averageLabelText": "AVERAGE"
  }
}
```

---

## Default Behavior

✅ **Automatically detects:**
- Score columns (id contains: "score", "marks", "total", "grade_points")
- Label column (id contains: "subject", or uses first column)

✅ **Default config:**
- Totals: **enabled**
- Averages: **enabled**
- Label: "TOTAL"
- Average label: "AVERAGE"

---

## Status

- ✅ Production ready
- ✅ No database migrations
- ✅ All templates supported
- ✅ Works offline/client-side
- ✅ Backward compatible

---

See `DRCE_TOTALS_AND_AVERAGES.md` for full documentation.
