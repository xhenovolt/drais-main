# DRAIS Unified Ingestion — Phase 1

The single-pipeline answer to the Phase 0 audit finding: DRAIS today
has 4 CSV parsers, 3 XLSX parsers, 4 attendance ingestion paths, 3
conflict policies, and zero abstraction layer between them. This
module is the abstraction.

**Phase 1 ships the contract + the runner + the adapters.**
**Phase 2+ migrates existing importers onto it, one at a time.**
Nothing in this module touches existing routes — legacy importers
keep working unchanged until each is opted in.

---

## Architecture (one screen)

```
                ┌────────────────┐
                │  parsed source │   ← caller's job (CSV/XLSX/JSON parser)
                │  RawRow[]      │
                └───────┬────────┘
                        │
                        ▼
       ┌──────────────────────────────┐
       │  schema-inference            │   exact → synonym → fuzzy → memory
       │  inferSchema(headers, fields)│
       └──────┬───────────────────────┘
              │
              ▼
       ┌──────────────────────────────┐
       │  pipeline.runIngestionPipeline│
       │   ├─ map raw → canonical     │
       │   ├─ validate each row        │
       │   ├─ identity/resolveIdentity │   ← single answer to "who is this?"
       │   ├─ conflict/resolveFieldConflicts │
       │   ├─ commit (caller-supplied) │
       │   └─ aggregate report         │
       └──────┬───────────────────────┘
              │
              ▼
       ┌──────────────────────────────┐
       │ IngestionReport              │   → persisted to ingestion_runs
       │  + per-row outcomes          │   → orphans → ingestion_orphans
       │  + counts                    │   → memory  → ingestion_field_memory
       │  + errorSummary              │
       └──────────────────────────────┘
```

For attendance ingestion, swap the schema-inference step for a vendor
adapter:

```
   raw vendor payload (ZKTeco SDK / Dahua text / WebAuthn / manual)
        ↓
   attendanceAdapters.find(a => a.canHandle(payload))
        ↓
   adapter.adapt(payload, resolveIdentity)
        ↓
   AttendanceEvent[]   ← canonical, vendor-agnostic shape
```

---

## Files

| Path | Role |
|---|---|
| `types.ts` | The contract. Every module here implements types defined here. |
| `pipeline.ts` | The runner — orchestrates parse → infer → map → validate → identity → conflict → commit → report. |
| `schema-inference/index.ts` | `inferSchema` + `applyMapping` |
| `schema-inference/fuzzy.ts` | `normalizeHeader`, `tokenSetScore`, `levenshteinRatio`, `combinedScore` |
| `identity/index.ts` | `resolveIdentity` + `PersonLookup` interface |
| `conflict/index.ts` | `resolveFieldConflicts` + `toConflictDecision` |
| `memory/index.ts` | `MemoryReader` / `MemoryWriter` interfaces + helpers |
| `attendance/event.ts` | `AttendanceEvent` canonical type + `AttendanceAdapter` contract + helpers |
| `attendance/adapters/zkteco.ts` | ZKTeco SDK → AttendanceEvent[] |
| `attendance/adapters/dahua.ts` | Dahua text payload → AttendanceEvent[]; fixes the "CardNo IS identity" bug |
| `attendance/adapters/manual.ts` | Manual mark + WebAuthn + adapter registry |
| `__tests__/*.test.mjs` | 63 tests, run via `npm run test:ingestion` |
| `../../migrations/ingestion_memory.sql` | Per-school memory tables + run log + orphan queue |

---

## How to add a new importer (Phase 2+ playbook)

Say you're migrating the existing `/api/students/import` onto the
pipeline.

1. **Define the canonical fields** in the route module:
   ```ts
   const STUDENT_FIELDS: CanonicalField[] = [
     { name: 'admission_no', label: 'Admission Number',
       synonyms: ['admission no', 'adm no', 'reg no', 'stamp no'],
       type: 'string', required: true },
     { name: 'first_name', label: 'First Name',
       synonyms: ['firstname', 'given name'],
       type: 'string', required: true },
     // …
   ];
   ```

