# Attendance Founder-Independence Audit

**Scope:** the entire Attendance ecosystem. **Rule:** audit only — no implementation until approved.
**Version audited:** 1.96.1 · 2026-07-25. **Method:** code inspection of the 22 attendance pages + ~55 attendance/biometric API routes actually present.

**Headline:** DRAIS is now *mostly* founder-independent for attendance — the last ~16 releases added a full self-service intelligence layer (Health, Recovery, Time, Device, Identity, Behaviour, Explanation). The residual founder-dependence is concentrated in **five** areas: undo for identity corrections, duplicate-person merge, bulk roster hygiene, one-off historical repair, and localization/accessibility of the new pages. This audit certifies what is covered and names precisely what is not.

---

## 1 · Attendance Architecture Report (component assessment)

| Component | Route | State | Arch | Founder-dep | Notes |
|---|---|---|---|---|---|
| Dashboard | `/attendance` | Healthy | 8 | **Low** | Fixed the only-full-group-by 500; intelligence strip links every layer. |
| Logs | `/attendance/logs` | Healthy | 8 | **Low** | Data-first; Correct/Assign/Explain inline; sortable, exportable, bulk-delete. |
| Health Center | `/attendance/health` | Healthy | 9 | **None** | 10-check score + worst-first recommendations. Self-diagnosis. |
| Recovery Center | `/attendance/recovery` | Healthy | 9 | **None** | Gap detection → routed recovery (LAN pull / queue retry / device). |
| Time Health | `/attendance/time-health` | Healthy | 9 | **None** | Drift detect → preview → apply → **UNDO** → history. Gold standard. |
| Event Explorer | `/attendance/trace` | Healthy | 9 | **None** | Per-punch 10-stage trace answers "where did it break?". |
| Trends | `/attendance/trends` | Healthy | 8 | **Low** | Pattern analytics + alerts. *English-only.* |
| Profiles | `/attendance/profiles` | Healthy | 8 | **Medium** | Watch-list + roster-review list, but **no bulk-deactivate action**. |
| Device Intelligence | `/attendance/device-intelligence` | Healthy | 9 | **None** | Reputation + maintenance advice. |
| Identity Intelligence | `/attendance/identity-intelligence` | Healthy | 8 | **Medium** | Detects duplicates/unknowns/stale but **merge is not one-click**. |
| Identity Matching | `/attendance/identity-matching` | Healthy | 8 | **Low** | Auto/review tiers, Detect & map. |
| Identity Correction | logs → Correct modal | Healthy | 7 | **Medium** | Reassign + create + person-cascade, audited — **but NO undo in UI**. |
| Settings / Shifts / Holidays | `/attendance/settings`,`/shifts`,`/holidays` | Healthy | 8 | **Low** | Self-service policy + weekday overrides + shifts. English-leaning. |
| Devices / Device Control | `/attendance/devices`,`/device-control` | Healthy | 7 | **Medium** | TCP pull wizard; provisioning is expert-oriented. |
| Enrollment | `/attendance/enrollment` | Healthy | 7 | **Medium** | Multi-finger + card panel; capture still device-bound. |
| ADMS ingest | `/api/zk-handler` | Healthy | 8 | **Low** | Store-and-forward; device-key auth; logged. |
| Live popup / SSE | `/api/attendance/stream`,`live-scan` | Healthy | 8 | **Low** | popup_at stamped; gate verdicts. |
| SMS / notifications | outbox + drain | Healthy | 8 | **Low** | Health Center surfaces failures; Recovery retries queue. |
| Exports | `/api/attendance/export` | Healthy | 7 | **Low** | CSV/Excel. **No matching bulk import UI.** |
| Reports | `/attendance/reports*` | Healthy | 7 | **Low** | Allowance + aggregates. |
| Background sweep | `intelligence-sweep` | Healthy | 9 | **None** | Self-feeding (baselines, clock, finalization) — no manual trigger needed. |

---

## 2 · Founder Dependence Report (the residual — ranked)

These are the workflows a normal administrator **still cannot fully self-serve**:

**FD-1 · Identity correction has no UNDO (High).** Time correction has a one-click undo + history; identity correction does not. A mis-correction is fixable only by searching and re-correcting. `biometric_mapping_history` holds the prior binding, so the data exists — the UI just doesn't expose "revert this correction." *Founder risk: an admin who mis-maps and panics calls the founder.*

**FD-2 · Duplicate-person merge is not a workflow (High).** Identity Intelligence *detects* "one person, many records / PINs" but consolidating two person rows (attendance + enrollments + verdicts) is only reachable via the raw person-reattribution API — no guided "merge A into B, preview, apply" screen. *This is exactly what forced script-based cleanup.*

