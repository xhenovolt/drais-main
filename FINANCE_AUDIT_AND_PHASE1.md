# DRAIS Finance — Phase 0 Audit + Phase 1 Currency Engine

## Phase 0 — Forensic audit findings
**Surface:** 12 finance pages, 32 `/api/finance/*` routes, tables `fee_payments`, `fee_invoices`, `fee_payment_allocations`, `fee_structures`, `finance_fee_items`, `student_fee_items`, `fee_assignment_log`, **`receipts`**.

1. **TZS root cause — hardcoded UI labels, not data.** 11 literal `TZS` strings + `en-TZ` locale in **2 pages only** (`finance/ledger-v2`, `students/[id]/fees`). Every other place already used the shared formatter.
2. **UGX default:** `schools.currency` is already **`UGX` for all 20 schools**, and `utils/formatters.formatCurrency` defaulted to UGX (via a hacky `USD`-replace). So the data was correct — only those 2 pages lied.
3. **Currency stored per school?** Yes — `schools.currency`.
4. **Formatting centralized?** Partially (`utils/formatters.ts`) but bypassed by the hardcoded pages + local `fmt()` helpers. Now centralized in `src/lib/currency.ts`.
5–9. **Buttons / APIs / scoping:** large existing module; routes sampled use `getSessionSchoolId` (school-scoped). A full route-by-route button test is **Phase 2** (not done here).
10–12. **Receipts (good news):** a **`receipts` table + `ReceiptService` (pdfkit + QR)** already exist, plus `/api/finance/payments/[id]/receipt`. Auto-generation on payment, receipt-no uniqueness, and a public **verify** route still need confirmation/build (**Phases 4–5**).
13–15. **Import / reversals:** `/api/finance/bulk-import` exists; `finance.payments.refund` permission exists. Import validation/reconciliation (**Phase 3**) and void/reverse safety (**Phase 8**) need building/confirming.

## Phase 1 — Currency Engine (IMPLEMENTED + verified)
- **`src/lib/currency.ts`** — ONE canonical helper: `formatCurrency(amount, code='UGX')` + `CURRENCIES` config (UGX/USD/KES/TZS/RWF/SSP/EUR/GBP, each with symbol/decimals/position) + custom-code fallback. **Default UGX.**
- **`utils/formatters.ts`** now **delegates** to it (removes the `USD`-replace hack) — every existing caller improves automatically.
- **`/api/auth/me`** returns `school.currency`; **AuthContext `School`** gains `currency` — so any client reads the school's currency.
- **Fixed the 2 hardcoded pages** to format via the school currency (no more `TZS`, no `en-TZ`).
- **`/api/finance/currency`** GET/PUT (PUT gated by `finance.fees.manage`) + **`/finance/settings`** page: pick currency, **live preview**, save. Display-only — amounts never converted.

### Files / tables / routes changed
- New: `src/lib/currency.ts`, `src/app/api/finance/currency/route.ts`, `src/app/finance/settings/page.tsx`.
- Changed: `src/utils/formatters.ts`, `src/app/api/auth/me/route.ts`, `src/contexts/AuthContext.tsx`, `src/app/finance/ledger-v2/page.tsx`, `src/app/students/[id]/fees/page.tsx`.
- Tables: none added (uses existing `schools.currency`). No data converted.

### Tests run (live + TiDB)
```
grep TZS / en-TZ in src (excl. currency.ts) -> NONE
/api/auth/me .school.currency -> UGX
/api/finance/currency GET -> UGX (8 supported)
PUT USD -> 200 -> GET USD -> restored UGX   (display-only switch works)
/finance/settings -> 200 ; changed pages lint clean
```

## Remaining risks / not yet done
- Phase 2 (route/button stability sweep), Phase 3 (import/reconciliation engine), Phase 4 (auto-receipt-on-payment + uniqueness), Phase 5 (receipt design + `/finance/receipts/[no]` + verify API), Phase 6 (receipt branding), Phase 7 (trust dashboard), Phase 8 (void/reverse), Phase 9 (parent finance — note: `/api/parent/learners/[id]/receipts` already exists).
- `/finance/settings` is reachable by URL; add a nav/menu link in a follow-up.

## Next recommended phase
**Phase 4 + 5 (Receipts)** — the engine (`ReceiptService` + `receipts` table + QR) already exists, so the high-value next step is: guarantee auto-generation + unique receipt no on payment, add `/finance/receipts/[receiptNo]` + `/api/finance/receipts/[id]/verify`, and make every amount use `formatCurrency`. (Phase 2 button-sweep is the alternative if you want stability first.)
