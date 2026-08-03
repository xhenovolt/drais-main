'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, Steps, Step, GoTo, DefTable } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="fees">
      <p>
        DRAIS finance is built so that at any moment you can say what a learner owes and show exactly how that
        figure was arrived at.
      </p>

      <Callout kind="success" title="Balances are calculated, never typed">
        <p>
          No balance in DRAIS is a stored number someone can edit. Every balance is computed from the charges
          and payments behind it, each time it is shown. That is why the figures still add up a year later.
        </p>
      </Callout>

      <h2>Setting up the fee structure</h2>

      <p><GoTo href="/finance">Finance</GoTo></p>

      <Steps>
        <Step title="Create fee items">
          One line each — Tuition, Lunch, Transport, Boarding, Examination.
        </Step>
        <Step title="Set amounts per class and term">
          Different classes usually pay different amounts.
        </Step>
        <Step title="Add eligibility rules where a fee is not universal">
          Transport only for learners who use it; boarding only for boarders. Rules can key off boarding
          status, gender, class range, programme or stream.
        </Step>
        <Step title="Run the billing">
          <p>DRAIS charges the learners the structure matches.</p>
          <p><GoTo href="/finance/bills">Bills</GoTo></p>
        </Step>
      </Steps>

      <Callout kind="tip" title="Rules beat maintaining a list">
        <p>
          A rule such as &quot;boarders in S1–S4&quot; is evaluated against each learner&apos;s actual record.
          When a day learner becomes a boarder, the next billing run charges them correctly with no list to
          update.
        </p>
      </Callout>

      <Callout kind="warning" title="Do not run billing twice for the same term">
        <p>
          It charges twice. If you are not sure whether it has run, open one learner&apos;s statement and look
          before running it again.
        </p>
      </Callout>

      <h2>Recording a payment</h2>

      <DefTable
        rows={[
          ['Amount', <>What was actually received. Part payments are normal.</>],
          ['Money location', <>Where the cash went — bursar&apos;s cash box, headteacher, a named bank account, mobile money, School Pay. This is what makes money traceable rather than merely recorded.</>],
          ['Paid by', <>Who handed it over. Often not the registered guardian.</>],
          ['Reference', <>Bank slip or mobile money transaction number, where there is one.</>],
        ]}
      />

      <p>Every payment produces a receipt with a unique number and a QR code that verifies it is genuine.</p>

      <h2>Money locations</h2>

      <p>
        Each location&apos;s balance is derived from its opening balance, payments in, transfers in and out,
        and expenses paid from it.
      </p>

      <Callout kind="warning" title="Record your transfers">
        <p>
          Cash banked at the end of the day must be recorded as a transfer from the cash location to the bank
          location. Skipping transfers is the single most common reason a location balance stops matching the
          physical cash — the money is not lost, it is just still showing in the wrong place.
        </p>
      </Callout>

      <h2>Importing payments</h2>

      <p>
        Schools receiving payments through a bank or an aggregator can import in bulk — School Pay, SurePay,
        bank statements, mobile money, or a plain spreadsheet.
      </p>

      <p><strong>Nothing is posted until you confirm.</strong></p>

      <Steps>
        <Step title="Upload and map the columns">
          Which column holds the admission number, amount, date and reference.
        </Step>
        <Step title="Review the preview">
          DRAIS matches each row to a learner and flags duplicates — both against payments already recorded
          and within the file itself.
        </Step>
        <Step title="Resolve what needs attention">
          Rows matched by name rather than admission number always require your confirmation.
        </Step>
        <Step title="Commit">
          Only approved rows are posted, through the same path as a payment typed at the desk — so they get the
          same receipt, ledger entry and audit record.
        </Step>
      </Steps>

      <Callout kind="warning" title="Name matches are never automatic">
        <p>
          DRAIS will not post a payment to a learner matched only by name. Two learners share a name far more
          often than schools expect, and a payment credited to the wrong child is discovered at the worst
          possible moment.
        </p>
      </Callout>

      <h2>Balances and defaulters</h2>

      <ul>
        <li>A learner&apos;s statement — charges, payments, running balance.</li>
        <li>Outstanding balances by class or stream.</li>
        <li>Defaulters above a threshold you set.</li>
        <li>Total expected, collected and outstanding for the term.</li>
      </ul>

      <p>
        Balances can be shown to guardians in the parent portal — on by default, and switchable. See{' '}
        <Link href="/admin/parents">Parents</Link>.
      </p>

      <h2>Reminders</h2>

      <p>
        SMS reminders can go to guardians with outstanding balances, filtered by class and amount, with the
        balance inserted into the message. See <Link href="/help/guides/messages">Messaging guardians</Link>.
      </p>

      <h2>Budgets and expenses</h2>

      <p>
        Plan spend by term, department, project or activity. Spent is derived from the expenses linked to the
        budget, with remaining, percentage used and a warning before you overspend.
      </p>

      <p><GoTo href="/finance/budgets">Budgets</GoTo></p>

      <h2>Correcting a mistake</h2>

      <p>
        A payment entered wrongly is reversed with a correcting entry rather than deleted, and both entries
        stay visible. The balance ends up right and the history explains itself.
      </p>

      <Callout kind="note">
        <p>
          This is deliberate. A finance record that can be silently edited proves nothing; one that shows the
          mistake and the correction is worth having during an audit.
        </p>
      </Callout>
    </HelpDoc>
  );
}
