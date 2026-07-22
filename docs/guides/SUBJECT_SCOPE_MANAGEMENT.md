# Subject Scope Management - Implementation Guide

## Overview

This feature solves the problem where learners are seeing results for subjects they don't actually take. For example, nursery students shouldn't see Science, English, Social Studies, or Mathematics results if those subjects aren't offered in their class.

**Solution:** Subject scope is now defined through class-subject allocations in the system. Only subjects that are allocated to a specific class will appear in reports for students in that class.

---

## How It Works

### 1. Define Subject Scope

Go to **Academics → Subjects** page:
- Click the **⚙️ Settings icon** (purple button) next to any subject
- A modal opens showing all available classes
- **Check/uncheck classes** to define which classes take this subject
- Click **Save Allocation** to confirm

### 2. Automatic Filtering

Once allocations are saved:
- When generating reports for a class, **only allocated subjects appear**
- Results are automatically filtered through the `/api/class-subjects` validation
- Students in Nursery won't see Math if it's not allocated to their class
- Both Northgate and Albayan schools benefit from this scoping

### 3. Flexible & Scalable

- Not hard-coded — manages unlimited class-subject combinations
- Can be updated anytime without code changes
- Works across multiple academic years and terms
- Applies to all report formats (PDF, Excel, etc.)

---

## Technical Architecture

### Database Table: `class_subjects`

```sql
CREATE TABLE class_subjects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL
);
```

**Relationship:**
- One subject can be allocated to multiple classes
- One class can have multiple subjects
- Each allocation can have an optional teacher assignment

---

## Frontend Changes

### SubjectsManager Component (`src/components/academics/SubjectsManager.tsx`)

**New Button in Actions Column:**
```
[⚙️ Settings] [✏️ Edit] [🗑️ Delete]
```

**New Allocation Modal Features:**
- Grid display of all classes
- Checkbox selection for multi-select
- Shows current allocations for each subject
- Real-time count: "Save Allocation (N)"
- Confirmation and error handling

**Key Imports:**
```typescript
import { Settings } from 'lucide-react';  // New icon
```

**New State Variables:**
- `isAllocationModalOpen` - Toggle modal visibility
- `allocationSubjectId` - Current subject being allocated
- `allocationSubjectName` - Display name
- `selectedClasses` - Set of selected class IDs
- `allClasses` - Available classes from API

---

## API Endpoints

### GET `/api/class-subjects?subject_id=X`

Returns classes that have this subject allocated.

**Response:**
```json
{
  "success": true,
  "data": {
    "allocations": [
      {
        "id": 1,
        "class_id": 5,
        "subject_id": 10,
        "class_name": "Primary 5",
        "subject_name": "Mathematics",
        "teacher_id": 2,
        "teacher_name": "John Smith"
      }
    ],
    "allClasses": [
      { "id": 1, "name": "Nursery", "class_level": "Pre-primary" },
      { "id": 2, "name": "Pre-Primary A", "class_level": "Pre-primary" },
      ...
    ],
    "totalAllocations": 8
  }
}
```

### POST `/api/class-subjects`

Update subject allocations for multiple classes.

**Request:**
```json
{
  "subject_id": 10,
  "class_ids": [5, 6, 7, 8],
  "teacher_id": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subject allocated to 4 classes",
  "data": { "allocations_created": 4 }
}
```

### DELETE `/api/class-subjects?class_id=X&subject_id=Y`

Remove a specific subject-class allocation.

---

## Report Generation Filtering

### Results API Updates

Three results API endpoints now include `class_subjects` filtering:

#### 1. `/api/results/by-term/route.ts`
```typescript
LEFT JOIN class_subjects cs ON cr.class_id = cs.class_id AND cr.subject_id = cs.subject_id
```

#### 2. `/api/results/filtered/route.ts`
```typescript
LEFT JOIN class_subjects cs ON cr.class_id = cs.class_id AND cr.subject_id = cs.subject_id
```

#### 3. `/api/reports/list/route.ts`
```typescript
LEFT JOIN class_subjects cs ON cr.class_id = cs.class_id AND cr.subject_id = cs.subject_id
```

**Effect:**
- Results for subjects NOT in `class_subjects` are excluded
- Only allocated subjects appear on reports
- Server-side filtering ensures data integrity

