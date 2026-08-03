# `src/lib/auth/` — API auth helpers and module gating

Route-level helpers for staff authentication and **module gating**. The session layer itself is [`src/lib/auth.ts`](../auth.ts); permissions are [`src/lib/rbac/`](../rbac/README.md).

## Permissions vs modules — two different questions

They look similar and are checked separately on purpose:

| | Question | Source | Super-admin bypass? |
|---|---|---|---|
| **Permission** ([`rbac/`](../rbac/README.md)) | *May this user do this?* | roles → `role_permissions` | **Yes** |
| **Module** (here) | *Has this school bought this?* | per-school module flag | **No** |

**Super-admin does not bypass a module gate.** A super-admin still represents one school; if that school has Tahfiz disabled, Tahfiz stays disabled for them too. Module gates model **subscription and billing intent**, not access level — and a super-admin who could see unpurchased modules would make the boundary meaningless. To act across schools, a super-admin uses the school-selection flow; to act on behalf of a school without its password, an operator uses [Control Center impersonation](../control/README.md).

## Files

| File | Purpose |
|---|---|
| `withModule.ts` | The HOF to use: `export const GET = withModule('tahfiz', handler)`. Returns `403 MODULE_DISABLED` when the calling school lacks the module. |
| `requireModule.ts` | `checkModule()` / `requireModule()` — the underlying check, mirroring `requirePermission`'s shape. |
| `apiAuth.ts` | Session validation and permission checking for API routes. Older surface; new routes should prefer [`rbac/authorize.ts`](../rbac/authorize.ts). |
| `enforcement.ts` | Server-side route protection and the public-route allowlist (`/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, …). |

## Working in this folder

- **Gate at the route with `withModule`**, not inside a component. A UI that hides a disabled module while its API still answers is not gated.
- **Both gates usually apply.** A Tahfiz route needs the module *and* the permission — they are independent checks and a route needing both should perform both.
- **Adding a public route means editing the allowlist in `enforcement.ts`.** Everything not listed requires authentication; that default is deliberate.
- **Don't add a super-admin bypass to the module check.** It has been considered and rejected for the reason above.

## Known constraints

- **Module flags are per school, not per user.** There is no "this teacher may use Tahfiz" — that is what permissions are for.
- **Module state is read per request** with no cache.
- **`apiAuth.ts` overlaps with `rbac/authorize.ts`.** Both work; the RBAC engine is the one to build on.

## Dependencies

`src/lib/db` · `src/lib/auth` (`getSessionSchoolId`) · `next/server`, `next/navigation`

## Related

[ADR-0008](../../../docs/adr/0008-two-auth-systems.md) · [`../rbac/README.md`](../rbac/README.md) · [`docs/RBAC_ARCHITECTURE.md`](../../../docs/RBAC_ARCHITECTURE.md)
