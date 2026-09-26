// Render smoke tests: the shared face/sheet components produce the expected
// markup for two-sided designs, and single-sided designs render unchanged.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IdCardFace } from '@/components/idcards/IdCardFace.tsx';
import { IdCardSheets } from '@/components/idcards/IdCardSheets.tsx';
import { starterSpec } from '@/lib/idcards/spec.ts';

const rec = (n, a) => ({ full_name: n, admission_no: a, class: 'S1', school: 'Test School', valid_until: 'Dec 2026', photo_url: '' });
const A4 = { widthMm: 210, heightMm: 297, marginMm: 10, gapMm: 4 };
const h = React.createElement;

describe('IdCardFace', () => {
  it('fills tokens per learner and never leaks braces', () => {
    const html = renderToStaticMarkup(h(IdCardFace, { spec: starterSpec(true), face: 'front', record: rec('Ann Lee', 'R9') }));
    assert.match(html, /Ann Lee/);
    assert.match(html, /Reg No: R9/);
    assert.doesNotMatch(html, /\{[a-z_]+\}/);
    assert.match(html, /width:85\.6mm/);
    assert.match(html, /height:54mm/);
  });

  it('back face renders back elements (QR + validity), front does not', () => {
    const spec = starterSpec(true);
    const back = renderToStaticMarkup(h(IdCardFace, { spec, face: 'back', record: rec('Ann Lee', 'R9') }));
    const front = renderToStaticMarkup(h(IdCardFace, { spec, face: 'front', record: rec('Ann Lee', 'R9') }));
    assert.match(back, /Valid until: Dec 2026/);
    assert.match(back, /<svg/);
    assert.doesNotMatch(front, /Valid until/);
  });

  it('a single-sided spec asked for its back falls back to the front (existing designs keep working)', () => {
    const html = renderToStaticMarkup(h(IdCardFace, { spec: starterSpec(false), face: 'back', record: rec('Ann Lee', 'R9') }));
    assert.match(html, /Ann Lee/);
  });

  it('missing photo shows initials placeholder, not a broken image', () => {
    const html = renderToStaticMarkup(h(IdCardFace, { spec: starterSpec(false), face: 'front', record: rec('Ann Lee', 'R9') }));
    assert.match(html, />AL</);
    assert.doesNotMatch(html, /<img/);
  });

  it('imported artwork is a background layer beneath the dynamic elements', () => {
    const spec = starterSpec(false);
    spec.front.backgroundImage = { url: 'https://res.cloudinary.com/x/art.png', fit: 'stretch' };
    const html = renderToStaticMarkup(h(IdCardFace, { spec, face: 'front', record: rec('Ann Lee', 'R9') }));
    assert.ok(html.indexOf('art.png') < html.indexOf('Ann Lee'), 'artwork precedes text in paint order');
    assert.match(html, /Ann Lee/);
  });
});

describe('IdCardSheets', () => {
  const records = Array.from({ length: 5 }, (_, i) => rec(`Learner ${i}`, `R${i}`));

  it('duplex print variant emits alternating front/back pages with each learner on both', () => {
    const html = renderToStaticMarkup(h(IdCardSheets, { spec: starterSpec(true), records, sheet: A4, mode: 'duplex_long', variant: 'print' }));
    assert.equal((html.match(/data-page-kind="front"/g) ?? []).length, 1);
    assert.equal((html.match(/data-page-kind="back"/g) ?? []).length, 1);
    for (let i = 0; i < 5; i++) assert.equal((html.match(new RegExp(`Learner ${i}<`, 'g')) ?? []).length, 1, 'name printed once (front only)');
    assert.equal((html.match(/Valid until: Dec 2026/g) ?? []).length, 5, 'five backs');
    assert.match(html, /@page \{ size: 210mm 297mm/);
  });

  it('side_by_side puts front before back in each unit on a single page', () => {
    const html = renderToStaticMarkup(h(IdCardSheets, { spec: starterSpec(true), records: records.slice(0, 1), sheet: A4, mode: 'side_by_side', variant: 'print' }));
    assert.equal((html.match(/class="idc-page"/g) ?? []).length, 1);
    assert.ok(html.indexOf('Learner 0<') < html.indexOf('Valid until'), 'front (left) precedes back (right)');
  });

  it('single-sided design ignores duplex request', () => {
    const html = renderToStaticMarkup(h(IdCardSheets, { spec: starterSpec(false), records, sheet: A4, mode: 'duplex_long', variant: 'print' }));
    assert.doesNotMatch(html, /data-page-kind="back"/);
  });

  it('preview variant caps rendered cards but reports the true total', () => {
    const many = Array.from({ length: 40 }, (_, i) => rec(`L${i}`, `R${i}`));
    const html = renderToStaticMarkup(h(IdCardSheets, { spec: starterSpec(false), records: many, sheet: A4, mode: 'front_only', maxCards: 8 }));
    assert.match(html, /Showing the first 8 of 40 cards\. All 40 will print\./);
    assert.doesNotMatch(html, /idc-print-root/);
  });

  it('reports a clear message when the card cannot fit the sheet', () => {
    const spec = starterSpec(false); spec.size.widthMm = 200;
    const html = renderToStaticMarkup(h(IdCardSheets, { spec, records, sheet: { ...A4, marginMm: 20 }, mode: 'front_only', variant: 'print' }));
    assert.match(html, /does not fit/);
  });
});
