# `src/lib/export/` — Data export

CSV, Excel and PDF export, with one stance behind all of it.

## The stance

> **A school management platform must never trap institutional data.**

That sentence is in `serverCsv.ts`, and it is the reason exports are a first-class subsystem rather than a
per-screen afterthought. A school that cannot get its own register, mark sheet or ledger out of DRAIS is
locked in — and a system schools cannot leave is a system they are right to distrust.

The same principle drives the per-school [backup](../backup/README.md) and the Control Center's per-school
data export. Different mechanisms, one commitment.

## Files

| File | Purpose |
|---|---|
| `exporter.ts` | The universal export engine — system-wide capability over arbitrary tabular data. |
| `exportService.ts` | Central service: CSV, Excel and PDF with consistent error handling. |
| `serverCsv.ts` | Server-side CSV with a **standard metadata header** on every file. |

## The metadata header

Every CSV produced through `serverCsv.ts` carries the same header block. That matters because an exported file
outlives the session that produced it: months later someone finds a spreadsheet and needs to know which
school, which term, and when it was generated — before deciding whether to trust it.

**Use the helper rather than assembling CSV inline.** A file without the header is indistinguishable from a
hand-edited one.

## Working in this folder

- **Never build a second export path.** `useExport()` on the client, this service on the server. A bespoke
  CSV in a route means no metadata header and no consistent escaping.
- **Escaping is not optional.** Learner names contain commas, apostrophes and quotes; Arabic names contain
  characters that break naive delimiters. Go through the engine.
- **Export what the user can see.** An export is a read — it must honour the same permission and tenant scope
  as the screen it came from. An export route that skips the permission check is a data-exfiltration route.
- **Bound the row count**, or stream. An unbounded export of a large school will exhaust memory in a serverless
  function.
- **PDF is expensive.** It goes through puppeteer; prefer CSV or Excel unless the output is genuinely a
  document.

## Known constraints

- **Excel has row limits** and will silently truncate in some tools. For very large datasets, CSV is safer.
- **PDF export shares the puppeteer path** with report printing and inherits its cost.
- **Exports contain real learner data.** They are subject to the same care as a backup file — not to be
  emailed or left on shared machines.

## Related

[`../backup/README.md`](../backup/README.md) · [`../control/README.md`](../control/README.md) — per-school data export · [`src/hooks/useExport.ts`](../../hooks/useExport.ts) — the client wrapper
