# Tahfiz Phase 2 — Book Structure Engine: Reference-Data Preview & Schema Proposal

**STATUS: PREVIEW / PROPOSAL ONLY. Nothing inserted. No migration applied. No TiDB change.**
Awaiting your approval before any seed runs (Phase 2E gate).

Preview data files:
- [quran_reference_preview.json](quran_reference_preview.json) — 114 sūrahs + 30 juzʾ
- [yassarna_reference_preview.json](yassarna_reference_preview.json) — structural template
- [shatibiyyah_reference_preview.json](shatibiyyah_reference_preview.json) — abwāb outline

---

## Religious-accuracy stance (read first)
- The Qur'an dataset here is **machine-proposed and MUST be verified.** My strong recommendation: **seed from a pinned authoritative dataset** (Tanzil.net `quran-data.xml`, KFGQPC, or QUL/quran.com), recording the exact version — *not* from my generation. The preview gives you something concrete to check, but it should not be the source of truth.
- **Confidence:** sūrah numbers/names = high; āyah counts = high **for the Ḥafṣ/Kūfan tradition (total 6236)** but other counting traditions differ — VERIFY; juzʾ boundaries = medium (small differences across references, e.g. Juz 23 start); **pages/ḥizb/rubʿ = deliberately NOT generated** (print-specific) and deferred to an authoritative paginated dataset.
- Yassarnā and Shāṭibiyyah are **edition-specific** — exact lessons/pages/bayt ranges must come from the school's actual copy/edition.

---

## Phase 2A — Real-world book-structure analysis

### 1. Qur'an (hierarchical, multi-addressable)
- 114 **sūrah**; 6236 **āyāt** (Ḥafṣ/Kūfan); 30 **juzʾ**; 60 **ḥizb**; 240 **rubʿ al-ḥizb**; **604 pages** in the standard Madinah 15-line muṣḥaf (15 lines/page is itself a print convention).
- A portion may be addressed by **any** of: āyah-range, page-range, sūrah-range, ḥizb-range, juzʾ-range — and these must inter-convert.
- **Limitations/assumptions:** āyah counting varies by tradition; page/line layout is print-specific (Madinah ≠ IndoPak ≠ Tajweed prints). Therefore pages/lines are **per-edition reference data**, not universal facts. Juzʾ/ḥizb/rubʿ boundaries are by āyah (stable) but their *page* positions are print-specific.

### 2. Yassarnā (linear primer)
- Ordered **lessons → pages → (lines)**. No sūrah/juzʾ/āyah semantics. Edition-specific counts → model as a generic ordered-lessons book, ideally seeded per-school.

### 3. Shāṭibiyyah (didactic poem)
- **Abwāb** (topic chapters) → **abyāt** (verses), ~1173 total (edition-dependent). Addressed by **bayt-number range** (and optionally bāb).

### 4. Generic books (other mutūn / primers)
- Ordered **units** (chapter/lesson) → optional **pages/lines**. Addressed by unit-range and/or page/line range.

**Taxonomy → `structure_type`:** `quran` · `ordered_lessons` (Yassarnā/qāʿidah/generic) · `versed_poem` (Shāṭibiyyah/mutūn) · `chaptered_text` (generic chapter/page).

---

## Architectural strategy — global vs school-scoped (proposed)
- **Global canonical books** (e.g. the Qur'an): one shared copy of reference data — **not duplicated per school**.
- **School-enabled books:** a school switches a global book on, optionally with a local display name + teaching order.
- **School custom books:** school-specific primers/local texts with their own units.
- Portion assignment works **identically** for global and custom books via the addressing model (Phase 2D).

---

## Phase 2C — Proposed schema (DESIGN ONLY — not created)

**Global / canonical**
- `tahfiz_global_books` — id, code, title_ar, title_en, structure_type, total_units, unit_label, is_active, source_note, version.
- `tahfiz_book_structures` — (optional) per-book structure metadata (hierarchy levels, addressing config) so the UI knows which controls to render.
- `tahfiz_book_units` — generic ordered units for ordered_lessons/versed_poem/chaptered_text global books (book_id, order_index, label, parent_unit_id, page_from, page_to).
- **Qur'an reference (global, specialized):**
  - `tahfiz_quran_surahs` — number(PK), name_ar, name_translit, name_en, ayah_count, revelation_type, juz_start.
  - `tahfiz_quran_juz` — juz_number(PK), start_surah, start_ayah (+ start_page when sourced).
  - `tahfiz_quran_hizb` — hizb_number, juz_number, start_surah, start_ayah (**deferred data**).
  - `tahfiz_quran_pages` — page_number(PK), start_surah, start_ayah, line_count (**deferred, per-edition**).
  - `tahfiz_quran_ayah_map` *(optional, large)* — surah, ayah, page, juz, hizb, rub (**only if we import a full authoritative dataset**).

**School enablement**
- `tahfiz_school_books` — school_id, global_book_id, enabled, local_name_override, teaching_order, default_for_program.

**Custom school books**
- `tahfiz_custom_books` — school_id, title, structure_type, unit_label, total_units, status (soft-delete).
- `tahfiz_custom_book_units` — custom_book_id, order_index, label, parent_unit_id, page_from, page_to.

All tables: `school_id` where applicable, soft-delete columns, timestamps — consistent with DRAIS conventions.

---

## Phase 2D — Portion addressing model (DESIGN ONLY)
A single portion record references a book (global or custom) + `structure_type`, and stores a **superset** of optional address fields; the UI shows only the relevant controls:

| structure_type | Address fields used |
|---|---|
| `quran` | from_surah, from_ayah, to_surah, to_ayah, from_page, to_page, juz, hizb, rub |
| `ordered_lessons` (Yassarnā/generic) | lesson(unit_from)…unit_to, page_from, page_to, line_from, line_to, section |
| `versed_poem` (Shāṭibiyyah) | bab, bayt_from, bayt_to |
| `chaptered_text` (generic) | unit_from, unit_to, page_from, page_to, line_from, line_to |

Stored on the existing/extended portion record (reconciled with Phase 5's `tahfiz_records` canonical model — no new scoring duplication).

---

## Assumptions & uncertainty (must be acknowledged)
1. Qur'an āyah counts = Ḥafṣ/Kūfan (6236). Other traditions differ.
2. Juzʾ boundaries: a few have reference-level discrepancies (flagged in JSON).
3. Pages/ḥizb/rubʿ NOT generated — require an authoritative, edition-pinned import.
4. Yassarnā/Shāṭibiyyah exact counts require the school's edition.
5. Revelation type: ~10 sūrahs traditionally disputed (flagged).

---

## Phase 2E — APPROVAL GATE (please review & decide)
Nothing proceeds until you approve. Decisions needed:
1. **Qur'an data:** use this preview as-is, OR (recommended) have me import a pinned authoritative dataset (Tanzil/KFGQPC/QUL) for surahs+juz+hizb+rub+pages?
2. **Yassarnā:** global vs per-school; will you provide the edition's lessons/pages?
3. **Shāṭibiyyah:** include now (global, bayt-addressed) or defer?
4. **Global vs school-scoped strategy:** confirm global Qur'an + school-enable + custom books.
5. **Table design:** confirm the Phase 2C schema (names/shape).
6. **Seed scope for first insert:** surahs + juz only (safe), or also attempt pages/hizb/rub (needs authoritative import)?
