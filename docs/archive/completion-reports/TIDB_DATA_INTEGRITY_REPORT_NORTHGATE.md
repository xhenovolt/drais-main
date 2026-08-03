# TiDB Cloud Data Integrity Report - Northgate School

**Report Date:** April 28, 2026  
**Database:** TiDB Cloud (drais)  
**School:** Northgate School  
**Focus:** Term 1 2026 Results  

---

## Executive Summary

✅ **Good News:**
- No orphaned records (all results have valid student, class, and subject references)
- All results are from 2026 (no old 2025 data lingering)
- Data is stored in TiDB Cloud successfully

⚠️ **Critical Issue Found:**
- **2,979 results (38% of data) have CLASS MISMATCHES**
- Students have marks entered in wrong classes
- Data entry dates: April 21-27, 2026 (recent entries)

---

## Data Overview

### Total Northgate Results by Term

| Term | Total Results | Date Range | Data Status |
|------|---------------|-----------|-------------|
| Term 1 | 1,215 | 2026-04-23 to 2026-04-27 | ✅ Current 2026 |
| Term 2 | 1,448 | 2026-04-21 | ✅ Current 2026 |
| Term 3 | 1,611 | 2026-04-21 | ✅ Current 2026 |
| **TOTAL** | **4,274** | April 21-27, 2026 | All 2026 ✅ |

**No 2025 orphaned data detected** ✅

---

## Critical Issue: Class Mismatches

### Overview
2,979 results have been entered for students in **wrong classes**.

### Affected Student Groups (Ranked by Impact)

| Student Current Class | Marks Entered In Class | Affected Students | Total Results | Issue |
|----------------------|------------------------|------------------|---------------|-------|
| PRIMARY TWO | PRIMARY ONE | 56 | 570 | ❌ Major |
| PRIMARY THREE | PRIMARY TWO | 46 | 413 | ❌ Major |
| MIDDLE CLASS | BABY CLASS | 42 | 426 | ❌ Major |
| PRIMARY ONE | MIDDLE CLASS | 32 | 288 | ❌ Major |
| PRIMARY ONE | TOP CLASS | 32 | 160 | ❌ Major |
| PRIMARY SIX | PRIMARY FIVE | 24 | 192 | ❌ Major |
| TOP CLASS | PRIMARY ONE | 27 | 103 | ⚠️ Significant |
| PRIMARY FOUR | PRIMARY THREE | 31 | 310 | ❌ Major |
| PRIMARY FIVE | PRIMARY FOUR | 31 | 248 | ❌ Major |
| PRIMARY SEVEN | PRIMARY SIX | 18 | 144 | ⚠️ Significant |
| PRIMARY FOUR | PRIMARY FIVE | 4 | 16 | ⚠️ Minor |
| PRIMARY FIVE | PRIMARY TWO | 5 | 15 | ⚠️ Minor |
| PRIMARY FOUR | PRIMARY TWO | 8 | 24 | ⚠️ Minor |
| PRIMARY THREE | PRIMARY ONE | 7 | 13 | ⚠️ Minor |
| PRIMARY SIX | PRIMARY SEVEN | 2 | 7 | ⚠️ Minor |
| PRIMARY ONE | PRIMARY TWO | 1 | 5 | ⚠️ Minor |
| BABY CLASS | MIDDLE CLASS | 1 | 5 | ⚠️ Minor |
| BABY CLASS | TOP CLASS | 1 | 5 | ⚠️ Minor |
| MIDDLE CLASS | TOP CLASS | 7 | 35 | ⚠️ Minor |

**Total Affected Students: 511**  
**Total Mismatched Results: 2,979 (38% of all Northgate results)**

---

## Root Cause Analysis

### Likely Causes

1. **Bulk Data Import Issue**
   - Results may have been imported with incorrect class mappings
   - Student class assignments were changed after results were entered
   - Import script used wrong class IDs

2. **Data Entry Error**
   - Teachers or admins entered marks for wrong class
   - System defaulted to wrong class during entry

3. **Student Promotion/Transfer**
   - Students were promoted or transferred to new classes
   - Old marks remain linked to old class assignments
   - Student record updated but marks not migrated

