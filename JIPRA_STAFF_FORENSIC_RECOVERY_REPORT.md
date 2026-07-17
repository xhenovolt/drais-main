# JIPRA Staff Forensic Recovery — Phase 0/1 Findings Report

**School:** JINJA PROGRESSIVE ACADEMY (short_code: JIPRA, `school_id = 12004`)
**Generated:** 2026-07-17
**Mode:** Forensic audit only — **no data was modified, restored, or deleted.**

---

## 1. Executive Summary — STOP BEFORE RESTORING

The audit found **196 soft-deleted (`ARCHIVED_STAFF`) staff records** for JIPRA, leaving only **1 active staff record** in the `staff` table. However, the audit trail shows this is **very unlikely to be accidental data loss**:

- All 196 removals were performed through the application's legitimate `ARCHIVED_STAFF` audit action (soft-delete via the app's own "archive staff" feature) — not a raw SQL wipe, not a crash, not a failed migration.
- All actions were performed by **the same authenticated, school-scoped user**: `user_id 360001` ("ENOCH", `enochktt01@gmail.com`), whose `school_id = 12004` — i.e. **an authorized JIPRA account**, not a platform superadmin or external actor.
- The archiving happened gradually **over 3.5 months** (2026-04-03 → 2026-07-15), in individual one-at-a-time actions (5–15 seconds apart when in bursts), not a single bulk/automated event.
- The most recent action for this school (2026-07-16, i.e. yesterday) was **`CREATED_STAFF`** — a brand-new, correctly-populated HR Manager record — suggesting the school was actively mid-cleanup/re-entry of its staff data, not experiencing data loss.
- Every underlying `people` record for the 196 archived staff is **still active** (`people.deleted_at IS NULL`) — only the staff/employment role was archived, not the person's identity.

Per your instruction not to blindly restore, **I am stopping here and not proceeding to Phase 2 (restore).** This pattern (legitimate in-app action, same authenticated in-school user, gradual over months, culminating in fresh correct staff data) is consistent with an intentional cleanup/re-onboarding exercise — exactly the scenario you warned could be wrongly "undone" by blind restoration.

**This needs a human decision from JIPRA/the platform owner before any restoration is executed**, because:
- The archived list includes senior leadership (Executive Director, Deputy Director of Studies, Bursar) and 152 teachers — i.e., effectively the entire staff body — which is unusual enough in scale that I cannot safely assume intent either way from data alone.
- If genuinely intentional (bad/duplicate data, staff turnover, re-registration), restoring would re-create exactly the duplicate/zombie-staff problem you flagged.
- If genuinely accidental (an admin misunderstanding the "archive" button, or clicking through the wrong list), the school currently has **no functioning teaching staff, subject allocations, or leadership records** — a serious operational problem.

---

## 2. Phase 0 — Forensic Audit Detail

| Source checked | Result |
|---|---|
| `staff` table (school_id=12004) | 1 active, **196 soft-deleted** (`deleted_at` set) |
| `people` table (school_id=12004) | 595 active, 0 soft-deleted |
| `users` table | Not staff-specific; no relevant deletions found |
| `staff_employment` | 1 active event row tied to archived staff (minor inconsistency, see §4) |
| `staff_qualifications` / `staff_salaries` / `staff_subject_specializations` | 0 rows (school never populated these) |
| `audit_logs` (action=`ARCHIVED_STAFF`) | 196 entries, 2026-04-03 → 2026-07-15, all by `user_id 360001` |
| `audit_logs` (action=`CREATED_STAFF`) | 198 entries, 2026-04-03 → 2026-07-16 (last one = the 1 currently active HR Manager) |
| `audit_log` (legacy table) | 0 entries for `staff` entity_type at this school |
| `zk_user_mapping` (biometric) | **147 mappings still point to archived staff_id values** — see §4 |
| `class_subjects` (teaching allocations) | 0 rows at all for JIPRA — no active or orphaned teacher assignments |
| `departments.head_staff_id` | 0 references to archived staff (no orphaned department heads) |
| Duplicate `person_id` within `staff` table | 0 — no duplicate staff rows existed before archiving |
| `restored_at` previously set | 0 — none of the 196 were ever previously restored/re-archived |
| Git history | No repository commits touch JIPRA staff data (this was a live DB action, not a code change) |

### Timing pattern
- Archive-to-creation gap: average 68.7 hours, min 0 hours (archived same day created), max 2,307 hours (~96 days).
- This mixed pattern (some archived instantly, some after months) is consistent with a mix of "removed test/duplicate entries immediately" and "removed established staff after weeks/months" — i.e. an ongoing data cleanup, not one single mistake.

### Positions archived (196 total)
Teacher (152), Other Staff (6), Cleaner (6), Bursar (6), Driver (4), Cook (3), Assistant Teacher (2), Security Officer (2), Personal Assistant (2), plus 1 each: IT Technician, Matron, Senior Man Teacher, Uniform, Nurse, Executive Director, Lab Attendant, Technician, Head Cook, Deputy Director of Studies, Warden, Human Resource Manager, Head Coach Girls.

---

## 3. Phase 1 — Duplicate Detection

Not executed against production, because no restoration is being performed. If restoration is approved, each of the 196 candidates must be re-checked at restoration time against the *then-current* active roster (by name, phone, email, national ID, staff_no) since new staff may have been created since this audit.

---

## 4. Inconsistencies Found (independent of the restore decision)

These are real orphaned/inconsistent references that exist **today**, regardless of whether staff are restored:

1. **147 active `zk_user_mapping` biometric records still reference archived `staff_id`s.** This means fingerprint/device mappings for archived staff are still live — attendance devices may still recognize and log punches for staff who no longer appear on `/staff`. This should be reviewed (either the mappings should be cleared as part of an intentional offboarding, or the staff should be restored so their mapping matches an active record).
2. **1 `staff_employment` record with `status='active'` still points to an archived staff_id** — a minor state mismatch between the archived staff record and its employment history event.
3. **JIPRA currently has 0 rows in `class_subjects`** — no active subject/teacher allocations exist at all, meaning any restoration will need to reconstruct/re-verify teaching allocations from scratch since none carried over as orphans (there's nothing to "repair" here — allocations simply don't exist for anyone right now).

No duplicate biometric identities, no duplicate `person_id`/staff rows, and no orphaned `departments.head_staff_id` were found.

---

## 5. Phase 5 — Verification Summary

| Metric | Value |
|---|---|
| Total staff before recovery consideration | 197 (1 active + 196 archived) |
| Recovered staff | **0 — no restoration performed** |
| Skipped duplicates | N/A (not attempted) |
| Archived staff (candidates) | 196 |
| Still missing / unresolved | 196 (pending decision) |
| Relationships repaired | 0 |
| Requires manual review | **Yes — see §1 and §4** |

---

## 6. Recommendation

1. **Do not run a bulk restoration.** The evidence points to intentional, legitimate, in-app archiving by an authorized JIPRA user over 3.5 months, not accidental loss.
2. If JIPRA (the school) confirms they *did not* intend to remove their entire staff roster, provide this report to identify exactly which 196 staff_no / person_id pairs to selectively restore — restoration can then be done one-by-one or in a reviewed batch using the app's own restore path (reversing `ARCHIVED_STAFF`), with duplicate-detection re-run at that time.
3. Independently of the restore decision, review and clean up the **147 orphaned biometric mappings** (§4.1) tied to archived staff, since that is a live data-integrity issue today.
4. No commit/push is needed — this operation only read data and produced this report; no code or data was changed.

---
*No staff records, allocations, biometric mappings, or any other data were modified during this audit. This report is a decision-support artifact only.*
