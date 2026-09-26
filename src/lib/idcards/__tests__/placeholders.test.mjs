import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tokenForLabel, splitLabelValue, replaceSchoolName, classifyPhrase, isSchoolNameLike, isSchoolNameTail,
  looksLikeDate, looksLikeClass, looksLikeRegNo, looksLikePersonName, tokenForValueShape, isAllCaps,
} from '@/lib/idcards/placeholders.ts';
import { importPublisherShapes } from '@/lib/idcards/publisher-import.ts';
import { sanitizeSpec, shrinkFactor, specTokens } from '@/lib/idcards/spec.ts';
import { ID_CARD_TEMPLATES } from '@/lib/idcards/templates.ts';

const dump = JSON.parse(readFileSync(new URL('./fixtures/id-temp.shapes.json', import.meta.url), 'utf8'));

describe('placeholder intelligence: labels', () => {
  it('maps common ID-card labels to tokens', () => {
    assert.equal(tokenForLabel('NAME:', 'front').token, 'full_name');
    assert.equal(tokenForLabel('Learner Name', 'front').token, 'full_name');
    assert.equal(tokenForLabel('CLASS:', 'front').token, 'class');
    assert.equal(tokenForLabel('ID NO:', 'front').token, 'admission_no');
    assert.equal(tokenForLabel('Reg. No:', 'front').token, 'admission_no');
    assert.equal(tokenForLabel('EXPIRY DATE:', 'front').token, 'valid_until');
    assert.equal(tokenForLabel('Valid until', 'front').token, 'valid_until');
    assert.equal(tokenForLabel('DATE:', 'front').token, 'issue_date');
    assert.equal(tokenForLabel('D.O.B', 'front').token, 'dob');
  });

  it('never treats another person\'s lines (head teacher, holder, parent) as the learner\'s data', () => {
    assert.equal(tokenForLabel('HEAD TEACHER’S NAME:', 'front'), null);
    assert.equal(tokenForLabel('HEAD TEACHER’S SIGN:', 'front'), null);
    assert.equal(tokenForLabel('HOLDER’S SIGN:', 'front'), null);
    assert.equal(tokenForLabel('Parent name:', 'front'), null);
  });

  it('"Tel" is the school\'s phone on the back and the guardian\'s on the front', () => {
    assert.equal(tokenForLabel('Tel', 'back').token, 'school_phone');
    assert.equal(tokenForLabel('Tel', 'front').token, 'guardian_phone');
  });

  it('splits "LABEL: value" written as one run, but not ordinary sentences', () => {
    assert.deepEqual(splitLabelValue('NAME: OKELLO DAVID'), { label: 'NAME', value: 'OKELLO DAVID' });
    assert.equal(splitLabelValue('This identity card is a property of a school'), null);
  });
});

describe('placeholder intelligence: school names', () => {
  it('recognises a bare school name, over any number of words', () => {
    assert.equal(replaceSchoolName('JINJA PROGRESSIVE SECONDARY SCHOOL').template, '{school}');
    assert.equal(replaceSchoolName("St. Mary's Boys Secondary School Kisubi").template, '{school}');
    assert.equal(replaceSchoolName('University of Nairobi Academy').template, '{school}');
  });

  it('replaces only the school name inside a sentence', () => {
    const r = replaceSchoolName('This identity card is a property of Jinja progressive secondary school');
    assert.equal(r.template, 'This identity card is a property of {school}');
    assert.equal(r.original, 'Jinja progressive secondary school');
  });

  it('always replaces the importing school\'s own name, whatever the wording around it', () => {
    const r = replaceSchoolName('Welcome to Kampala Hill Prep, a great place', 'Kampala Hill Prep');
    assert.equal(r.template, 'Welcome to {school}, a great place');
    assert.equal(r.confidence, 'high');
  });

  it('does not mistake headings and instructions for a school name', () => {
    assert.equal(replaceSchoolName('STUDENT IDENTITY CARD'), null);
    assert.equal(replaceSchoolName('If found please return to the above address'), null);
    assert.equal(replaceSchoolName('HEAD TEACHER’S SIGN:'), null);
    assert.equal(isSchoolNameLike('SCHOOL'), false);
    assert.equal(isSchoolNameTail('SCHOOL'), true);
    assert.equal(isSchoolNameTail('PRIMARY SCHOOL'), true);
  });
});

