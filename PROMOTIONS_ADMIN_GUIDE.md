# Promotions System - Complete Implementation Guide

## Overview

This guide documents the complete, production-grade student promotions system for DRAIS with:
- ✅ Optional academic year filtering (show ALL learners by default)
- ✅ Enhanced promotion statuses (promoted, not promoted, demoted, dropped out, completed, pending)
- ✅ Complete audit trail (who, when, why, what class movement)
- ✅ UI trust features (no silent changes, show previews before confirming)
- ✅ Fast server-side filtering and search
- ✅ Bulk promotion with two methods (manual selection + criteria-based)

---

## Admin Workflows

### Workflow 1: View All Learners (Default Behavior)

**Location**: `/promotions`

**What you see**:
- All learners in the system are displayed by default
- No academic year selection required to see students
- Statistics shown: Total, Promoted, Not Promoted, Demoted, Dropped Out, Completed, Pending

**Steps**:
1. Click "Promotions" in sidebar
2. Page loads with ALL students visible
3. Each row shows:
   - Student name
   - Admission number
   - Current class (e.g., "Primary Five")
   - Academic year (if set)
   - Total marks from Term 3
   - Average marks
   - Current status badge (e.g., "Pending")
   - Last updated date

**Example Output**:
```
Amina Okonkwo  | 2025-001 | Primary Five    | 2025  | 287 | 57.4 | Pending       | 2025-02-01
Ahmed Hassan   | 2025-002 | Primary Five    | 2025  | 265 | 53.0 | Promoted      | 2025-01-28
Fatima Ali     | 2025-003 | Primary Five    | 2025  | 234 | 46.8 | Not Promoted  | 2025-01-29
```

---

### Workflow 2: Use Filters to Find Specific Learners

**Use case**: "Show me all promoted students from Primary Five in 2025"

**Steps**:
1. Go to `/promotions`
2. Use the filter bar at the top:
   - **Academic Year (Optional)**: Select "2025"
   - **Current Class (Optional)**: Select "Primary Five"
   - **Promotion Status**: Select "Promoted"
   - **Search (Optional)**: Leave blank or type a name
3. Click outside filter field or wait 1 second
4. Table automatically updates to show matching students

**Important**: All filter fields are optional. You can:
- View all students (no filters)
- Filter by year only
- Filter by class only
- Filter by status only
- Combine any filters

---

### Workflow 3: Search for Individual Students

**Use case**: "Find student Amina quickly"

**Steps**:
1. Go to `/promotions`
2. Type "Amina" in the Search box (top right)
3. Results update in real-time
4. Shows only students with "Amina" in name or admission number

**Search targets**:
- First name
- Last name
- Other names
- Admission number

---

### Workflow 4: Promote a Single Student (Manual)

**Use case**: "Promote Amina from Primary Five to Primary Six"

**Steps**:
1. Filter/search to find Amina
2. Click the checkbox next to her name
3. Her row is highlighted
4. At the bottom of the page, you see: "1 student(s) selected" with a **Promote Selected** button
5. Click **Promote Selected**
6. Confirmation modal appears showing:
   - Current class: "Primary Five"
   - Destination class: "Primary Six"
   - Number of students: 1
   - Confirmation message
7. Click **Confirm**
8. Success message: "Student 2025-001 - PROMOTED"
9. Amina's status changes to "Promoted"
10. Promotion record created with audit trail

---

### Workflow 5: Bulk Promote Multiple Students (Manual Selection)

**Use case**: "Promote all of Ahmed, Fatima, and Zainab to the next class"

**Steps**:
1. Filter to show students you want to promote (e.g., "Primary Five")
2. Click checkboxes next to each student
3. Selection appears at bottom: "3 student(s) selected" 
4. Click **Promote Selected**
5. Confirmation modal shows:
   - "You are about to promote 3 learners to Primary Six"
   - Lists all 3 students with current class (Primary Five)
6. Click **Confirm**
7. Success: "3 students promoted successfully"
8. All 3 now show status "Promoted"

---

### Workflow 6: Promote by Condition (Term 3 Results)

**Use case**: "Promote all students from Primary Five who scored 250+ total marks and 50+ average in Term 3"

**Steps**:
1. Go to `/promotions`
2. Select filters:
   - **Academic Year**: "2025"
   - **Current Class**: "Primary Five"
3. Click **"Promote by Condition (Term 3 Results)"** button
4. Modal appears with criteria fields:
   - Minimum Total Marks: [250]
   - Minimum Average Marks: [50]
   - Minimum Attendance %: [75]
5. Click **Generate Preview**
6. **Preview Modal** shows:
   - **Summary**: 18 eligible, 5 not yet eligible, 23 total
   - **Eligible Students Table**: Shows names, admission numbers, and their scores
   - **Not Yet Eligible Table**: Shows who didn't make it (and which criteria failed)
7. Review the eligible list
8. Click **Confirm Promotion (18 students)**
9. Success: "18 students promoted successfully"
10. Promotion records created for all 18 with audit trail showing criteria applied

