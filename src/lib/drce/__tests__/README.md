# DRCE — pure-function test suite

These tests cover the three engines whose correctness underpins every
document DRCE produces:

| File | What it covers |
|---|---|
| `formula.test.mjs` | Lexer, parser, evaluator. All 6 new functions, nested expressions, error states, cycle detection (via TableSection's resolveCells exposure isn't here — kept in formula.test for purity) |
| `visibility.test.mjs` | The 14-operator rule evaluator, AND/OR/NOT groups, NaN/null handling |
| `mutations.test.mjs` | applyMutation across single-page + multi-page docs, container nesting, undo/redo equivalence |

## Running

These are written against Node's built-in test runner (`node:test`) so they
run with **no package dependencies**:

```bash
node --experimental-vm-modules --test src/lib/drce/__tests__/*.test.mjs
```

The suite intentionally avoids React, JSX, the DB, and any Next-specific
APIs so it can run in CI under any Node ≥ 18.

## Adding a test

1. Reuse one of the `.mjs` files or add a new one.
2. Import from compiled JS (we use `tsc` once before running) OR import
   the `.ts` source through `tsx`:

   ```bash
   npx tsx --test src/lib/drce/__tests__/*.test.mjs
   ```

## What's intentionally NOT covered here

- Renderer output → covered by snapshot byte-equivalence checks in
  separate `src/lib/snapshots/__tests__/`.
- Issuance engine integration → covered by an end-to-end suite under
  `src/lib/issuance/__tests__/`.
- React behaviour → manual smoke tests for now; a Playwright suite is
  the right shape later.

The tests below are the "no excuses" floor — if these pass we know
every formula, visibility rule, and document mutation is correct on
every commit, which is the trust contract schools rely on.
