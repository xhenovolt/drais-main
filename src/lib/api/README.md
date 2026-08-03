# `src/lib/api/` — The route wrapper

Two files. `withRoute` is the standard robustness wrapper for API routes; `resolve-error` is the pure
error→HTTP mapping behind it.

## What `withRoute` gives you

```ts
export const GET = withRoute(
  { permission: 'finance.payments.view' },
  async ({ session, params, req }) => {
    return await listPayments(session.schoolId);   // plain object → JSON
  },
);
```

Uniformly and for free:

| Concern | Behaviour |
|---|---|
| Authentication | Resolves the session; `401` when absent. Skippable with `auth: false`. |
| Authorization | `requirePermission` when `permission` is set; throws are mapped to `403`. |
| Maintenance | Blocks tenant **writes** while platform read-only mode is on. Reads pass. |
| Dynamic params | `params` already awaited — Next 15 hands them over as a promise. |
| Errors | A thrown error becomes JSON with a status, not a stack trace. |
| Return value | A plain object is serialised; a `NextResponse` is passed through untouched. |

## Why `resolve-error` is a separate module

It is a **pure** function with no imports — no `next/server`, no auth stack — so it can be unit-tested in
isolation. That is the same pure-core pattern used across the Control Center and `src/lib/academics`.

## When *not* to use `withRoute`

**Control Center routes deliberately do not use it**, for two reasons:

1. It resolves a **school** session; the Control Center is a separate auth domain (`getControlSession`).
2. It enforces read-only maintenance mode — and the Control Center must stay usable during maintenance so an
   operator can lift it.

Platform API v1 routes likewise use `requirePlatformAuth`, not this.

## Adoption

`withRoute` is used by a handful of routes; most of the 691 use the explicit form. **Both are current.** The
explicit form is required when a route needs behaviour the wrapper does not cover — the backup routes, for
example, try one permission and fall back to another.

If you use the explicit form, you are responsible for everything in the table above yourself. See the
[API playbook](../../../docs/README.md) for the full checklist.

## Working in this folder

- **Keep `resolve-error` dependency-free.** Adding an import costs its testability.
- **A new cross-cutting concern belongs here**, not copied into routes — that is the point of a wrapper.
- **Do not make `withRoute` resolve control or platform sessions.** Three auth domains sharing one wrapper
  would defeat the isolation those domains exist for.

## Related

[`../rbac/README.md`](../rbac/README.md) · [`../auth/README.md`](../auth/README.md) — module gating · [`docs/guides/API_ERROR_HANDLING_GUIDE.md`](../../../docs/guides/API_ERROR_HANDLING_GUIDE.md) — the zero-silent-failures standard
