import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePageParams, totalPages } from '../pagination.ts';

describe('parsePageParams', () => {
  it('defaults when params are absent', () => {
    assert.deepEqual(parsePageParams(null, null), { page: 1, limit: 50, offset: 0 });
  });
  it('computes offset from page and limit', () => {
    assert.deepEqual(parsePageParams('3', '20'), { page: 3, limit: 20, offset: 40 });
  });
  it('clamps limit to maxLimit', () => {
    assert.equal(parsePageParams('1', '99999', { maxLimit: 200 }).limit, 200);
  });
  it('floors page at 1 for zero/negative/garbage', () => {
    assert.equal(parsePageParams('0', '10').page, 1);
    assert.equal(parsePageParams('-4', '10').page, 1);
    assert.equal(parsePageParams('abc', '10').page, 1);
  });
  it('falls back to defaultLimit for bad limit', () => {
    assert.equal(parsePageParams('1', 'xyz', { defaultLimit: 25 }).limit, 25);
    assert.equal(parsePageParams('1', '0', { defaultLimit: 25 }).limit, 25);
  });
  it('honors a custom defaultLimit', () => {
    assert.equal(parsePageParams(null, null, { defaultLimit: 30 }).limit, 30);
  });
});

describe('totalPages', () => {
  it('rounds up', () => {
    assert.equal(totalPages(201, 50), 5);
    assert.equal(totalPages(200, 50), 4);
  });
  it('never returns less than 1', () => {
    assert.equal(totalPages(0, 50), 1);
    assert.equal(totalPages(-5, 50), 1);
  });
  it('guards a zero limit', () => {
    assert.equal(totalPages(100, 0), 1);
  });
});