2. **Build the IngestionPipeline**:
   ```ts
   const studentPipeline: IngestionPipeline<StudentRow> = {
     name: 'students',
     schema: STUDENT_FIELDS,
     validateRow(mapped, prov) {
       // your existing per-row coercion + checks
       return { ok: true, value: mapped as StudentRow };
     },
     identityFromRow(row) {
       return {
         admissionNo: row.admission_no,
         firstName:   row.first_name,
         lastName:    row.last_name,
         className:   row.class_name,
       };
     },
     async commit(row, identity, decision) {
       // your existing SQL writes — but BRANCH on decision.action
       // so the audit log is honest:
       //   'insert' → INSERT person/student/enrolment
       //   'update' → UPDATE only the fields the resolver said changed
       //   'merge'  → UPDATE with the merged values
       //   'skip'   → no-op (logged)
       //   'orphan' → INSERT into ingestion_orphans for review
     },
   };
   ```

3. **Implement `PersonLookup`** in your route (SQL stays where it
   already lives — just expose the 4 query methods).

4. **Implement `MemoryReader` / `MemoryWriter`** for
   `ingestion_field_memory` (two simple SQL methods each).

5. **Run it**:
   ```ts
   const parsed = parseCsvOrXlsx(fileBuffer);
   const memory = await memoryReader.loadFieldMemory(schoolId, 'students');
   const report = await runIngestionPipeline({
     schoolId,
     parsed,
     pipeline: studentPipeline,
     lookup,
     mappingMemory: memory,
     mappingOverrides: req.body.overrides,   // from the review UI
     conflictPolicy: await loadPolicy(schoolId, 'students'),
     fetchExisting: async personId => fetchStudentRow(personId),
   });

   // Persist the report
   await saveIngestionRun(report);
   // Remember mappings the school just used
   await persistAutoMappings({
     schoolId,
     pipelineName: 'students',
     mappings: report.schemaInference.mappings,
     writer: memoryWriter,
     approvedBy: userId,
   });

   return NextResponse.json(report);
   ```

That's the whole migration. The legacy CSV parser, the fuzzy header
detector, the conflict policy switch — all gone, replaced by the
pipeline. The route shrinks; the audit log gets honest; the schema
flexibility comes from the engine, not from per-route ad-hoc code.

---

## How to add a new attendance vendor

1. Define a vendor payload type.
2. Implement the `AttendanceAdapter<T>` contract — `canHandle` + `adapt`.
3. Push it into the `attendanceAdapters` array in `attendance/adapters/manual.ts`.

No router changes. No DB changes. The Phase-2 attendance route just
does:

```ts
const adapter = attendanceAdapters.find(a => a.canHandle(payload));
if (!adapter) return 400;
const result = await adapter.adapt(payload, resolveIdentity, options);
await persistCanonicalEvents(result.events);
await persistOrphans(result.errors, result.orphanedCount);
```

---

## Non-goals for Phase 1

- **No existing routes are touched.** The legacy importers all still
  work. Migration is opt-in, one route at a time.
- **No new UI.** The review UI (mapping override + orphan resolution)
  is Phase 6 in the original brief.
- **No DB write code.** This module is pure types + pure functions.
  The wiring into mysql2 lives in the routes that opt in.
- **No backwards-incompat changes.** Snapshots, dataHash invariant,
  every existing import endpoint — all unaffected.

---

## Test coverage (current: 63/63 passing)

```
npm run test:ingestion
```

Coverage breakdown:
- `fuzzy.ts` — normalisation + token-set + Levenshtein + combinedScore (4 tests)
- `schema-inference` — exact/normalized/synonym/fuzzy/memory/required-field/applyMapping (12 tests)
- `identity` — credential, admission, device, name+class, ambiguity (15 tests)
- `conflict` — every FieldConflictPolicy + composition into ConflictDecision (12 tests)
- `attendance` — every adapter + every helper + adapter registry (20 tests)

The acceptance gate for Phase 2+ migrations: every existing test stays
green AND the dataHash invariant test (`npm run test:drce`) stays green.
The ingestion abstraction is additive by design.
