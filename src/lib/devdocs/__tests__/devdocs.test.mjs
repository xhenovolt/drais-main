// Developer documentation — the analyser reads code correctly, and the hand-written
// half cannot silently go stale (dead guide targets, Source links to deleted files).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIndex, completeness } from '../../../../scripts/devdocs/analyze.mjs';

const ROOT = process.cwd();

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devdocs-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

describe('analyser on a small fixture tree', () => {
  let ix;
  before(() => {
    const dir = fixture({
      'src/app/layout.tsx': `export default function Root({ children }) { return <html>{children}</html>; }`,
      'src/app/(shop)/layout.tsx': `export default function Shop({ children }) { return <div>{children}</div>; }`,
      'src/app/(shop)/items/[id]/page.tsx': `'use client';
/** Item page. */
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { API_ITEMS } from '@/lib/urls';
import Card from '@/components/ui/card';
const BASE = '/api/items';
export default function ItemPage({ id, qs }) {
  const [tab, setTab] = useState('info');
  const { data } = useSWR(\`/api/items/\${id}\`);
  useEffect(() => { fetch(\`/api/items\${qs}\`); fetch(BASE + '/x'); }, []);
  const save = () => fetch(id ? \`/api/items/\${id}\` : '/api/items', { method: 'POST' });
  const gone = () => fetch('/api/nowhere');
  const listed = () => fetch(API_ITEMS);
  return <Card onClick={() => setTab('x')} />;
}`,
      'src/app/(shop)/items/_parts/Helper.tsx': `export default function Helper() { return null; }`,
      'src/app/api/items/route.ts': `import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req) { const s = await getSessionSchoolId(req); return query('SELECT * FROM items WHERE school_id = ?', [s.schoolId]); }
export async function POST(req) { await requirePermission(req, 'items.edit'); }`,
      'src/app/api/items/[id]/route.ts': `import { query } from '@/lib/db';\nexport async function GET() { return query('SELECT * FROM items'); }`,
      'src/lib/db.ts': `export async function query() {}`,
      'src/app/api/old/route.ts': `import { NextResponse } from 'next/server';\nexport function POST() { return NextResponse.json({}, { status: 410 }); }`,
      'src/lib/urls.ts': `export const API_ITEMS = '/api/items';`,
      'src/lib/auth.ts': `export async function getSessionSchoolId() {}`,
      'src/components/ui/Card.tsx': `export default function Card() { return null; }`,
      'database/schema.sql': `CREATE TABLE items (id int);`,
    });
    ix = buildIndex(dir);
  });

  it('builds routes from the real folders: groups dropped, private folders excluded', () => {
    assert.ok(ix.routes['/items/[id]']);
    assert.equal(ix.routes['/items/[id]'].kind, 'page');
    assert.ok(!Object.keys(ix.routes).some((u) => u.includes('_parts')));
    assert.deepEqual(ix.routes['/items/[id]'].layouts, ['src/app/layout.tsx', 'src/app/(shop)/layout.tsx']);
  });

  it('resolves request URLs: templates, query-string suffixes, variables, conditionals, imported constants', () => {
    const f = ix.files['src/app/(shop)/items/[id]/page.tsx'];
    const urls = f.requests.map((r) => `${r.method} ${r.url} -> ${r.endpoint ?? (r.endpointMissing ? 'MISSING' : '?')}`);
    assert.ok(urls.includes('GET /api/items/:param -> /api/items/[id]'), urls.join('\n'));
    assert.ok(urls.includes('GET /api/items -> /api/items'), 'a ${qs} glued to the path is a query string');
    assert.ok(urls.includes('GET /api/items/x -> /api/items/[id]'), 'BASE + "/x" follows the const (and /x fills the [id] segment)');
    assert.ok(urls.includes('POST /api/items/:param -> /api/items/[id]') && urls.includes('POST /api/items -> /api/items'), 'both branches of a conditional');
    assert.ok(urls.includes('GET /api/nowhere -> MISSING'));
    assert.ok(f.requests.some((r) => r.via.includes('API_ITEMS') && r.endpoint === '/api/items'), 'constant imported from another module');
  });

  it('flags a POST to a route with no POST handler', () => {
    const f = ix.files['src/app/(shop)/items/[id]/page.tsx'];
    assert.ok(f.requests.some((r) => r.method === 'POST' && r.endpoint === '/api/items/[id]' && r.methodMissing));
  });

  it('records state, hooks by source, rendered components', () => {
    const f = ix.files['src/app/(shop)/items/[id]/page.tsx'];
    assert.deepEqual(f.state.map((s) => [s.name, s.setter]), [['tab', 'setTab']]);
    assert.equal(f.hooks.find((h) => h.name === 'useState').source, 'react');
    assert.equal(f.hooks.find((h) => h.name === 'useSWR').source, 'swr');
    assert.equal(f.directive, 'use client');
    assert.equal(f.header, 'Item page.');
  });

  it('reports an import that resolves only case-insensitively', () => {
    const imp = ix.files['src/app/(shop)/items/[id]/page.tsx'].imports.find((i) => i.spec === '@/components/ui/card');
    assert.equal(imp.broken, true);
    assert.equal(imp.caseMismatch, 'src/components/ui/card.tsx');
  });

  it('API routes: methods, real tables only, auth, stubs', () => {
    const r = ix.files['src/app/api/items/route.ts'];
    assert.deepEqual(r.httpMethods, ['GET', 'POST']);
    assert.deepEqual(r.sqlTables, ['items']);
    assert.equal(r.sessionScoped, true);
    assert.deepEqual(r.permissions.map((p) => p.code), ['items.edit']);
    assert.equal(ix.files['src/app/api/old/route.ts'].stub, true);
    assert.equal(completeness(ix, '/api/old').permissions, 'derived');
    assert.equal(completeness(ix, '/api/items/[id]').permissions, 'needs-review');
  });

  it('records dependants', () => {
    assert.ok(ix.files['src/lib/urls.ts'].dependants.includes('src/app/(shop)/items/[id]/page.tsx'));
  });
});

