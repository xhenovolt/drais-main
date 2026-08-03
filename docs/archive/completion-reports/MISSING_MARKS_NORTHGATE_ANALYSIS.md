# Missing Marks Analysis - Northgate School

## Summary
The subjects are **NOT missing from the database** - they are properly allocated to classes. However, **marks have not been entered** for certain subjects in **Term 1**.

When a subject has no marks entered for a term, it doesn't appear on the report because there's no data to display.

## Missing Data (Term 1 Only)

| Class | Subject | Issue | Action Required |
|-------|---------|-------|-----------------|
| PRIMARY TWO | LITERACY I | No Term 1 marks entered | Teacher must enter marks for all students |
| PRIMARY TWO | LITERACY II | No Term 1 marks entered | Teacher must enter marks for all students |
| PRIMARY THREE | LITERACY I | No Term 1 marks entered | Teacher must enter marks for all students |
| PRIMARY THREE | LITERACY II | No Term 1 marks entered | Teacher must enter marks for all students |
| PRIMARY FOUR | SOCIAL STUDIES | No Term 1 marks entered | Teacher must enter marks for all students |
| PRIMARY FIVE | ENGLISH | No Term 1 marks entered | Teacher must enter marks for all students |
| PRIMARY SIX | SOCIAL STUDIES | No Term 1 marks entered | Teacher must enter marks for all students |

## Verification

### Subject Allocations (✅ All correct)
- ✅ PRIMARY TWO: ENGLISH, LITERACY I, LITERACY II, MATHEMATICS
- ✅ PRIMARY THREE: ENGLISH, LITERACY I, LITERACY II, MATHEMATICS  
- ✅ PRIMARY FOUR: ENGLISH, SOCIAL STUDIES, MATHEMATICS, Science
- ✅ PRIMARY FIVE: ENGLISH, SOCIAL STUDIES, MATHEMATICS, Science
- ✅ PRIMARY SIX: ENGLISH, SOCIAL STUDIES, MATHEMATICS, Science

### Marks Entered
- ✅ PRIMARY TWO: ENGLISH (Term 1, 2, 3), MATHEMATICS (Term 2, 3), LITERACY I (Term 2, 3), LITERACY II (Term 3 only)
- ✅ PRIMARY THREE: ENGLISH (Term 1, 2, 3), MATHEMATICS (Term 1, 2, 3), LITERACY I (Term 2, 3), LITERACY II (Term 2, 3)
- ✅ PRIMARY FOUR: All subjects in Term 2 & 3, but SOCIAL STUDIES missing Term 1
- ✅ PRIMARY FIVE: ENGLISH missing Term 1 (has Term 2, 3), all others have Term 1
- ✅ PRIMARY SIX: SOCIAL STUDIES missing Term 1 (has Term 2, 3), all others have Term 1

## What This Means for Reports

When a subject has no marks for a term:
1. The subject **cannot display** on the report (no data to show)
2. Teachers must enter marks in the **Marks Entry** section
3. Once marks are entered, the subject will automatically appear on generated reports
4. The allocation system is working correctly - it's just a data entry issue

## Next Steps

1. **Login as School Admin/Teacher** for Northgate
2. Navigate to **Marks Entry** section  
3. For each missing subject/term combination above:
   - Select the class
   - Select the subject
   - Select Term 1
   - Enter marks for all students
   - Save
4. Re-generate reports - subjects should now appear

## Database Queries Used

To verify this yourself:
```sql
-- Check allocations
SELECT c.name, s.name FROM classes c
JOIN class_subjects cs ON c.id = cs.class_id
JOIN subjects s ON cs.subject_id = s.id
WHERE c.school_id = (SELECT id FROM schools WHERE name = 'Northgate');

-- Check marks entered
SELECT c.name, s.name, t.name, COUNT(*)
FROM class_results cr
JOIN classes c ON cr.class_id = c.id
JOIN subjects s ON cr.subject_id = s.id
JOIN terms t ON cr.term_id = t.id
WHERE c.school_id = (SELECT id FROM schools WHERE name = 'Northgate')
GROUP BY c.name, s.name, t.name;
```

---

**Conclusion:** This is not a system issue. The allocation and reporting infrastructure is working correctly. The subjects simply need their Term 1 marks to be entered in the system.