---

### Workflow 7: View Promotion History (Audit Trail)

**Use case**: "Who promoted Ahmed? When? For what reason?"

**Steps**:
1. Query the database directly (requires database access):
```sql
SELECT 
  pal.created_at,
  u.name as performed_by,
  p.first_name, p.last_name,
  pal.action_type,
  c1.name as from_class,
  c2.name as to_class,
  pal.criteria_applied,
  pal.reason
FROM promotion_audit_log pal
JOIN students s ON pal.student_id = s.id
JOIN persons p ON s.person_id = p.id
JOIN users u ON pal.performed_by = u.id
JOIN classes c1 ON pal.from_class_id = c1.id
JOIN classes c2 ON pal.to_class_id = c2.id
WHERE p.first_name = 'Ahmed'
ORDER BY pal.created_at DESC;
```

**Output**:
```
2025-02-01 14:32:15 | Admin User      | Ahmed Hassan | promoted | Primary Five → Primary Six | Bulk condition_based | Term 3 marks >= 250
2025-01-20 10:15:42 | Head Teacher    | Ahmed Hassan | not_promoted | Primary Five | Primary Five | Manual correction | Student requested repeat year
```

---

## System Features Explained

### Academic Year is NOW Optional

**Before**: You had to select an academic year to see any students
**After**: Students display automatically, year is optional

This means:
- ✅ Admitted students who haven't been assigned to an academic year still appear
- ✅ Students from past years remain visible
- ✅ No learner is ever "hidden" from view

---

### Promotion Status Explained

| Status | Meaning | Example |
|--------|---------|---------|
| **Pending** | No promotion decision made yet | New students, awaiting results |
| **Promoted** | Student moved to next class | Ahmed: Primary Five → Primary Six |
| **Not Promoted** | Student stays in same class | Zainab: Remains in Primary Five |
| **Demoted** | Student moved to previous class | Faisal: Primary Six → Primary Five (due to poor marks) |
| **Dropped Out** | Student left school | Hassan: Withdrawn from school |
| **Completed** | Student completed final year | Sarah: Completed Primary Seven |

---

### Preview Feature (Critical)

Before ANY promotion (single or bulk), the system shows a preview that displays:

**For Manual Promotion**:
- Number of students selected
- Their names and admission numbers
- Current class
- Destination class
- Request for confirmation

**For Condition-Based Promotion**:
- Criteria being applied (minimum marks, average, attendance)
- How many students qualify (eligible)
- How many don't qualify (ineligible)
- Names and scores of all eligible students
- Reason why ineligible students don't qualify

**Key Point**: Nothing happens until you explicitly click "Confirm"

---

### Audit Trail (Complete Accountability)

Every promotion action is logged with:
- **What**: Student ID, status change (e.g., pending → promoted)
- **When**: Exact timestamp (e.g., 2025-02-01 14:32:15)
- **Who**: User ID who performed promotion
- **Why**: Criteria applied or reason provided
- **How**: Class movement (e.g., Primary Five → Primary Six)

This means:
- ✅ No hidden changes
- ✅ Full accountability
- ✅ Can audit any promotion decision
- ✅ Can see correction history

---

## Powerful Filtering & Search

### Search
- Type a student name (any part) or admission number
- Results update in real-time
- Searches across all students globally

### Filters (All Optional)
- **Academic Year**: Show only students in specific year
- **Current Class**: Show only students in specific class
- **Status**: Show only students with specific promotion status
- **Combine filters**: E.g., "Primary Five" + "Pending" shows all Primary Five students not yet promoted

---

## Understanding the UI

### Statistics Bar (Top)
Shows counts for each status:
```
Promoted: 45    Not Promoted: 12    Demoted: 2    Dropped Out: 3    Completed: 8    Pending: 20
```

This gives you instant overview of promotion readiness.

### Student Table Columns
1. **Checkbox**: Select for manual bulk promotion
2. **Name**: Student's full name
3. **Admission #**: Registration number (for records)
4. **Current Class**: Where student currently is (by NAME, not ID)
5. **Academic Year**: If assigned (can be empty)
6. **Total Marks**: Sum of all Term 3 scores
7. **Average**: Mean of all Term 3 scores
8. **Status**: Current promotion status badge
9. **Last Updated**: When promotion record was last changed

### Action Buttons

**Top Bar**:
- **Promote by Condition**: Opens criteria modal for automatic eligibility check
- **Clear Selection**: Clears all checkboxes

**When Students Selected**:
- **Promote Selected**: Confirms and promotes all selected students

---

## Common Scenarios & Solutions

### Scenario: "I want to see only promoted students"
1. Filter → Status = "Promoted"
2. Table shows only promoted students
3. You can still search/filter by class/year

### Scenario: "Show all students from 2025 who haven't been promoted yet"
1. Filter → Academic Year = "2025", Status = "Pending"
2. Table shows pending students from 2025