describe('the real tree', () => {
  let ix;
  before(() => { ix = buildIndex(ROOT); });

  it('documents every page.tsx and route.ts that Next.js would serve', () => {
    const served = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = d + '/' + e.name;
        if (e.isDirectory()) { if (!e.name.startsWith('_') && e.name !== 'node_modules') walk(rel); }
        else if (/^(page|route)\.(tsx?|jsx?)$/.test(e.name)) served.push(rel);
      }
    };
    walk('src/app');
    const documented = new Set(Object.values(ix.routes).flatMap((r) => [r.files.page, r.files.route, ...(r.duplicates || [])]).filter(Boolean));
    const missing = served.filter((f) => !documented.has(f));
    assert.deepEqual(missing, []);
  });

  it('parses every file', () => {
    assert.deepEqual(Object.values(ix.files).filter((f) => f.error).map((f) => f.file), []);
  });

  it('reads the attendance dashboard data sources (scenario: find its data loading)', () => {
    const reqs = ix.files['src/app/attendance/page.tsx'].requests;
    assert.ok(reqs.some((r) => r.via === 'EventSource' && r.endpointFile === 'src/app/api/attendance/stream/route.ts'));
    assert.ok(reqs.some((r) => r.via === 'useSWR' && r.endpointFile === 'src/app/api/attendance/zk/dashboard/route.ts'));
  });

  it('attendance settings: layout chain, tab state, endpoints', () => {
    const node = ix.routes['/attendance/settings'];
    assert.deepEqual(node.layouts, ['src/app/layout.tsx', 'src/app/attendance/layout.tsx']);
    const f = ix.files[node.files.page];
    assert.ok(f.state.some((s) => s.name === 'tab' && s.setter === 'setTab'));
    assert.ok(f.requests.some((r) => r.method === 'POST' && r.endpoint === '/api/attendance/settings'));
  });
});

describe('hand-written documentation stays attached to real code', () => {
  let ix;
  before(() => { ix = buildIndex(ROOT); });

  it('every guide target exists and has a body', async () => {
    const { GUIDE_INDEX } = await import('../../../app/control/docs/routes/guide-index.ts');
    const guides = fs.readFileSync(path.join(ROOT, 'src/app/control/docs/routes/guides.tsx'), 'utf8');
    for (const g of GUIDE_INDEX) {
      const exists = g.target.startsWith('/') ? !!ix.routes[g.target] : !!ix.files[g.target];
      assert.ok(exists, `guide target no longer exists: ${g.target}`);
      assert.ok(guides.includes(`'${g.target}':`), `no body in guides.tsx for ${g.target}`);
    }
  });

  it('every <Source path> and file link in the docs points at a file that exists', () => {
    const broken = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const rel = d + '/' + e.name;
        if (e.isDirectory()) walk(rel);
        else if (rel.endsWith('.tsx')) {
          const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          for (const m of text.matchAll(/<(?:Source|F|FileLink)\s+[^>]*?path="([^"]+)"/g)) {
            const p = m[1].replace(/:\d+(-\d+)?$/, '').replace(/\s.*$/, '');
            if (!/^[\w.@()[\]/-]+$/.test(p) || p.includes('<')) continue; // placeholders like <subsystem>
            if (!fs.existsSync(path.join(ROOT, p))) broken.push(`${rel}: ${m[1]}`);
          }
        }
      }
    };
    walk('src/app/control/docs');
    assert.deepEqual(broken, []);
  });
});

describe('search', () => {
  let lib;
  let entries;
  before(async () => {
    lib = await import('../index.ts');
    const ix = buildIndex(ROOT);
    for (const r of Object.values(ix.routes)) r.completeness = completeness(ix, r.url);
    entries = lib.__buildSearchForTest(ix);
  });
  const top = (q, cat, n = 5) => lib.search(entries, q, cat, n).results.map((r) => r.label);

  it('finds routes, hooks, files, guides and concepts, case-insensitively and by parts', () => {
    assert.ok(top('attendance settings', 'route').includes('/attendance/settings'));
    assert.ok(top('USELIVEFEED').includes('useLiveFeed'));
    assert.ok(top('dashboard-counts', 'file').some((l) => l.endsWith('dashboard-counts.ts')));
    assert.ok(top('custom tab', null, 10).includes('Add a custom tab'));
    assert.ok(top('protected layout', 'guide').some((l) => l.includes('(protected)')));
  });

  it('lists detected problems', () => {
    assert.ok(lib.search(entries, 'endpoint does not exist', 'problem', 100).total >= 1);
  });

  it('returns nothing, not everything, for a nonsense query', () => {
    assert.equal(lib.search(entries, 'zzqqxx-no-such-thing', null).total, 0);
  });
});
