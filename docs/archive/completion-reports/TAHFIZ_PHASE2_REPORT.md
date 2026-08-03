# Tahfiz Phase 2 — Book Structure Engine (COMPLETE, approved + seeded)

Approval recorded (Phase 2E): **import authoritative dataset · seed full Qur'an structure (pages+ḥizb+rubʿ) · Qur'an first · proposed schema approved.**

## Source of truth (authoritative, pinned)
- Seeded from **Tanzil.net `quran-data.xml`** (CC-BY © Tanzil.info), pinned at `docs/tahfiz/quran-data.tanzil.xml` (committed for audit). Not machine-generated.

## Files changed
- `sql/tahfiz_books_quran.sql` — 9-table schema.
- `scripts/seed-tahfiz-quran.mjs` — parses the pinned XML, derives ḥizb(60) from quarters(240), computes start/end pages, juz mapping; idempotent.
- `docs/tahfiz/quran-data.tanzil.xml` — pinned authoritative dataset.
- APIs: `tahfiz/books/catalog` (GET), `tahfiz/books/enable` (POST), `tahfiz/books/custom` (GET/POST), `tahfiz/quran/reference` (GET).
- `src/app/tahfiz/books/page.tsx` — rebuilt: Global / Custom books + enable toggle + live Qur'an portion selector.

## Tables created (TiDB Cloud)
`tahfiz_global_books`, `tahfiz_school_books` (enablement), `tahfiz_custom_books`, `tahfiz_custom_book_units`, and Qur'an reference: `tahfiz_quran_surahs`, `tahfiz_quran_juz`, `tahfiz_quran_hizb`, `tahfiz_quran_quarters`, `tahfiz_quran_pages`.

## Seeded reference data (verified on TiDB)
- 114 sūrahs · 30 juzʾ · **60 ḥizb** · **240 quarters (rubʿ)** · **604 pages** · 1 global book (Qur'an).
- **Integrity check: SUM(ayah_count) = 6236** (exact Ḥafṣ/Kūfan). Spot-checks: Al-Fātiḥah (7, p1–2, juzʾ1), Al-Baqarah (286, p2–50), Yāsīn (83, p440–446, juzʾ22), An-Nās (6, p604, juzʾ30).

## UI changed
`/tahfiz/books` now shows **Global books** (Qur'an, with Enable/Disable per school + "Enabled for your school"), **Custom books** (add your own: ordered-lessons / versed-poem / chaptered-text), and a **live Qur'an portion selector** — Surah/Ayah · Page · Juz · Ḥizb — driven by the seeded reference data.

## Old → New
| | Old | New |
|---|---|---|
| Books | dormant generic `tahfiz_books` (PDF uploader, empty) | Global canonical + school-enable + custom, with real structure types |
| Qur'an structure | none | authoritative 114/30/60/240/604 reference data |
| Portion selection | free-text | book-aware selector (Surah/Ayah/Page/Juz/Ḥizb) |
| Data scope | n/a | global Qur'an shared (not duplicated per school); schools enable + add custom |

## Tests run (live + TiDB)
```
seed: counts 114/30/60/240/604 + global 1 · SUM(ayahs)=6236 ✓
/api/tahfiz/quran/reference -> counts {surahs:114,juz:30,hizb:60}, page_count 604
catalog -> quran enabled:false → POST enable → catalog quran enabled:true ✓
custom create -> 200, appears in catalog ✓
/tahfiz/books page -> 200 (compiles)
```
Bug found & fixed during verification: `db.ts` `bigNumberStrings` returned the `COALESCE(enabled)` flag as a string; catalog mapping now coerces with `Number()`.

## TiDB Cloud verification
All 9 tables + seed live on `gateway01…tidbcloud.com / drais`. Idempotent scripts (safe to re-run).

## Founder-independence check
✅ school enables/disables global books from UI · ✅ school adds custom books from UI · ✅ teacher selects Qur'an portions by Surah/Ayah/Page/Juz/Ḥizb without the founder · ✅ no Quran-only assumption (4 structure types) · ✅ accurate reference data from an authoritative pinned source.

## Remaining (later phases)
- Yassarnā (per-school, edition-specific) + Shāṭibiyyah (global, bayt-addressed) — deferred per approval; previews ready in `docs/tahfiz/`.
- `tahfiz_quran_ayah_map` (full per-ayah page/juz/hizb) — only if ayah-exact paging is needed.
- Custom-book **units** editor UI (table exists).
- Wire the portion selector into assignment/daily register (**Phase 4**).

## Next recommended phase
**Phase 3 — Halaqah model** (first-class circles: teacher/supervisor/level/program/time-slot + membership history), or **Phase 4 — Daily halaqah register** (the teacher's fast daily screen, consuming this portion selector).
