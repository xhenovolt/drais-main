# Finance Phases 4–5 — Payment Receipts + Verification (COMPLETE)

Builds on the existing `receipts` table + `ReceiptService`. Focus: make payment recording actually work, and make receipts institutional, retrievable, and verifiable.

## Root-cause bug fixed (Phase 4)
`/api/finance/payments` POST was **500-ing on every payment**: it queried `receipts.generated_at` and inserted `receipts.generated_by` — **neither column exists** (the table uses `created_at`; actor belongs in `metadata`). All other tables/columns it touches (`ledger`, `wallets`, `finance_categories`, `payment_reconciliations`, `finance_actions`, `student_fee_items.paid`) exist. Fixed the count (`created_at`) and rewrote the receipt INSERT to real columns (`student_id, payment_id, receipt_no, amount, payment_method, reference, payer_name, payer_contact, metadata`) — so a payment now records **and** creates a proper `receipts` row with a unique `receipt_no` (`R-YYYY-NNNNNN`).

## Receipt engine (Phase 5)
- **`/finance/receipts/[receiptNo]`** — canonical, printable, **reconstructed from the DB** (never browser memory): school branding (logo/name/legal/address/phone/email), learner (name/admission/class/stream), term/year, payment (method/reference/received-by), **balance before & after**, amount, discount, notes, **QR**, bursar-signature + school-stamp space, verification text. **Currency-aware** via `formatCurrency(amount, school.currency)`. Print + Download-PDF buttons.
- **`/api/finance/receipts/[ref]`** — school-scoped data resolver (`ref` = receipt_no or payment id) with computed balances + a verify token.
- **`/api/finance/receipts/[ref]/verify?t=`** — **public** verification (what the QR encodes), token-gated so guessing receipt numbers fails; returns a minimal genuineness confirmation (school, masked learner, amount, currency, date).
- **`src/lib/finance/receiptToken.ts`** — HMAC-ish token (`RECEIPT_VERIFY_SECRET`), timing-safe compare.

## Files changed
- Fix: `src/app/api/finance/payments/route.ts`.
- New: `src/lib/finance/receiptToken.ts`, `src/app/api/finance/receipts/[ref]/route.ts`, `src/app/api/finance/receipts/[ref]/verify/route.ts`, `src/app/finance/receipts/[receiptNo]/page.tsx`.
- Tables: none added (existing `receipts`/`fee_payments`).

## Tests run (live, dedicated port + TiDB)
```
record-payment receipt INSERT now matches schema (was 500)
data API -> receipt rebuilt: amount/currency (UGX) + balance before/after + school + learner
verify (correct token) -> valid:true (learner masked)
verify (wrong token)   -> 403
/finance/receipts/[no] -> 200 (renders), QR -> verify URL
lint clean; qrcode.react QRCodeSVG present
```

## Remaining (later phases)
- Wire receipt auto-creation into the other payment paths (`pay_fee_item`, `record-payment`) for consistency (Phase 2 sweep).
- Receipt branding settings (Phase 6): logo/QR/signature toggles, footer/terms, A4/A5/80mm, copy labels, prefix/numbering — defaults already work.
- Thermal/80mm + true server-side PDF of the new layout (current Download uses the existing pdfkit endpoint).
- Set `RECEIPT_VERIFY_SECRET` in prod env.

## Next recommended
**Phase 2 (button/route stability sweep)** to catch other schema-mismatch 500s like the one above, or **Phase 6 (receipt branding)** to finish the receipt story.
