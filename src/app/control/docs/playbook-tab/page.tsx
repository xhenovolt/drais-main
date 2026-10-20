'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="playbook-tab">
      <p>
        <strong>Worked on the real code.</strong> The reference is <code>/attendance/settings</code>, whose tabs were built
        the way this playbook describes. The example adds a tab called <em>Exports</em>; substitute your own. Read the
        route&apos;s <Link href="/control/docs/routes/attendance/settings">teaching guide</Link> first if you have not.
      </p>

      <Box kind="tip" title="Which tab pattern to copy">
        <p>DRAIS has several. Counted in the current tree:</p>
        <ul>
          <li>31 files hold their own <code>tab</code>/<code>activeTab</code> state and render buttons — the common case.</li>
          <li>2 use <code>@headlessui/react</code> <code>Tab</code>; 1 uses the shared <code>Tabs</code> from <code>src/components/ui</code>.</li>
        </ul>
        <p>
          For a settings-style page, copy <code>/attendance/settings</code>: typed tab list, hash deep links, panels kept
          mounted, and ARIA roles. Do not introduce a fourth pattern on a page that already has one.
        </p>
      </Box>

      <h2>1. Declare the tab</h2>
      <p>The tab key is a union type, so a typo in step 4 fails to compile instead of rendering an empty panel.</p>
      <pre><code>{`// src/app/attendance/settings/page.tsx
type SettingsTab = 'schedule' | 'boarding' | 'sms' | 'devices' | 'lessons' | 'display' | 'exports';
const SETTINGS_TABS: Array<{ key: SettingsTab; label: string }> = [
  …,
  { key: 'exports', label: 'Exports' },   // label is a fallback; the bar renders t(...) below
];`}</code></pre>

      <h2>2. Give it a translated label</h2>
      <p>
        The tab bar renders <code>{'t(`attendancePages.settings.tab.${tb.key}`)'}</code>, so the new key needs an English
        <em> and</em> an Arabic entry in <code>src/locales/en.json</code> and <code>src/locales/ar.json</code>. Arabic text
        must be Arabic only (Arabic-Indic digits included); <code>npm run test:i18n</code> enforces it.
      </p>
      <pre><code>{`"attendancePages": { "settings": { "tab": { …, "exports": "Exports" } } }      // en.json
"attendancePages": { "settings": { "tab": { …, "exports": "التصدير" } } }       // ar.json`}</code></pre>

      <h2>3. Build the panel as its own component</h2>
      <p>
        Every non-schedule tab on this page is a self-contained component in <code>src/components/attendance/</code> that
        loads and saves its own data. The smallest one is the template:
      </p>
      <Source path="src/components/attendance/LogsDisplaySettings.tsx">89 lines: GET on mount, PUT on change, its own loading row and toast.</Source>
      <Source path="src/app/api/attendance/settings/logs-display/route.ts">Its API: session school, whitelist validation, one row in school_settings.</Source>
      <p>So a new tab is a new <code>ExportsSettings.tsx</code> beside it. Keeping the panel separate means the page does not grow, and the panel cannot break the rule form&apos;s state.</p>

      <h2>4. Render the panel</h2>
      <pre><code>{`<div hidden={tab !== 'exports'} role="tabpanel" id="panel-exports" aria-labelledby="tab-exports" className="space-y-6">
  <ExportsSettings />
</div>`}</code></pre>
      <Table
        head={['Detail', 'Why']}
        rows={[
          [<code key="h">hidden</code>, 'Panels stay mounted, so unsaved edits survive switching tabs. Conditional rendering (&&) would throw them away.'],
          [<code key="i">id / aria-labelledby</code>, 'Pairs with the button’s aria-controls so screen readers announce the panel.'],
          ['No change to the hash code', 'The hashchange effect accepts any key in SETTINGS_TABS, so /attendance/settings#exports works immediately.'],
        ]}
      />

      <h2>5. The API route</h2>
      <ul>
        <li>Take the school from <code>getSessionSchoolId(req)</code>; never read <code>school_id</code> from the body.</li>
        <li>For a write, call <code>requirePermission</code> with the permission code the feature needs. (The rule form&apos;s
          own POST lacks one — a recorded gap, not a model.)</li>
        <li>Validate on the server even if the panel validates too.</li>
        <li>Put any rule (&quot;exports older than 30 days are…&quot;) in <code>src/lib/attendance/</code> as a pure function.</li>
      </ul>

      <h2>6. Test</h2>
      <ul>
        <li>The pure rule: a <code>node:test</code> file in <code>src/lib/attendance/__tests__/</code>, run by <code>npm run test:attendance</code>. <code>day-overrides.test.mjs</code> is a short example.</li>
        <li>The labels: <code>npm run test:i18n</code>, then <code>node scripts/l10n-render.mjs src/components/attendance/ExportsSettings.tsx</code> to see it in English and Arabic.</li>
        <li>The page: open <code>/attendance/settings#exports</code>, switch tabs with unsaved edits, and reload — the tab must persist and the edits must survive.</li>
      </ul>

      <SeeAlso slugs={['playbook-page', 'playbook-api', 'anti-patterns']} />
    </ControlDoc>
  );
}
