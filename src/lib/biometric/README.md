# `src/lib/biometric/` — Biometric identity

Who is behind a fingerprint. This folder owns the mapping between a **device PIN** and a **person**, and everything needed to keep that mapping honest.

Attendance ingestion (raw events, dedup, punch time) lives in [`src/lib/ingestion/`](../ingestion/README.md) and [`src/lib/attendance/`](../attendance/README.md). This folder answers only "whose finger was that?"

## Responsibilities

Allocate PINs, record enrollments and templates, match device-supplied names to DRAIS people, queue what can't be matched for a human, correct mistakes without destroying history, and reconcile what a device actually holds against what DRAIS believes.

## The canonical model

```
school_id + device_sn + device_user_pin
        │
        ▼
biometric_enrollments  ──▶ person_id (+ role_type, role_ref_id)
        │
        └──▶ biometric_templates  (fingerprint bytes, per finger)
```

`biometric_enrollments` is **the** identity table. It replaced a three-table fallback chain (`zk_user_mapping` → `device_user_mappings` → `device_users`) that produced different answers depending on which reader you asked.

**Every identity writer routes through `enrollment-service.ts`** — auto-link, USERINFO processing, local TCP enroll, sync-identities, the mapping UI, and orphan claim. None of them write mapping tables directly. That single write path is what makes the invariants below enforceable at all.

## Three invariants, each bought with a real incident

**1. Attendance events are immutable; identity associations are correctable.**

A wrong mapping is not fixed by deleting events. `identity-correction.ts` moves the PIN to the right person (history-first — a `mapping_history` row recording who, when, old, new, why) and then re-attributes historical raw events. The event's time, device and fingerprint identity are preserved verbatim; only the identity label changes. Nothing is ever deleted. Same principle in `person-merge.ts`: losers are soft-deleted and restorable, raw events untouched.

**2. A device name may only create a permanent mapping when the match is deterministic.**

`name-match-policy.ts` is a pure module with no imports precisely so every caller applies the identical rule: the top candidate must be a **full-score** match (every name token matched, Jaccard 1.0) **and** no other candidate may be plausible. Two same-named people both scoring 1.0 is ambiguous — an operator decides.

The previous 0.6 threshold mapped "close enough" names permanently. The forensic audit found what that costs.

**3. An unmatched device user becomes a queue item, never a new person.**

`pending-device-users.ts` exists because USERINFO processing used to do two unsafe things: silently **create** people and student rows from unknown device names (a misspelling forked a duplicate learner that then accrued attendance), and resolve exact-name collisions with `LIMIT 1` (the lower id silently won the PIN forever). Now anything not deterministically matchable lands as `pending` (no candidate) or `ambiguous` (several), carrying the device's own evidence.

## Files

**Identity core**

| File | Purpose |
|---|---|
| `identity/resolve.ts` | The unified resolver. Reads canonical enrollments first; falls back to the legacy chain only when `dual_read` is on, and **records which path answered** so the mismatch rate per school is measurable before dual-read is switched off. |
| `enrollment-service.ts` | The single write path. Resolves `person_id` school-scoped, upserts the canonical row. |
| `pin-allocator.ts` | Allocates against `biometric_enrollments` (`uk_school_pin`), dual-writing to `zk_user_mapping` during the migration window. The predecessor allocated `INSERT IGNORE` per device while other paths used `MAX+1` over a different scope; the audit confirmed observable collisions. |
| `fingerprint-status.ts` | One read path for "does this person have a working fingerprint, and if not, where is it stuck?" Replaced a three-table boolean guess. Legacy template tables are consulted only as a compatibility hint. |

**Matching**

| File | Purpose |
|---|---|
| `identity/matching.ts` | The scoring engine: 0–100 confidence with tiers `auto` ≥90 / `review` 60–89 / `unmatched` <60. Handles the naming chaos real school devices exhibit — case, accents, token order, missing middle names, fused tokens. |
| `name-match-policy.ts` | The **permanence** rule (above). Pure, no DB, no imports. Scoring says "how close"; this says "close enough to be permanent". They are separate on purpose. |
| `name-fuzzy.ts` | Shared "given a device name, who could this be?" lookup for the orphan-claim queue and the live identity popup. Single source of truth — don't re-implement the scoring at a call site. |
| `identity/device-user-sync.ts` | Orchestration: TCP-pull the device directory → match unmapped PINs → persist tiered suggestions → admin confirms or rejects. Guards 1:1 both ways; contested auto-matches are downgraded rather than applied. |
| `pending-device-users.ts` | The queue for everything that isn't deterministic. |
| `device-directory.ts` | What the device *thinks* a (sn, pin) is called — even without a formal mapping. Populated from device pushes, and separately for DRAIS-initiated enrollments, since most firmware ACKs `DATA UPDATE USERINFO` silently and never echoes a USER record back. |

