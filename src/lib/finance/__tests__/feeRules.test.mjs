import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleMatchesLearner, evaluateBill } from '../feeRules.ts';

const ctx = (over) => ({
  studentId: 1, classId: 1, classLevel: null, streamId: null, programId: null,
  gender: 'female', boarding: 'boarding', termId: 10, academicYearId: 5, ...over,
});

test('class-set rule: applies to a class in the set', () => {
  const r = ruleMatchesLearner({ class_ids: [1, 2, 3] }, ctx({ classId: 1 }));
  assert.equal(r.match, true);
});

test('class-set rule: P4 does NOT get P1-P3 fee', () => {
  const r = ruleMatchesLearner({ class_ids: [1, 2, 3] }, ctx({ classId: 4 }));
  assert.equal(r.match, false);
});

test('gender rule: girls-only applies to female, not male', () => {
  assert.equal(ruleMatchesLearner({ gender: 'female' }, ctx({ gender: 'female' })).match, true);
  assert.equal(ruleMatchesLearner({ gender: 'female' }, ctx({ gender: 'male' })).match, false);
});

test('tour fee P7 and beyond via explicit class set', () => {
  assert.equal(ruleMatchesLearner({ class_ids: [7, 8, 9] }, ctx({ classId: 7 })).match, true);
  assert.equal(ruleMatchesLearner({ class_ids: [7, 8, 9] }, ctx({ classId: 6 })).match, false);
});

test('level range when class_level populated', () => {
  assert.equal(ruleMatchesLearner({ level_min: 7 }, ctx({ classLevel: 7 })).match, true);
  assert.equal(ruleMatchesLearner({ level_min: 7 }, ctx({ classLevel: 6 })).match, false);
});

test('boarding rule applies only to boarders', () => {
  assert.equal(ruleMatchesLearner({ boarding: 'boarding' }, ctx({ boarding: 'boarding' })).match, true);
  assert.equal(ruleMatchesLearner({ boarding: 'boarding' }, ctx({ boarding: 'day' })).match, false);
});

test('compound rule (girls AND P1-P3) ANDs conditions', () => {
  const rule = { class_ids: [1, 2, 3], gender: 'female' };
  assert.equal(ruleMatchesLearner(rule, ctx({ classId: 2, gender: 'female' })).match, true);
  assert.equal(ruleMatchesLearner(rule, ctx({ classId: 2, gender: 'male' })).match, false);
  assert.equal(ruleMatchesLearner(rule, ctx({ classId: 9, gender: 'female' })).match, false);
});

test('empty rule applies to all learners', () => {
  assert.equal(ruleMatchesLearner({}, ctx()).match, true);
});

test('term-scoped rule only applies in its term', () => {
  assert.equal(ruleMatchesLearner({ term_id: 10 }, ctx({ termId: 10 })).match, true);
  assert.equal(ruleMatchesLearner({ term_id: 11 }, ctx({ termId: 10 })).match, false);
});

test('evaluateBill: amount override beats item default; only applicable items billed', () => {
  const items = [
    { id: 1, name: 'Tuition', category: 'tuition', default_amount: 200000 },
    { id: 2, name: 'Uniform (girls)', category: 'uniform', default_amount: 450000 },
    { id: 3, name: 'Boarding', category: 'boarding', default_amount: 600000 },
  ];
  const rulesByItem = new Map([
    [1, [{ id: 11, fee_item_id: 1, class_ids: [1, 2, 3], amount: 230000, priority: 100, is_active: 1 }]],
    [2, [{ id: 12, fee_item_id: 2, gender: 'female', priority: 100, is_active: 1 }]],   // no amount → default
    [3, [{ id: 13, fee_item_id: 3, boarding: 'day', priority: 100, is_active: 1 }]],    // day-only → boarder excluded
  ]);
  const { lines, total } = evaluateBill(items, rulesByItem, ctx({ classId: 1, gender: 'female', boarding: 'boarding' }));
  const names = lines.map((l) => l.name).sort();
  assert.deepEqual(names, ['Tuition', 'Uniform (girls)']);     // boarding(day-only) excluded
  assert.equal(lines.find((l) => l.name === 'Tuition').amount, 230000); // override applied
  assert.equal(lines.find((l) => l.name === 'Uniform (girls)').amount, 450000); // default
  assert.equal(total, 680000);
});

test('evaluateBill priority: lower number wins, tie prefers explicit amount', () => {
  const items = [{ id: 1, name: 'Tuition', category: 'tuition', default_amount: 200000 }];
  const rulesByItem = new Map([[1, [
    { id: 1, fee_item_id: 1, priority: 100, amount: null, is_active: 1 },
    { id: 2, fee_item_id: 1, priority: 50, amount: 180000, is_active: 1 },
  ]]]);
  const { lines } = evaluateBill(items, rulesByItem, ctx());
  assert.equal(lines[0].amount, 180000);
  assert.equal(lines[0].rule_id, 2);
});
