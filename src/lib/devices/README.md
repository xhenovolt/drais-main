# `src/lib/devices/` — Device ownership

Which school owns a physical biometric device, and the ceremony for changing that.

Identity (which person is behind a PIN) is [`src/lib/biometric/`](../biometric/README.md). Attendance capture is [`src/lib/ingestion/`](../ingestion/README.md). This folder is only about ownership.

## Why it's a ceremony and not an update

Moving a device between schools is a cross-tenant, physical-world action: it archives enrollment and directory data at the old school and hands a fingerprint reader to a different set of children. So it is gated, staged and audited rather than being a `school_id` update.

## The three operations

```
release(sn)      current school relinquishes
                 → closes every active enrollment for (sn, school) as 'transferred'
                 → device_transfers row status='released', device status='released'

acquire(sn, to)  new school picks it up   [requires status='released']
                 → devices.school_id = new school, status back to 'active'
                 → wipes fingerprint_orphans for this SN — they belonged to the old school

decommission(sn) terminal
                 → revokes every active enrollment, cross-school; device retired
```

**`attendance_raw_events` are never deleted by any of these.** They stay attributed to the original school, because they record something that actually happened there ([ADR-0001](../../../docs/adr/0001-attendance-raw-events.md)).

Every operation writes an `audit_logs` row (`DEVICE_RELEASED` / `DEVICE_ACQUIRED` / `DEVICE_DECOMMISSIONED`), queryable from `/admin/audit-logs`, and returns impact counts so the operator UI can say "14 enrollments archived, 3 orphans wiped" before and after.

## Failing safe

**The claim secret gate.** Release, acquire and decommission all require a shared operator secret from `DEVICE_CLAIM_SECRET`. It lives only in the environment — never in the repo, never returned to a client. **If the variable is unset the gate is closed**: every transfer is refused with a clear message, so a misconfigured deployment fails safe instead of allowing free transfers.

Control Center super-admins may force-transfer without the secret (`fromSuperAdmin`), which is the founder-independence escape hatch; accountability is preserved through `device_transfers` plus `audit_logs`.

**Best-effort transactional.** Each step is individually wrapped, so a partial failure still leaves an auditable transfer row in `aborted` state rather than an invisible half-transfer. Operators re-run with `forceRetry` to complete it.

## Files

| File | Purpose |
|---|---|
| `transfer-service.ts` | The three operations above. Also called by [`src/lib/control/devices.ts`](../control/README.md) so platform-driven transfers use the identical ceremony. |
| `claim-secret.ts` | The closed-by-default secret gate. |
| `migrations/` | Ownership schema ensure helpers. |

## Deliberately not done: device-side wipe on acquire

Queueing `DATA DELETE USER` at acquire time to clear the physical device's user list is **deferred**, because firmware support is inconsistent and doing it blindly would fail silently on some devices.

Leaving PINs on the device is safe DRAIS-side: a punch from a stale PIN goes through the resolver and lands unresolved, which is correct. The device merely still "knows" a name from the previous school, cosmetically. Physical cleanup is operator-initiated via "Sync identities".

## Working in this folder

- **Reuse `transfer-service`; don't write a second path.** School-side and Control-Center-side transfers behave identically because they share it. That's the point.
- **Never delete raw events during a transfer.**
- **Keep the secret gate closed-by-default.** An "if unset, allow" fallback would turn a config mistake into open cross-school transfers.
- **Return impact counts.** Operators need to see consequences before confirming.

## Known constraints

- **`acquire` requires `released` first.** There is no direct school-to-school move; the two-step is what makes the intermediate state auditable.
- **Partial transfers need manual `forceRetry`.** Nothing retries automatically.
- **Physical devices may retain stale user lists** (above).

## Dependencies

`src/lib/db` · `src/lib/audit` · `src/lib/devices/migrations`

## Related

[ADR-0001](../../../docs/adr/0001-attendance-raw-events.md) · [`../biometric/README.md`](../biometric/README.md) · [`../control/README.md`](../control/README.md) · [`../ingestion/README.md`](../ingestion/README.md)
