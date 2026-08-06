'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="module-tahfiz">
      <p>
        29 API routes and 13 pages tracking Qur&apos;an memorisation. Technically a straightforward progress
        module. <strong>Editorially, the most sensitive code in DRAIS</strong> — and that is what this page is
        mostly about.
      </p>

      <FiveQuestions
        what={<>Memorisation tracking: books, portions, halaqa groups, learning plans, recitation records, attendance and reports for a theology programme.</>}
        why={<>Islamic schools run a full second curriculum alongside the secular one. Tracking it in a notebook makes progress reports and parent communication impossible at scale.</>}
        how={<>Reference data (sūrah, āyah, juzʾ and edition-specific books) plus per-learner portion assignments and recitation records, rolled up into reports through the same DRCE engine.</>}
        where={<><code>src/app/tahfiz/*</code> · <code>src/app/api/tahfiz/*</code> · <code>docs/tahfiz/</code> (reference-data stance)</>}
        extend={<>Reference data comes from a pinned authoritative source, never from generation. Everything here is module-gated.</>}
      />

      <h2>The religious-accuracy stance</h2>

      <Box kind="invariant" title="Reference data must come from a pinned authoritative dataset">
        <p>
          Sūrah names, āyah counts and juzʾ boundaries are <strong>not</strong> to be machine-generated,
          inferred, or copied from an unversioned source. Seed from a pinned authoritative dataset — Tanzil,
          KFGQPC, or QUL/quran.com — and <strong>record the exact version used</strong>.
        </p>
        <p>
          This is not a code-quality preference. Wrong Qur&apos;anic reference data in a school&apos;s system is
          a religious error, not a bug report, and it will be noticed by people who know the text far better
          than any engineer working on it.
        </p>
      </Box>

      <p>The repository&apos;s own preview document is explicit about confidence levels, and those distinctions must survive:</p>

      <Table
        head={['Data', 'Confidence', 'Consequence']}
        rows={[
          [<>Sūrah numbers and names</>, <strong>High</strong>, <>Safe to rely on.</>],
          [
            <>Āyah counts</>,
            <strong>High — for Ḥafṣ/Kūfan (6236)</strong>,
            <><strong>Other counting traditions differ.</strong> A school in a different tradition needs its own dataset; do not assume 6236 is universal.</>,
          ],
          [
            <>Juzʾ boundaries</>,
            <>Medium</>,
            <>References disagree in small ways (Juz 23&apos;s start, for instance). Verify against the school&apos;s reference.</>,
          ],
          [
            <>Pages, ḥizb, rubʿ positions</>,
            <><strong>Deliberately not generated</strong></>,
            <>Page layout is <em>print-specific</em>: Madinah 15-line ≠ IndoPak ≠ Tajweed prints. These are per-edition reference data, not universal facts.</>,
          ],
        ]}
      />

      <Box kind="warning" title="Yassarnā and Shāṭibiyyah are edition-specific">
        <p>
          Lessons, pages and bayt ranges must come from <strong>the school&apos;s actual copy and edition</strong>.
          Two schools using &quot;the same book&quot; may have different pagination. Treat book structure as
          school-supplied data, not as a shipped constant.
        </p>
      </Box>

      <Source path="docs/tahfiz/PHASE2_REFERENCE_DATA_PREVIEW.md">
        The full stance, the preview datasets, and the explicit statement that nothing was seeded without approval.
      </Source>

      <Box kind="tip" title="Note how that document was written">
        <p>
          It states its status in the first line — <em>preview only, nothing inserted, no migration applied,
          awaiting approval</em> — and separates what the author was confident about from what they were not.
        </p>
        <p>
          That is the standard for anything touching religious or legal reference data: state what is verified,
          what is assumed, and what is deferred. Do not present generated data as authoritative.
        </p>
      </Box>

      <h2>Addressing a portion</h2>

      <p>
        A memorisation portion may be addressed by āyah range, page range, sūrah range, ḥizb range or juzʾ
        range — and these must inter-convert.
      </p>

      <Box kind="invariant" title="Āyah is the stable axis; pages are not">
        <p>
          Juzʾ, ḥizb and rubʿ boundaries are defined <strong>by āyah</strong>, which is stable. Their{' '}
          <em>page</em> positions are print-specific and vary by edition.
        </p>
        <p>
          So conversions should route through āyah wherever possible. A conversion that goes through page
          numbers silently assumes one particular muṣḥaf.
        </p>
      </Box>

      <h2>Module gating</h2>

      <p>
        Tahfiz is an optional module. Every route is gated with <code>withModule(&apos;tahfiz&apos;, …)</code>{' '}
        and every UI entry hidden with <code>useEnabledModules()</code>.
      </p>

      <Box kind="warning">
        <p>
          Super-admin does <strong>not</strong> bypass the module gate. A school without Tahfiz has it
          unavailable to everyone, including its own super-admin — modules model subscription, not seniority.
        </p>
        <p>
          When someone reports &quot;I cannot see Tahfiz and my role looks right&quot;, the module flag is the
          answer far more often than the permission.
        </p>
      </Box>

      <h2>Reporting</h2>

      <p>
        Tahfiz reports render through the same DRCE engine and snapshot pipeline as secular report cards. That
        means all the same rules apply: layout is school-authored data, snapshots are frozen at generation, and
        reprints must reproduce the original.
      </p>

      <p>
        It also means Tahfiz benefits automatically from the bilingual and RTL support — most Tahfiz schools
        print in Arabic.
      </p>

      <Box kind="invariant" title="Arabic is a first-class output, not a translation layer">
        <p>
          Arabic numerals, RTL layout and Arabic report labels come from the shared vocabulary in the report
          engine. Never hardcode Arabic strings into a Tahfiz component, and never make a surface Arabic-only —
          every localisation change keeps both English and Arabic.
        </p>
      </Box>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Generating or inferring Qur&apos;anic reference data</>, <>A religious error in a school&apos;s system. The most serious mistake available in this module.</>],
          [<>Assuming 6236 āyāt universally</>, <>Wrong for schools in other counting traditions.</>],
          [<>Treating page numbers as universal</>, <>Breaks for any school using a different muṣḥaf edition.</>],
          [<>Shipping book structure as a constant</>, <>Editions differ; it is school data.</>],
          [<>Converting ranges through pages</>, <>Silently assumes one print edition.</>],
          [<>Forgetting the module gate on a new route</>, <>Schools without the module can reach it by URL.</>],
          [<>Hardcoding Arabic in a component</>, <>Bypasses the shared vocabulary; drifts from every other report.</>],
        ]}
      />

      <h2>Extension points</h2>

      <ul>
        <li><strong>New book</strong> → per-school, per-edition structure supplied by the school. Not a shipped constant.</li>
        <li><strong>New addressing scheme</strong> → convert through āyah.</li>
        <li><strong>New report</strong> → a DRCE section, so it inherits branding, bilingual output and snapshot immutability.</li>
        <li><strong>New reference dataset</strong> → pin the source and record the version, in the migration and in the docs.</li>
      </ul>

      <Box kind="note" title="Where the logic lives">
        <p>
          There is no <code>src/lib/tahfiz/</code>. Logic sits in the route handlers under{' '}
          <code>src/app/api/tahfiz/</code>, with the module registered in the permission catalog, the module
          codes and the trash registry. If you do substantial work here, extracting a <code>src/lib/tahfiz/</code>{' '}
          with a README would be a genuine improvement — it is one of the 17 subsystems still uncovered.
        </p>
      </Box>

      <SeeAlso slugs={['module-reports', 'security', 'playbook-module', 'system-map']} />
    </ControlDoc>
  );
}