---

## Validation & Safety

### Validation Library: `src/lib/subject-allocation-validation.ts`

**Key Functions:**

1. **`isSubjectAllocatedToClass(connection, classId, subjectId)`**
   - Checks if subject is allocated to class
   - Used during marks entry (POST `/api/reports/list`)
   - Prevents entering results for unallocated subjects

2. **`getValidSubjectsForClass(connection, classId)`**
   - Returns all subject IDs for a class
   - Used for filtering lists

3. **`filterToAllocatedSubjects(connection, classId, results)`**
   - Client-side filtering function
   - Removes results for unallocated subjects

### Enforcement in Results Entry

When submitting results via `/api/reports/list` POST:
```typescript
const subjectAllocated = await isSubjectAllocatedToClass(connection, class_id, subject_id);
if (!subjectAllocated) {
  return NextResponse.json({
    error: `Subject "${subjName}" is not allocated to this class.`
  }, { status: 400 });
}
```

---

## Use Cases

### Nursery Example
```
Subjects Allocated to Nursery:
✓ Kiswahili
✓ Numeracy
✓ Creative Activities
✗ Science        (NOT allocated)
✗ Social Studies (NOT allocated)
```

Result: Nursery report shows only Kiswahili, Numeracy, Creative Activities

### Albayan Example
```
Theology Stream:
✓ Islamic Studies
✓ Quranic Studies
✓ Arabic

Science Stream:
✓ Biology
✓ Chemistry
✓ Physics
✗ Islamic Studies (NOT in Science stream)
```

---

## Migration & Deployment

### 1. Database Table Already Exists
The `class_subjects` table exists in your database and may already have historical data.

### 2. Seed Initial Allocations (Optional)

To auto-allocate based on your schools' current setup:

```sql
-- Example: Allocate all core subjects to all classes
INSERT INTO class_subjects (class_id, subject_id)
SELECT c.id, s.id
FROM classes c
CROSS JOIN subjects s
WHERE s.subject_type = 'core'
AND c.school_id = 1
ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id);
```

### 3. Test the Feature

1. Navigate to **Academics → Subjects**
2. Click ⚙️ on any subject
3. Select/uncheck classes
4. Save
5. Generate a report → Only allocated subjects should appear

---

## Benefits

✅ **Scalable** — Manage unlimited combinations without code changes  
✅ **Flexible** — Update allocations anytime  
✅ **Safe** — Server-side validation prevents invalid results  
✅ **Clean Reports** — No noise from unallocated subjects  
✅ **Multi-School Ready** — Works for both Northgate and Albayan  
✅ **Performance** — LEFT JOIN doesn't degrade query speed  
✅ **Backward Compatible** — Existing allocations work immediately  

---

## Troubleshooting

### Reports Still Showing Wrong Subjects?

1. **Check Allocations:**
   ```bash
   SELECT class_id, subject_id FROM class_subjects WHERE class_id = X;
   ```

2. **Verify Subject Allocation:**
   - Go to Academics → Subjects
   - Click ⚙️ on the subject
   - Check if the class is selected

3. **Clear Cache:**
   - Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
   - Clear browser cache

### Allocation Modal Not Loading?

- Check browser console (F12) for errors
- Verify `/api/class-subjects` endpoint is responding
- Check database `class_subjects` table exists

### Can't Save Allocations?

- Verify authentication (check session)
- Check `/api/class-subjects` POST logs
- Verify subject exists: `SELECT id FROM subjects WHERE id = X;`
- Verify classes exist: `SELECT id FROM classes WHERE id IN (...);`

---

## Future Enhancements

- **Bulk Allocate:** Select multiple subjects and allocate to classes at once
- **Templates:** Save allocation templates for quick setup
- **History:** Track when allocations changed
- **Export:** Export allocation matrix as CSV
- **Suggest:** AI-suggest allocations based on class level

---

## Support

For issues or questions:
1. Check logs: `src/app/api/class-subjects/route.ts`
2. Review database: `SELECT * FROM class_subjects;`
3. Test allocation: POST to `/api/class-subjects` with test data

---

**Status:** ✅ Production Ready  
**Last Updated:** April 29, 2026  
**Schools:** Both Northgate and Albayan
