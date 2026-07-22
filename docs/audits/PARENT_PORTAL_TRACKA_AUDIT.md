# Parent Portal (Track A) — Phase 0 Audit Addendum

Builds on [PARENT_PORTAL_READINESS_AUDIT.md](PARENT_PORTAL_READINESS_AUDIT.md). Focuses on what the **new** model needs: pure-OTP (no password), `/parent` + `/api/parent/*`, cross-school visibility, opaque `learnerAccessId`. Verified on TiDB (school 12011 + cross-school).

## Verdict: SAFE TO PROCEED
Parent identity resolves reliably from existing data — no STOP condition.

## The 10 questions
1. **Where parent phones live:** `people.phone`, reached via `contacts.person_id` → `student_contacts.contact_id` → `students`. (`student_next_of_kin` empty; `parents`/`student_parents` empty.)
2. **Which model is populated:** `contacts`/`student_contacts` (sparse but real). The canonical *grant* tables exist (`parent_student_links` etc., created in earlier phases).
3. **Empty/unused:** `parents`, `student_parents`, `student_next_of_kin`.
4. **Normalized?** No — stored as `+256…`, `256…`, `0…`. Resolver normalizes + matches 4 variants.
5. **One phone → many learners?** Yes (e.g. `+256741341483` → 2 learners in 2 schools).
6. **One learner → many contacts?** Yes (`student_contacts` is many-per-student).
7. **School-scoped?** Yes — each `parent_student_links` row carries `school_id`; evidence join carries `students.school_id`.
8. **Same phone across schools — safe?** Yes architecturally: each link is independently school-scoped, created only from a phone match on *that* learner's contact, and every read re-checks `school_id`. **Risk:** placeholder/shared numbers over-link (flagged below).
9. **Relationship type present?** Yes — `student_contacts.relationship`.
10. **Reliable enough for self-service OTP?** Yes where data exists; sparse coverage is a data-entry gap (Phase 6 admin tools + staff capture address it), not a safety blocker.

## Canonical parent-link strategy (decided)
- **Identity:** `parent_accounts` keyed by normalized `phone`, **password optional** (OTP-only).
- **Evidence:** `people.phone`→`contacts`→`student_contacts` (never the grant itself).
- **Grant:** `parent_student_links` (active), one row per learner, school-scoped, with a new **`access_uuid`** = the opaque `learnerAccessId` exposed to clients. Raw `student_id` never leaves the server.
- **Cross-school:** session is *not* pinned to one school; the resolver returns all active links across schools, grouped by school in the UI.

## Migration needs (Phase 1)
- `parent_student_links.access_uuid CHAR(36)` (unique; backfilled).
- `parent_accounts.password_hash` → **nullable** (OTP-only accounts).

## Security risks
- **Shared/placeholder phone over-linking** — same number on multiple unrelated learners ⇒ instant access to all. Mitigations: admin revoke/suspend/correct (Phase 6); optional per-school manual approval; per-school fees hide (`parent_finance_visibility`).
- **Enumeration** — request-otp must return a generic response regardless of match (Phase 2).
- **IDOR** — never accept raw `student_id`; resolve `learnerAccessId` → link scoped to the session's parent + `status='active'`.

## Implementation phases (this track)
P1 resolver + access_uuid · P2 phone-OTP auth · P3 `/parent` UI shell · P4 learner detail · P5 cross-school compare · P6 admin tools · P7 security tests.