**Corrections**

| File | Purpose |
|---|---|
| `identity-correction.ts` | "FP12345 was mapped to John but belongs to Peter." `planCorrection()` is pure and previewable; `applyCorrection()` executes it history-first. |
| `person-merge.ts` | Guided duplicate-person merge — detect, pick keeper, preview, merge, audit. Duplicates split attendance and corrupt analytics; this used to require scripts. `normalizeName()` and `groupDuplicates()` are pure. |

**Templates**

| File | Purpose |
|---|---|
| `template-service.ts` | Record a captured template (upsert on enrollment + finger index) and fan out distributions. A re-capture overwrites — old bytes are lost, but capture time and originating device survive as forensic context. |
| `template-distribution.ts` | Push a stored template to another device. Templates are stored **verbatim** in the device's own ADMS base64 format, so distribution is the exact inverse of capture — no format conversion, no corruption risk. Delivered over `zk_device_commands`. |

**Devices**

| File | Purpose |
|---|---|
| `device-access.ts` | Authorization: a session may operate on a device only when the device's school matches, or the session is super-admin. **The device's `school_id` is the trusted scope for every downstream write** — never the session's. A live K40 test exposed the cross-school contamination this prevents. |
| `inventory-service.ts` | Ask the device what it actually holds. `tcp` (LAN `getUsers()`) is the source of truth; `adms` (queued `DATA QUERY USERINFO`) works for cloud deployments but K40 firmware support is inconsistent and a run may stay pending. On-device counts always come from the latest **completed** run. |
| `reconciliation-service.ts` | Device ⇄ DRAIS diff with specific mismatch categories instead of "data mismatch". Persists runs and items with a resolution lifecycle (open → resolved / ignored / quarantined). |
| `device-user-commands.ts` | Queues `DATA DELETE USER PIN=X` so a device physically drops the templates for an unmapped or archived person — otherwise it keeps 1:N-matching them locally. Best-effort with an expiry; **DRAIS never blocks an identity change on a device round-trip.** |

**Migrations** — `migrations/` holds the schema-ensure and backfill helpers for `biometric_enrollments`, `biometric_templates` and `mapping_history`.

## Working in this folder

- **Never write a mapping table directly.** Go through `enrollment-service.ts`, or the invariants above stop holding.
- **Never delete or edit a raw attendance event to fix identity.** Re-attribute it.
- **Scope every device write by the device's `school_id`**, not the session's.
- **Don't lower the deterministic-match bar** to clear a queue backlog. The queue is the feature.
- **Don't block on device round-trips.** Devices go offline; identity operations must complete regardless, with the command queued and its status visible.
- **Keep the pure modules pure.** `name-match-policy.ts`, `matching.ts` scoring, `planCorrection`, `normalizeName`/`groupDuplicates` are all unit-tested without a database.

## Tests

`npm run test:biometric` — matching, name-match policy, identity correction and undo, person merge, template distribution, fingerprint labels.

## Known constraints

- **Dual-read is still on for unmigrated schools.** `identity/resolve.ts` records which path answered; that instrumentation is the prerequisite for turning it off, per school.
- **Templates are format-locked to ZK ADMS.** Storing bytes verbatim is what makes distribution safe, and also means a non-ZK device cannot consume them.
- **Re-capture destroys the previous template bytes.** Only the metadata is retained.
- **ADMS inventory may never complete** on firmware that ignores `DATA QUERY USERINFO`. LAN/TCP is the reliable path — see [local LAN access](../../../docs/architecture/BIOMETRIC_IMPLEMENTATION_MAP.md).
- **`zk_user_mapping` is still dual-written** during the migration window. It is legacy; do not add readers.

## Dependencies

`src/lib/db` · `src/lib/auth` (`SessionInfo`) · `zk_device_commands` channel (`/api/zk-handler`) · `src/lib/ingestion` (consumes identity, not the reverse)

## Related

[`docs/architecture/BIOMETRIC_IMPLEMENTATION_MAP.md`](../../../docs/architecture/BIOMETRIC_IMPLEMENTATION_MAP.md) · [ADR-0001](../../../docs/adr/0001-attendance-raw-events.md) raw-event immutability · [`../ingestion/README.md`](../ingestion/README.md) · [`../attendance/README.md`](../attendance/README.md) · the July 2026 biometric centralization audit in [`docs/audits/`](../../../docs/audits/)
