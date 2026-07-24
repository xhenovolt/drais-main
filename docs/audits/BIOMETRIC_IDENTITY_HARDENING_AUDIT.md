# Biometric & Identity Hardening — Architecture Audit

Grounds the operational-maturity brief in what DRAIS **actually** has (2026-07-24, v1.93.0).
Finding: the identity/biometric model is already mature at the data + service layer.
This is an **expose + fill-gaps** job, not a rebuild — and must not break working attendance.

## Part-by-part reality

| Part | Brief asks | Reality in DRAIS | Gap → action |
|---|---|---|---|
| **1 · Data-first logs** | `/attendance/logs` too decorated, records pushed down | Page is 1,589 lines; intelligence strip, banners, confidence, live feed all stacked above the table | Density pass: table above the fold, collapse secondary panels. *Careful, not a rewrite.* |
| **2 · Identity correction** | Wrong mapping correctable; events immutable; audited | `reassignEnrollment()` (history-first, in-place, audited via `mapping_history`) + `raw-event-backfill` exist | **No correction-from-attendance flow; historical events not re-attributed.** → build `correctIdentity` + UI |
| **3 · Fast create from attendance** | Unknown person → create staff/learner/assign, without leaving | `QuickAssignModal` assigns unmatched to existing people; `/api/staff` + students create exist | Add "create new staff/learner" inside the assign flow |
| **4 · Multi-finger** | One person → many templates | **`biometric_templates(enrollment_id, finger_index, template_bytes, template_format, quality_score, captured_device_sn)` — already 1:many.** `template-service.recordTemplate` writes per finger_index | Schema+service DONE. Gap is UI to view/add/remove fingers |
| **5 · Cards** | Fingerprint / card / both | `biometric_enrollments.card_number` handled in `enrollment-service` (upsert, mirror) | Schema+service DONE. Gap is enrollment UI surfacing cards |
| **6 · Template sync** | Central store → push to authorized devices | `template-service.queueDistributionsForSchool()` already distributes templates to devices; `biometric_templates` is the central store | **Capability EXISTS.** Document + verify device push path; no false claims |
| **7 · Model hardening** | Person / templates / cards / devices / events decoupled | Already separated: people ← enrollments (pin, card) ← templates (per finger); attendance_raw_events reference person_id/role_ref; devices standalone | Model is correct. No coupling to fix |
| **8 · Auditability** | Every identity change logged (who/when/old/new/why) | `mapping_history` (map/reassign/unmap/revoke) + `control_audit_logs` + attendance audit | Extend to cover correction + re-attribution |
| **9 · Testing** | 6 scenarios | — | Pure tests for correction planning + guards |

## This release (v1.94.0) implements
**Part 2 + 3 + 8** — the founder-independence core: an **Identity Correction** capability usable from the attendance context.
- `correctIdentity()`: reassign the PIN to the right person via the existing `reassignEnrollment` (history-first), then **re-attribute historical raw events** — events are never deleted (same time, device, fingerprint) but their identity label is corrected and both people's affected days re-evaluated. Fully audited.
- UI: a **"Correct"** action on matched attendance rows → search the right person + reason → applied.
- **Create-from-attendance**: the assign flow can create a new staff/learner inline when the person doesn't exist yet.

## Deferred (documented, not faked)
- Part 1 density pass — safe, next.
- Parts 4/5 UI (view/add fingers, enroll card) — backend ready; UI is additive.
- Part 6 — capability exists; a verification pass on the live device push path is warranted before advertising it.

Principle held throughout: **attendance events are immutable; identity associations are correctable and auditable.**