describe('placeholder intelligence: value shapes', () => {
  it('recognises dates, classes, registration numbers and person names', () => {
    assert.ok(looksLikeDate('11TH/04/2024'));
    assert.ok(looksLikeDate('31 Dec 2026'));
    assert.ok(looksLikeClass('S.6'));
    assert.ok(looksLikeClass('Senior 4'));
    assert.ok(looksLikeClass('P7'));
    assert.ok(looksLikeRegNo('JPA/A/822'));
    assert.ok(looksLikeRegNo('ADM/2026/0042'));
    assert.ok(looksLikePersonName('OCERO MOSES'));
    assert.ok(looksLikePersonName('Namatovu Sarah'));
  });

  it('does not take wording for a person\'s name or a class', () => {
    assert.equal(looksLikePersonName('STUDENT IDENTITY CARD'), false);
    assert.equal(looksLikePersonName('HEAD TEACHER'), false);
    assert.equal(looksLikePersonName('Jinja Progressive Secondary School'), false);
    assert.equal(looksLikeClass('Class teacher'), false);
  });

  it('a long sentence that merely contains a date is not a date placeholder', () => {
    assert.equal(tokenForValueShape('Valid until 31/12/2025 unless withdrawn earlier by the school', 'front'), null);
    assert.equal(tokenForValueShape('31/12/2025', 'front').token, 'issue_date');
  });

  it('detects a shouted sample (ALL CAPS) so the value keeps the template\'s style', () => {
    assert.equal(isAllCaps('OCERO MOSES'), true);
    assert.equal(isAllCaps('Ocero Moses'), false);
    assert.equal(isAllCaps('S.6'), false);
  });
});

describe('placeholder intelligence: address and phone', () => {
  it('turns a P.O. Box line and a Tel line into school placeholders', () => {
    const a = classifyPhrase('P . o . Box 1645, Wanje road, Jinja City', { side: 'back' });
    assert.equal(a.template, '{school_address}');
    const t = classifyPhrase('Tel: 0702182687 / 0772338892', { side: 'back' });
    assert.equal(t.template, 'Tel: {school_phone}');
    assert.equal(t.findings[0].original, '0702182687 / 0772338892');
  });
});

