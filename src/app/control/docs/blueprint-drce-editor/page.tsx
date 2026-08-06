'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="blueprint-drce-editor">
      <p>
        The report designer is the most sophisticated UI in DRAIS: ~6,800 lines across{' '}
        <code>src/components/drce/editor/</code>, with a 2,468-line properties panel and an 859-line editor
        shell.
      </p>

      <p>
        It is here as a blueprint because <strong>an editor is not a form</strong>, and treating one like the
        other is the most expensive mistake available in this codebase. Everything below applies to any
        builder, canvas or multi-step wizard you are asked to write.
      </p>

      <h2>Form vs editor</h2>

      <Table
        head={['', 'Form', 'Editor']}
        rows={[
          ['State', <>Field values</>, <>A whole document tree, plus a <strong>history</strong> of it</>],
          ['Mutation', <>Set a field</>, <>Apply a typed mutation through one funnel</>],
          ['Undo', <>Browser-native, per field</>, <>Application-level, across the tree</>],
          ['Selection', <>Focus</>, <>Multi-select, with a distinct primary</>],
          ['Dirty', <>Any field touched</>, <>Position in history ≠ last saved position</>],
          ['Failure mode', <>One wrong value</>, <><strong>Lost work</strong></>],
        ]}
      />

      <Box kind="invariant" title="The failure mode is what drives the architecture">
        <p>
          A form that loses a field is annoying. An editor that loses an afternoon of layout work is the reason
          a school stops trusting the product. Every design decision below is bought with that.
        </p>
      </Box>

      <h2>1. One mutation funnel</h2>

      <pre><code>{`import { applyMutation } from '@/lib/drce/mutations';

// EVERY edit — add, delete, reorder, restyle, move — is a typed DRCEMutation
// passed through applyMutation(document, mutation) → new document.`}</code></pre>

      <Box kind="invariant" title="Editing the tree directly works until someone presses undo">
        <p>
          Because every change is a described mutation rather than an arbitrary object edit, history is just an
          array of documents, undo is an index change, and the reducer never has to reverse-engineer what
          happened.
        </p>
        <p>
          The moment one code path mutates the document outside the funnel, that step is invisible to
          history — undo skips past it and the user watches an edit they made survive an undo that should
          have removed it.
        </p>
      </Box>

      <h2>2. History as a reducer</h2>

      <Source path="src/components/drce/editor/useDRCEEditor.ts">126 lines. Read this one in full — it is the core of the editor.</Source>

      <pre><code>{`const MAX_HISTORY = 30;
const COALESCE_MS = 250;

interface EditorState {
  history:    DRCEDocument[];   // snapshots, newest at index
  index:      number;           // where we are in history
  savedIndex: number;           // where we were when last saved
  lastTouch:  { type: string; targetId: string | null; at: number } | null;
}`}</code></pre>

      <Diagram caption="Undo/redo is an index. Nothing is recomputed or reversed.">
{`  history  [ doc0 ][ doc1 ][ doc2 ][ doc3 ][ doc4 ]
                              ▲               ▲
                            index          (dropped on next MUTATE)
                       savedIndex = 2  →  isDirty === false

  UNDO   index--        REDO   index++        SAVE   savedIndex := index`}
      </Diagram>

      <h3>Coalescing — the fix that makes drag usable</h3>

      <Box kind="warning" title="Without it, a one-second drag erases your entire undo history">
        <p>
          A free-drag commits roughly <strong>60 mutations per second</strong> (one per animation frame). With
          a 30-step window, one second of dragging fills history completely and pushes out every prior edit.
        </p>
        <p>
          So successive <code>SET_SECTION_STYLE</code> mutations on the <em>same</em> section within 250ms{' '}
          <strong>overwrite the head of history</strong> instead of appending. The coalesced entry holds the
          final position, so a single undo rewinds the whole drag — which is what a user expects anyway.
        </p>
      </Box>

      <pre><code>{`function coalesceKey(m: DRCEMutation) {
  // Only the high-frequency drag/resize mutations coalesce. Add, delete,
  // reorder and typing each deserve their own undo step.
  if (m.type !== 'SET_SECTION_STYLE') return null;
  return { type: m.type, targetId: m.sectionId };
}`}</code></pre>

      <p>
        Note what is <em>not</em> coalesced. Coalescing everything would merge unrelated edits into one undo
        step, which is just a different way of losing work.
      </p>

      <h3>Dirty tracking</h3>

      <pre><code>{`isDirty === (index !== savedIndex)     // ✅
isDirty === (index > 0)                // ❌ the bug this replaced`}</code></pre>

      <Box kind="tip">
        <p>
          With <code>index &gt; 0</code>, undoing back to the saved state still reported unsaved changes — so
          the user was warned about losing work they had already undone. Comparing against{' '}
          <code>savedIndex</code> makes moving <strong>backward or forward</strong> to the saved position clear
          the flag correctly.
        </p>
      </Box>

      <h2>3. Selection is decoupled from the document</h2>

      <Source path="src/components/drce/editor/selectionStore.ts" />

      <pre><code>{`sectionIds   // multi-select set
shapeIds     // multi-select set
primaryId    // the focused element (last clicked) — drives the properties
             // panel and anchors the contextual toolbar
clipboard    // JSON snapshot for cut/copy/paste`}</code></pre>

      <p>
        Backed by <code>useSyncExternalStore</code>, deliberately: consumers subscribe individually, so
        <strong> clicking a section does not re-render components that only care about shape selection.</strong>
      </p>

      <Box kind="invariant" title="Selection is not document state">
        <p>
          Putting it in the document would push a history entry on every click — filling the undo window with
          selections and making <code>isDirty</code> true for merely looking at something.
        </p>
        <p>
          The general rule: <strong>ephemeral UI state must not enter the history.</strong> Selection, hover,
          zoom, which panel is open — none of it belongs in the undo stack.
        </p>
      </Box>

      <p>
        <code>primaryId</code> is worth copying too. Multi-select needs a distinct &quot;focused&quot; member,
        or the properties panel has no defensible answer to &quot;which of these seven am I editing?&quot;.
      </p>

      <h2>4. Structure of the surface</h2>

      <Diagram>
{`  DRCEEditor                     shell, keyboard, save
    ├ PageNavigator              multi-page documents
    ├ SectionListPanel           tree — add, reorder, nest
    ├ canvas + SelectionLayer    render + selection handles
    ├ ContextualToolbar          anchored to primaryId
    ├ PropertiesPanel            per-type; the 2,468-line one
    │   ├ ShapePropertiesPanel
    │   ├ TablePropertiesPanel
    │   ├ TypographyPopover
    │   ├ VariablePicker         {student.fullName | upper}
    │   └ VisibilityRuleEditor   the shared rule tree
    ├ VersionHistoryDrawer       server-side versions
    └ KindAdvisories             soft warnings, never blocking`}
      </Diagram>

      <Table
        head={['Piece', 'Why it is separate']}
        rows={[
          [<code>SectionListPanel</code>, <>Structure and canvas are different mental tasks. Reordering by dragging a tree is far easier than dragging on a canvas.</>],
          [<code>PropertiesPanel</code>, <>Splits by selected type. At 2,468 lines it is the file most in need of further decomposition — treat it as a warning, not a model.</>],
          [<code>VariablePicker</code>, <>Nobody memorises the binding syntax. The picker <em>is</em> the documentation for the expression language.</>],
          [<code>VisibilityRuleEditor</code>, <>Builds the same <code>VisibilityRule</code> tree used by comment rules, CAFE promotion and issuance eligibility. <strong>One rule language in DRAIS, not four.</strong></>],
          [<code>KindAdvisories</code>, <>Advises that a portrait certificate looks unusual — and <strong>never blocks save or print</strong>. Advisory, not validation.</>],
          [<code>SectionErrorBoundary</code>, <>One malformed section must not blank the whole document.</>],
        ]}
      />

      <h2>5. Two save layers</h2>

      <Table
        head={['Layer', 'Where', 'Purpose']}
        rows={[
          [<>Draft</>, <><code>localStorage</code>, via <code>draftStore.ts</code></>, <>Crash recovery between explicit saves. Discarded once saved. <strong>No-ops when localStorage is unavailable</strong> (SSR, private mode, quota) — it must never be load-bearing.</>],
          [<>Version</>, <>Server, per save</>, <>Every successful save snapshots a version. Restoring is itself a save, so <strong>a restore is undoable</strong>.</>],
        ]}
      />

      <Box kind="warning" title="The draft is not a save">
        <p>
          It exists because a tab close used to lose everything silently. It is a safety net for the user, not
          a persistence mechanism — never treat a draft as the document of record.
        </p>
      </Box>

      <h2>Building your own editor</h2>

      <Table
        head={['#', 'Do this', 'Or else']}
        rows={[
          ['1', <>Route every change through one typed mutation function</>, <>Undo silently skips edits</>],
          ['2', <>History as an array + index; cap it</>, <>Unbounded memory</>],
          ['3', <>Coalesce only high-frequency mutations, by target, on a time window</>, <>One drag erases the undo window</>],
          ['4', <>Track <code>savedIndex</code>; <code>isDirty = index !== savedIndex</code></>, <>False unsaved-changes warnings</>],
          ['5', <>Keep selection and UI state <em>out</em> of the document</>, <>Clicks pollute history</>],
          ['6', <>Subscribe granularly (<code>useSyncExternalStore</code>)</>, <>Every click re-renders the whole editor</>],
          ['7', <>Local draft for crash recovery, no-op when unavailable</>, <>Lost work on a tab close</>],
          ['8', <>Server versions; restore <em>is</em> a save</>, <>An irreversible restore</>],
          ['9', <>Error-boundary each rendered unit</>, <>One bad node blanks everything</>],
          ['10', <>Advisories advise; validation blocks. Choose deliberately</>, <>Users blocked by your taste</>],
        ]}
      />

      <Box kind="invariant" title="If it renders a report, RENDER_LAYERS.md binds you">
        <p>
          The editor may do as it likes. The <strong>render path</strong> must stay a pure function of
          (document, dataCtx, renderCtx) — no I/O, no <code>Date.now()</code>. A reprint must reproduce the
          original byte for byte.
        </p>
      </Box>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Mutating the document outside <code>applyMutation</code></>, <>Invisible to undo.</>],
          [<>Coalescing everything</>, <>Unrelated edits merge into one undo step.</>],
          [<>Coalescing nothing</>, <>Drag destroys history.</>],
          [<>Selection in document state</>, <>Clicks create undo steps and mark the document dirty.</>],
          [<>Treating the local draft as a save</>, <>Silent data loss when localStorage is unavailable.</>],
          [<>Blocking save on an advisory</>, <>The school cannot ship the layout it wants.</>],
          [<>Adding a branch to the renderer for a new section</>, <>Register a descriptor instead.</>],
          [<>Growing <code>PropertiesPanel</code></>, <>It is already 2,468 lines. Split by type.</>],
        ]}
      />

      <SeeAlso slugs={['module-reports', 'blueprint-students-list', 'frontend', 'components']} />
    </ControlDoc>
  );
}