**FD-3 · Bulk roster hygiene is script-only (High).** Person Profiles surfaces the "never-present / likely former" list, but there is **no bulk action** to deactivate them or fix a student/enrollment mismatch. Cleaning a bloated roster still needs SQL/scripts. *The intelligence is honest but the remedy is founder-bound.*

**FD-4 · One-off historical repair is script-only (Medium).** Going-forward is self-healing (sweep finalizes, corrects). But a *past* corruption (e.g. a bad backfill, a wrong-owner span before detection) has no admin "re-evaluate this date range / re-attribute this span" tool — those were run as `tmp/*.mts` by the founder. Self-heal covers new data, not retro repair.

**FD-5 · Template push to devices is manual + unverified (Medium).** The format is proven and the "Push fingerprints" action exists, but no template has been validated against a live device, and cross-device availability isn't automatic. A "person works on Device A but not B" situation still needs founder judgement.

**FD-6 · New intelligence pages are English-only / un-accessibility-audited (Medium).** Health, Recovery, Trends, Profiles, Device/Identity Intelligence, Event Explorer were built English-first. Per the project's own bilingual rule, Arabic + keyboard/screen-reader passes are missing. *A non-English administrator is partially founder-dependent on these screens.*

**FD-7 · Deleted person → attendance impact not clearly recoverable in-context (Low).** Soft-delete + `/admin/trash` restore exist, but the attendance consequence of deleting a teacher/learner (orphaned punches, broken verdicts) isn't surfaced or one-click-recoverable from the attendance side.

Everything else in the brief's failure list — clock drift, offline device, ADMS/TCP disconnect, gap/missing attendance, SMS failure, blocked queue, unknown fingerprint, duplicate PIN, wrong timezone, RTC battery, heartbeat stop, wrong policy, popup stop, logs stop, why-late — **has a self-service detect+explain+recover path today** (Health / Recovery / Time / Device / Identity / Explanation). Those are certified **not** founder-dependent.

---

## 3 · Risk Register

| ID | Risk | Class | Trigger |
|---|---|---|---|
| R-1 | Mis-correction with no undo → wrong attendance persists | **High** | FD-1 |
| R-2 | Duplicate people → double/split attendance, wrong analytics | **High** | FD-2 |
| R-3 | Roster bloat → intelligence "true but noisy", absence over-counted | **High** | FD-3 |
| R-4 | Past corruption undiscovered → silent wrong history | **Medium** | FD-4 |
| R-5 | Template not on second device → learner "unknown" at a gate | **Medium** | FD-5 |
| R-6 | Non-English admin blocked on intelligence screens | **Medium** | FD-6 |
| R-7 | Deleted person orphans attendance | **Low** | FD-7 |
| R-8 | 112 attendance routes lack try/catch (from route audit) → opaque 500s | **Medium** | cross-cutting |

---

## 4 · Missing Features Register

1. **Undo/Revert on identity correction** (revert to the prior `mapping_history` binding, preview + re-evaluate).
2. **Guided Person Merge** (pick keeper, preview what moves, apply, audit) — turns FD-2 into two clicks.
3. **Bulk roster actions** in Profiles (multi-select never-present → deactivate; fix student/enrollment mismatch).
4. **Historical Repair tool** (admin: "re-evaluate date range for person/school", "re-attribute span") — the script work, made self-service and audited.
5. **Attendance Import** (bulk correction/backfill from CSV, mirroring export).
6. **Localization pass** for all intelligence pages (EN+AR) + accessibility (keyboard, ARIA, contrast).
7. **In-context delete recovery** (attendance-side "restore this person + rebuild their verdicts").

---

## 5 · UX Improvement Register

- Every intelligence page already **explains itself** and links its fix — good. Gap: **preview + undo** are inconsistent (Time has both; Identity has neither).
- **Bulk operations** exist only for log-delete; missing for roster/identity.
- **Localization/dark-mode**: dark mode is consistent; Arabic is not on new pages.
- **Empty/searching/error states**: fixed on the Correct search this cycle; sweep the other search surfaces for the same visible-state treatment.
- **Confirmation on destructive/irreversible actions** (person merge, bulk deactivate) must be explicit given no undo yet.

---

## 6 · Recovery Workflow Register (does a no-founder path exist?)

