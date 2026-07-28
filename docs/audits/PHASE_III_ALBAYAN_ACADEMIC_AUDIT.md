# Phase III — Albayan Academic Intelligence & Integrity Audit

**Report Engine Patch Program, Phase III.** Read-only investigation against live
production data. **No code or data was changed in this phase** — findings below
are documented for review; only genuinely trivial, zero-risk items already
shipped in Phases I/II are noted as such.

- **School:** ALBAYAN QURAN MEMORIZATION CENTRE NURSARY AND PRIMARY SCHOOL
  (school_id 8002, short_code AQMC)
- **Most recent *completed* term:** Term 1, 2026 (id 30005, ended 2026-05-18).
  Term II (id 300004) is currently active and was deliberately excluded — it
  isn't finished yet.
- **Structure discovered:** Albayan runs a **dual curriculum** — an
  English-medium secular track (BABY/MIDDLE/TOP CLASS, PRIMARY ONE–SIX) and a
  parallel Arabic-medium Quran/theology track (الروضة, صف الأول–الخامس). A
  student can be enrolled in both simultaneously; this is intentional given
  the school's name and mission, not a data error.
- **Dataset analyzed:** `class_results` rows for term 30005, `result_type_id = 1`
  ("End of term") — the largest, most complete assessment record for the term:
  **3,334 subject-results, 411 distinct students, 16 classes** (of 17 classes
  with any Term 1 data — see Finding 2).

---

## 1. Snapshot Accuracy — the completed term was never fully reported

**Only one `report_snapshots` row exists for term 30005** (id 30009), and its
metadata says `resultTypeName: "MID TERM"`, `sourceCounts: { classes: 5,
students: 250 }`. The End-of-Term dataset analyzed in this audit — 16 classes,
411 students, the actual final academic record for the term — **has never been
rendered into a snapshot**.

**Impact:** if a parent or administrator today asks "show me this student's
Term 1 report," the only snapshot on file reflects a mid-term checkpoint
covering half the school, not the final result. The class/subject/division
analysis in this document is the first time the completed term's real
End-of-Term data has been looked at as a whole.

**Recommendation:** generate an End-of-Term snapshot for term 30005,
`result_type_id = 1`, before this term is considered closed for reporting
purposes. This is an operational action for the school/founder, not a code
change — DRAIS's generation pipeline handles it once triggered.

---

## 2. Data completeness — MIDDLE CLASS has zero End-of-Term records

`class_results` has **no rows at all** for MIDDLE CLASS (the English-medium
nursery middle class, ~20 students) under `result_type_id = 1` for term 30005.
Every other class (16 of 17) has End-of-Term data; MIDDLE CLASS does not.

**Impact:** these ~20 students have no final Term 1 academic record in the
system — not incomplete, entirely absent.

**Recommendation:** confirm with the school whether MIDDLE CLASS's Term 1
end-of-term assessment was administered and, if so, get it entered. This
audit cannot tell whether the assessment happened and wasn't recorded, or
didn't happen.

---

## 3. Teacher attribution query — filters by "now," not by the report's term

**This is the most significant architectural finding.**

`fetchResultsForGeneration` (`src/lib/snapshots/queries.ts:241-274`) resolves
`teacher_name`, `teacher_initials`, and `teachers_all` via a correlated
subquery against `class_subjects`, filtered by:

```sql
(cs2.valid_from IS NULL OR cs2.valid_from <= CURRENT_TIMESTAMP)
AND (cs2.valid_to IS NULL OR cs2.valid_to > CURRENT_TIMESTAMP)
```

The inline comment directly above this code says:

> *"Phase D: time-filter allocation by term start_date so past snapshots pick
> the teacher who was allocated at that time."*

**The comment and the code disagree.** The SQL compares against
`CURRENT_TIMESTAMP` — the moment the query runs — never against the report's
own `term_id` date range. So a report generated *today* for a *past* term
picks whichever teacher happens to be allocated to that class/subject **right
now**, not the teacher who was actually teaching during that term.

**Measured impact (this audit, run 2026-07-28, against Term 1 which ended
2026-05-18):** re-running the exact production query against the 3,334 Term-1
End-of-Term rows, **2,148 rows (64.4%) resolve to no teacher at all** — the
allocation window that was valid during Term 1 has since closed (teachers
were reassigned for Term II) and nothing in the query looks back to Term 1's
own dates. The remaining 35.6% happen to still resolve because those specific
allocations haven't been superseded yet — this will only get worse as more
terms pass and more allocations rotate.

