'use client';

import React from 'react';
import HelpDoc, { Callout, GoTo, DefTable, Steps, Step } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="id-cards">
      <p>
        The ID Card Studio makes two-sided student ID cards for the whole school — from your enrolled learners or from an Excel list — and prints them
        with each learner&rsquo;s front and back together. You can start from a ready-made design, so you do not need to design anything.
      </p>
      <p><GoTo href="/students/id-cards/studio">Open the ID Card Studio</GoTo></p>

      <h2>Make cards in five steps</h2>
      <Steps>
        <Step title="Pick a design">In <b>1. Design</b>, choose <b>Start from a template…</b>. The ready-made student ID has the photo and school badge on the left, name, class, ID and signature lines on the right, and the address on the back. Or start from a blank design or your classic design.</Step>
        <Step title="Check it uses your school">Your school name, badge, address and phone fill in by themselves — you do not retype them. Click any item to move it, resize it or change its text, size and colour.</Step>
        <Step title="Save it">Press <b>Save &amp; make active</b> so the design is there next time.</Step>
        <Step title="Choose the learners">In <b>2. Generate &amp; print</b>, tick learners, or leave nothing ticked to print everyone shown. To print from a list, choose <b>Excel file</b>, upload it and match the columns.</Step>
        <Step title="Print">Set <b>Date of issue</b> and <b>Valid until</b>, check the preview, then press <b>Print / Save as PDF</b>.</Step>
      </Steps>

      <h2>Front on the left, back on the right</h2>
      <p>
        For two-sided designs the sheet is set to <b>Front left, back right</b>. Each learner gets one row: the front on the left and the back on the right,
        so both faces are always together and you can cut them out and laminate. This works on any printer.
      </p>
      <DefTable rows={[
        ['Front left, back right', 'The default. One row per learner, front then back. Works on every printer.'],
        ['Double-sided printer — long edge / short edge', 'Only for printers that print on both sides of the paper. All the fronts are on one page and all the backs on the next, arranged so each back lands behind its own front when the paper is turned. If your printer prints on one side only, do not use these.'],
        ['Fronts only', 'Prints just the fronts.'],
      ]} />
      <Callout kind="tip" title="Test on one sheet first">
        Print one sheet on plain paper before printing the whole school — every printer feeds paper slightly differently.
      </Callout>

      <h2>Why the school name and learner names on a template are not final</h2>
      <p>
        A design made in Publisher or another program always shows sample text — a school name, a sample learner, a sample class and ID number, sample dates,
        an address and phone. DRAIS understands that this is filler, not the real thing. It replaces it with fields that are filled per learner and per school:
      </p>
      <DefTable rows={[
        ['School name', 'Your school name on every card, whatever its length. A long name uses two lines.'],
        ['Learner name, class, ID number', 'Filled from each learner (or from the Excel columns you matched).'],
        ['Date of issue, Valid until', <>The dates you type on the print screen. A column mapped to <b>Valid until</b> in your Excel file takes priority.</>],
        ['School address and phone', 'Taken from your school settings. If they are empty in School Information, that line prints blank — fill them in first.'],
        ['Labels and fixed wording', 'Words such as NAME:, CLASS: and STUDENT IDENTITY CARD stay exactly as designed.'],
      ]} />
      <Callout kind="note" title="Signature lines stay as they are">
        &ldquo;Head teacher&rsquo;s sign&rdquo; and &ldquo;Holder&rsquo;s sign&rdquo; lines are left for a real signature. DRAIS never fills them with a learner&rsquo;s details.
      </Callout>

      <h2>My design is a Publisher (.pub) file</h2>
      <p>
        DRAIS cannot open <b>.pub</b> files directly — Publisher stores them in a private Microsoft format that only Publisher can read. Your school&rsquo;s student ID
        design has already been converted and is in <b>Start from a template</b>. For another Publisher design you have two options:
      </p>
      <ul>
        <li>In Publisher choose <b>File → Export → Change File Type → PNG or JPEG</b> (300 DPI), then in the Studio use <b>Import artwork</b> on each side. Names and photos are added on top as live fields.</li>
        <li>Ask Xhenvolt to convert it. The design is rebuilt as editable text, lines and photo slots, with the sample text turned into fields.</li>
      </ul>

      <Callout kind="warning" title="Photos and Excel lists">
        Cards made from an Excel list are for printing only — no learner records are created or changed, and no attendance or SMS activity is triggered.
        Your file is kept in private storage and deleted automatically after 24 hours. Photos in a spreadsheet must be web links in a column; pictures placed inside the workbook are not read.
      </Callout>

      <h2>If something looks wrong</h2>
      <DefTable rows={[
        ['A name is cut off or too small', <>Very long names shrink slightly to stay on one line. Widen the name box in the Studio, or turn off <b>Shrink long text</b> to let it wrap.</>],
        ['The address or phone line is empty', <>Add them in <GoTo href="/settings/school">School Information</GoTo>, then reopen the Studio.</>],
        ['The date prints blank', <>Fill <b>Date of issue</b> and <b>Valid until</b> on the print screen.</>],
        ['The back is not behind the front', <>You are using a double-sided option. Use <b>Front left, back right</b>, or check the printer is set to flip on the same edge you chose.</>],
        ['Text looks different from Publisher', 'Some Publisher fonts are not installed on every computer, so a similar font is used. Change the font in the Studio if you prefer another.'],
      ]} />
    </HelpDoc>
  );
}
