import {
  evaluateSingleRule,
  evaluateRuleSet,
  computeDerivedField,
  getFieldValue
} from '../../src/domain/rules/evaluator.js';

describe('Domain: Rule Evaluator Unit Tests', () => {
  const samplePayload = {
    applicantName: 'Alice Springs',
    age: 28,
    monthlyIncome: 60000,
    existingMonthlyDebt: 12000,
    creditScore: 720,
    employmentStatus: 'EMPLOYED'
  };

  test('extracts nested field values correctly', () => {
    const nested = { user: { profile: { address: { city: 'New York' } } } };
    expect(getFieldValue(nested, 'user.profile.address.city')).toBe('New York');
    expect(getFieldValue(nested, 'user.profile.nonexistent')).toBeUndefined();
  });

  test('computes safe derived fields without code execution', () => {
    // 12000 / 60000 = 0.2
    const dti = computeDerivedField('existingMonthlyDebt / monthlyIncome', samplePayload);
    expect(dti).toBe(0.2);
  });

  test('evaluates a single passing rule with explainable trace', () => {
    const rule = {
      id: 'rule-min-income',
      name: 'Minimum Monthly Income',
      field: 'monthlyIncome',
      operator: 'gte',
      value: 25000,
      failureAction: 'reject'
    };

    const result = evaluateSingleRule(rule, samplePayload);
    expect(result.passed).toBe(true);
    expect(result.actualValue).toBe(60000);
    expect(result.explanation).toContain('PASSED');
  });

  test('evaluates a single failing rule with failure action explanation', () => {
    const rule = {
      id: 'rule-min-age',
      name: 'Legal Adult Age Check',
      field: 'age',
      operator: 'gte',
      value: 30, // Alice is 28
      failureAction: 'reject'
    };

    const result = evaluateSingleRule(rule, samplePayload);
    expect(result.passed).toBe(false);
    expect(result.actualValue).toBe(28);
    expect(result.explanation).toContain('FAILED');
    expect(result.explanation).toContain('Triggered REJECT');
  });

  test('evaluates a rule set with logical AND logic', () => {
    const rules = [
      { id: 'r1', name: 'Age', field: 'age', operator: 'gte', value: 18, failureAction: 'reject' },
      { id: 'r2', name: 'Score', field: 'creditScore', operator: 'gte', value: 700, failureAction: 'manual_review' }
    ];

    const result = evaluateRuleSet(rules, samplePayload, 'test-stage', 'AND');
    expect(result.stagePassed).toBe(true);
    expect(result.evaluations).toHaveLength(2);
    expect(result.decisiveAction).toBeNull();
  });

  test('correctly prioritizes reject over manual_review in rule set', () => {
    const rules = [
      { id: 'r1', name: 'Income', field: 'monthlyIncome', operator: 'gte', value: 100000, failureAction: 'reject' }, // fails
      { id: 'r2', name: 'Score', field: 'creditScore', operator: 'gte', value: 750, failureAction: 'manual_review' } // fails
    ];

    const result = evaluateRuleSet(rules, samplePayload, 'test-stage', 'AND');
    expect(result.stagePassed).toBe(false);
    expect(result.decisiveAction).toBe('reject');
  });
});