**Recommendation (do not implement in this audit-only phase):** join `terms`
on `cr.term_id` and change the filter to an **overlap check against the
term's own `start_date`/`end_date`** (e.g. `cs2.valid_from <= t.end_date AND
(cs2.valid_to IS NULL OR cs2.valid_to > t.start_date)`), matching what the
comment already claims. This affects every school, not just Albayan — it's
the shared query every snapshot generation call uses. Recommend a **patch**
release once implemented, with a regression test asserting that regenerating
an OLD term's snapshot after a teacher reassignment still attributes the
original teacher.

---

## 4. Grading data hygiene — `class_results.grade`/`remarks` are unpopulated

Every one of the 3,334 End-of-Term rows has `grade = NULL` and `remarks =
NULL` in the database; only `score` is stored. This is **not a rendering
bug** — `src/lib/snapshots/generator.ts` already derives the grade from score
via `applyGradingScale()` at generation time (confirmed: Albayan has no
custom grading-scale override in `settings`, so the DRAIS default scale in
`src/lib/drce/defaults.ts` applies, and every derived grade in this audit
matched what a report would show).

**Why it's still worth flagging:** any *other* consumer of `class_results`
that reads `grade` directly (an export, an external integration, a future
report path that doesn't go through the generator) would see nulls. The
grade should arguably be persisted at entry/import time rather than derived
only at render time, so `class_results` is self-describing.

---

## 5. Grade-level performance decline — real, not a data artifact

Class averages (End-of-Term, this audit's dataset) **decline steadily with
grade level in BOTH curriculum tracks**:

| English track | Avg | | Arabic/theology track | Avg |
|---|---|---|---|---|
| PRIMARY ONE | 72.4 | | صف الأول | 77.0 |
| PRIMARY TWO | 64.6 | | صف الثاني | 69.0 |
| PRIMARY THREE | 58.4 | | (صف الثالث, mixed cohort) | 79.3 |
| PRIMARY FOUR | 52.9 | | صف الرابع | 40.4 |
| PRIMARY FIVE | 48.7 | | صف الخامس | 33.2 |
| PRIMARY SIX | 51.6 | | | |

Verified this is **uniform across every subject within each class** (not one
bad subject dragging an average down) — e.g. PRIMARY FIVE's five subjects
all sit in the 41–55 range; صف الخامس's four subjects all sit in the 28–38
range. This rules out a subject-specific data problem and points to a
genuine cohort-level pattern.

**This is an educational-intelligence finding for school leadership, not a
software defect.** Possible explanations (a pedagogical judgment call, not
mine to make): curriculum difficulty escalating faster than support scales,
compounding learning gaps carried forward from earlier grades, or a grading
culture that is stricter in senior classes. Recommend the school's academic
leadership review PRIMARY FOUR–SIX and صف الرابع–الخامس specifically —
consistently the lowest-performing bands across every subject.

---

## 6. Zero-score records — likely "not assessed," recorded as failure

Four students in صف الثاني have a subset of their Arabic-track subjects
recorded with an explicit score of **0** (not null, not missing — a real
stored zero), verified precisely by `(class_id, student_id)`:

- NAKATO SHIFRAH — الفقه=0, TARBIYAH=0
- MUSENZE HANANI — TARBIYAH=0, القرآن=0
- KATO HUSSEIN — القرآن=0
- HANSAN YUSUF KIREMA — الفقه=0, اللغة=0, TARBIYAH=0, القرآن=0

**Why this matters:** DRAIS has no way to distinguish "this student sat the
exam and scored zero" from "this student was never assessed and 0 was used
as a placeholder." A genuine zero and an absent assessment currently render
identically — as an F9 and a division-crushing aggregate hit. If any of
these four were absent rather than failing, their report and division are
wrong through no fault of the grading logic.

**Recommendation:** confirm with the school whether these four sat the
Arabic-track assessment. If a recurring situation across terms, consider
letting `class_results.score` be nullable-with-reason (e.g. `ABSENT`,
`EXEMPT`) distinct from a stored `0`, and excluding "not assessed" rows from
aggregate/division computation rather than counting them as F9.

---

## 7. Division / grade distribution (non-nursery, n = 629 subject-enrollments)

| Division | Count | % |
|---|---|---|
| Division I | 323 | 51.4% |
| Division II | 219 | 34.8% |
| Division III | 33 | 5.2% |
| Division IV | 34 | 5.4% |
| Division U | 20 | 3.2% |

Internally consistent — counts sum exactly to n. Overall subject-grade
distribution (n = 3,334): D1 639, D2 480, C3 506, C4 400, C5 402, C6 163, P7
171, P8 108, F9 465 (13.9% F9 rate at the individual-subject level, before
aggregation).

**Aggregate/division math verified against the renderer by code audit** (not
just this dataset): `computeAggregateFromGrades`/`computeDivision`
(`canonical-report-engine.ts`, used by the generator) and
`calculateAggregateFromResults`/`calculateDivisionFromAggregate`
(`assessmentUtils.ts`, used by the live renderer via
`computeAssessmentRawValues`) share the **identical** grade-point map
(`DEFAULT_GRADE_POINT_MAP` is imported directly, not duplicated) and
**identical** division thresholds (`[12, 24, 28, 32]`, same labels). A
Division shown in a printed report can never disagree with the aggregate
next to it — this was the exact class of bug in the 2026-07 division
postmortem, and it is now structurally prevented (also reused directly by
Phase II's Intelligent Comment Engine, which resolves comments from this same
math).

---

## 8. Promotion decisions — none have been made for a term that's over

**All 411 students' `promotion_status` is `pending`** — not one has been
marked promoted, retained, or otherwise decided, for a term that ended over
two months ago (2026-05-18). No case of a student being promoted despite a
failing average was found — but only because *no* promotion decisions exist
yet to check.

**Recommendation:** this is an operational gap, not a bug — but it's exactly
the kind of thing a founder-independent system should surface proactively
rather than leave silent. Consider a dashboard/digest nudge: "Term 1 ended
10 weeks ago; 0/411 students have a promotion decision recorded."

---

## 9. Best / worst performers (non-nursery, by class-scoped average)

- **Top:** NAQIYYU YUSUF (صف الأول, 96.8), BABIRYE FARIDA (صف الأول, 96.0),
  GAALI FARAHAT (PRIMARY THREE, 95.8).
- **Lowest genuine averages** (excluding the zero-score cases in Finding 6,
  which are likely non-assessment, not failure): KAKAIRE IMRAN (PRIMARY
  FIVE, 7.4), ISMAEL AZED SOWED (PRIMARY FIVE, 8.2), MUTESI RAHMAH (PRIMARY
  FOUR, 12.6).
- **Overall failure rate:** 69/629 (11.0%) non-nursery student-class
  enrollments have an overall average in the F9 band (<35).

---

## 10. Teacher performance (where attribution resolves — see Finding 3 caveat)

Because 64.4% of rows currently fail to attribute a teacher (Finding 3), this
breakdown is **partial and should not be treated as a reliable teacher
ranking** until that query is fixed:

| Teacher | Rows | Avg score |
|---|---|---|
| WAFULA ANTHONY | 49 | 67.2 |
| KYAMUNNO LAILAH | 174 | 66.5 |
| NANDEGO SHARIFAH | 173 | 64.0 |
| STELLA APIO | 114 | 54.4 |
| OKURUT HAKIM | 52 | 53.6 |
| KAGOYA ZAUJAH | 73 | 52.0 |
| KATALEMWA MUSA | 62 | 51.4 |
| NABIKAMBA PETER | 114 | 50.4 |
| NAMUKOSE ZAUJAH | 52 | 49.9 |
| MATOVU NASSER | 236 | 48.2 |
| KICHOPI FRANK | 49 | 43.2 |

This spread (43.2–67.2 average) is plausible and not itself alarming, but a
reliable teacher-performance view genuinely requires Finding 3 to be fixed
first — right now 2 out of every 3 subject-results can't even be attributed
to a teacher.

---

## 11. Not performed in this pass (recommended follow-ups)

- **Attendance correlation** — not computed. Would require joining
  `daily_attendance`/`attendance_daily_aggregates` for the Term 1 window per
  student and correlating with average score. Worth doing once Finding 1 is
  resolved (a real snapshot to correlate against) and as a distinct pass
  given its own data-quality questions.
- **Multi-term trend analysis** (declining/improving subjects over time) —
  not performed; only one prior term (Term III 2025, id 30004) exists before
  Term 1, and no snapshot exists for it either (would need the same raw-data
  approach as this audit). Recommend as a follow-up once Finding 1's gap is
  closed going forward.
- **Cross-tenant/DRCE-consistency spot-checks beyond Albayan** — this audit
  is scoped to Albayan per the brief; Findings 1, 3, 4 are architectural
  (shared code paths) and very likely apply to every school on the platform,
  not just Albayan.

---

## Summary — answering the brief's validation questions

| Question | Answer |
|---|---|
| Grades match percentages? | Yes — every derived grade in this dataset matches the DRAIS default scale (no custom override). |
| Divisions match aggregates? | Yes, structurally guaranteed — generator and renderer share one grade-point map and one threshold set (verified by code audit). |
| Aggregates exclude electives/IRE where configured? | Yes — `isContributingSubject` excludes IRE by name and restricts to principal/core/primary/theology/islamic/religion types; applied correctly in this analysis. |
| Subject totals equal report totals? | N/A discrepancy found — no report totals exist to compare against yet (Finding 1). |
| Snapshots equal current calculations? | **No** — no End-of-Term snapshot exists for the completed term at all (Finding 1). |
| Positions correctly ranked? | Not independently re-verified in this pass (would require reimplementing `rankStudents`); no evidence of a ranking defect found. |
| Promotion decisions correct? | **None exist** to be correct or incorrect (Finding 8). |
| Comments match learner performance? | Fixed in Phase II (this program) — comments are now rule-driven from real performance, not static text. |
| DRCE rules respected? | Yes for totals/comments (Phases I–II, code-verified); teacher attribution (Finding 3) is the one place a shared query does NOT do what its own documentation claims. |

**Bottom line:** Albayan's actual grading math is sound and internally
consistent — the real risks are **operational/pipeline gaps** (no
end-of-term snapshot, one class with no data, promotions never decided) and
**one genuine, fixable architectural bug** (teacher attribution ignoring the
report's own term) that very likely affects every school on the platform,
not just Albayan.