| Failure | Self-service today? | Where |
|---|---|---|
| Clock drift / RTC dead / wrong TZ | ✅ detect+preview+apply+undo | Time Health |
| Device offline / heartbeat stop / rebooted | ✅ detect+advise | Health, Recovery, Device Intel |
| ADMS/TCP disconnect, logs stop, missing attendance | ✅ gap detect → routed recovery | Recovery Center |
| SMS fails / queue blocked | ✅ surfaced + retry | Health, Recovery |
| Unknown fingerprint / duplicate PIN | ✅ detect+map+create | Identity Matching/Intelligence |
| Wrong identity mapping | ⚠️ correct **but no undo** | Correction modal (FD-1) |
| Duplicate person | ⚠️ detect only, no merge UI | FD-2 |
| Roster bloat / deleted person | ❌ script/founder | FD-3, FD-7 |
| Past corruption / re-attribute span | ❌ script/founder | FD-4 |
| Why late / why unresolved / why changed | ✅ Explanation + audit | Explain, mapping_history |

---

## 7 · Automation Opportunities

- **Auto-suggest merges**: Identity Intelligence already computes duplicate risk — one step from a "merge suggested" queue an admin approves (human-in-the-loop, never auto).
- **Proactive digest** (still the #1 systemic gap): all intelligence is pull/banner; nothing *pushes* the admin a daily "here's what needs you" via the existing SMS/notification pipeline. Closing this makes "notices" become "tells you."
- **Roster self-audit**: the sweep already learns who never appears — it could maintain the deactivation-candidate list continuously so bulk hygiene is one approval.

---

## 8 · Recommended Execution Phases

Each future phase must reference this audit. Ordered by founder-dependence eliminated per unit effort.

**Phase A — Undo & preview parity (FD-1).** *Problem:* correction is irreversible in-UI. *Impact:* mis-maps need the founder. *Cause:* no revert wired to `mapping_history`. *Routes:* logs Correct modal, `/api/attendance/identity-correction`. *Tables:* biometric_mapping_history, attendance_raw_events, attendance_records. *Architecture:* add `action:'undo_correction'` (revert to prior binding + re-evaluate) + a preview before apply. *Complexity:* Low. *Risk:* Low. *Benefit:* every correction becomes safe/reversible. *Version:* minor (adds capability).

**Phase B — Guided Person Merge (FD-2).** *Problem:* duplicates need scripts. *Impact:* wrong analytics, double-count. *Cause:* no merge UI over the reattribution API. *Routes:* new `/attendance/identity-intelligence` action + modal. *Tables:* people, staff/students, enrollments, attendance_raw_events, attendance_records. *Architecture:* pick keeper → preview moved counts → apply reattributePerson → audit. *Complexity:* Medium. *Risk:* Medium (data move — needs preview + undo). *Benefit:* self-service dedup. *Version:* minor.

**Phase C — Bulk roster hygiene (FD-3).** *Problem:* deactivating former staff/learners is script-only. *Impact:* noisy intelligence, over-counted absence. *Cause:* no bulk action on the roster-review list. *Routes:* Profiles page + a bulk endpoint. *Tables:* staff, students, enrollments. *Architecture:* multi-select never-present → confirm → soft-deactivate → audited; plus a student/enrollment mismatch fixer. *Complexity:* Medium. *Risk:* Medium. *Benefit:* trustworthy intelligence without SQL. *Version:* minor.

**Phase D — Proactive digest (Automation).** *Problem:* intelligence waits to be viewed. *Impact:* nobody watching = unactioned problems. *Cause:* pull-only. *Routes:* new scheduled digest via existing outbox. *Tables:* notification_outbox/policies. *Architecture:* daily "attendance needs you" to admin (opt-in). *Complexity:* Low–Med. *Risk:* Low. *Benefit:* founder-independence of *attention*. *Version:* minor.

**Phase E — Historical Repair tool (FD-4).** *Problem:* past corruption = founder scripts. *Cause:* no admin retro-repair. *Architecture:* audited "re-evaluate range / re-attribute span" panel. *Complexity:* Medium. *Risk:* Medium. *Version:* minor.

**Phase F — Localization + accessibility (FD-6).** *Problem:* new pages EN-only. *Architecture:* t()-wrap all intelligence pages (EN+AR per project rule) + a11y pass. *Complexity:* Medium (breadth). *Risk:* Low. *Version:* patch/minor per page.

**Phase G — Contracts/robustness (cross-cutting, R-8).** Fold in the route-hardening audit's `withRoute` wrapper on attendance routes so no attendance call fails opaquely.

**Suggested order:** A → D → C → B → E → F → G. (Undo first makes everything else safe; digest closes the attention gap cheaply; then dedup/hygiene/repair; localization + robustness last.)

---

### Certification statement
As of 1.96.1, the Attendance module is **founder-independent for all real-time operational failure modes** (device/clock/sync/SMS/identity-resolution/explanation). It is **not yet** founder-independent for **corrective data operations** (undo, merge, bulk hygiene, retro repair) or for **non-English/assistive users**. Closing Phases A–F removes the remaining founder dependence; no implementation should begin until this audit is approved.