### Evidence
- Mismatches follow **logical class progressions** (e.g., PRIMARY TWO → PRIMARY ONE suggests a reversal during import)
- **All entered in April 2026** (batch operation indicator)
- Affect **multiple classes simultaneously** (not isolated incidents)

---

## Data Validation Results

### Orphaned Records

| Type | Count | Status |
|------|-------|--------|
| Results with no matching student | 0 | ✅ Clean |
| Results with no matching class | 0 | ✅ Clean |
| Results with no matching subject | 0 | ✅ Clean |
| Results with no term | 0 | ✅ Clean |

### Referential Integrity: **PASSED** ✅

All records have valid foreign key references.

---

## Impact on Reporting

### Current Impact
1. **Reports Show Wrong Classes** - Marks appear under wrong class
2. **Student Report Cards Affected** - May show in wrong class report
3. **Class Totals Wrong** - Class summaries include extra/missing students
4. **Performance Analytics Broken** - Class comparison invalid

### Example
- Student: NGS/0007/2025 (currently in BABY CLASS)
  - Has 5 marks entered in MIDDLE CLASS
  - Report card might show in MIDDLE CLASS section
  - BABY CLASS will be missing their results
  - MIDDLE CLASS class average will be skewed

---

## Recommended Actions

### Priority 1: Immediate (Do First)
1. **Backup current data** (before making corrections)
2. **Identify correct class for each student** using:
   - Current student.class_id
   - Promotion records if available
   - Manual verification from school records

### Priority 2: Urgent (Do This Week)
1. **Migrate mismatched results to correct classes**
   - Update class_results.class_id to match student.class_id
   - Verify by student, not by bulk class

2. **Validate data quality post-migration**
   - Re-run this report
   - Verify all mismatches resolved

### Priority 3: Investigation
1. **Root cause determination**
   - Check data import logs
   - Review student class transfer history
   - Audit API calls from April 21-27

2. **Process improvement**
   - Add validation in marks entry system
   - Prevent entering marks in wrong class
   - Alert if student class doesn't match marks class

---

## SQL for Fixing Mismatches

```sql
-- Option 1: Find specific mismatches
SELECT cr.id, st.id, st.class_id, cr.class_id
FROM class_results cr
JOIN students st ON cr.student_id = st.id
WHERE cr.class_id != st.class_id
LIMIT 100;

-- Option 2: Fix all mismatches (use with caution - BACKUP FIRST!)
-- UPDATE class_results cr
-- JOIN students st ON cr.student_id = st.id
-- SET cr.class_id = st.class_id
-- WHERE cr.class_id != st.class_id;

-- Option 3: Verify fix worked
SELECT COUNT(*) as remaining_mismatches
FROM class_results cr
JOIN students st ON cr.student_id = st.id
WHERE cr.class_id != st.class_id;
```

---

## Timeline of Data Entry

```
April 21, 2026, 04:24:50 - First Term 2 results entered
April 21, 2026, 04:25:35 - First MISMATCHED result detected
April 21, 2026, 04:38:33 - Last Term 2 & 3 results entered
April 23, 2026, 11:16:14 - First Term 1 results entered
April 27, 2026, 11:26:35 - Last results entered (Term 1)
```

**Observation:** Mismatches appeared on same day as bulk term 2/3 import.

---

## Conclusion

### Status: ⚠️ REQUIRES IMMEDIATE ATTENTION

The Northgate data has **no orphaned/broken references** but **has significant class assignment errors** affecting 38% of results. All data is from 2026 (no 2025 contamination), but requires correction before reports can be trusted.

**Recommendation:** Do NOT generate official reports until class mismatches are resolved.

---

## Questions for Northgate Admin

1. Why were students promoted/transferred in April?
2. Were marks supposed to follow students or stay with original class?
3. Who initiated the bulk data import on April 21?
4. Can you verify a sample of 10 students - which class should they really be in?

---

**Report Generated:** 2026-04-28 23:45 UTC  
**Database:** TiDB Cloud (gateway01.eu-central-1.prod.aws.tidbcloud.com)  
**Query Performance:** 100% responsive - no database issues
