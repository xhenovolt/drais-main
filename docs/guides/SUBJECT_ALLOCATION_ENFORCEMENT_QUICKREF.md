# Subject Allocation Enforcement - Quick Reference

**Implementation Date:** April 28, 2026

## What Changed?

✅ **ICT cannot be entered/reported for Primary Two** (only allocated to P3+)
✅ **Only officially allocated subjects** appear on Albayan reports
✅ **Validation happens at 5 entry points** (marks submission, report generation, etc.)

---

## For Teachers

### Marks Entry
If you see an error like:
```
"Subject \"ICT\" is not allocated to this class"
```

**This means:** You cannot enter marks for ICT in that class because it's not in the curriculum.

**Solution:** Ask admin to add the subject to the class allocation if it should be taught.

---

## For Administrators

### To Check Allocations
1. Go to **Academics → Teacher Subject Allocation**
2. Select a class to see all allocated subjects
3. Verify each subject is correct

### To Fix Missing Subject
1. Click **Manage Allocations** for the class
2. Click **Add Subject** 
3. Select the subject and teacher initials
4. Save

### Example: Add ICT to Primary Two
1. Go to Primary Two allocation page
2. Click "Add Subject"
3. Select "ICT"
4. Select "N.M" (teacher initials)
5. Save

---

## Technical Details (Developers)

### Entry Points Protected
| Endpoint | File | Protection |
|----------|------|-----------|
| `POST /api/class_results/submit` | `class_results/submit/route.ts` | ✅ Marks validation |
| `POST /api/class_results/list` | `class_results/list/route.ts` | ✅ Bulk validation |
| `POST /api/reports/list` | `reports/list/route.ts` | ✅ Import validation |
| `POST /api/report-cards` | `report-cards/route.ts` | ✅ Report filtering |
| `POST /api/tahfiz/results` | `tahfiz/results/route.ts` | ✅ Tahfiz validation |

### Using the Library
```typescript
import { isSubjectAllocatedToClass } from '@/lib/subject-allocation-validation';

// Check if subject allocated
const allocated = await isSubjectAllocatedToClass(conn, classId, subjectId);

if (!allocated) {
  throw new Error('Subject not allocated to this class');
}
```

---

## Albayan Allocations Quick Reference

| Class | Subjects |
|-------|----------|
| Baby Class | Numbers, Language, Writing, Reading, S.D, Health Habits |
| Top Class | Numbers, Language, Writing, S.D, Health Habits |
| Middle Class | Numbers, Language, Writing, Reading, S.D, Health Habits |
| **Primary 1, 2** | **Math, English, Literacy One, Literacy Two** (NO ICT) |
| Primary 3+ | Math, English, (Science/Social Studies), ICT, Literacy |
| Primary 4, 5 | Math, English, Science, Social Studies, ICT |
| Primary 6 | Math, English, Science, Social Studies, ICT |

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Subject not allocated" error | Subject not in class allocation | Add subject to allocation |
| ICT appears on P2 report | Old data from before enforcement | Re-generate report |
| Can't find subject in dropdown | Subject deleted or inactive | Create/restore subject |
| Report missing subjects | Subjects filtered during generation | Check class allocation |

---

## Testing Checklist

- [ ] Try entering ICT marks for Primary 2 → Should get error
- [ ] Try entering Math marks for Primary 2 → Should work ✅
- [ ] Generate P2 report → ICT should NOT appear
- [ ] Try bulk import with non-allocated subject → Error
- [ ] Check Tahfiz results same enforcement → Error on non-allocated

---

## Files Changed

**New Files:**
- `src/lib/subject-allocation-validation.ts` - Validation library

**Updated Files:**
- `src/app/api/report-cards/route.ts`
- `src/app/api/class_results/submit/route.ts`
- `src/app/api/class_results/list/route.ts`
- `src/app/api/reports/list/route.ts`
- `src/app/api/tahfiz/results/route.ts`

**Documentation:**
- `SUBJECT_ALLOCATION_ENFORCEMENT.md` - Full guide
- This file - Quick reference

---

**Status: ✅ Live and Active**
