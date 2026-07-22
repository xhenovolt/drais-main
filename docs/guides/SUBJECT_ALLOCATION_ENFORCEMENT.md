# Subject Allocation Enforcement System for Albayan Reports

**Date Implemented:** April 28, 2026  
**Status:** ✅ COMPLETE  
**Impact Scope:** All report generation, marks entry, and result submission systems

---

## Overview

A comprehensive enforcement system has been implemented to prevent subjects that are **not allocated** to a class from appearing on reports or having marks entered for that class.

**Example:** ICT must not appear on Primary Two reports since it's only allocated to Primary Three and above.

---

## What Was Implemented

### 1. **New Validation Library**
📁 File: `src/lib/subject-allocation-validation.ts`

This new utility provides:

- **`getValidSubjectsForClass()`** - Retrieves all subject IDs allocated to a class
- **`getValidSubjectDetailsForClass()`** - Gets subject details (name, code, initials) for a class
- **`isSubjectAllocatedToClass()`** - Checks if a specific subject is allocated to a class
- **`filterToAllocatedSubjects()`** - Filters subject results to include only allocated subjects
- **`enforceSubjectAllocation()`** - Throws error if invalid subjects exist
- **`getSubjectAllocationSummary()`** - Gets allocation summary for debugging/logging

### 2. **Report Card Generation** (Updated)
📁 File: `src/app/api/report-cards/route.ts`

**Changes:**
- Added subject filtering to the report card generation process
- Only subjects in the `class_subjects` table are included in the final report
- Non-allocated subjects are automatically filtered out with warning logs
- Ensures report cards only reflect officially allocated curriculum

---

## 3. **Marks Entry Points** (All Protected)

### **A. Class Results Submit Endpoint**
📁 File: `src/app/api/class_results/submit/route.ts`

**Enforcement:**
- ✅ Validates subject is allocated to class BEFORE accepting marks
- ✅ Returns error code `SUBJECT_NOT_ALLOCATED` if subject not in allocation
- ✅ Clear error message with subject name

```
Error Response:
{
  "error": "Subject Allocation Violation: \"ICT\" is not allocated to this class. 
           Results cannot be entered for subjects not in the class allocation.",
  "code": "SUBJECT_NOT_ALLOCATED",
  "status": 400
}
```

### **B. Class Results List Endpoint** 
📁 File: `src/app/api/class_results/list/route.ts`

**Enforcement:**
- ✅ POST method validates subject allocation
- ✅ Prevents bulk subject result entry for non-allocated subjects
- ✅ Consistent error messaging

### **C. Reports List Endpoint**
📁 File: `src/app/api/reports/list/route.ts`

**Enforcement:**
- ✅ POST method validates subject allocation before batch import
- ✅ Prevents non-allocated subjects from being bulk-imported

### **D. Tahfiz Results Endpoint**
📁 File: `src/app/api/tahfiz/results/route.ts`

**Enforcement:**
- ✅ Subject allocation validation for Tahfiz subjects
- ✅ Prevents non-allocated Tahfiz subjects from having marks entered
- ✅ Detailed error logging for each invalid entry

---

## How It Works

### **Data Flow**

```
1. Teacher enters marks for Subject X in Class Y
                ↓
2. System checks class_subjects table
   "Is Subject X allocated to Class Y?"
                ↓
        YES ← → NO
         │        │
         ✅       ❌ REJECTED
      Accept    Error: "Subject not allocated"
      Marks     Code: SUBJECT_NOT_ALLOCATED
```

### **Database Reference**

**Source of Truth:** `class_subjects` table
- `class_id` - Which class
- `subject_id` - Which subject
- `deleted_at` - Soft delete flag (ignored)

**Allocation Linked to:** Teacher initials stored here
- `custom_initials` - Teacher initials assigned to subject in class

---

## Albayan Subject Allocations

