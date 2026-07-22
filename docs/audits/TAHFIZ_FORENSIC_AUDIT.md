# DRAIS Tahfiz Engine — Forensic Audit & Real-World Islamic Education Model

**Audit only. No code, no migrations, no implementation.** Grounded in the live DRAIS codebase + schema (read-only) and real-world Quran-memorization practice.

---

## 0. CURRENT DRAIS TAHFIZ SYSTEM MAP (forensic)

### 0.1 What exists (surface)
- **10 tables:** `tahfiz_books`, `tahfiz_groups`, `tahfiz_group_members`, `tahfiz_plans`, `tahfiz_portions`, `tahfiz_records`, `tahfiz_evaluations`, `tahfiz_results`, `tahfiz_seven_metrics`, `tahfiz_attendance`.
- **24 API routes** under `/api/tahfiz/*`: books, groups, group-members, plans, portions (+`/history`, +`/present`), records, results, students, learners, teachers, init, reports (+`/list`, +`/comprehensive`).
- **12 pages** under `/app/tahfiz/*`: overview, books, groups, learners, students, plans, portions, records, results, attendance, reports, reports/[id].
- **RBAC:** full `tahfiz.*` permission set (overview/records/books/portions/groups/plans/results/reports — view/manage).
- **Nav:** a `Tahfiz` module group gated by `requiredModules:['tahfiz']`.

### 0.2 What actually works / is used
- **Almost nothing is in production use.** Row counts: every table is **empty** except `tahfiz_groups` (1 row). The engine is built but dormant — the same "code shipped, never adopted" pattern seen with the parent portal.
- The **real** theology/Quran teaching currently runs through the **academic system**, not this engine: `students.theology_class_id` is set on **348 learners**, taught via `classes`/`enrollments`/`results` and surfaced through **Theology Report Cards (DRCE)** — entirely parallel to `tahfiz_*`.

### 0.3 Partially implemented
- `tahfiz/portions` carries BOTH a generic model (`portion_text`, `portion_unit`) AND a half-built Quran model (`surah_name`, `ayah_from/to`, `juz_number`, `page_from/to`) — neither validated nor backed by reference data.
- `reports/comprehensive` joins `tahfiz_group_members`, `tahfiz_attendance`, `tahfiz_portions`, `tahfiz_evaluations`, `tahfiz_books` — all empty, so it returns hollow output.
- `portions/[id]/present` + `tahfiz_records` hint at a daily-presentation flow, but `records` stores only `presented`, `presented_length`, `retention_score`, `mark` — no lesson typology.

### 0.4 Duplicated / contradictory
- **Two learner endpoints:** `/api/tahfiz/learners` and `/api/tahfiz/students` both operate on the canonical `students` table. Nav points to `/tahfiz/students`; `/tahfiz/learners` is an orphan duplicate.
- **THREE competing scoring models, none reconciled:**
  1. `tahfiz_records` → `retention_score`, `mark`, `rating`, `score`
  2. `tahfiz_evaluations` → 4 metrics (retention, tajweed, voice, discipline)
  3. `tahfiz_results` + `tahfiz_seven_metrics` → 7 metrics (fluency, accuracy, tajweed, consistency, participation, attitude, improvement)
- **Assignment duplicated:** `tahfiz_plans` (class/stream/group template) overlaps `tahfiz_portions` (per-student assignment), with two unit vocabularies (`portion_unit` vs Quran columns).

### 0.5 Dead / dangerous
- 🔴 **`DELETE /api/tahfiz/learners/[id]` runs `DELETE FROM students …`** — a hard delete of the *canonical* student record from inside the Tahfiz module. Data-loss landmine.
- 🔴 **Parallel attendance silo:** `tahfiz_attendance` is wholly disconnected from the canonical biometric `attendance_records` engine (the `attendance_records` text in Tahfiz code is just a *column alias* over `tahfiz_attendance`). Two attendance truths.
- 🟠 **No soft-delete** on 9 of 10 tables (only `tahfiz_results` has `deleted_at`) — inconsistent with the rest of DRAIS's lifecycle model.
- 🟠 `tahfiz/init` seeds **no Quran reference data** (no 114 sūrah / 30 juzʾ / 60 ḥizb / 604 pages); `tahfiz_books` is empty.
- 🟠 No promotion logic, no certification/ijāzah model, no report-card integration (report cards/DRCE **do not read** any `tahfiz_*` table).

### 0.6 Missing (high level)
Quran reference model; lesson typology (sabaq/sabqī/manzil); halaqah depth; revision scheduling; mistake capture; completion/ijāzah; canonical-attendance link; report-card integration; promotion; parent-portal exposure of Tahfiz.

---

