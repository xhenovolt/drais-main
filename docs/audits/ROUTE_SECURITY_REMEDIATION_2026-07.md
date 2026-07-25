# Route security remediation — 2026-07 (route-hardening, batch 1)

Triage of the route-audit "unguarded" set turned up several genuinely dangerous
legacy/debug routes (not just heuristic false positives). This batch closes them
and makes the audit metric honest.

## Fixed

| Route | Problem | Action |
|---|---|---|
| `POST/GET /api/sms` | **Unauthenticated.** POST sent SMS by `member_code` off an old `members` table; GET fired a **real SMS to a hardcoded number on every request**. Hardcoded live provider API key. Broken `to: +256`. No callers. | **Retired → 410.** Live path is the authenticated `/api/sms/send`. |
| `/api/reminders` | Authenticated, but carried the **same hardcoded provider API key** at module scope. | Key moved to `AFRICASTALKING_API_KEY` / `AFRICASTALKING_USERNAME` env (matching existing convention). |
| `GET /api/test-db` | **Unauthenticated schema disclosure** — opened a raw DB connection and reported table existence + row counts. No callers. | **Deleted.** |
| `GET /api/test-simple` | Dead debug stub. No callers. | **Deleted.** |
| `POST /api/fingerprint` | **Unauthenticated write** — inserted `fingerprints` rows keyed by a caller-supplied `student_id`. Enrollment half of the "decorative WebAuthn" surface (static all-zeros challenge, no real verification) whose **verify half is already hard-disabled**. | **Hard-disabled → 501**, consistent with the verify route's recorded decision. |
| `POST /api/dvcf/migrate-templates?seed=true` | **Unauthenticated data seeding** into `dvcf_documents`. No callers. | Gated behind an authenticated **super-admin** session. |
| `GET/POST /api/device-simulator/dahua/attendance` | Dev hardware stand-in reachable in production. | Gated to non-production (`404` in prod unless `ALLOW_DEVICE_SIMULATOR=true`). |

## Audit tool correctness

`scripts/route-audit.mjs` only recognised the school-session guard, so it
mis-flagged routes guarded by other legitimate mechanisms — and flagged the new
`withRoute` routes as unguarded. The `AUTH` matcher now also recognises
`withRoute`, `requirePlatformAuth`, `requireParent`, `requirePortalContext`, and
`verifyVerifyToken`; the `no-trycatch` class now treats `withRoute` (which wraps
the handler in try/catch) as covered. Result: unguarded **88 → 52**, a truer
picture. The residue is dominated by legitimately public routes (auth/login,
health, heartbeat, device webhooks, token-verify, parent/portal contexts).

## ⚠ Action required by the operator (cannot be done from code)

The leaked Africa's Talking API key
(`atsk_…3d9a1994a774`, username `xhenovolt`) **is in git history** and must be
treated as compromised:

1. **Rotate it** on the Africa's Talking dashboard (revoke the old key, issue a new one).
2. Set `AFRICASTALKING_API_KEY` and `AFRICASTALKING_USERNAME` in the hosting
   environment so `/api/reminders` keeps working.
3. (Optional) purge the key from history with `git filter-repo` / BFG — rotation
   is what actually protects the account; history rewrite is hygiene.

## Next batches (tracked, not in this change)

- Migrate the remaining hand-rolled attendance/finance/academics routes onto
  `withRoute` for uniform try/catch (`no-trycatch` still 114).
- `n-plus-1` (116) and `select-star` (28) query-hygiene sweeps.
