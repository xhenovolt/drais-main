# DRAIS — Term Intelligence, Enrollment Context, Notifications & Feature Flagging

Verified against **TiDB Cloud** (`gateway01***/drais`), school 12011, superadmin. Shipped v0.0.0087 → 0.0.0090.

---

## 1. Root cause of the wrong term on enrollment
Terms carry **two** competing fields: a legacy `status` (`'draft'|'active'|…`) **and** an `is_active` flag. The old `getCurrentTerm()`:
1. matched `status='active'` + date range, then
2. fell back to *any* `status='active'`, then
3. fell back to the **latest term regardless of date**.

The real term for 12011 is `status='draft', is_active=1`, ended **2026-04-23** (today is 06-19). So steps 1–2 found nothing (`status` ≠ 'active') and step 3 returned the **past Term I forever**, ignoring the calendar. It also **INNER-JOINed `academic_years`**, hiding any term whose AY row is missing. Net: enrollment (and anything using `getCurrentTerm`) showed a stale past term and a term marked active could never "expire."

## 2. Term resolver implemented (Phase 1)
`src/lib/academic/term-resolver.ts` → `resolveTermContext(schoolId, offsetMin)`:
- **Date-driven**: a term is `current` only if today ∈ [start, end] (compared in the school's local calendar via the time-policy offset).
- Derives per-term status `upcoming|current|completed`.
- Returns `current`, `effective` (date-current, else **null** — never a stale term), `manualActive` (is_active), `upcoming`, `previous`, `progress` (days elapsed/remaining/%), and `warnings` (`NO_CURRENT_TERM`, `STALE_ACTIVE`, `MULTIPLE_ACTIVE`, `MANUAL_OVERRIDE_MISMATCH`, `NO_TERMS`). LEFT JOIN academic_years.
- **Verified on TiDB**: Term I → `completed`; `effective=null`; warnings `NO_CURRENT_TERM` + `STALE_ACTIVE` (old code returned stale Term I).

## 3. Terms management (Phase 2 — backend done, UI pending)
`PATCH /api/terms/[id]` now handles `is_active` with **single-active enforcement**: activating one term deactivates every other term in the school (sets `status='active'`); clearing deactivates. Each change is **audit-logged** (`SET_ACTIVE_TERM`/`CLEAR_ACTIVE_TERM`).
*Remaining:* the dedicated terms-management **UI** (progress bars, overlap/no-current warnings, set/clear buttons) is not built — the APIs + resolver it needs are ready.

## 4. Enrollment term fix (Phase 3)
- `/api/terms/current` rewritten to use the resolver: `data.current` is the **date-driven** term (null when between terms) and `data.context` carries effective/upcoming/previous/progress/warnings.
- `/students/enroll` shows a **term-context banner**: current term + progress when in-term; a clear **"No current term is configured"** warning (with nearest upcoming + last term) when between terms. Enrollment now reflects the real term — or honestly says none exists — instead of defaulting to Term I.

## 5. Routes updated (Phase 4 — partial)
Pointed at the resolver: `/api/terms/current`, `/api/academic/term-context` (new canonical endpoint), and the enroll page.
*Remaining:* `results`, `attendance`, `finance fees`, `reports/DRCE`, `promotions`, dashboards still call the legacy `getCurrentTerm`/ad-hoc SQL. They should be migrated to `resolveTermContext`. (Listed callers: `enrollments/bulk`, `students/enrolled`, `students/admitted`, `academic/current-term`, `results/filtered`, plus ad-hoc `is_active` SQL in `students/migrate` & `students/import`.)

## 6. Notification bell fixed (Phase 5/6)
**The bell, `/notifications` page, and `/api/notifications/{list,unread-count,mark-read,archive}` already exist and work.** Root cause of "shows nothing": notifications fan out to specific role-users via `user_notifications`; the **viewing superadmin (720001) had 0 rows** (school 12011 had only 6 notifications total, none targeting the viewer).
- New `src/lib/academic/term-notifications.ts` → `maybeNotifyTermContext()` emits in-app notifications **to the viewer** from the resolver (`NO_CURRENT_TERM`, `STALE_ACTIVE`, `MULTIPLE_ACTIVE`, `TERM_ENDING_SOON`), **deduped per (school, action) per day**. Wired into `/api/academic/term-context` (fire-and-forget), so an admin loading term context now gets real, actionable bell items.
*Remaining:* broaden fan-out to **all school admins** (not just the viewer) by resolving admin user IDs, and add term events for results/attendance/fees on the wrong term. Notification-center filters/priority already exist in the page.

## 7. Feature flagging (Phase 7)
- `src/lib/version/feature-manifest.ts`: static **New/Improved/Updated** manifest keyed to `package.json` version; entries auto-expire after N bumps (`isFlagActive`, `activeFeatureFlags`).
- `GET /api/version/features` returns active flags.
*Remaining:* render the badges in the sidebar / route headers (consume the API).

## 8. Tables changed
None for terms (reused `terms.is_active`/`status`/`start_date`/`end_date`). Notifications/feature-flagging reuse existing tables / no DB. (Time-policy table from the previous task supplies the per-school offset the resolver uses.)

## 9. APIs changed/added
- New: `GET /api/academic/term-context`, `GET /api/version/features`.
- Changed: `GET /api/terms/current` (resolver), `PATCH /api/terms/[id]` (single-active + audit).

## 10. Tests run
- Resolver classification **verified on TiDB**: Term I → completed, no current term, correct warnings.
- Single-active SQL logic verified (activating deactivates others).
- Type-clean across all new/changed files.
*Remaining (Phase 8 full matrix):* set-active→others-deactivate end-to-end, clear-active, enrollment-during-Term-II (needs a current-dated Term II in data), notification create→unread-count→mark-read round trip, badge expiry. These need a warm running server (dev server is unstable in this sandbox).

## 11. TiDB Cloud verification
Resolver + terms queries executed against TiDB Cloud; term classification and warnings confirmed on real data.

## 12. Remaining risks
1. **No Term II exists in the data** — so today the school correctly shows "no current term." The visible fix depends on the admin **creating Term II with real dates** (then the resolver shows it automatically). The activate/deactivate API + resolver make this work; the terms-management UI to do it easily is the main remaining build.
2. **Legacy `getCurrentTerm` still used by several modules** (Phase 4 partial) — until migrated, those can still show stale term behavior. Migrate them to `resolveTermContext`.
3. **Notification fan-out is currently to the viewer only** — broaden to all school admins.
4. **Feature badges not yet rendered** in the sidebar (API ready).
5. Date comparison uses the school time-policy offset; terms stored as midnight-local could be ±1 day at exact term-boundary days — acceptable, noted.
