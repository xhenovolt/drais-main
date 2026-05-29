// node:test suite for the mutation engine.
// Run with:  npx tsx --test src/lib/drce/__tests__/mutations.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyMutation } from '../mutations.ts';

// Minimal doc factory — only fields the mutations touch.
function makeDoc(extra = {}) {
  return {
    $schema: 'drce/v1',
    meta: {
      id: '0', name: 'test', school_id: 1, version: 1,
      created_at: '', updated_at: '', report_type: 'end_of_term',
      is_default: false, template_key: null, template_category: 'custom',
    },
    theme: {
      primaryColor: '#000', secondaryColor: '#000', accentColor: '#000',
      fontFamily: 'sans-serif', baseFontSize: 12, pagePadding: '0',
      pageBackground: '#fff',
      pageBorder: { enabled: false, width: 0, style: 'solid', color: '#000', radius: 0 },
      pageSize: 'a4', orientation: 'portrait',
    },
    watermark: { enabled: false, type: 'text', content: '', imageUrl: null,
      opacity: 0, position: 'center', rotation: 0, fontSize: 0, color: '#000', scope: 'page' },
    sections: [],
    shapes: [],
    ...extra,
  };
}

function bannerSection(id, content = 'Hi') {
  return { id, type: 'banner', visible: true, order: 0,
    content: { text: content }, style: {} };
}

describe('mutations — ADD_SECTION (top-level)', () => {
  it('appends with afterId=null', () => {
    const doc = makeDoc();
    const next = applyMutation(doc, {
      type: 'ADD_SECTION', section: bannerSection('a'), afterId: null,
    });
    assert.equal(next.sections.length, 1);
    assert.equal(next.sections[0].id, 'a');
  });
  it('inserts after named id', () => {
    let doc = makeDoc();
    doc = applyMutation(doc, { type: 'ADD_SECTION', section: bannerSection('a'), afterId: null });
    doc = applyMutation(doc, { type: 'ADD_SECTION', section: bannerSection('b'), afterId: null });
    doc = applyMutation(doc, { type: 'ADD_SECTION', section: bannerSection('c'), afterId: 'a' });
    assert.deepEqual(doc.sections.map(s => s.id), ['a', 'c', 'b']);
  });
});

describe('mutations — TOGGLE_SECTION across nesting', () => {
  it('toggles a top-level section', () => {
    const doc = makeDoc({ sections: [bannerSection('a')] });
    const next = applyMutation(doc, { type: 'TOGGLE_SECTION', sectionId: 'a' });
    assert.equal(next.sections[0].visible, false);
  });
  it('toggles a nested-in-container section', () => {
    const doc = makeDoc({
      sections: [{
        id: 'c1', type: 'container', visible: true, order: 0,
        style: { layout: 'stack' },
        children: [bannerSection('a')],
      }],
    });
    const next = applyMutation(doc, { type: 'TOGGLE_SECTION', sectionId: 'a' });
    assert.equal(next.sections[0].children[0].visible, false);
  });
});

describe('mutations — DELETE_SECTION', () => {
  it('removes from top-level and renumbers order', () => {
    const doc = makeDoc({ sections: [
      bannerSection('a'), bannerSection('b'), bannerSection('c'),
    ].map((s, i) => ({ ...s, order: i }))});
    const next = applyMutation(doc, { type: 'DELETE_SECTION', sectionId: 'b' });
    assert.deepEqual(next.sections.map(s => s.id),    ['a', 'c']);
    assert.deepEqual(next.sections.map(s => s.order), [0, 1]);
  });
  it('removes from inside container', () => {
    const doc = makeDoc({
      sections: [{
        id: 'c1', type: 'container', visible: true, order: 0, style: {},
        children: [bannerSection('a'), bannerSection('b')],
      }],
    });
    const next = applyMutation(doc, { type: 'DELETE_SECTION', sectionId: 'a' });
    assert.equal(next.sections[0].children.length, 1);
    assert.equal(next.sections[0].children[0].id, 'b');
  });
});

describe('mutations — multi-page', () => {
  it('ENABLE_MULTI_PAGE wraps top-level sections into pages[0]', () => {
    const doc = makeDoc({ sections: [bannerSection('a')] });
    const next = applyMutation(doc, { type: 'ENABLE_MULTI_PAGE' });
    assert.equal(next.pages?.length, 1);
    assert.equal(next.pages[0].sections[0].id, 'a');
    assert.equal(next.sections.length, 0);
  });
  it('ADD_PAGE appends', () => {
    let doc = applyMutation(makeDoc(), { type: 'ENABLE_MULTI_PAGE' });
    doc = applyMutation(doc, { type: 'ADD_PAGE', name: 'Page 2' });
    assert.equal(doc.pages.length, 2);
    assert.equal(doc.pages[1].name, 'Page 2');
  });
  it('ADD_SECTION with pageId targets that page', () => {
    let doc = applyMutation(makeDoc(), { type: 'ENABLE_MULTI_PAGE' });
    doc = applyMutation(doc, { type: 'ADD_PAGE', name: 'P2' });
    const pageId = doc.pages[1].id;
    doc = applyMutation(doc, { type: 'ADD_SECTION', section: bannerSection('b'), afterId: null, pageId });
    assert.equal(doc.pages[0].sections.length, 0);
    assert.equal(doc.pages[1].sections[0].id, 'b');
  });
  it('SET_SECTION_STYLE finds sections wherever they live (top + pages)', () => {
    let doc = applyMutation(makeDoc(), { type: 'ENABLE_MULTI_PAGE' });
    doc = applyMutation(doc, { type: 'ADD_PAGE', name: 'P2' });
    const pageId = doc.pages[1].id;
    doc = applyMutation(doc, { type: 'ADD_SECTION', section: bannerSection('b'), afterId: null, pageId });
    const next = applyMutation(doc, { type: 'SET_SECTION_STYLE', sectionId: 'b', path: 'padding', value: '8px' });
    assert.equal(next.pages[1].sections[0].style.padding, '8px');
  });
});

describe('mutations — REORDER_SECTIONS', () => {
  it('reorders top-level by id list', () => {
    const doc = makeDoc({ sections: [
      bannerSection('a'), bannerSection('b'), bannerSection('c'),
    ].map((s, i) => ({ ...s, order: i }))});
    const next = applyMutation(doc, { type: 'REORDER_SECTIONS', ids: ['c', 'a', 'b'] });
    assert.deepEqual(next.sections.map(s => s.id),    ['c', 'a', 'b']);
    assert.deepEqual(next.sections.map(s => s.order), [0, 1, 2]);
  });
});

describe('mutations — SET_THEME', () => {
  it('sets a nested path', () => {
    const next = applyMutation(makeDoc(), { type: 'SET_THEME', path: 'pageSize', value: 'a5' });
    assert.equal(next.theme.pageSize, 'a5');
  });
});