describe('Publisher template import (real structure of the school\'s ID TEMP.pub)', () => {
  const r = importPublisherShapes(dump);
  const texts = (side) => r.spec[side].elements.filter((e) => e.kind === 'text').map((e) => e.text);

  it('finds a two-sided card at the true printed size', () => {
    assert.ok(r.spec.back, 'back side found');
    assert.equal(r.spec.size.widthMm, 88.9);
    assert.equal(r.spec.size.heightMm, 55.9);
    assert.deepEqual(r.warnings, []);
  });

  it('puts the photo and the school logo in their own slots', () => {
    const imgs = r.spec.front.elements.filter((e) => e.kind === 'image');
    assert.deepEqual(imgs.map((i) => i.source).sort(), ['logo', 'photo']);
    const photo = imgs.find((i) => i.source === 'photo');
    assert.ok(photo.h > photo.w, 'portrait photo');
  });

  it('treats the sample school name, learner, class, ID and dates as placeholders — not final text', () => {
    const front = texts('front').join('\n');
    for (const sample of ['JINJA', 'PROGRESSIVE', 'OKELLO', 'DAVID', 'JPA/A', 'S.6', '2024', '2025']) {
      assert.ok(!front.includes(sample), `front still contains sample “${sample}”`);
    }
    for (const token of ['{school}', '{full_name}', '{class}', '{admission_no}', '{issue_date}', '{valid_until}']) {
      assert.ok(front.includes(token), `front has ${token}`);
    }
  });

  it('keeps fixed wording and labels, and merges the two-line school name into one placeholder', () => {
    const front = texts('front');
    assert.ok(front.includes('STUDENT IDENTITY CARD'));
    assert.ok(front.includes('NAME:') && front.includes('CLASS:') && front.includes('ID NO:'));
    assert.ok(front.includes('HEAD TEACHER’S SIGN:'));
    assert.equal(front.filter((t) => t === '{school}').length, 1, 'SECONDARY + SCHOOL became one {school}');
  });

  it('converts the back\'s address, phone and ownership sentence, and keeps the "if found" wording', () => {
    const back = texts('back').join('\n');
    assert.match(back, /\{school_address\}/);
    assert.match(back, /Tel: \{school_phone\}/);
    assert.match(back, /property of \{school\}/);
    assert.match(back, /If found please return to the above address/);
    assert.doesNotMatch(back, /Jinja|Wanje|07\d{8}/i);
  });

  it('ignores a copy of the back text hidden underneath the card', () => {
    assert.equal(texts('back').filter((t) => /If found/.test(t)).length, 1);
  });

  it('names what it understood, side by side, for the school to check', () => {
    const kinds = (side) => r.findings.filter((f) => f.side === side).map((f) => f.kind).sort();
    assert.deepEqual(kinds('front'), ['admission_no', 'class', 'issue_date', 'learner_name', 'school_name', 'valid_until']);
    assert.deepEqual(kinds('back'), ['school_address', 'school_name', 'school_name', 'school_phone']);
    assert.ok(r.findings.every((f) => f.confidence === 'high' && f.reason));
  });

  it('keeps a value out of the next field on its line', () => {
    const cls = r.spec.front.elements.find((e) => e.kind === 'text' && e.text === '{class}');
    const idLabel = r.spec.front.elements.find((e) => e.kind === 'text' && e.text === 'ID NO:');
    assert.ok(cls.x + cls.w <= idLabel.x, 'class value ends before the ID NO label');
  });

  it('is deterministic and survives the server sanitiser unchanged', () => {
    assert.deepEqual(importPublisherShapes(dump).spec, r.spec);
    assert.deepEqual(JSON.parse(JSON.stringify(sanitizeSpec(r.spec))), JSON.parse(JSON.stringify(r.spec)));
  });

  it('uses only known tokens', () => {
    const known = new Set(['school', 'full_name', 'class', 'admission_no', 'issue_date', 'valid_until', 'school_address', 'school_phone']);
    for (const t of specTokens(r.spec)) assert.ok(known.has(t), `unknown token ${t}`);
  });

  it('recognises the importing school\'s real name even when it looks nothing like a school name', () => {
    const custom = JSON.parse(JSON.stringify(dump));
    for (const s of custom.pages[0].shapes) for (const l of s.lines ?? []) {
      for (const g of l.segments) if (g.text === 'JINJA PROGRESSIVE SECONDARY') g.text = 'KISUBI HILL';
    }
    const res = importPublisherShapes(custom, { knownSchoolName: 'Kisubi Hill' });
    assert.ok(res.findings.some((f) => f.kind === 'school_name' && f.original.startsWith('KISUBI HILL') && /own name/.test(f.reason)));
  });

  it('refuses a file with no card-sized outline instead of guessing', () => {
    assert.throws(() => importPublisherShapes({ page: { widthPt: 612, heightPt: 792 }, pages: [{ index: 1, shapes: [] }] }), /No card outline/);
  });
});

describe('built-in templates', () => {
  it('the checked-in template is exactly what the importer produces (regenerate with scripts/idcards/build-template.mts)', () => {
    const t = ID_CARD_TEMPLATES.find((x) => x.id === 'publisher-student-id');
    assert.deepEqual(t.spec, JSON.parse(JSON.stringify(importPublisherShapes(dump).spec)));
  });

  it('carries no other school\'s name, learners or contact details', () => {
    const json = JSON.stringify(ID_CARD_TEMPLATES.map((t) => t.spec));
    assert.doesNotMatch(json, /jinja|wanje|okello|ocero|0700000001|0702182687/i);
  });
});

describe('shrink to fit', () => {
  it('leaves short text alone and shrinks long text, never below 55%', () => {
    assert.equal(shrinkFactor('S.6', 8, 20), 1);
    const f = shrinkFactor('NAMATOVU SARAH BIRUNGI KYOMUHENDO', 8, 40, { bold: true, upper: true });
    assert.ok(f < 1 && f >= 0.55);
    assert.equal(shrinkFactor('x'.repeat(200), 8, 10), 0.55);
  });
});
