# Dashboard API Analysis
_Generated: 2026-04-17_

## Routes Scanned
- `/api/dashboard/route.ts`
- `/api/dashboard/overview/route.ts`
- `/api/dashboard/intelligence/route.ts`
- `/api/dashboard/health/route.ts`
- `/api/dashboard/recommendations/route.ts`
- `/api/dashboard/admissions-analytics/route.ts`
- `/api/dashboard/duplicates/route.ts`

---

## What Is Computed

### `/api/dashboard/overview`
- Total students, staff, parents, classes
- Gender breakdown
- Admissions timeline (today / last 7d / last 30d)
- Payment stats (paid / partial / overdue)
- Best/worst performing student (by AVG score, all-time, no term filter)
- Current term progress (days remaining)
- Today's attendance count
- Active biometric device count

### `/api/dashboard/intelligence`
- Today attendance counts
- 7-day and 30-day attendance trend arrays
- At-risk students list (based on recent attendance absence patterns)
- Class breakdown by attendance
- Gender breakdown by attendance
- Device stats

### `/api/dashboard/health`
- System health signals (devices, data integrity)

---

## What Is Static / Generic

❌ **No historical performance trend** — "best learner" is just `MAX(score)` all time, ignores term sequence  
❌ **No term comparison** — cannot tell if Term II was better or worse than Term I for any student  
❌ **No subject-level drill-down** — no "Math is consistently the weakest subject" logic  
❌ **No behavioral classification** — no "silent struggler" or "high performer" labels  
❌ **No prediction** — scores shown as static snapshots, not trajectories  
❌ **Performance query ignores term context** — `AVG(score)` from `class_results` with no `WHERE term_id = ?`  
❌ **Attendance intelligence is empty** — `student_attendance` has 0 rows; entire `/intelligence` route returns nulls  
❌ **Duplicate effort** — `/route.ts` and `/overview/route.ts` run nearly identical queries  
❌ **No class-level aggregate insight** — no "Class 7A is declining this term" detection  
❌ **Recommendations route returns generic text** — not computed from real student patterns  

---

## Shallow Metric Examples

```sql
-- Current (shallow):
SELECT AVG(score) FROM class_results -- no term, no trend
SUM(CASE WHEN score > 75 THEN 1) AS improving  -- no context

-- What it should be:
-- Compare Term I avg vs Term II avg per student → detect direction
-- Classify: if T2_avg < T1_avg - 10 → "declining"
```

---

## Gaps Summary
| Gap                        | Impact                           |
|----------------------------|----------------------------------|
| No trend engine            | Can't detect declining students  |
| No term comparison         | Historical data unused           |
| No behavioral labels       | No early warning system          |
| No subject risk detection  | Teachers get no signals          |
| No class-level comparison  | Principals see no class trends   |
| Attendance data absent     | Half of behavioral model missing |
