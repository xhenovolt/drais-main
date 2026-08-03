# `src/lib/services/` — Mixed service layer

**This folder is not a coherent subsystem.** It accumulated services from several eras: device integration, an older finance layer, and two lifecycle services. Read it as four unrelated groups.

New code belongs in the domain folder it serves — [`finance/`](../finance/README.md), [`devices/`](../devices/README.md), [`biometric/`](../biometric/README.md) — not here.

## 1. Finance — and which one is canonical

| File | Status |
|---|---|
| `FinanceLedger.ts` | **The canonical ledger.** Build on this. |
| `FeeService.ts` / `FinanceService.ts` | Older fee surface. Still in use. |
| `ReceiptService.ts` | PDF receipts (`pdfkit` + `qrcode`). |

`FinanceLedger.ts` states its rules at the top and they hold across the finance domain:

> 1. **Balance is NEVER stored** — always `SUM(debit) - SUM(credit)`.
> 2. **Ledger entries are NEVER deleted or updated** after creation.
> 3. Every fee charge is a debit; every payment is a credit.
> 4. Fee assignment is **idempotent** — `fee_assignment_log` prevents duplicates.

"Every shilling must have a source, destination, and history." A correction is a new compensating entry, never an edit — which is what makes the ledger auditable a year later, and what makes idempotent assignment necessary rather than merely nice.

See [`../finance/README.md`](../finance/README.md), which applies the same derive-never-store rule to money locations, budgets and pocket money.

## 2. Devices (non-ZKTeco)

| File | Purpose |
|---|---|
| `DahuaDeviceService.ts` | Dahua access-control devices over their authenticated HTTP CGI API: connection test, system info, access logs, retries, timeouts. |
| `DeviceAdapterService.ts` | Abstraction across Dahua / ZKTeco / HikVision / generic. |
| `DeviceConnectionManager.ts` | Device config persistence, connection monitoring, heartbeats. |
| `EncryptionUtil.ts` | **AES-256-GCM at rest for device credentials.** Requires `DEVICE_ENCRYPTION_KEY` (32 bytes, hex). |

Device credentials are stored encrypted because a device password is a working key to a physical access-control system on a school's premises. Authenticated encryption (GCM) rather than plain AES means tampering is detected, not just decrypted into garbage.

ZKTeco/ADMS ingestion is **not** here — see [`../ingestion/`](../ingestion/README.md) and [`../biometric/`](../biometric/README.md).

## 3. Lifecycle services

| File | Purpose |
|---|---|
| `staff-employment.ts` | **Append-only** event log over `staff_employment`. Hire, suspend, return, terminate, promote, transfer — each a new row. Rows are never `UPDATE`d; a correction is a new event with a `reason`. `staff.status` is a cache of the latest event. `effective_date` may be backdated; `event_date` is always now. |
| `class-teachers.ts` | Time-bounded per-(class, term, stream) assignments. `stream_id IS NULL` applies to every stream in the class. A reassignment sets the previous row's `valid_until` and appends — the historical chain is preserved. The snapshot generator resolves the name at generation time into `snapshot.classes[].classTeacher`, so the renderer stays unchanged. |

Both are append-only for the same reason: "who was the class teacher in Term 2 last year" must still be answerable after five reassignments, and a printed report card must keep naming whoever actually signed it.

## Working in this folder

- **Put new code in its domain folder**, not here.
- **Append; never update or delete** in the ledger and the two lifecycle logs.
- **Set `DEVICE_ENCRYPTION_KEY`** in any deployment using Dahua devices, or credential storage fails.
- **Prefer `FinanceLedger.ts`** over the older finance services for anything new.

## Known constraints

- **Overlapping finance implementations.** `FinanceService.ts` / `FeeService.ts` predate `FinanceLedger.ts`; the boundary is historical, not designed.
- **`staff.status` is a cache** and can drift if an event is inserted outside the service.
- **Dahua support is HTTP-CGI-specific** and firmware-sensitive.
- **`EncryptionUtil` has no key rotation path.** Changing `DEVICE_ENCRYPTION_KEY` orphans stored credentials.

## Dependencies

`src/lib/db` · `pdfkit` · `qrcode` · `node:crypto`

## Related

[`../finance/README.md`](../finance/README.md) · [`../devices/README.md`](../devices/README.md) · [`../biometric/README.md`](../biometric/README.md) · [`../snapshots/README.md`](../snapshots/README.md)
