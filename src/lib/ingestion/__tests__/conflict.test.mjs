// node:test suite — conflict resolver (Phase 1.5).
// Run with: npx tsx --test src/lib/ingestion/__tests__/conflict.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFieldConflicts, toConflictDecision } from '../conflict/index.ts';

describe('resolveFieldConflicts — prefer-existing default', () => {
  it('keeps existing values when policy is prefer-existing', () => {
    const r = resolveFieldConflicts({
      existing: { name: 'Ali', age: 14 },
      incoming: { name: 'Aly', age: 15 },
      policy: { perField: {}, default: 'prefer-existing' },
    });
    assert.equal(r.anyChange, false);
    assert.equal(r.blocksAnyField, false);
    assert.equal(r.decisions.find(d => d.field === 'name').resolved, 'Ali');
  });

  it('per-field override beats the default', () => {
    const r = resolveFieldConflicts({
      existing: { name: 'Ali',   phone: '000' },
      incoming: { name: 'Aly',   phone: '111' },
      policy: { perField: { phone: 'prefer-new' }, default: 'prefer-existing' },
    });
    assert.equal(r.decisions.find(d => d.field === 'name').resolved,  'Ali');
    assert.equal(r.decisions.find(d => d.field === 'phone').resolved, '111');
    assert.equal(r.anyChange, true);
  });
});

describe('resolveFieldConflicts — fill empty', () => {
  it('fills an empty existing regardless of policy', () => {
    const r = resolveFieldConflicts({
      existing: { phone: null, email: '' },
      incoming: { phone: '555', email: 'x@y' },
      policy: { perField: {}, default: 'prefer-existing' }, // even prefer-existing
    });
    assert.equal(r.decisions.find(d => d.field === 'phone').resolved, '555');
    assert.equal(r.decisions.find(d => d.field === 'email').resolved, 'x@y');
    assert.equal(r.anyChange, true);
  });
});

describe('resolveFieldConflicts — numeric policies', () => {
  it('prefer-higher takes the max', () => {
    const r = resolveFieldConflicts({
      existing: { score: 72 },
      incoming: { score: 88 },
      policy: { perField: { score: 'prefer-higher' }, default: 'prefer-existing' },
    });
    assert.equal(r.decisions[0].resolved, 88);
    assert.equal(r.decisions[0].changed,  true);
  });

  it('prefer-lower takes the min', () => {
    const r = resolveFieldConflicts({
      existing: { absences: 5 },
      incoming: { absences: 8 },
      policy: { perField: { absences: 'prefer-lower' }, default: 'prefer-existing' },
    });
    assert.equal(r.decisions[0].resolved, 5);
    assert.equal(r.decisions[0].changed,  false);
  });

  it('merge-average rounds to 2 decimals', () => {
    const r = resolveFieldConflicts({
      existing: { score: 80 },
      incoming: { score: 70 },
      policy: { perField: { score: 'merge-average' }, default: 'prefer-existing' },
    });
    assert.equal(r.decisions[0].resolved, 75);
  });

  it('non-numeric inputs fall through safely for numeric policies', () => {
    const r = resolveFieldConflicts({
      existing: { score: 'A' },
      incoming: { score: 'B' },
      policy: { perField: { score: 'prefer-higher' }, default: 'prefer-existing' },
    });
    // Falls back to existing without crashing.
    assert.equal(r.decisions[0].resolved, 'A');
    assert.equal(r.decisions[0].changed, false);
  });
});

describe('resolveFieldConflicts — fail-loud blocks', () => {
  it('fail-loud on a differing field sets blocksAnyField', () => {
    const r = resolveFieldConflicts({
      existing: { admission_no: 'A001' },
      incoming: { admission_no: 'A002' },
      policy: { perField: { admission_no: 'fail-loud' }, default: 'prefer-existing' },
    });
    assert.equal(r.blocksAnyField, true);
    assert.equal(r.decisions[0].blocks, true);
  });

  it('fail-loud on identical values is NOT a block (no-op)', () => {
    const r = resolveFieldConflicts({
      existing: { admission_no: 'A001' },
      incoming: { admission_no: 'A001' },
      policy: { perField: { admission_no: 'fail-loud' }, default: 'prefer-existing' },
    });
    assert.equal(r.blocksAnyField, false);
    assert.equal(r.anyChange, false);
  });
});

describe('toConflictDecision — composes the right ConflictDecision', () => {
  it('blocks → fail action', () => {
    const r = resolveFieldConflicts({
      existing: { score: 80 },
      incoming: { score: 70 },
      policy: { perField: { score: 'fail-loud' }, default: 'prefer-existing' },
    });
    const d = toConflictDecision(r, 11);
    assert.equal(d.action, 'fail');
    assert.match(d.error, /fail-loud blocked/);
  });

  it('no changes → skip action', () => {
    const r = resolveFieldConflicts({
      existing: { name: 'Ali' },
      incoming: { name: 'Ali' },
      policy: { perField: {}, default: 'prefer-new' },
    });
    const d = toConflictDecision(r, 11);
    assert.equal(d.action, 'skip');
  });

  it('changes + no merge rule → update action with changedFields', () => {
    const r = resolveFieldConflicts({
      existing: { name: 'Ali', phone: '000' },
      incoming: { name: 'Ali', phone: '111' },
      policy: { perField: {}, default: 'prefer-new' },
    });
    const d = toConflictDecision(r, 11);
    assert.equal(d.action, 'update');
    assert.deepEqual(d.changedFields, ['phone']);
    assert.equal(d.targetId, 11);
  });

  it('changes + merge rule description → merge action', () => {
    const r = resolveFieldConflicts({
      existing: { score: 80 },
      incoming: { score: 70 },
      policy: { perField: { score: 'merge-average' }, default: 'prefer-existing' },
    });
    const d = toConflictDecision(r, 11, 'avg of source + dest');
    assert.equal(d.action, 'merge');
    assert.equal(d.mergeRule, 'avg of source + dest');
  });
});

describe('Phase 0 regression: silent corruption is impossible', () => {
  it('overwrite-by-default policy still records every change in the decision list', () => {
    // Phase 0 found bulk-submit silently overwrote — here we prove the
    // new resolver always returns per-field decisions even under
    // prefer-new, so the audit trail is intact.
    const r = resolveFieldConflicts({
      existing: { score: 80, grade: 'B', remarks: 'good' },
      incoming: { score: 70, grade: 'C', remarks: 'fair' },
      policy: { perField: {}, default: 'prefer-new' },
    });
    assert.equal(r.anyChange, true);
    assert.equal(r.decisions.length, 3);
    assert.ok(r.decisions.every(d => d.changed && !d.blocks));
    // The decision array is the audit trail. The pipeline writes it.
  });
});
