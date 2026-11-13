import { OPERATORS, evaluateOperator, isValidOperator } from '../../src/domain/operators/registry.js';

describe('Domain: Operator Registry Unit Tests', () => {
  test('gt and gte operators compare numeric thresholds correctly', () => {
    expect(OPERATORS.gt(25, 18)).toBe(true);
    expect(OPERATORS.gt(18, 18)).toBe(false);
    expect(OPERATORS.gte(18, 18)).toBe(true);
    expect(OPERATORS.gte(17, 18)).toBe(false);
    expect(OPERATORS.gt(null, 18)).toBe(false);
  });

  test('lt and lte operators evaluate limits correctly', () => {
    expect(OPERATORS.lt(0.35, 0.45)).toBe(true);
    expect(OPERATORS.lt(0.45, 0.45)).toBe(false);
    expect(OPERATORS.lte(0.45, 0.45)).toBe(true);
    expect(OPERATORS.lte(0.50, 0.45)).toBe(false);
  });

  test('eq and neq evaluate numbers, strings, and booleans', () => {
    expect(OPERATORS.eq(650, 650)).toBe(true);
    expect(OPERATORS.eq('EMPLOYED', 'EMPLOYED')).toBe(true);
    expect(OPERATORS.eq(true, true)).toBe(true);
    expect(OPERATORS.eq(false, true)).toBe(false);
    expect(OPERATORS.neq('EMPLOYED', 'UNEMPLOYED')).toBe(true);
  });

  test('in and not_in verify membership in sets', () => {
    const validStatuses = ['EMPLOYED', 'SELF_EMPLOYED', 'RETIRED'];
    expect(OPERATORS.in('EMPLOYED', validStatuses)).toBe(true);
    expect(OPERATORS.in('UNEMPLOYED', validStatuses)).toBe(false);
    expect(OPERATORS.not_in('UNEMPLOYED', validStatuses)).toBe(true);
  });

  test('exists and not_exists verify presence of values', () => {
    expect(OPERATORS.exists('John')).toBe(true);
    expect(OPERATORS.exists(0)).toBe(true);
    expect(OPERATORS.exists(null)).toBe(false);
    expect(OPERATORS.exists(undefined)).toBe(false);
    expect(OPERATORS.not_exists(null)).toBe(true);
  });

  test('between checks inclusive numeric ranges', () => {
    expect(OPERATORS.between(650, [600, 700])).toBe(true);
    expect(OPERATORS.between(600, [600, 700])).toBe(true);
    expect(OPERATORS.between(700, [600, 700])).toBe(true);
    expect(OPERATORS.between(599, [600, 700])).toBe(false);
    expect(OPERATORS.between(701, [600, 700])).toBe(false);
  });

  test('evaluateOperator throws error on unrecognized operator', () => {
    expect(() => evaluateOperator('eval_js', '1+1', 2)).toThrow(/Unsupported or unknown operator/);
    expect(isValidOperator('unknown_op')).toBe(false);
  });
});

