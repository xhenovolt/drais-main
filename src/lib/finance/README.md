# `src/lib/finance/` — School finance

Fees, payments, money locations, budgets and pocket money.

## The rule that governs everything here

> **Balances are derived, never stored.**

Every balance in this folder is computed from its transaction log at read time:

| Balance | Derived from |
|---|---|
| Money location (`locations.ts`) | `opening_balance` + payments in + transfers in − transfers out − expenses paid |
| Budget (`budgets.ts`) | linked `expenditures.budget_id` rows |
| Pocket money (`pocketMoney.ts`) | deposits − withdrawals |

A stored balance is a second source of truth that drifts the first time a write fails halfway, and in a finance module drift is not a bug you can ship past — a school will find it during an audit and stop trusting the system. Deriving is slower and correct.

**Do not add a cached balance column.** If a read is too slow, cache the computation with an explicit invalidation story, and say so in the code.

## Import is two-phase and trust-first

`import.ts` never posts on upload:

```
PREVIEW   stage rows → match learners (admission number first;
          name matches require review) → detect duplicates
          against recorded payments AND within the file → summarise
             ↓  operator confirms
COMMIT    post only rows marked `import` with a resolved student,
          through the canonical recordPayment path
```

Sources: `manual_excel` · `schoolpay` · `surepay` · `bank` · `mobile_money` · `custom`. The client maps columns to normalized fields, so a new bank statement format needs no code.

**Commit goes through the canonical payment path**, not direct inserts — so imported payments get the same receipt, ledger and audit treatment as one typed at the desk.

## Files

| File | Purpose |
|---|---|
| `feeRules.ts` | Eligibility rules for a fee item. Rules are ORed; conditions within a rule are ANDed (girls **and** P1–P3). Keys off the learner's **active enrollment** + person: gender, boarding (study mode), program, stream, class / class-level range, term, year. |
| `feeImport.ts` | Per-learner fee upsert. Never duplicates a line for the same (learner, term, item). Keeps **both** stores consistent: `student_fee_items` (expected) and `student_ledger` (the debit that drives balances), matching the ledger debit on (student, term, notes = item name) so re-importing replaces rather than stacks. |
| `import.ts` | Payment import / reconciliation (above). |
| `locations.ts` | Where cash actually sits — bursar, headteacher, bank, mobile money, School Pay, SurePay (`wallets`) — plus transfers between them. |
| `budgets.ts` | Term / department / project / class / activity budgets with remaining, % used, deficit and threshold warnings. |
| `pocketMoney.ts` | Custodial per-learner wallet. **Withdrawals cannot overdraw.** |
| `receiptToken.ts` | The QR token on a printed receipt. Anyone can verify a receipt is genuine; guessing receipt numbers fails because the token can't be forged without `RECEIPT_VERIFY_SECRET`. |

## Working in this folder

- **Derive balances.** See above.
- **Post payments through `recordPayment`.** A direct insert skips receipt numbering, ledger effects and audit.
- **Use `withTransaction` for multi-table writes.** Money split across two statements without a transaction is how ledgers go out of balance.
- **Keep `student_fee_items` and `student_ledger` in step.** They answer different questions (what is owed vs what was charged) and a change to one usually needs the other.
- **Set `RECEIPT_VERIFY_SECRET` in production.** The fallback default makes tokens forgeable by anyone reading this repository.

## Known constraints

- **Derived balances cost a query per read** and grow with transaction volume.
- **Import name-matching always requires review** — deliberately. Automatic name matching would post a payment to the wrong child.
- **Fee rules evaluate against the *active* enrollment.** A mid-term transfer changes eligibility going forward, not retroactively.
- **`receiptToken` is a truncated (16-hex-char) SHA-256.** Adequate against guessing, not a signature — it proves a receipt exists, not who issued it.

## Dependencies

`src/lib/db` (`query`, `withTransaction`) · `node:crypto`

## Related

[`docs/archive/completion-reports/FINANCE_PHASE4_5_RECEIPTS.md`](../../../docs/archive/completion-reports/FINANCE_PHASE4_5_RECEIPTS.md) (point-in-time) · [`docs/database/TABLE_DICTIONARY.md`](../../../docs/database/TABLE_DICTIONARY.md) · [`../portal/README.md`](../portal/README.md) — parent fee visibility is a per-school toggle