### Scenario: "I promoted too many students! How do I undo it?"
1. Check audit log to see who was promoted
2. Manually demote them through UI (set status to "not_promoted" or "demoted")
3. Audit trail records this correction with reason

### Scenario: "I need to promote only honor students (>60% average)"
1. Click "Promote by Condition"
2. Set criteria:
   - Minimum Average: 60
   - Minimum Total: (leave empty or set high)
3. Generate Preview
4. System shows only high-performing students
5. Confirm to promote

---

## Database Queries for Admins

### Get all promotion decisions in a date range
```sql
SELECT 
  p.created_at,
  p.first_name, p.last_name,
  s.promotion_status,
  ay.name as academic_year,
  c.name as class_name
FROM promotions p
JOIN persons p ON s.person_id = p.id
WHERE p.created_at BETWEEN '2025-01-01' AND '2025-02-01'
ORDER BY p.created_at DESC;
```

### Get promotion statistics by class
```sql
SELECT 
  c.name as class_name,
  COUNT(*) as total_students,
  SUM(CASE WHEN s.promotion_status = 'promoted' THEN 1 ELSE 0 END) as promoted,
  SUM(CASE WHEN s.promotion_status = 'not_promoted' THEN 1 ELSE 0 END) as not_promoted,
  ROUND(SUM(CASE WHEN s.promotion_status = 'promoted' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as promotion_rate_percent
FROM students s
JOIN enrollments e ON s.id = e.student_id
JOIN classes c ON e.class_id = c.id
GROUP BY c.id, c.name;
```

---

## API Reference (For Developers)

### GET /api/promotions
Returns all students with promotion data

**Query Parameters** (all optional):
- `school_id`: School ID (default: 1)
- `academic_year_id`: Filter by academic year
- `class_id`: Filter by class
- `status`: Filter by promotion status (promoted|not_promoted|demoted|dropped_out|completed|pending)
- `search`: Search by name or admission number
- `term`: Filter by term (e.g., "Term 3")

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "admission_no": "2025-001",
      "full_name": "Amina Okonkwo",
      "class_name": "Primary Five",
      "promotion_status": "pending",
      "total_marks": 287,
      "average_marks": 57.4,
      "academic_year_name": "2025"
    }
  ],
  "stats": {
    "total": 100,
    "promoted": 45,
    "not_promoted": 12,
    "demoted": 2,
    "dropped_out": 3,
    "completed": 8,
    "pending": 30
  }
}
```

### POST /api/promotions
Promote or change status of a single student

**Required Fields**:
- `student_id`
- `from_class_id`
- `to_class_id`
- `promotion_status` (one of: promoted, not_promoted, demoted, dropped_out, completed, pending)

**Optional**:
- `criteria_used`: JSON with criteria that were applied
- `promotion_reason`: manual|criteria_based|appeal|correction
- `term_used`: Which term (e.g., "Term 3")
- `promotion_notes`: Admin notes
- `promoted_by`: User ID who performed promotion
- `user_ip`: IP address for compliance

### POST /api/promotions/preview
Generate preview of promotion eligibility (no changes made)

**Required**:
- `academic_year_id`
- `from_class_id`
- `to_class_id`
- At least one of: `minimum_total_marks`, `minimum_average_marks`, `attendance_percentage`

**Response**:
```json
{
  "preview": {
    "summary": {
      "total_students": 23,
      "eligible_count": 18,
      "ineligible_count": 5,
      "promotion_percentage": "78.3"
    },
    "eligible_students": [...],
    "ineligible_students": [...]
  }
}
```

### POST /api/promotions/bulk
Promote multiple students at once

**Required**:
- `mode`: "manual" or "condition_based"
- `academic_year_id`
- `from_class_id`
- `to_class_id`

**If Manual**:
- `student_ids`: Array of student IDs

**If Condition-Based**:
- `criteria`: Object with `minimum_total_marks`, `minimum_average_marks`, etc.

---

## Troubleshooting

### "I don't see any students"
1. The system now shows ALL students by default
2. If still no data, check:
   - Database has students records
   - Students aren't all soft-deleted
   - No database connection errors

### "Search isn't working"
1. Try typing just first name (e.g., "Ahmed")
2. Try admission number (e.g., "2025-001")
3. Refresh page and try again

### "Bulk promotion hangs"
1. Check browser console for errors
2. Wait a few seconds (large bulk operations take time)
3. If still hung, check server logs

### "I can't see promoted students"
1. Make sure "Status" filter isn't set to exclude them
2. Try clearing all filters
3. Try refreshing the page

---

## Best Practices

1. **Always Preview First**: Before bulk promoting, always generate preview
2. **Document Decisions**: Use "Promotion Notes" field to explain why promotions/demotions happened
3. **Regular Audits**: Check audit log weekly to ensure integrity
4. **Backup Before Bulk**: If making large bulk changes, backup database first
5. **Test on Sample**: Test condition-based criteria on small sample first

---

**Last Updated**: February 1, 2026
**System Version**: 4.1 (Promotions Enhancement)
**Status**: Production Ready ✅
