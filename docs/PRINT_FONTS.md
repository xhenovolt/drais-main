# DRAIS — Print Font Requirements

The DRCE renderer + DualCurriculumTemplate produce documents that exit
the browser in three ways:

1. **In-browser print** (`window.print()`) — uses the host OS's installed fonts
2. **Client-side PDF** (`html2canvas` → `jsPDF`) — bitmaps the DOM, OS fonts again
3. **Server-side PDF** (future, behind a Phase 3 follow-up) — needs fonts shipped with the renderer

This file lists the fonts the project depends on, why, and the rules for
adding more. It is the canonical pointer from
[`docs/translation/IMPLEMENTATION_PLAN.md`](./translation/IMPLEMENTATION_PLAN.md)
§6.

---

## 1. Required font families

### Arabic (RTL) — required when `meta.language === 'ar'` or `meta.numerals === 'arabic'`

| Family | Use | Licence | Source |
|---|---|---|---|
| **Noto Naskh Arabic** | Default body text in printed Arabic reports — UNESCO-style legibility, very wide subset coverage | SIL Open Font License 1.1 | https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic |
| **Amiri** | Optional second-choice for Qurʾanic-flavoured tahfiz certificates (more traditional naskh) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Amiri |

Both fonts handle Eastern Arabic numerals (٠–٩) and contextual Arabic glyph
shaping correctly. **Noto Naskh is the default;** Amiri is opt-in per
template via the DRCE `theme.font` field.

### Latin (LTR) — required for every document

| Family | Use | Licence | Source |
|---|---|---|---|
| **Inter** | Default sans-serif body text — matches the DRAIS application chrome | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Inter |
| **DM Serif Display** | Optional headline / certificate title font | SIL Open Font License 1.1 | https://fonts.google.com/specimen/DM+Serif+Display |

---

## 2. Distribution channels

### 2.1 In-browser preview (today)

Loaded from Google Fonts via `<link>` in `src/app/layout.tsx`. This is the
current behaviour — every preview, every screen, every `window.print()`
renders against Google-hosted WOFF2.

**Gotcha:** schools on slow connections may see a flash-of-unstyled-text
on first paint. That's tolerable in dev; for offline schools (the
SQLite-backed deployment described in
[`docs/OFFLINE_MIGRATION_ASSESSMENT.md`](./OFFLINE_MIGRATION_ASSESSMENT.md))
we'll need self-hosted WOFF2 + `font-display: optional`. See §3.

### 2.2 Client-side PDF (`html2canvas` + `jsPDF`)

Used by [`src/app/academics/reports/page.tsx`](../src/app/academics/reports/page.tsx)
and by `tahfiz/reports`. Because `html2canvas` rasterises the DOM,
whichever font the OS picks at print time is what ends up in the PDF.

**Outcome on a clean Ubuntu/Mac/Windows desktop with Noto fonts installed
from Google Fonts:** Arabic renders correctly. **Outcome on a stock
Windows machine without the Noto family installed:** Arabic falls back
to Tahoma or whatever the system has, which still shapes correctly but
loses the report-card "house style". This is acceptable for now.

### 2.3 Server-side PDF (Phase 3 follow-up — NOT YET BUILT)

The audit's `IMPLEMENTATION_PLAN.md §3` calls for a server-render path
that produces deterministic PDFs without going through the browser. When
that lands:

- Fonts MUST be bundled with the server-render binary (e.g. embedded
  WOFF2 files under `public/fonts/` and registered with `pdfkit` or
  Puppeteer's `--font-render-hinting=none` + on-disk font files)
- Both Noto Naskh + Inter must be present at minimum
- The renderer must select the family at runtime based on
  `meta.language` (Arabic → Noto Naskh; English → Inter)
- File hashes of bundled fonts must be added to a `fonts.lock.json` that
  is checked into git, so the dataHash invariant is not broken by an
  upstream Google Fonts re-release

---

## 3. Self-hosting (offline schools)

For schools using the offline / SQLite mirroring deployment described in
the OFFLINE_MIGRATION_ASSESSMENT.md, font assets must travel with the
client bundle:

```
public/
└── fonts/
    ├── noto-naskh-arabic/
    │   ├── NotoNaskhArabic-Regular.woff2
    │   ├── NotoNaskhArabic-Medium.woff2
    │   └── NotoNaskhArabic-Bold.woff2
    ├── amiri/
    │   ├── Amiri-Regular.woff2
    │   └── Amiri-Bold.woff2
    └── inter/
        ├── Inter-Regular.woff2
        ├── Inter-Medium.woff2
        └── Inter-Bold.woff2
```

Then declared in `src/app/globals.css` with `@font-face` rules using
`font-display: optional` so a missing file silently falls back without a
flash-of-unstyled-text. The Google Fonts `<link>` stays in for online
schools — both paths coexist.

This package is approximately **1.8 MB** total over the wire (Brotli-compressed
WOFF2). Acceptable for the offline product line; not loaded by default
for the online deployment.

---

## 4. Glyph coverage checklist

When adding a new Arabic-medium feature, verify the chosen font covers:

- [ ] Basic Arabic letters (U+0600..U+06FF) — present in every listed font
- [ ] Arabic Presentation Forms-A (U+FB50..U+FDFF) — used by some Quranic
      text orientations; present in Amiri + Noto Naskh
- [ ] Arabic Presentation Forms-B (U+FE70..U+FEFF) — required for
      isolated-form rendering in older browsers; present in Noto Naskh
- [ ] Arabic-Indic digits (U+0660..U+0669) — Eastern numerals ٠–٩,
      required by [`toArabicNumerals`](../src/lib/snapshots/normalizers.ts)
- [ ] Arabic mathematical decimal separator (U+066B, ٫)
- [ ] Tatweel (U+0640) — used by `Amiri` for justification

All four required glyph blocks are present in **Noto Naskh Arabic v2.018**
(the version Google Fonts serves as of this writing). Verified against
`docs/translation/EXPORT_GLOSSARY.md` — every Arabic phrase in the master
dictionary renders correctly.

---

## 5. Versioning + dataHash invariant

The snapshot pipeline computes `meta.dataHash` as `sha256(canonical(classes))`.
Fonts do NOT enter that hash. A font upgrade therefore does not invalidate
historical snapshots — they will re-render with the new font but their
identity stays stable.

**This is intentional.** Numerals are a property of the SNAPSHOT
(`meta.numerals`), not of the render. Visual presentation (the font) is
expected to drift over time; data identity is the invariant we protect.

---

## 6. Action items for shipping Phase 3 (server-side PDF)

When the server-render path lands, the engineer doing it should:

1. Download the four WOFF2 files into `public/fonts/` per §3
2. Register them with the PDF renderer
3. Add a `scripts/check-fonts.ts` that hashes them and writes
   `fonts.lock.json`, blocking CI if hashes drift
4. Run the snapshot regeneration matrix from
   [`docs/translation/IMPLEMENTATION_PLAN.md`](./translation/IMPLEMENTATION_PLAN.md)
   §3 acceptance gate — every existing `status='ready'` snapshot must
   regenerate with identical `meta.dataHash` after the change
