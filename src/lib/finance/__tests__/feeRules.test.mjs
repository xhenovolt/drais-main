import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleMatchesLearner, evaluateBill, computeClearance, isChannelAllowed, applyAdjustments } from '../feeRules.ts';

const ctx = (over) => ({
  studentId: 1, classId: 1, classLevel: null, streamId: null, programId: null,
  gender: 'female', boarding: 'boarding', isNewEntrant: null, termId: 10, academicYearId: 5, ...over,
});

const line = (over) => ({ fee_item_id: 1, name: 'X', category: 'other', base_amount: 0, discount: 0, waived: 0, amount: 0, final: 0, mandatory: true, payment_channel: 'any', clearance: 'optional', rule_id: 1, reason: '', adjustments: [], ...over });

test('new-entrant rule: matches new, rejects continuing', () => {
  assert.equal(ruleMatchesLearner({ is_new_entrant: 1 }, ctx({ isNewEntrant: true })).match, true);
  assert.equal(ruleMatchesLearner({ is_new_entrant: 1 }, ctx({ isNewEntrant: false })).match, false);
  assert.equal(ruleMatchesLearner({ is_new_entrant: 0 }, ctx({ isNewEntrant: false })).match, true);
});

test('clearance: before_entry 100%, partial_allowed 50%, exception overrides', () => {
  const lines = [line({ name: 'Uniform', final: 167000, clearance: 'before_entry' }), line({ name: 'Tuition', final: 700000, clearance: 'partial_allowed' })];
  assert.equal(computeClearance(lines, 0).status, 'blocked');
  assert.equal(computeClearance(lines, 100000).status, 'partially_cleared');
  assert.equal(computeClearance(lines, 517000).status, 'cleared'); // 167000 + 350000
  assert.equal(computeClearance(lines, 0, { status: 'approved' }).status, 'exception_approved');
});

test('channel: school_code-only fee rejects cash, allows bank/school code', () => {
  assert.equal(isChannelAllowed('any', 'cash').ok, true);
  assert.equal(isChannelAllowed('school_code', 'cash').ok, false);
  assert.equal(isChannelAllowed('school_code', 'school_code').ok, true);
  assert.equal(isChannelAllowed('bank', 'bank_transfer').ok, true);
  assert.equal(isChannelAllowed('cash', 'cash').ok, true);
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

// ── applyAdjustments (Finance Consolidation Stage C) ──
// The single source of truth for waiver/discount/override math, shared by
// generateBills() AND repriceApprovedAdjustments() (re-pricing already-
// generated bills when an adjustment is approved/rejected/deleted) — so a
// bug here would silently affect both new and already-billed students.

test('applyAdjustments: no adjustments leaves the base untouched', () => {
  const r = applyAdjustments(100000, []);
  assert.deepEqual(r, { amount: 100000, discount: 0, waived: 0, final: 100000, notes: [] });
});

test('applyAdjustments: a full waiver zeroes the final amount but keeps amount as the base', () => {
  const r = applyAdjustments(100000, [{ adjustment_type: 'waiver', tag: 'bursary' }]);
  assert.equal(r.amount, 100000);
  assert.equal(r.waived, 100000);
  assert.equal(r.discount, 0);
  assert.equal(r.final, 0);
});

test('applyAdjustments: percent_discount computes off the base and caps at the base', () => {
  const r = applyAdjustments(100000, [{ adjustment_type: 'percent_discount', value: 30 }]);
  assert.equal(r.discount, 30000);
  assert.equal(r.final, 70000);
  const overCapped = applyAdjustments(100000, [{ adjustment_type: 'percent_discount', value: 150 }]);
  assert.equal(overCapped.discount, 100000); // capped — never a negative final
  assert.equal(overCapped.final, 0);
});

test('applyAdjustments: fixed_discount subtracts a flat amount, multiple discounts stack', () => {
  const r = applyAdjustments(100000, [
    { adjustment_type: 'fixed_discount', value: 10000 },
    { adjustment_type: 'fixed_discount', value: 5000 },
  ]);
  assert.equal(r.discount, 15000);
  assert.equal(r.final, 85000);
});

test('applyAdjustments: override replaces the amount outright, ignoring the base and any other adjustments', () => {
  const r = applyAdjustments(100000, [
    { adjustment_type: 'override', value: 42000 },
    { adjustment_type: 'fixed_discount', value: 10000 }, // must be ignored — override wins
  ]);
  assert.equal(r.amount, 42000);
  assert.equal(r.discount, 0);
  assert.equal(r.waived, 0);
  assert.equal(r.final, 42000);
});

test('applyAdjustments: waiver takes precedence over discounts when both are present', () => {
  const r = applyAdjustments(100000, [
    { adjustment_type: 'waiver' },
    { adjustment_type: 'percent_discount', value: 50 },
  ]);
  assert.equal(r.waived, 100000);
  assert.equal(r.final, 0);
});
