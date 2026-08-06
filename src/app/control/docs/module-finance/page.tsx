'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="module-finance">
      <p>
        24 pages and 56 routes. The module with the least tolerance for &quot;approximately right&quot;, and
        the one where a single architectural rule does most of the work.
      </p>

      <FiveQuestions
        what={<>Fee structures, per-learner charges, payments and receipts, money locations, budgets, expenses and custodial pocket-money accounts.</>}
        why={<>A bursar must be able to state what a learner owes <em>and show how that figure was reached</em>. A number nobody can derive is a number nobody defends during an audit.</>}
        how={<>Every balance is computed from its transaction log at read time. Charges are debits, payments are credits, corrections are compensating entries. Nothing is edited in place.</>}
        where={<><code>src/lib/finance</code> · <code>src/lib/services/FinanceLedger.ts</code> (canonical) · <code>src/app/finance/*</code></>}
        extend={<>Post through the canonical payment path. Never add a stored balance. Use <code>withTransaction</code> for anything touching two tables.</>}
      />

      <h2>The one rule</h2>

      <Box kind="invariant" title="Balances are derived. There is no balance column, and none may be added.">
        <Diagram>
{`  learner balance    = SUM(debit) − SUM(credit)          student_ledger
  money location     = opening + payments in + transfers in
                                − transfers out − expenses paid
  budget spent       = SUM(expenditures WHERE budget_id = ?)
  pocket money       = SUM(deposits) − SUM(withdrawals)`}
        </Diagram>
        <p>
          A stored balance is a second source of truth. It drifts the first time a write fails halfway, and in
          finance drift is not something you ship past — a school finds it during an audit and stops trusting
          the system entirely.
        </p>
        <p>
          Deriving costs a query per read. That is the price, and it has been paid deliberately. If a read is
          too slow, cache the <em>computation</em> with an explicit invalidation story; do not denormalise the
          answer into a column.
        </p>
      </Box>

      <p>
        The same principle appears in <code>FinanceLedger.ts</code> as four stated rules: balance never stored;
        ledger entries never deleted or updated after creation; every charge a debit and every payment a
        credit; fee assignment idempotent via <code>fee_assignment_log</code>.
      </p>

      <h2>Fee rules: eligibility as data</h2>

      <p>
        A fee item carries eligibility rules rather than a maintained list of learners. Rules are OR-ed;
        conditions within a rule are AND-ed — &quot;girls AND P1–P3&quot;.
      </p>

      <p>
        Conditions key off the learner&apos;s <strong>active enrolment</strong> and person: gender, boarding
        (study mode), programme, stream, class or class-level range, term, year.
      </p>

      <Box kind="tip" title="Why rules rather than lists">
        <p>
          When a day learner becomes a boarder, the next billing run charges them correctly with nothing to
          update. A maintained list would be wrong from the moment the learner transferred, and nobody would
          notice until the parent queried the bill.
        </p>
      </Box>

      <Box kind="warning" title="Eligibility is evaluated at billing time, against the enrolment that is active then">
        <p>
          It is not retroactive. A mid-term transfer changes what is charged going forward, not what was
          already charged — which is correct, and occasionally surprising to a bursar expecting a recalculation.
        </p>
      </Box>

      <h2>Two stores that must stay in step</h2>

      <Table
        head={['Store', 'Answers', 'Note']}
        rows={[
          [<code>student_fee_items</code>, <>What is this learner <em>expected</em> to pay this term?</>, <>The expectation.</>],
          [<code>student_ledger</code>, <>What was actually <em>charged</em>, and what has been paid?</>, <>The transaction log that drives the balance.</>],
        ]}
      />

      <p>
        Fee import matches a ledger debit on <code>(student, term, notes = item name)</code>, so re-importing{' '}
        <strong>replaces</strong> the prior charge rather than stacking a second one — whether it came from a
        billing run or an earlier import.
      </p>

      <Box kind="warning" title="Running billing twice charges twice">
        <p>
          Fee assignment is idempotent through <code>fee_assignment_log</code>, but a second billing run for
          the same term is a distinct operation. The common support case &quot;the balance is double&quot; is
          nearly always this. Check a learner statement before re-running.
        </p>
      </Box>

      <h2>Import: two-phase, trust-first</h2>

      <Diagram caption="Nothing is posted on upload. The operator confirms first.">
{`  PREVIEW                                   nothing written
    ├─ stage rows
    ├─ match learners: admission number FIRST
    │                  name matches → flagged for REVIEW, never auto-posted
    ├─ detect duplicates  ▸ against already-recorded payments
    │                     ▸ AND within the file itself
    └─ summarise
              │  operator confirms
              ▼
  COMMIT
    └─ post only rows marked "import" with a resolved student,
       through the CANONICAL recordPayment path
         → same receipt, same ledger effect, same audit as a desk entry`}
      </Diagram>

      <p>
        Sources: <code>manual_excel</code>, <code>schoolpay</code>, <code>surepay</code>, <code>bank</code>,{' '}
        <code>mobile_money</code>, <code>custom</code>. The client maps columns to normalised fields, so a new
        statement format needs no code.
      </p>

      <Box kind="invariant" title="Never auto-post a name match">
        <p>
          Two learners share a name far more often than schools expect, and a payment credited to the wrong
          child surfaces at the worst possible moment — usually when the right child is sent home over an
          unpaid balance.
        </p>
      </Box>

      <Box kind="warning" title="Commit through recordPayment, not a direct insert">
        <p>
          A direct insert skips receipt numbering, ledger effects and audit. Imported payments must be
          indistinguishable from typed ones downstream.
        </p>
      </Box>

      <h2>Money locations</h2>

      <p>
        A money location is where cash physically sits: bursar&apos;s cash box, headteacher, a named bank
        account, mobile money, School Pay, SurePay. Recording <code>account_id</code> on a payment is what makes
        money traceable rather than merely recorded.
      </p>

      <Box kind="tip" title="The most common reconciliation complaint">
        <p>
          &quot;The cash location shows more than is in the box.&quot; Almost always missing transfers — cash
          banked at the end of the day must be recorded as a transfer, or the location keeps showing money that
          has physically moved.
        </p>
      </Box>

      <h2>Receipts</h2>

      <p>
        Each payment produces a receipt with a unique number and a QR encoding a verification token, so a
        receipt can be checked at the office and random receipt-number guessing fails.
      </p>

      <Box kind="warning" title="RECEIPT_VERIFY_SECRET must be set in production">
        <p>
          It falls back to a default committed in the repository. With that fallback in play, anyone reading
          the source can mint valid receipt tokens.
        </p>
        <p>
          Note also that the token is a truncated SHA-256, not a signature: it proves a receipt exists, not who
          issued it.
        </p>
      </Box>

      <h2>Corrections</h2>

      <p>
        A payment entered wrongly is <strong>reversed with a compensating entry</strong>, never deleted. Both
        entries stay visible. The balance ends up right and the history explains itself.
      </p>

      <p>
        This is the same principle as append-only attendance events and append-only staff employment: a record
        that can be silently edited proves nothing.
      </p>

      <h2>Performance</h2>

      <ul>
        <li>Derived balances cost a query per read and grow with transaction volume. Accepted for correctness.</li>
        <li>Class- and school-level outstanding reports aggregate across every learner — the queries to watch.</li>
        <li>Use <code>withTransaction</code> for multi-table writes. Money split across two statements without one is how a ledger goes out of balance.</li>
      </ul>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Adding a cached balance column</>, <>Two sources of truth; guaranteed drift.</>],
          [<>Inserting a payment directly</>, <>No receipt, no ledger effect, no audit.</>],
          [<>Deleting a wrong entry instead of reversing it</>, <>The history no longer explains the balance.</>],
          [<>Auto-posting a name-matched import row</>, <>Payment credited to the wrong learner.</>],
          [<>Multi-table write without a transaction</>, <>Half-applied money.</>],
          [<>Updating <code>student_fee_items</code> without the ledger</>, <>Expectation and charge disagree.</>],
          [<>Leaving <code>RECEIPT_VERIFY_SECRET</code> unset</>, <>Forgeable receipt tokens.</>],
        ]}
      />

      <h2>Extension points</h2>

      <ul>
        <li><strong>New fee condition</strong> → extend the rule model, keeping evaluation against the active enrolment.</li>
        <li><strong>New import source</strong> → a column mapping, usually no code.</li>
        <li><strong>New payment channel</strong> → a money location plus the canonical payment path.</li>
        <li><strong>New derived figure</strong> → derive it. Do not store it.</li>
      </ul>

      <Box kind="note" title="Which finance implementation is canonical">
        <p>
          <code>FinanceLedger.ts</code> is canonical. <code>FinanceService.ts</code> and{' '}
          <code>FeeService.ts</code> in <code>src/lib/services/</code> predate it and remain in use — the
          boundary is historical, not designed. Build new work on the ledger.
        </p>
      </Box>

      <Source path="src/lib/finance/README.md" />
      <Source path="src/lib/services/README.md">Explains the legacy overlap.</Source>

      <SeeAlso slugs={['schema', 'request-lifecycle', 'playbook-api', 'module-reports']} />
    </ControlDoc>
  );
}
