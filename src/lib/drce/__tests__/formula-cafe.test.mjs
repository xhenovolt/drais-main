// node:test suite for the CAFE Phase 6 formula functions.
// Run with:  npx tsx --test src/lib/drce/__tests__/formula-cafe.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFormula } from '../table/formula.ts';

function ctx({ results = [], student = {} } = {}) {
  return {
    cellValues: { col0: { r0: 0 } },
    columnIds: ['col0'], rowKeys: ['r0'],
    currentCol: 'col0', currentRow: 'r0',
    dataCtx: {
      student: {
        fullName: 'Test', firstName: 'T', lastName: 'S', gender: '', className: '',
        streamName: '', admissionNo: '', photoUrl: null, dateOfBirth: null,
        custom: {}, ...student,
      },
      results, subjects: [],
      assessment: { classPosition: null, streamPosition: null, aggregates: null, division: null, totalStudents: null },
      comments: { classTeacher: '', dos: '', headTeacher: '' },
      meta: { schoolName: '', schoolAddress: '', schoolContact: '', schoolEmail: '',
        centerNo: '', registrationNo: '', term: '', year: '', reportTitle: '', nextTermBegins: '' },
      language: 'en',
    },
  };
}

function result(subjectName, components = []) {
  return {
    subjectId: 1, subjectName, displaySubject: subjectName,
    score: null, displayScore: '', grade: '', remarks: '',
    initials: '', teacherName: '',
    components,
    competencyLevel: components[0]?.gradeCode ?? null,
  };
}

describe('COMPONENT', () => {
  it('reads default field (score) for a matching component code', () => {
    const c = ctx({ results: [ result('Maths', [
      { code: 'theory',    name: 'Theory',    score: 75, valueText: null, gradeCode: 'A', weight: 0.7 },
      { code: 'practical', name: 'Practical', score: 60, valueText: null, gradeCode: 'B', weight: 0.3 },
    ])]});
    assert.equal(evaluateFormula('COMPONENT("theory")', c).value, 75);
    assert.equal(evaluateFormula('COMPONENT("practical")', c).value, 60);
  });
  it('reads gradeCode when field arg is provided', () => {
    const c = ctx({ results: [ result('Maths', [
      { code: 'theory', name: 'Theory', score: 75, valueText: null, gradeCode: 'A', weight: 1 },
    ])]});
    assert.equal(evaluateFormula('COMPONENT("theory", "gradeCode")', c).value, 'A');
    assert.equal(evaluateFormula('COMPONENT("theory", "name")',      c).value, 'Theory');
  });
  it('returns null when code not found', () => {
    const c = ctx({ results: [ result('Maths', [
      { code: 'theory', name: 'Theory', score: 75, valueText: null, gradeCode: 'A', weight: 1 },
    ])]});
    assert.equal(evaluateFormula('COMPONENT("ghost")', c).value, null);
  });
  it('returns null on empty components', () => {
    const c = ctx({ results: [ result('Maths', []) ] });
    assert.equal(evaluateFormula('COMPONENT("theory")', c).value, null);
  });
});

describe('COMPETENCY', () => {
  it('returns framework mode with no args', () => {
    const c = ctx({ student: { cafe: { frameworkName: 'NLSC', frameworkMode: 'rubric' } } });
    assert.equal(evaluateFormula('COMPETENCY()', c).value, 'rubric');
  });
  it('returns competency level for a named subject', () => {
    const c = ctx({ results: [ result('Maths', [
      { code: 'theory', name: 'Theory', score: 75, valueText: null, gradeCode: 'A', weight: 1 },
    ])]});
    assert.equal(evaluateFormula('COMPETENCY("Maths")', c).value, 'A');
  });
  it('case-insensitive match', () => {
    const c = ctx({ results: [ result('Mathematics', [
      { code: 'theory', name: 'Theory', score: 75, valueText: null, gradeCode: 'A', weight: 1 },
    ])]});
    assert.equal(evaluateFormula('COMPETENCY("MATHEMATICS")', c).value, 'A');
  });
  it('returns null for unknown subject', () => {
    const c = ctx({ results: [] });
    assert.equal(evaluateFormula('COMPETENCY("Ghost")', c).value, null);
  });
});

describe('DESCRIPTOR', () => {
  it('returns the valueText for a component code', () => {
    const c = ctx({ results: [ result('Maths', [
      { code: 'aoi', name: 'AoI', score: null, valueText: 'Solved a real-world problem', gradeCode: '3', weight: 1 },
    ])]});
    assert.equal(evaluateFormula('DESCRIPTOR("aoi")', c).value, 'Solved a real-world problem');
  });
  it('falls back to gradeCode when valueText is null', () => {
    const c = ctx({ results: [ result('Maths', [
      { code: 'theory', name: 'Theory', score: 75, valueText: null, gradeCode: 'A', weight: 1 },
    ])]});
    assert.equal(evaluateFormula('DESCRIPTOR("theory")', c).value, 'A');
  });
  it('skill scope reads from student.genericSkills', () => {
    const c = ctx({
      student: {
        genericSkills: [
          { code: 'comm', label: 'Communication', score: null, valueText: 'Outstanding', gradeCode: 'A' },
        ],
      },
    });
    assert.equal(evaluateFormula('DESCRIPTOR("comm", "skill")', c).value, 'Outstanding');
  });
});
