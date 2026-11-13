/**
 * Comparison operator registry for workflow rule evaluation.
 * Uses explicit functions rather than eval() for deterministic, safe evaluation.
 */

export const OPERATORS = {
  gt: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    return Number(actual) > Number(expected);
  },

  gte: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    return Number(actual) >= Number(expected);
  },

  lt: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    return Number(actual) < Number(expected);
  },

  lte: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    return Number(actual) <= Number(expected);
  },

  eq: (actual, expected) => {
    if (typeof expected === 'boolean') {
      return Boolean(actual) === expected;
    }
    if (typeof expected === 'number') {
      return Number(actual) === Number(expected);
    }
    return String(actual) === String(expected);
  },

  neq: (actual, expected) => {
    return !OPERATORS.eq(actual, expected);
  },

  in: (actual, expected) => {
    if (!Array.isArray(expected)) return false;
    return expected.includes(actual);
  },

  not_in: (actual, expected) => {
    if (!Array.isArray(expected)) return false;
    return !expected.includes(actual);
  },

  exists: (actual) => {
    return actual !== undefined && actual !== null && actual !== '';
  },

  not_exists: (actual) => {
    return actual === undefined || actual === null || actual === '';
  },

  between: (actual, expected) => {
    if (actual === undefined || actual === null) return false;
    if (!Array.isArray(expected) || expected.length !== 2) {
      throw new Error('Operator "between" expects an array of two numbers [min, max]');
    }
    const val = Number(actual);
    const [min, max] = expected.map(Number);
    return val >= min && val <= max;
  },

  contains: (actual, expected) => {
    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual.toLowerCase().includes(expected.toLowerCase());
    }
    if (Array.isArray(actual)) {
      return actual.includes(expected);
    }
    return false;
  }
};

/**
 * Validates whether an operator exists in the registry.
 * @param {string} operator
 * @returns {boolean}
 */
export function isValidOperator(operator) {
  return typeof OPERATORS[operator] === 'function';
}

/**
 * Safely evaluates an operator without executing code.
 * @param {string} operator
 * @param {*} actual
 * @param {*} expected
 * @returns {boolean}
 */
export function evaluateOperator(operator, actual, expected) {
  const fn = OPERATORS[operator];
  if (!fn) {
    throw new Error(`Unsupported or unknown operator: "${operator}"`);
  }
  return fn(actual, expected);
}

