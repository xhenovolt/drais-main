# ID Card Studio

Two-sided student ID cards: design (or start from a template), generate from enrolled learners or an Excel list, print.
Route: `/students/id-cards/studio`. School-facing guide: `/help/guides/id-cards`. Developer page: `/control/docs/id-card-studio`.

## Design spec (v2)

`src/lib/idcards/spec.ts` — card size in mm, a `front` and optional `back` side; each side has a background colour/image and
positioned elements (`text`, `image` photo/logo/static, `qr`, `rect`). Text may contain `{tokens}`:

`full_name first_name last_name admission_no class gender dob school school_address school_phone school_email academic_year issue_date valid_until guardian_phone` and `col:<Header>` for Excel columns.
Unknown tokens render empty. Text elements support `shrink` (one line, font scales down for long values) and `valign`.

## Printing

`src/lib/idcards/layout.ts`.

| Mode | Layout |
|---|---|
| `side_by_side` (default for two-sided) | One row per learner: FRONT left, BACK right, one gap apart. Works on any printer. |
| `duplex_long` / `duplex_short` | All fronts on page N, all backs on page N+1, mirrored so each back registers behind its front on a duplex printer. |
| `front_only` | Fronts only; single-sided designs are always forced to this. |

`fold_pair` (back left, front right) was replaced by `side_by_side`. Date of issue / Valid until are set on the print screen and
used when a record has none.

## Publisher templates

`.pub` is a proprietary binary; DRAIS cannot parse it and `/api/id-cards/assets` rejects it with export guidance. A design is
converted by asking Publisher itself (Windows, Publisher installed):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/idcards/publisher-extract.ps1 -Pub "BACKUP\ID TEMP.pub" -Out shapes.json
npx tsx scripts/idcards/build-template.mts shapes.json src/lib/idcards/templates/publisher-student-id.ts PUBLISHER_STUDENT_ID_SPEC
```

Then register it in `src/lib/idcards/templates.ts`. The importer (`publisher-import.ts`) turns borders and rules into vector rects, pictures
into photo/logo slots and text into positioned elements; `placeholders.ts` decides which text is sample content (school name,
learner, class, ID, dates, address, phone → tokens) and which is fixed wording or a label (kept). Every decision carries a reason.
Signature lines (head teacher, holder) are never treated as learner data.

Templates must contain no real school's name, learners or contact details. Test fixtures are anonymised copies
(`src/lib/idcards/__tests__/fixtures/`), and a test fails if a checked-in template drifts from what the importer produces.

## Tests

`npm run test:idcards`