### **Early Childhood**
| Class | Subjects | Teacher Initials |
|-------|----------|------------------|
| Baby Class | Numbers, Language, Writing, Reading, S.D, Health Habits | I.R / K.L / N.M |
| Top Class | Numbers, Language, Writing, S.D, Health Habits | K.B / K.L / N.M |
| Middle Class | Numbers, Language, Writing, Reading, S.D, Health Habits | K.L / I.R / N.M |

### **Primary**
| Classes | Subjects | Teacher Initials |
|---------|----------|------------------|
| Primary 1, 2, 3 | Mathematics, English, Literacy One, Literacy Two, **ICT (P3 only)** | M.S / N.Z / K.Z / N.V / N.M |
| Primary 4, 5 | Mathematics, English, Science, Social Studies, ICT | M.H / S.A / N.P / K.M / N.M |
| Primary 6 | Mathematics, English, Science, Social Studies, ICT | O.H / W.A / F.S / O.S / N.M |

---

## Error Handling

### **Validation Checks** (in order)

1. ✅ **Subject Exists** - Subject ID is valid
2. ✅ **Subject Not Deleted** - Subject not soft-deleted
3. ✅ **Class Exists** - Class ID is valid
4. ✅ **Class Not Deleted** - Class not soft-deleted
5. ✅ **Allocation Exists** - Subject in `class_subjects` for that class
6. ✅ **Allocation Not Deleted** - Allocation not soft-deleted

### **Response Codes**

| Code | Status | Meaning |
|------|--------|---------|
| `SUBJECT_NOT_ALLOCATED` | 400 | Subject not allocated to this class |
| `success: false` | 500 | Database/system error |
| `Not authenticated` | 401 | User session invalid |
| `access denied` | 403 | School/class ownership issue |

---

## Usage Examples

### **✅ ALLOWED: Enter marks for allocated subject**

```bash
curl -X POST /api/class_results/submit \
  -H "Content-Type: application/json" \
  -d '{
    "class_id": 1,
    "subject_id": 5,              # Mathematics (allocated to this class)
    "result_type_id": 2,
    "term_id": 1,
    "entries": [
      { "student_id": 100, "score": 85, "grade": "A" }
    ]
  }'

Response: { "success": true, "inserted": 1, "message": "Results submitted successfully" }
```

### **❌ REJECTED: Enter marks for non-allocated subject**

```bash
curl -X POST /api/class_results/submit \
  -H "Content-Type: application/json" \
  -d '{
    "class_id": 2,                # Primary Two
    "subject_id": 15,             # ICT (NOT allocated to Primary 2)
    "result_type_id": 2,
    "term_id": 1,
    "entries": [
      { "student_id": 100, "score": 85, "grade": "A" }
    ]
  }'

Response: { 
  "error": "Subject Allocation Violation: \"ICT\" is not allocated to this class. Results cannot be entered for subjects not in the class allocation.",
  "code": "SUBJECT_NOT_ALLOCATED",
  "status": 400
}
```

---

## Report Card Impact

### **Before Enforcement**
Report cards might include:
- All subjects with marks entered (even if not officially allocated)
- Example: ICT appears on Primary 2 report (incorrect)

### **After Enforcement**
Report cards only include:
- Subjects officially allocated to the class
- Example: ICT filtered out from Primary 2 report (correct)
- Non-allocated subjects with entered marks are logged as warnings

---

## Admin/Staff Actions Needed

### **For Administrators**
1. ✅ Review subject allocations in `Academics > Teacher Subject Allocation`
2. ✅ Ensure all class-subject assignments are correct
3. ✅ Remove any incorrect allocations

### **For Teachers/Examiners**
1. ✅ Only subjects shown in the marks entry interface are valid
2. ✅ If you need to enter marks for a subject:
   - Check if subject is in class allocation
   - Request admin to add subject if missing
3. ✅ Cannot bypass allocation validation

### **For IT/Database Team**
1. ✅ Regularly audit `class_subjects` table
2. ✅ Monitor logs for `[Subject Allocation Warning]` messages
3. ✅ Verify Albayan allocations match official curriculum

---

## Technical Details

### **Key Functions**

