# Founder-Independence — Phase 0 Audit

Audit only, no code changed. Date: 2026-06-24.

## 1. Enrollment programs (confusing names)
- **Table** `programs`: `id, school_id, name, description, is_active, created_at` — **free text only**. No code vs display-name split, no standard defaults.
- **Live data is the problem**: e.g. school 8002 has `Secular`, `Secuoar` (typo), `Theology`; 12003 has `New curriculum`, `SECULAR`; 12004 `New Curriculum`. Users typed these — there's no curated list (UNEB/Cambridge/Tahfiz…).
- **API/UI**: `src/app/api/programs/route.ts` (basic CRUD); enrollment page renders `programs.name` directly. No `/settings/academic-programs` admin page.
- **Fix (Phase 1)**: migration add `code`, `display_name`, `curriculum_body`, `is_default`, `is_archived`; seed standard defaults (UNEB / Cambridge / Tahfiz Only / UNEB+Tahfiz / Custom); normalise obvious junk to display labels; admin UI `/settings/academic-programs` (create/rename/default/archive/curriculum/eligibility); enroll uses `display_name`, hides archived.

## 2. Template Kitchen (lifecycle)
- **Table** `report_templates`: `id, name, description, layout_json, is_default, school_id, template_key`. No `archived`/`is_builtin`/usage columns.
- **UI** `src/app/settings/templates/page.tsx` already calls: list `/api/report-templates`, set default `/active`, **duplicate** `/[id]/duplicate`, **delete** `/[id]` (DELETE). So duplicate + delete exist.
- **Missing**: **rename**, **archive/restore**, built-in protection (anything with a `template_key` should not be hard-deleted), **usage count**, prevent-delete-if-used, audit logging.
- **Fix (Phase 2)**: migration add `is_archived` (+ treat `template_key IS NOT NULL` as built-in); APIs: rename (PATCH name), archive/restore, guard DELETE (block built-ins → archive instead; block if referenced by published reports), usage count; wire the buttons + confirm + audit_logs.

## 3. "Next Term Begins" date crash
- **Editor** `PropertiesPanel.tsx` `NextTermBeginsPanel` (~L1830): controlled `<input type="date" value={content.customDate || ''}>`, empty→undefined. Looks safe.
- **Renderer** `NextTermBeginsSection.tsx`: `new Date(fallbackDate)` wrapped in try/catch + `isNaN` guard. Looks safe.
- **So the crash is not statically obvious** — both paths are already defensive (likely a prior partial fix). Candidates: a *different* date field, a snapshot/preview formatter (`src/lib/drce/computed/formatters.ts`, `builtin-resolver.ts`, `adapter/toDRCEDataContext.ts`) receiving the new value, or `content` being undefined on an older template.
- **Fix (Phase 3)**: implement the spec's `next_term_begins_source` (`auto_from_terms` | `manual` | `hidden`) — this both adds the requested capability AND removes the crash class (no raw date parsing when auto/hidden; validated manual). **Need from you**: the exact console error/stack when it crashes, or I implement the source-mode redesign blind (still a net improvement).

## 4. Custom report comments
- **Renderer** `src/components/drce/sections/ResultsTableSection.tsx` (+ `DRCEDocumentRenderer`, `TableSection`). Comments are currently hard-coded/derived, not rule-driven; no `/settings/report-comments`.
- **Fix (Phase 4)**: new `report_comment_rules` table (scope/subject/class/grade/min-max score/competency/text/language/priority/active) + evaluator + `/settings/report-comments` UI + DRCE results-table options (show/hide comments, source = rule|manual, column label, empty text).

## Recommended batches (independent; pick order)
- **Batch 1 — Programs (Phase 1):** highest founder-independence value, additive, low risk.
- **Batch 2 — Template lifecycle (Phase 2):** mostly wiring + small schema; the buttons partly exist.
- **Batch 3 — Next Term source-mode (Phase 3):** small; ideally with your crash trace.
- **Batch 4 — Comments engine (Phase 4):** largest (new rules engine + UI + renderer wiring).

Recommend starting **Batch 1 (Programs)**. #3 benefits from the exact crash trace.
