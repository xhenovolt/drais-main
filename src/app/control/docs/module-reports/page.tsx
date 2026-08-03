'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="module-reports">
      <p>
        The module that produces the artefact a family keeps for years, and that a receiving school or an
        employer may be shown a decade later. Correctness here is not a quality goal — it is the product.
      </p>

      <FiveQuestions
        what={<>Two halves: <strong>snapshots</strong> (the frozen data) and <strong>DRCE</strong> (the school-authored layout and the render engine).</>}
        why={<>A report card must be reproducible. If a reprint disagreed with the copy a parent holds, neither could be trusted — and there would be no way to tell which was right.</>}
        how={<>Generation reads the live database once and freezes a hashed snapshot. Every render — preview, print, PDF, parent portal, public verify — reads only that snapshot.</>}
        where={<><code>src/lib/snapshots</code> (data) · <code>src/lib/drce</code> (layout + render) · <code>src/components/drce</code> (editor) · <code>src/app/api/snapshots</code></>}
        extend={<>Add fields to generation, never to the render path. Keep the render a pure function. Read <code>RENDER_LAYERS.md</code> before touching anything that renders.</>}
      />

      <Source path="src/lib/drce/RENDER_LAYERS.md">
        The binding contract: five layers, five hard invariants, one documented exception. Read it first.
      </Source>

      <h2>The business problem</h2>

      <p>Three requirements that pull against each other:</p>

      <ol>
        <li><strong>Every school wants a different report card.</strong> Waiting on a developer for a column change is unacceptable.</li>
        <li><strong>A printed report card must never change.</strong> Reprints must be byte-identical.</li>
        <li><strong>Some schools print in Arabic, right-to-left, with Arabic numerals.</strong></li>
      </ol>

      <p>
        (1) means layout must be <strong>data</strong>. (2) means data must be <strong>frozen</strong>. The
        architecture is the resolution of those two.
      </p>

      <h2>Architecture</h2>

      <Diagram caption="Generation happens once. Rendering happens many times and never touches live tables.">
{`  ══ GENERATION ═══════════════════════════════════════════════════════════
   live academic tables
        │  read ONCE
        ▼
   snapshot generator          deterministic: no Date.now, no Math.random,
        │                      all iteration over PRE-SORTED arrays
        ▼
   report_snapshots.snapshot_json  +  meta.dataHash (sha256, key-sorted)
        │
  ══ RENDER  (preview · print · pdf · portal · public verify) ═════════════
        │
        ├── 1  base DRCEDocument      layout, authored by the school
        ├── 2  snapshot branding      FROZEN at generation — no live lookup
        ├── 3  snapshot data          per-student rows; never live results
        ├── 4  override layer         transforms the DOCUMENT, not the data
        └── 5  render                 pure (document, dataCtx, renderCtx)
                                        │
                                        ▼
                              HTML → browser print
                              HTML → puppeteer → PDF
                              QR   → HMAC verify token`}
      </Diagram>

      <h2>Determinism, concretely</h2>

      <p>
        <code>meta.dataHash</code> is a SHA-256 over the key-sorted classes array. Two generations from
        unchanged data must produce identical bytes. Throughout both folders that means:
      </p>

      <ul>
        <li>No <code>Date.now()</code> or <code>Math.random()</code> anywhere reaching <code>snapshot.classes</code>.</li>
        <li>No <code>Object.keys()</code> over unsorted data — all iteration is over pre-sorted arrays.</li>
        <li>Ranking ties break on a fixed chain: total → average → lastName → firstName → studentDbId.</li>
        <li><code>canonicalStringify</code> produces identical bytes for identical input.</li>
        <li>The render path performs <strong>no I/O at all</strong>.</li>
      </ul>

      <Box kind="invariant" title="If you add a field, decide its sort order first">
        <p>
          Before anything else. An unsorted field makes generation non-deterministic, which is not caught by a
          passing test — it is caught months later when a reprint differs.
        </p>
        <p>Old snapshots keep their old hash. That is correct. <strong>Do not backfill.</strong></p>
      </Box>

      <h2>The documented exception</h2>

      <Box kind="warning" title="Overall comments are re-resolved at print time">
        <p>
          Class teacher / DOS / headteacher comments are the one field that deliberately breaks snapshot
          immutability, so that comment rules scoped to a specific template can apply — snapshots are generated
          template-unaware, but printed under whichever template is active.
        </p>
        <p>
          <strong>Accepted trade-off:</strong> reprinting can show different comment wording if the school
          changes its comment bank. Marks, grades, positions, aggregates and branding remain byte-identical.
          Parent-portal and public-verify renders always show the frozen value, because they have no staff
          session with which to fetch rules.
        </p>
        <p>Cite ADR-0007 as precedent. Do not copy the pattern.</p>
      </Box>

      <h2>DRCE: layout as data</h2>

      <p>
        A DRCE document is JSON in <code>dvcf_documents</code>. Schools compose sections in a visual editor;
        DRAIS renders them. No deploy is involved in a layout change.
      </p>

      <Table
        head={['Capability', 'How it stays safe']}
        rows={[
          [<>24 section types</>, <>A closed discriminated union in <code>schema.ts</code>. New types register a descriptor rather than adding a branch to the renderer.</>],
          [<>Expression language <code>{'{student.fullName | upper}'}</code></>, <>Deliberately small and <strong>closed</strong> — no arithmetic, no sub-expressions, no eval. Purity and sandbox-freedom come from the grammar being tiny.</>],
          [<>Spreadsheet formulas in table sections</>, <>A real recursive-descent parser. Errors surface as <code>#ERROR!</code> / <code>#CYCLE!</code> rather than failing silently.</>],
          [<>Conditional visibility per section</>, <>A pure rule tree evaluated per learner. One document serves boarders and day learners instead of four documents drifting apart.</>],
          [<>Per-student overrides</>, <>Transform the document tree; the snapshot and academic data are untouched.</>],
          [<>Bilingual EN/AR with RTL</>, <>Labels come from a shared vocabulary, never typed into a design.</>],
        ]}
      />

      <Box kind="invariant" title="Aggregates and divisions have exactly one source of truth">
        <p>
          <code>getContributingAssessmentResults</code> decides which subjects count — ICT, IRE and electives
          never do. <strong>Never reimplement this.</strong> A second implementation is precisely what caused
          the 2026-07 division mismatch, and it was found by a school, not by a test.
        </p>
        <p>After any change here run <code>test:drce</code>, <code>test:snapshots</code> and <code>verify:divisions</code>.</p>
      </Box>

      <h2>Two renderers, both permanent</h2>

      <Table
        head={['Renderer', 'Used for', 'Trade-off']}
        rows={[
          [<code>drce</code>, <>Standard, custom, DRCE templates</>, <>Full override support, school branding, visual editor.</>],
          [<code>emergency_html</code>, <>Emergency, Arabic, legacy templates</>, <>Lightweight and fast; <strong>cannot honour overrides</strong> — string substitution has no document tree to transform.</>],
        ]}
      />

      <Box kind="warning" title="The static HTML files under backup/ are load-bearing">
        <p>
          They serve the snapshot previewer&apos;s emergency iframe and the legacy secular-emergency-report
          routes. They look like dead files. Deleting them breaks both.
        </p>
      </Box>

      <h2>Verification</h2>

      <p>
        Every printed report carries a QR encoding an HMAC-SHA256 token. Anyone can decode the payload; only
        the server can mint a valid signature, so a scanner can confirm a report is genuine.
      </p>

      <p>
        Tokens are <strong>deliberately not time-bounded</strong> — a parent checking a report card years later
        should still get a valid view. Revocation is by key rotation. They sign with{' '}
        <code>SESSION_COOKIE_SECRET</code>, so rotating that invalidates every previously printed QR.
      </p>

      <h2>Performance</h2>

      <ul>
        <li><strong>Generation is single-flight</strong> per (school, term, year, type) via a unique index. A concurrent request is rejected, not queued; an abandoned run clears on the staleness sweep.</li>
        <li><strong><code>snapshot_json</code> is a LONGTEXT with no chunking.</strong> A very large school produces a very large row — a known ceiling.</li>
        <li><strong>PDF is puppeteer</strong>, which is heavy. <code>/print</code> and <code>/pdf</code> share one HTML builder so they cannot drift.</li>
        <li><strong>Grade codes resolve on write</strong>, not read — reads are the hot path.</li>
      </ul>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Querying live results in a render path</>, <>Reprints stop being reproducible. The core defect this module exists to prevent.</>],
          [<><code>Date.now()</code> anywhere in render</>, <>Non-deterministic output.</>],
          [<>Reimplementing the contributing-subject rule</>, <>Wrong divisions on printed cards. Has happened.</>],
          [<>Importing <code>@/lib/db</code> into a client-imported module</>, <>Pulls <code>tls</code> into the client bundle. Use the <code>.server.ts</code> twin pattern.</>],
          [<>Adding a branch to the renderer for a new section</>, <>Register a descriptor instead.</>],
          [<>Extending the expression grammar</>, <>Its smallness is what keeps it safe.</>],
          [<>Assuming a design change is live</>, <>Only a <strong>published</strong> design is used for printing.</>],
        ]}
      />

      <h2>Extension points</h2>

      <ul>
        <li><strong>New section type</strong> → union entry in <code>schema.ts</code> + descriptor in <code>section-registry.ts</code> + component. No renderer change.</li>
        <li><strong>New computed value</strong> → one entry in <code>computed/builtins.ts</code>; the picker, resolver and print path all pick it up.</li>
        <li><strong>New formatter pipe</strong> → <code>computed/formatters.ts</code>. Unknown formatters must pass the value through.</li>
        <li><strong>New snapshot field</strong> → generation only, with a defined sort order.</li>
        <li><strong>New render target</strong> → build on <code>build-print-html.ts</code>.</li>
      </ul>

      <Source path="src/lib/snapshots/README.md" />
      <Source path="src/lib/drce/README.md" />

      <SeeAlso slugs={['request-lifecycle', 'schema', 'decisions', 'module-attendance']} />
    </ControlDoc>
  );
}
