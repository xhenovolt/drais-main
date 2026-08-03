# `src/lib/rbac/` — Permissions and authorization

Who may do what, in which school. One declarative catalog, one check function, one sync engine.

## Responsibilities

Declare every permission DRAIS recognises, reconcile that declaration against the database, and answer a single question for every API route: **may this session perform this action?**

## The model

```
user ──▶ user_roles ──▶ roles ──▶ role_permissions ──▶ permissions
                                                            ▲
                                                            │ sync
                                              catalog.ts (source of truth)
```

Permission codes are `module.resource.action`, lowercase, snake_case segments:

```
academics.theology.view
finance.payments.record
trash.purge
```

172 permissions across 21 modules — academics (30), finance (16), staff (14), learners (12), attendance, tahfiz, system, roles, passouts, admissions, payroll, examinations, drce, comm, visitation, trash, departments, notifications, inventory, intelligence, analytics.

## The three rules that matter

**1. The catalog is the source of truth, the database is a projection.** `catalog.ts` declares permissions in code; `sync.ts` reconciles the `permissions` table to match. Adding a permission is a code change, not a SQL insert.

**2. Sync never touches `role_permissions`.** A code removed from the catalog is marked `is_active = 0`, not deleted — the grants that reference it survive for audit, the UI hides it, and `authorize` rejects it. This is what makes catalog evolution safe on live schools.

**3. Wildcards are expanded at check time, not at grant time.** Granting `finance.*` stores the literal string `finance.*`. `expandPermissionChain('finance.payments.record')` produces `['finance.payments.record', 'finance.payments.*', 'finance.*', '*']` and the check passes if the role holds any of them. Storing the wildcard rather than the expansion means a new permission under `finance.` is granted automatically to whoever already holds `finance.*` — which is almost always what the admin meant.

## Files

| File | Purpose |
|---|---|
| `catalog.ts` | Every permission, declared. Also `buildPermissionTree()` for the tree UI and `expandPermissionChain()` for wildcards. Legacy coarse-grained codes are appended at the end and treated identically by sync. |
| `authorize.ts` | **The one function to call from API routes.** Super-admin bypass, wildcard expansion, school scoping. Returns a structured result — it never throws, so callers choose the response. |
| `sync.ts` | Catalog ↔ `permissions` reconciliation. Idempotent, returns a diff for the admin UI. |
| `role-defaults.ts` | Starting permission profiles per canonical role slug (teacher, bursar, DOS, receptionist…). Entries may be exact codes or wildcard ancestors. |
| `seed-roles.ts` | Applies `ROLE_DEFAULTS` to existing roles. Inserts only missing grants — never revokes. Idempotent. |

## Using it in a route

```ts
import { requireAuthorize } from '@/lib/rbac/authorize';

const denied = await requireAuthorize(session, 'finance.payments.record');
if (denied) return denied;
```

`authorize` returns the structured result; `requireAuthorize` returns a ready `NextResponse` or `null`; `checkAuthorize` returns a boolean; `authorizeMany` batches several codes in one round trip.

The older `userCan` / `requirePermission` / `checkPermission` helpers in [`src/lib/rbac.ts`](../rbac.ts) still work — they are backwards-compat shims that now delegate here. **Use `authorize` in new code.**

## Super-admin

Recognised by **flag OR slug OR canonical name**, deliberately redundant. `userCan` re-checks super-admin itself rather than trusting the caller to pass `isSuperAdmin`, because forgetting that argument would otherwise lock a super-admin out of their own system. Defense in depth over elegance, on purpose.

## Working in this folder

- **New permission?** Add one `p(...)` line to `catalog.ts`, run the sync from the admin UI (or `syncPermissionCatalog()`), and add it to the relevant `ROLE_DEFAULTS` entries if a canonical role should have it by default.
- **Run `npm run lint:permissions` before committing.** It scans every `.ts`/`.tsx` under `src/` for permission literals passed to the authorization helpers and flags codes that aren't in the catalog — the check that catches a typo'd permission string before it becomes a silent 403 in production.
- **Never delete a catalog entry to revoke access.** Deactivation is the mechanism; deletion loses the audit trail.
- **Don't add school scoping in the route.** `authorize` already honours the caller's school. Routes that re-derive `schoolId` from the request body are the recurring bug this centralization exists to prevent.

## Known constraints

- **Permission checks hit the database on every call.** There is no request-level cache; `authorizeMany` exists to amortize this when a route needs several codes.
- **Wildcard grants are invisible in the permission tree UI** as individual checkboxes — a role holding `finance.*` shows the wildcard, not 16 ticked boxes. This confuses admins occasionally and is a known UX gap.
- **`role_permissions` accumulates orphans by design.** Rows referencing deactivated codes stay. They are harmless (`authorize` rejects inactive codes) but the table grows.

## Dependencies

`src/lib/db` · `src/lib/auth` (`SessionInfo`) · `next/server`

## Related

[`docs/RBAC_ARCHITECTURE.md`](../../../docs/RBAC_ARCHITECTURE.md) — the fuller architecture write-up · [ADR-0008](../../../docs/adr/0008-two-auth-systems.md) — why staff RBAC does not apply to the parent portal · [`scripts/lint-permissions.mjs`](../../../scripts/lint-permissions.mjs)
