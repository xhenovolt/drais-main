// Hand-written route documents must stay attached to the real code: every route and file
// they name exists, every note points at a real import/declaration/member, and every file
// has a reviewed hash. Status (IN PROGRESS / DOCUMENTED / NEEDS REVIEW …) is reported, not
// failed on — the registry page shows it; a doc going stale must be visible, not block a build.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../../../../scripts/devdocs/analyze.mjs';
import { ROUTE_DOCS } from '../../../app/control/docs/routes/docs/index.ts';
import { fileCoverage, routeDocStatus, REQUIRED_SECTIONS } from '../route-doc.ts';

describe('route documents', () => {
  let ix;
  before(() => {
    ix = buildIndex(process.cwd());
    const counts = {};
    for (const d of ROUTE_DOCS) { const s = routeDocStatus(d, ix.files).status; counts[s] = (counts[s] || 0) + 1; }
    console.log('[route-docs]', ROUTE_DOCS.length, 'documents', JSON.stringify(counts));
  });

  it('each documents a real page route, once', () => {
    const seen = new Set();
    for (const d of ROUTE_DOCS) {
      assert.ok(ix.routes[d.route]?.kind === 'page', `no such page route: ${d.route}`);
      assert.ok(!seen.has(d.route), `documented twice: ${d.route}`);
      seen.add(d.route);
    }
  });

  it('names only files that exist, each with a reviewed hash', () => {
    for (const d of ROUTE_DOCS) for (const f of d.files) {
      assert.ok(ix.files[f.path], `${d.route}: file no longer exists: ${f.path}`);
      assert.match(d.reviewed[f.path] || '', /^[0-9a-f]{12}$/, `${d.route}: no reviewed hash for ${f.path}`);
    }
  });

  it('has no notes for code that no longer exists', () => {
    for (const d of ROUTE_DOCS) for (const [file, notes] of Object.entries(d.notes)) {
      assert.ok(d.files.some((f) => f.path === file), `${d.route}: notes for ${file}, which is not in its file map`);
      const { unknown } = fileCoverage(ix.files[file], notes);
      assert.deepEqual(unknown, [], `${d.route}: stale notes in ${file}`);
    }
  });

  it('every template section is present', () => {
    for (const d of ROUTE_DOCS) for (const s of REQUIRED_SECTIONS) assert.ok(d[s] != null, `${d.route}: section ${s} missing`);
  });
});
