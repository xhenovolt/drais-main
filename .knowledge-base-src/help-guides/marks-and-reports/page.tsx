'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, Steps, Step, GoTo, DefTable } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="marks-and-reports">
      <p>
        Marks in, report cards out. This is the busiest week of the term for most schools, so the order matters
        and so does knowing what cannot be undone.
      </p>

      <h2>Before marks entry</h2>

      <p>Three things must be right or marks will go somewhere you did not intend:</p>

      <DefTable
        rows={[
          ['The current term', <>Marks attach to the term that is current. <Link href="/terms">Check it</Link> before opening mark sheets.</>],
          ['Subject allocation', <>A learner can only be marked in a subject their class actually takes. <Link href="/academics/class-subjects">Class subjects</Link>.</>],
          ['The exam or result type', <>Mid-term, end of term, and so on. <Link href="/academics/exams">Exams</Link>.</>],
        ]}
      />

      <h2>Entering marks</h2>

      <p><GoTo href="/academics/results">Results</GoTo></p>

      <p>
        Choose the class, subject and exam, and enter marks down the list. The sheet saves as you go rather
        than requiring one large save at the end.
      </p>

      <Callout kind="tip">
        <p>
          Teachers can be given access to only their own classes. Set that up once and mark entry becomes
          something you delegate rather than something the office does for everyone. See{' '}
          <Link href="/help/guides/users-and-access">Staff accounts and access</Link>.
        </p>
      </Callout>

      <h3>Checking before you generate</h3>

      <ul>
        <li>Missing marks — a blank is not a zero, and it changes totals and positions.</li>
        <li>Marks above the maximum, usually a typing slip.</li>
        <li>A whole subject with no marks — often a teacher who has not submitted yet.</li>
      </ul>

      <h2>Grading, aggregates and divisions</h2>

      <p>
        The grade scale, aggregate points and division thresholds are configured for your school. DRAIS ships
        with the standard UCE scale and schools using something else can change it.
      </p>

      <Callout kind="warning" title="Which subjects count">
        <p>
          Aggregates and divisions are computed from a specific set of contributing subjects — electives and
          religious education do not count by default. This is usually right, but check it matches your
          school&apos;s policy <em>before</em> you print four hundred report cards, not after.
        </p>
      </Callout>

      <h2>Generating report cards</h2>

      <p><GoTo href="/academics/report-cards">Report cards</GoTo></p>

      <Steps>
        <Step title="Choose the class, term and exam">
          Generation runs for a whole class at a time.
        </Step>
        <Step title="Generate">
          DRAIS takes a fixed copy of the marks at that moment, ranks the class, applies grades and comments,
          and saves the result.
        </Step>
        <Step title="Preview one learner">
          Check the numbers against the mark sheet before going near a printer.
        </Step>
        <Step title="Print a single card on real paper">
          Margins, logo size and column widths look different on paper than on screen. This costs one sheet
          and saves reprinting a class.
        </Step>
        <Step title="Print the class">
        </Step>
      </Steps>

      <h2>Why a reprint shows the old marks</h2>

      <p>
        When you generate, DRAIS freezes the marks into the report card. Reprinting next term produces the
        identical document — which is the point: the copy the parent holds and the copy you reprint must agree.
      </p>

      <Callout kind="success" title="If marks changed and you want the new ones">
        <p>
          Generate again. Both versions remain traceable, so you can always tell which document a parent is
          holding. Every printed report card carries a QR code that confirms it is genuine and shows what DRAIS
          recorded.
        </p>
      </Callout>

      <h2>Comments</h2>

      <p>
        Rather than typing the same remark thirty times, set comment rules once and let DRAIS choose based on
        the learner&apos;s result. Staff can still override any individual comment.
      </p>

      <p><GoTo href="/settings/report-comments">Report comments</GoTo></p>

      <p>
        The live preview shows which comment each learner would receive before you commit to the rules — use
        it against a real class.
      </p>

      <h2>Changing the report card layout</h2>

      <p>
        The layout is yours to design — sections, branding, which columns appear, bilingual output. Changes
        take effect on the next generation.
      </p>

      <p><GoTo href="/drce">Report card designer</GoTo></p>

      <Callout kind="note">
        <p>
          Designs move through draft → submitted → approved → published, and only a published design is used
          for printing. If a design change is not showing up, check it has been published rather than left in
          draft.
        </p>
      </Callout>

      <h2>Adjusting one learner&apos;s report</h2>

      <p>
        Occasionally one learner needs something different — a subject hidden because they joined late. From
        the report preview you can apply an override to that learner only. Their marks are not changed, only
        what is shown, and overrides can be removed individually.
      </p>

      <h2>If something looks wrong</h2>

      <DefTable
        rows={[
          ['A learner is missing', <>Check their enrolment is in that class for that term, and that they are not marked as left.</>],
          ['Marks entered do not appear', <>Almost always the wrong term was current when they were entered.</>],
          ['Position or total looks wrong', <>Look for missing marks first — a blank subject changes both.</>],
          ['Aggregate looks wrong', <>Check which subjects are set to contribute.</>],
          ['Layout is wrong on paper', <>Check paper size, and that the design is published rather than draft.</>],
        ]}
      />
    </HelpDoc>
  );
}
