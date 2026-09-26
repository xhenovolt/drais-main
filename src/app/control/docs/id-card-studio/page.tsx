'use client';

import React from 'react';
import ControlDoc, { Box, Table, Source, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="id-card-studio">
      <p>
        The ID Card Studio (<code>/students/id-cards/studio</code>) makes two-sided student ID cards. A design is a card size in millimetres plus a front and an optional back;
        each side is a static backdrop with positioned elements on top. It is separate from the classic single-sided designer and from DRCE, which keep working unchanged.
      </p>

      <h2>The design spec (v2)</h2>
      <Source path="src/lib/idcards/spec.ts" />
      <Table
        head={['Element', 'Fields', 'Notes']}
        rows={[
          ['text', 'text with {tokens}, fontSizePt, bold, italic, color, align, valign, uppercase, fontFamily, shrink', 'shrink keeps one line by scaling the font (55–100 %) using a width estimate, so screen and print agree. valign centres a name that may take 1–2 lines.'],
          ['image', 'source: photo | logo | static, fit, shape', 'photo = the learner, logo = the school\'s DRAIS logo, static = a fixed https URL.'],
          ['qr', 'value with {tokens}', ''],
          ['rect', 'fill, stroke, strokeMm, radiusMm', 'Used for borders and rule lines — vector, crisp at any print size.'],
        ]}
      />
      <p>
        <code>sanitizeSpec()</code> coerces any JSON into a safe spec on save (clamped numbers, https-only URLs, capped element count, font-family whitelist).
        Tokens: <code>full_name, first_name, last_name, admission_no, class, gender, dob, school, school_address, school_phone, school_email, academic_year, issue_date, valid_until, guardian_phone</code>
        and <code>col:&lt;Header&gt;</code> for Excel columns. Unknown tokens render empty — braces never leak onto a card.
      </p>

      <h2>Printing</h2>
      <Source path="src/lib/idcards/layout.ts" />
      <Table
        head={['Mode', 'Layout']}
        rows={[
          ['side_by_side (default for two-sided)', 'One row per learner: FRONT left, BACK right, one sheet gap apart. Works on any printer.'],
          ['duplex_long / duplex_short', 'Page N = all fronts, page N+1 = all backs, mirrored by column (long edge) or row (short edge) so each back registers behind its front on a duplex printer.'],
          ['front_only', 'Fronts only. Single-sided designs are always forced to this.'],
        ]}
      />
      <Box kind="tip" title="Why duplex was the old default">
        <p>
          Duplex is what a double-sided printer needs: fronts and backs on different pages, mirrored. It cannot put a learner&apos;s two faces together on one sheet, and on a
          single-sided printer it leaves fronts and backs on separate sheets. <code>defaultPrintMode(hasBack)</code> now returns <code>side_by_side</code> for two-sided designs;
          duplex stays one select away. The pair unit is <code>2 × card width + gap</code>, and the grid stays centred on the sheet.
        </p>
      </Box>
      <p>
        The card date fields come from the print options: <code>issue_date</code> and <code>valid_until</code> fall back to the values typed on the print screen when a record has none
        (an Excel column mapped to Valid until wins). School address / phone / email come from the school config passed to <code>IdCardGenerate</code>.
      </p>

      <h2>Importing a Publisher template</h2>
      <Box kind="warning" title="A .pub file cannot be parsed by DRAIS">
        <p>
          <code>.pub</code> is a proprietary OLE/CFB binary with no open specification and no parser in the repository. <code>/api/id-cards/assets</code> recognises the signature
          (<code>d0 cf 11 e0</code>) and rejects it with export guidance. The supported path is to let Publisher itself describe the file.
        </p>
      </Box>
      <Table
        head={['Step', 'File', 'What it does']}
        rows={[
          ['1. Extract', 'scripts/idcards/publisher-extract.ps1', 'Drives an installed Publisher over COM and writes JSON: every shape\'s geometry, fill/line, and each text line split into label/value segments with measured bounds, font, size, bold and colour. Needs Windows + Publisher.'],
          ['2. Import', 'src/lib/idcards/publisher-import.ts', 'Pure. Drops shapes hidden behind a later opaque shape, finds the card outline(s) (equal-sized boxes → front/back), converts borders/rules to rects, pictures to photo/logo slots and text to positioned elements.'],
          ['3. Understand', 'src/lib/idcards/placeholders.ts', 'Pure. Decides what is sample text and what is fixed wording (below).'],
          ['4. Build', 'scripts/idcards/build-template.mts', 'Runs 2+3 and writes src/lib/idcards/templates/<name>.ts — only the finished design, no sample data.'],
          ['5. Register', 'src/lib/idcards/templates.ts', 'The list shown under "Start from a template".'],
        ]}
      />
      <p>
        To add another Publisher design: run the extractor, then <code>npx tsx scripts/idcards/build-template.mts shapes.json src/lib/idcards/templates/&lt;name&gt;.ts &lt;EXPORT_NAME&gt;</code>,
        register it in <code>templates.ts</code>, and add an anonymised fixture and a test. The current template is regenerated from
        <code> __tests__/fixtures/id-temp.shapes.json</code> and a test fails if the checked-in file drifts from what the importer produces.
      </p>

      <h2>Placeholder intelligence</h2>
      <p>
        Imported templates carry sample content (another school&apos;s name, a sample learner, class, ID, dates, address, phone). <code>placeholders.ts</code> classifies each run of text as a
        label to keep, a placeholder, or fixed wording, and records a reason and confidence for every decision:
      </p>
      <Table
        head={['Signal', 'Example', 'Result']}
        rows={[
          ['Label → token', 'NAME: / CLASS: / ID NO: / EXPIRY DATE: / DATE:', 'value becomes {full_name} / {class} / {admission_no} / {valid_until} / {issue_date}'],
          ['Label of another person', 'HEAD TEACHER\'S SIGN:, HOLDER\'S SIGN:, Parent name:', 'never a learner field — kept as a label'],
          ['School name', 'a phrase with a school word (SCHOOL, SECONDARY, COLLEGE, ACADEMY …) and no sentence words; also the name after "property of / issued by"', '{school} (a name split over two lines is merged)'],
          ['Known school name', 'the importing school\'s real name, anywhere', '{school}, high confidence'],
          ['Address / phone', 'P.O. Box …; Tel: 07… / 07…', '{school_address}; Tel: {school_phone} ("Tel" is the guardian\'s phone on the front)'],
          ['Value shape (no label)', 'JPA/A/822, S.6, 11TH/04/2024, OCERO MOSES', '{admission_no}, {class}, {issue_date}, {full_name} — medium confidence'],
        ]}
      />
      <Box kind="invariant" title="No sample data may reach a template">
        <p>
          A built-in template must contain no other school&apos;s name, learners or contact details; a test scans every template for them. Fixtures are anonymised copies.
          Centred lines stay centred (symmetrical box), values never run into the next field on their line, and ALL-CAPS samples set <code>uppercase</code>.
        </p>
      </Box>

      <h2>Tests</h2>
      <p>
        <code>npm run test:idcards</code> — layout order and default, spec sanitising, renderer, Excel jobs, isolation, plus <code>placeholders.test.mjs</code> (label/value/school-name rules,
        importer on a real Publisher structure, template drift, shrink).
      </p>

      <SeeAlso slugs={['module-reports']} />
    </ControlDoc>
  );
}