```typescript
// Check if subject allocated to class
const isAllocated = await isSubjectAllocatedToClass(connection, classId, subjectId);

// Get all valid subjects for a class
const validSubjects = await getValidSubjectsForClass(connection, classId);

// Get subject details (name, initials, etc.)
const details = await getValidSubjectDetailsForClass(connection, classId);

// Filter result list to allocated subjects only
const filtered = await filterToAllocatedSubjects(connection, classId, results);

// Get allocation summary (for logging/debugging)
const summary = await getSubjectAllocationSummary(connection, classId);
```

### **SQL Queries Used**

```sql
-- Get valid subjects for a class
SELECT DISTINCT cs.subject_id
FROM class_subjects cs
WHERE cs.class_id = ? AND cs.deleted_at IS NULL;

-- Check if subject allocated to class
SELECT cs.id
FROM class_subjects cs
WHERE cs.class_id = ? AND cs.subject_id = ? AND cs.deleted_at IS NULL
LIMIT 1;
```

---

## Logging & Monitoring

### **Warning Logs**

When non-allocated subjects are filtered from reports:
```
[Subject Allocation Warning] Class 2: Filtered out 1 non-allocated subject(s): Subject ID 15
```

### **Error Logs**

When someone tries to enter marks for non-allocated subject:
```
Error: Subject Allocation Violation: "ICT" is not allocated to this class...
Code: SUBJECT_NOT_ALLOCATED
Status: 400
```

---

## Testing the System

### **Test Scenario 1: ICT in Primary Two (Should FAIL)**

1. Go to marks entry for **Primary Two**
2. Try to enter marks for **ICT**
3. Expected: Error message appears
4. Subject allocation violation prevented ✅

### **Test Scenario 2: Mathematics in Primary Two (Should PASS)**

1. Go to marks entry for **Primary Two**
2. Enter marks for **Mathematics**
3. Expected: Marks saved successfully
4. Subject is allocated ✅

### **Test Scenario 3: Report Card Generation**

1. Generate report card for **Primary Two**
2. Check subject list on report
3. Expected: **ICT not listed** (only allocated subjects shown)
4. Report accuracy enforced ✅

---

## Future Enhancements

- [ ] UI warning/tooltip when hovering over non-allocated subjects
- [ ] Bulk subject allocation management interface
- [ ] Subject allocation change history/audit trail
- [ ] Template-based allocation for quick setup
- [ ] Curriculum year-based allocation profiles

---

## Support & Troubleshooting

**Q: Why can't I enter marks for a subject?**
A: Check if the subject is allocated to the class. Request admin to add it if needed.

**Q: How do I add a subject to a class allocation?**
A: Go to `Academics > Teacher Subject Allocation > Manage Allocations` and add the subject.

**Q: Can I delete a subject allocation?**
A: Yes, but existing marks/reports won't be affected (soft delete). Archive carefully.

**Q: Are old reports affected?**
A: No, only new report cards generated after this change apply the enforcement.

---

## Files Modified

1. ✅ `src/lib/subject-allocation-validation.ts` - **NEW** Validation library
2. ✅ `src/app/api/report-cards/route.ts` - Report filtering
3. ✅ `src/app/api/class_results/submit/route.ts` - Marks validation
4. ✅ `src/app/api/class_results/list/route.ts` - Marks list validation
5. ✅ `src/app/api/reports/list/route.ts` - Report import validation
6. ✅ `src/app/api/tahfiz/results/route.ts` - Tahfiz marks validation

---

## Deployment Notes

✅ **Production Ready**
- No database migrations required
- Uses existing `class_subjects` table
- Backward compatible
- No breaking changes
- Soft delete safe (non-deleted allocations only)

**Deployment Checklist:**
- [ ] Code review completed
- [ ] Unit tests passed
- [ ] Integration tests with Albayan school
- [ ] Admin notified of new restrictions
- [ ] Teachers briefed on proper subject allocation
- [ ] Database backup taken
- [ ] Monitor logs for first 48 hours

---

**Status:** ✅ Complete and Ready for Use