## 1. REAL-WORLD TAHFIZ EDUCATION MODEL

How genuine institutions operate (Uganda madāris, Saudi/Madinah ḥalaqāt, Egyptian/Azhari maqāriʾ, Sudanese khalāwī, mosque maktabs, modern boarding ḥifẓ schools):

- **Daily three-part cycle** (near-universal):
  - **Sabaq (سبق)** — the *new* lesson memorized today.
  - **Sabqī (سبقي)** — *recent* memorization under consolidation (last ~7–30 days).
  - **Manzil (منزل)** — *old* memorized portion kept alive by long-cycle revision (the whole accumulated ḥifẓ).
- **Halaqah (حلقة)** = a teacher-led circle, **not a class**: grouped by level/stage, sometimes gender, age, program, or time slot; a teacher runs one or more; supervisors (mushrif) oversee many.
- **Assignment** is a *portion* (ayah/page/sūrah/ḥizb/juzʾ range) sized to the learner's capacity, not a fixed class syllabus.
- **Evaluation** is oral, per presentation: the teacher listens and records **mistakes** (ghalaṭ), prompting (talqīn), tajwīd errors, fluency, and a quality judgement. Common scales: number of mistakes, "passed/repeat," or a graded mark.
- **Progression** is individual and continuous (learner-paced), gated by **quality of revision**, not the calendar. Weak manzil blocks new sabaq.
- **Certification:** completing a juzʾ, then the full muṣḥaf, then a **khatm**; formal mastery is an **ijāzah** (often with sanad) after rigorous full-Quran testing.
- **Attendance is existential:** missed days break the revision chain; absence directly stalls progression and is reviewed by supervisors. (DRAIS's biometric attendance is a strong asset here — but the Tahfiz engine ignores it.)
- **Quality metrics used in practice:** accuracy (mistake count), tajwīd, fluency/speed, retention (manzil strength), consistency/attendance, and adab/attitude.

**Implication for DRAIS:** the system must be **learner-paced, halaqah-centric, portion-based, revision-aware, and mistake-driven** — DRAIS today is class/results-centric and has none of the revision/mistake machinery.

---

## 2. BOOK / LEARNING-MATERIAL TAXONOMY

The current `tahfiz_books(total_units, unit_type)` is too flat. A correct taxonomy needs a **structure type** per book:

- **TYPE A — Qur'an (hierarchical, multi-addressable):** 114 sūrah · 30 juzʾ · 60 ḥizb · 240 rubʿ al-ḥizb · 604 pages (Madinah muṣḥaf) · ayāt (per sūrah) · lines (15/page Madinah). A portion may be addressed by **any** of: ayah-range, page-range, sūrah-range, ḥizb-range, juzʾ-range — and these must inter-convert. Needs **reference data** (sūrah list with ayah counts, juzʾ/ḥizb/page boundaries).
- **TYPE B — Yassarnā al-Qur'ān (linear primer):** lessons → pages → subsections; **no** sūrah/juzʾ/ayah semantics. A simple ordered-lesson model.
- **TYPE C — Shāṭibiyyah (didactic poem):** abyāt (verses) grouped into abwāb (chapters)/sections; addressed by verse-number ranges.
- **TYPE D — Generic ordered text** (other mutūn: Tuḥfah, ʿAqīdah, fiqh primers): chapters/sections/lines or just ordered units.

**Conclusion:** model a **book structure-type enum** + a generic **addressable-unit** scheme, with Qur'an as a specialized, reference-data-backed case — never assume "every future book is Qur'an-shaped," and never assume "chapter→page" either. DRAIS currently does neither cleanly (it half-hardcodes Qur'an onto a generic portions table).

---

## 3. LEARNER LIFE-CYCLE MODEL

Real institutions span all of these; DRAIS must represent the learner's **academic track** and **tahfiz track** as **independent, composable enrollments**:

| Model | Description | DRAIS today |
|---|---|---|
| A | Academic only, no Tahfiz | ✅ works (standard enrollment) |
| B | Academic **+** Tahfiz simultaneously | ⚠ partial: `theology_class_id` exists but Tahfiz engine unlinked |
| C | **Tahfiz only** (no academic curriculum) | ❌ DRAIS assumes an academic class/enrollment; a pure-ḥifẓ learner has no clean home |
| D | Tahfiz + Secondary | ⚠ as B |
| E | Tahfiz + Primary | ⚠ as B |
| F | Hybrid institution (some in Tahfiz, some not) | ⚠ module toggle exists but per-learner opt-in is ad hoc |

**Failure:** DRAIS binds a learner's identity to an academic `enrollment` (class/stream/term). Tahfiz participation is not a first-class enrollment; it's bolted via `tahfiz_group_members` with no term/year/status lifecycle, no promotion, and a dangerous delete path. Pure-Tahfiz learners (Model C) and clean dual-track learners (B/D/E) are not properly modeled.

---

## 4. HALAQAH MODEL

A halaqah ≠ a class. The real entity is multi-dimensional:

- **Identity dimensions:** teacher · level/stage (e.g. juzʾ 1–5, 6–15, 16–30, murājaʿah, ijāzah) · program (ḥifẓ vs nāẓirah/qirāʾah) · gender · age band · time slot (fajr/ʿaṣr/boarding evening) · specialization (qirāʾāt, tajwīd).
- **Membership is fluid:** learners **move between halaqāt** as they advance or as levels rebalance — this requires **membership history** (joined/left/reason), which DRAIS lacks (`tahfiz_group_members` has `joined_date`/`status` but no movement history or level semantics).
- **Supervision:** a **mushrif/supervisor** oversees many halaqāt; needs cross-halaqah dashboards and comparison.
- **Operations:** per-halaqah daily attendance, daily presentation logging, performance comparison across halaqāt, teacher workload.

**Current state:** `tahfiz_groups(name, teacher_id, notes)` is a thin stub — none of the dimensions, no supervisor role, no movement history, no level/stage. Adequate for a single small circle; collapses for a real institution.

---

## 5. MEMORIZATION ENGINE MODEL

The heart of the system, and DRAIS's biggest gap. A faithful engine needs:

- **Lesson typology** per presentation: `sabaq` (new), `sabqī` (recent revision), `manzil` (old revision), plus `repeat`, `test`. DRAIS has a freeform `type` varchar that the records insert path doesn't even populate.
- **Portion addressing** (from §2) with auto-conversion (pages⇄ayāt⇄juzʾ) and "expected vs presented" length.
- **Mistake capture:** count + type (ghalaṭ ḥifẓ, tajwīd, talqīn/prompt, waqf) — the primary real-world signal. **Absent in DRAIS.**
- **Quality scoring** rolled up from presentations: accuracy (mistakes), tajwīd, fluency/speed, retention (manzil strength), consistency (attendance-linked), attitude. DRAIS has three *disconnected* metric tables and no roll-up.
- **Revision scheduling:** sabqī/manzil cycles (weekly/monthly), "due for revision," spaced-repetition style queues, weak-portion flags. **Absent.**
- **Progression state per learner:** current sabaq position, furthest point reached, total memorized (juzʾ/pages), revision debt. DRAIS stores a manual `juz_completed` int with no derivation.
- **Lifecycle outcomes:** missed/repeated/failed lesson handling; completion (khatm); **certification/ijāzah** record with examiner + sanad. **Absent.**
- **Cadence rollups:** daily → weekly → monthly → term → annual → completion. DRAIS has term `tahfiz_results` only, manually entered.

**Verdict:** DRAIS has *scoring tables* but **no memorization engine** — no lesson typology, no mistakes, no revision scheduling, no derived progression, no certification.

---

## 6. REPORTING MODEL

Needed (and where DRAIS stands):

| Report | Real-world need | DRAIS today |
|---|---|---|
| Daily presentation slip | teacher/parent: today's sabaq + mistakes + mark | ❌ (records empty, no slip) |
| Weekly/Monthly progress | portions done, revision strength, attendance | ⚠ route exists, empty data |
| Term report | juzʾ/pages, quality, rank in halaqah | ⚠ `tahfiz_results` manual |
| Annual report | yearly memorization + retention | ❌ |
| Completion / Khatm | full-Quran verification | ❌ |
| **Ijāzah** report | examiner, sanad, date | ❌ |
| Teacher report | learners, output, attendance | ❌ |
| Halaqah report | circle performance + comparison | ⚠ comprehensive route, hollow |
| Institution report | multi-halaqah KPIs | ❌ |
| **Parent report** | child's daily/periodic ḥifẓ | ❌ (Tahfiz not exposed in `/parent`) |

**Crucial gap:** Tahfiz progress reaches **neither the report cards (DRCE) nor the parent portal**. Parents of ḥifẓ learners see nothing.

---

## 7. UI / UX FORENSIC REVIEW

(12 pages exist; data empty, so this assesses workflow design.)
- **Teacher data-entry speed** — the make-or-break for adoption. Real halaqah logging must be **one screen, one learner-row per tap**, with last-position pre-filled and mistake +/- steppers. Current `records`/`portions` pages are CRUD forms, not a fast daily-presentation roster → too many clicks per learner.
- **No daily "halaqah register" workflow** (the single most-used screen in a real Tahfiz school): pick halaqah → see all learners → log sabaq/sabqī/manzil + mistakes + mark inline.
- **Supervisor experience** — no multi-halaqah dashboard / comparison.
- **Parent/mobile** — no Tahfiz surface in `/parent`; nothing mobile-optimized for teachers logging on a phone in the circle.
- **Duplication confusion** — `/tahfiz/learners` vs `/tahfiz/students` pages.
- **Reports** open but render empty; no quick actions (assign next portion, mark revision done, flag weak portion).

---

## 8. SCALABILITY AUDIT

- **100–500 learners:** current model likely *functions* once populated, but the missing halaqah/level model and manual results make it laborious.
- **2,000+ learners / 100 teachers / 500 halaqāt:** breaks on:
  - **No halaqah level/movement model** → can't organize or rebalance circles.
  - **Daily presentations** at scale = millions of `tahfiz_records` rows with **no soft-delete, no partitioning strategy, freeform `type`/`portion_text`** → reporting joins over empty/!indexed columns won't hold.
  - **Three scoring tables** → ambiguous source of truth, expensive multi-join reports (the `comprehensive` route already 5-way LEFT JOINs).
  - **Parallel attendance silo** → double data entry, reconciliation pain; biometric attendance (already at scale) is wasted.
  - **No derived progression** → every report recomputes from raw rows.
- **Multi-campus / hybrid:** halaqah has no campus/branch scoping beyond `school_id`; supervisor cross-campus views absent.

---

## 9–12. SYNTHESIS

### 10. Missing features (consolidated)
Quran reference model (sūrah/juzʾ/ḥizb/rubʿ/page/ayah/line + conversions) · book structure-type taxonomy · sabaq/sabqī/manzil lesson typology · mistake capture · revision scheduling & weak-portion queue · derived learner progression (memorized total, revision debt) · halaqah level/stage/program/gender/time-slot + **membership history** · supervisor role + dashboards · certification/khatm/**ijāzah** · canonical-attendance integration · report-card (DRCE) integration · parent-portal Tahfiz views · promotion logic · fast daily halaqah register UI · Tahfiz-only learner enrollment (Model C).

### 11. Architectural risks (ranked)
1. 🔴 `DELETE /tahfiz/learners` hard-deletes canonical `students` — **data-loss landmine**.
2. 🔴 **Two attendance systems** (`tahfiz_attendance` vs biometric `attendance_records`) — conflicting truth, wasted biometric asset.
3. 🔴 **Three overlapping scoring models** — no single source of truth; reports ambiguous.
4. 🟠 **Quran half-modeled** on a generic portions table — wrong/unvalidated addressing.
5. 🟠 **Engine dormant** (all tables empty) while real teaching runs in the academic system → risk of building atop something unproven/abandoned.
6. 🟠 No soft-delete/lifecycle on 9/10 tables; no membership history; no derived state.
7. 🟠 Learner identity tied to academic enrollment → Model C (pure Tahfiz) unsupported.

### 12. Recommended implementation phases (audit recommendation — not built here)
- **P1 — Decide & de-risk:** pick ONE scoring/source-of-truth model; remove the dangerous `students` delete; deprecate the duplicate `learners` route; decide "extend vs rebuild." Make Tahfiz participation a **first-class enrollment** (supports Models B–F incl. pure Tahfiz).
- **P2 — Quran reference + book taxonomy:** seed sūrah/juzʾ/ḥizb/rubʿ/page/ayah reference data; introduce book structure-types (A–D); portion addressing + conversions.
- **P3 — Memorization engine:** sabaq/sabqī/manzil typology + mistake capture + quality roll-up + derived progression; **link to biometric attendance** (retire the silo).
- **P4 — Halaqah model:** levels/stages/program/gender/time-slot + membership history + supervisor role + dashboards/comparison.
- **P5 — Revision scheduling:** sabqī/manzil cycles, due-for-revision queue, weak-portion flags.
- **P6 — Reporting + integration:** daily slip → term/annual → khatm/ijāzah; wire into DRCE report cards **and** the `/parent` portal.
- **P7 — Fast UI:** the daily halaqah register (one-tap per learner) + supervisor dashboard + mobile.
- **P8 — Scale hardening:** indexing/partitioning for daily records, soft-delete/lifecycle, multi-campus halaqah scoping.

**Bottom line:** DRAIS has a *scaffold* of Tahfiz tables/routes/pages but **not a Tahfiz engine** — it's dormant, internally duplicated, Quran-naïve, attendance-siloed, and disconnected from report cards and parents, while the real theology teaching quietly runs through the academic system. The recommended path is to consolidate to one model, make Tahfiz a first-class enrollment, seed real Quran structure, and build the memorization/revision engine on top of the (already strong) biometric attendance — **before** any new pages are designed.
