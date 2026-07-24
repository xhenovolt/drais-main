# Biometric Template Synchronization — Capability Report (Part 6)

The brief said: *do not assume; study; if yes design, if no document the limitation and the closest alternative.* This is the verified finding for DRAIS v1.94.x, grounded in the code + the live `template_distributions` table.

## Verdict: PARTIAL — central store ✓, distribution queue ✓, outbound device push ✗ (by design, safely)

### What works today
1. **Central template store.** Devices POST fingerprint templates after enrollment via the ADMS tables `TEMPLATEV10` / `BIODATA` (`zk-handler` → `processFingerprint`), stored verbatim in `biometric_templates(enrollment_id, finger_index, template_bytes, template_size, quality_score, captured_device_sn)`. So DRAIS already holds every template centrally. Production: templates present, people with 3–4 fingers.
2. **Distribution ledger.** `template_distributions(template_id, device_sn, status, queued_at, attempted_at, loaded_at, attempts, last_error)` records, per device, whether each template is `queued` / `loaded` / `failed`. `template-service.queueDistributionsForSchool()` fans a new template out to every active device in the school (origin marked `loaded`). Live state: 412 rows, all `loaded`.
3. **Re-queue** of failed distributions via `/api/admin/biometric/templates/[id]/distribute`.

### The gap
Nothing converts a `queued` `template_distributions` row into the actual **ADMS command that delivers the template bytes to the target device**. The device command channel (`zk-handler`) emits `DATA UPDATE USERINFO …` (identity) but not `DATA UPDATE BIODATA …` (template) from the queue. So a template captured on Device A is *recorded centrally and queued* for Device B, but not yet *pushed* to Device B — a person enrolled on one device isn't automatically usable on another.

### Why it is NOT wired blind (the responsible call)
Pushing biometric templates to live devices is high-risk: a wrong template format/version (ZKTeco ZK6.0 vs ZK9.0/ISO), size, or FID mapping can corrupt on-device enrollment or silently reject. It MUST be validated against a physical device before enabling in production. Doing it untested inside a "stabilization" patch would be the opposite of stabilization.

### Design (ready to implement when a device is available to validate)
ADMS supports server→device template delivery. When a device polls for commands, additionally drain its queued distributions:
```
DATA UPDATE BIODATA PIN=<pin>\tNo=<pin>\tIndex=<finger_index>\tValid=1\tDuress=0\tType=1\tMajorVer=<fmt>\tMinorVer=0\tFormat=0\tTmp=<base64 template_bytes>
```
(exact field set depends on firmware; `TEMPLATEV10` uses `DATA UPDATE FINGERTMP PIN=…FID=…Size=…Valid=…TMP=…`). On the device's ACK for that command id, mark the `template_distributions` row `loaded`; on error, `failed` + `last_error`, with bounded `attempts`.

Steps to enable safely:
1. Confirm each target device's template format (`captured_device_sn` + a firmware probe) matches the stored template's format — never push a mismatched format.
2. Emit the command for one finger to one test device; verify the person can authenticate on it.
3. Only then enable fleet fan-out; keep it opt-in per school.

### Closest alternative already usable now
- The central store + `queueDistributionsForSchool` mean re-enrolling a person on a second device is unnecessary for *identity* (USERINFO is pushed); only the *template* needs the device push above. Until then, the operational path is: enrol the finger on each gate device (the enrollment station already supports this), which the panel from Parts 4/5 makes visible per person.

### Observability shipped with this report
`/api/biometric/enrollment-status` now also returns each finger's distribution state (loaded/queued across devices) so an admin can SEE sync status per person — the capability is transparent even while the outbound push stays gated on device validation.
