import { evaluateOperator, isValidOperator } from '../operators/registry.js';

/**
 * Safely extracts a nested property from an object using a dot-delimited path.
 * @param {object} obj
 * @param {string} path
 * @returns {*}
 */
export function getFieldValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Resolves derived fields using a safe calculator without eval().
 * Supports standard expressions like: "a / b", "a * b", "a + b", "a - b"
 * @param {string} formula
 * @param {object} data
 * @returns {number|null}
 */
export function computeDerivedField(formula, data) {
  if (!formula || typeof formula !== 'string') return null;

  // Pattern: "fieldA [operator] fieldB"
  const tokens = formula.trim().split(/\s*([+\-*/])\s*/);
  if (tokens.length === 3) {
    const [leftField, op, rightField] = tokens;
    const leftVal = Number(getFieldValue(data, leftField));
    const rightVal = Number(getFieldValue(data, rightField));

    if (Number.isNaN(leftVal) || Number.isNaN(rightVal)) return null;

    switch (op) {
      case '/':
        return rightVal === 0 ? 0 : Number((leftVal / rightVal).toFixed(4));
      case '*':
        return Number((leftVal * rightVal).toFixed(4));
      case '+':
        return Number((leftVal + rightVal).toFixed(4));
      case '-':
        return Number((leftVal - rightVal).toFixed(4));
      default:
        return null;
    }
  }
  return null;
}

/**
 * Evaluates a conditional rule (e.g., only execute this rule if condition holds true).
 * Safely parses simple condition expressions like "field === 'VALUE'".
 * @param {string} conditionExpr
 * @param {object} data
 * @returns {boolean}
 */
export function checkCondition(conditionExpr, data) {
  if (!conditionExpr) return true; // unconditional

  const match = conditionExpr.match(/^([\w.]+)\s*(===|==|!==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) return true;

  const [, fieldPath, op, rawVal] = match;
  const actual = getFieldValue(data, fieldPath);
  let expected = rawVal.trim().replace(/^['"]|['"]$/g, '');

  if (rawVal === 'true') expected = true;
  else if (rawVal === 'false') expected = false;
  else if (!Number.isNaN(Number(rawVal))) expected = Number(rawVal);

  switch (op) {
    case '===':
    case '==':
      return actual === expected;
    case '!==':
    case '!=':
      return actual !== expected;
    case '>':
      return Number(actual) > Number(expected);
    case '>=':
      return Number(actual) >= Number(expected);
    case '<':
      return Number(actual) < Number(expected);
    case '<=':
      return Number(actual) <= Number(expected);
    default:
      return true;
  }
}

/**
 * Generates an explainable human-readable sentence for rule evaluation.
 */
function createExplanation(rule, actualValue, passed) {
  const statusStr = passed ? 'PASSED' : 'FAILED';
  const expectedStr = Array.isArray(rule.value) ? `[${rule.value.join(', ')}]` : rule.value;
  const actualStr = actualValue !== undefined && actualValue !== null ? actualValue : 'null';

  if (passed) {
    return `Rule "${rule.name}" PASSED: ${rule.field} was ${actualStr}, meeting the condition (${rule.operator} ${expectedStr}).`;
  }

  const actionNotice = rule.failureAction === 'manual_review'
    ? 'Triggered MANUAL_REVIEW.'
    : `Triggered ${rule.failureAction.toUpperCase()}.`;

  return `Rule "${rule.name}" FAILED: ${rule.field} was ${actualStr}, but expected ${rule.operator} ${expectedStr}. ${actionNotice}`;
}

/**
 * Evaluates a single rule definition against application context data.
 * @param {object} rule
 * @param {object} contextData
 * @param {string} stageId
 * @returns {object|null} Evaluation trace record (null if condition skipped)
 */
export function evaluateSingleRule(rule, contextData, stageId = 'rules') {
  if (!isValidOperator(rule.operator)) {
    throw new Error(`Rule ${rule.id} specifies unknown operator: ${rule.operator}`);
  }

  // Check if rule condition applies
  if (rule.condition && !checkCondition(rule.condition, contextData)) {
    return {
      stageId,
      ruleId: rule.id,
      ruleName: rule.name || rule.id,
      field: rule.field,
      operator: rule.operator,
      expectedValue: rule.value,
      actualValue: null,
      passed: true,
      skipped: true,
      failureAction: rule.failureAction || 'reject',
      explanation: `Rule "${rule.name}" was SKIPPED because condition "${rule.condition}" was not met.`,
      evaluatedAt: new Date().toISOString()
    };
  }

  // Compute actual value (direct or derived)
  let actualValue;
  if (rule.derived) {
    actualValue = computeDerivedField(rule.derived, contextData);
  } else {
    actualValue = getFieldValue(contextData, rule.field);
  }

  const passed = evaluateOperator(rule.operator, actualValue, rule.value);
  const explanation = createExplanation(rule, actualValue, passed);

  return {
    stageId,
    ruleId: rule.id,
    ruleName: rule.name || rule.id,
    field: rule.field,
    operator: rule.operator,
    expectedValue: rule.value,
    actualValue,
    passed,
    skipped: false,
    failureAction: rule.failureAction || 'reject',
    explanation,
    evaluatedAt: new Date().toISOString()
  };
}

/**
 * Evaluates a list of rules deterministically.
 * Supports logical AND (default) or OR logic for rule groups.
 * @param {Array<object>} rules
 * @param {object} contextData
 * @param {string} stageId
 * @param {string} combinator 'AND' | 'OR'
 * @returns {object} { evaluations: Array, stagePassed: boolean, decisiveAction: string|null }
 */
export function evaluateRuleSet(rules, contextData, stageId = 'rules', combinator = 'AND') {
  const evaluations = [];
  let decisiveAction = null;

  for (const rule of rules) {
    const result = evaluateSingleRule(rule, contextData, stageId);
    evaluations.push(result);

    if (!result.passed && !result.skipped) {
      if (!decisiveAction || result.failureAction === 'reject') {
        decisiveAction = result.failureAction; // 'reject' takes precedence over 'manual_review'
      }
    }
  }

  let stagePassed = false;
  if (combinator === 'OR') {
    stagePassed = evaluations.some(e => e.passed && !e.skipped);
  } else {
    stagePassed = evaluations.every(e => e.passed);
  }

  return {
    stageId,
    evaluations,
    stagePassed,
    decisiveAction: stagePassed ? null : decisiveAction
  };
}

