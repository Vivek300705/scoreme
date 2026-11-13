/**
 * Configurable Exponential Backoff Retry Policy & Failure Classifier.
 */

export const ERROR_TYPES = Object.freeze({
  BUSINESS_REJECTION: 'BUSINESS_REJECTION',
  RETRYABLE_INFRASTRUCTURE: 'RETRYABLE_INFRASTRUCTURE',
  PERMANENT_INFRASTRUCTURE: 'PERMANENT_INFRASTRUCTURE',
  VALIDATION_ERROR: 'VALIDATION_ERROR'
});

export const RETRYABLE_STATUS_CODES = Object.freeze([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504  // Gateway Timeout
]);

export const RETRYABLE_ERROR_NAMES = Object.freeze([
  'TIMEOUT',
  'TEMPORARY_FAILURE',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
  'ECONNRESET',
  'ETIMEDOUT'
]);

/**
 * Classifies an error to determine whether it is retryable or not.
 * @param {Error|object} error
 * @returns {string} One of ERROR_TYPES
 */
export function classifyError(error) {
  if (!error) return ERROR_TYPES.PERMANENT_INFRASTRUCTURE;

  // Business rejections are deterministic and should not be retried
  if (error.isBusinessRejection || error.failureAction === 'reject' || error.type === 'BUSINESS_REJECTION') {
    return ERROR_TYPES.BUSINESS_REJECTION;
  }

  // Explicit retryable status check
  if (error.statusCode && RETRYABLE_STATUS_CODES.includes(error.statusCode)) {
    return ERROR_TYPES.RETRYABLE_INFRASTRUCTURE;
  }

  // Error code or message pattern matching
  const identifier = `${error.code || ''} ${error.name || ''} ${error.status || ''} ${error.message || ''}`.toUpperCase();

  for (const pattern of RETRYABLE_ERROR_NAMES) {
    if (identifier.includes(pattern)) {
      return ERROR_TYPES.RETRYABLE_INFRASTRUCTURE;
    }
  }

  return ERROR_TYPES.PERMANENT_INFRASTRUCTURE;
}

/**
 * Calculates exponential backoff in milliseconds.
 * backoff = initialBackoffMs * (backoffMultiplier ^ (attempt - 1)) + jitter
 * @param {number} attempt Current retry attempt count (1, 2, 3...)
 * @param {object} policy Retry policy configuration
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffMs(attempt, policy = {}) {
  const initial = policy.initialBackoffMs || 300;
  const multiplier = policy.backoffMultiplier || 2;
  const maxDelay = policy.maxDelayMs || 10000;

  const baseDelay = initial * Math.pow(multiplier, Math.max(0, attempt - 1));
  // Add 10% jitter to prevent thundering herd
  const jitter = Math.floor(Math.random() * (baseDelay * 0.1));
  return Math.min(baseDelay + jitter, maxDelay);
}

/**
 * Determines whether another retry should be attempted.
 * @param {number} currentAttempts
 * @param {Error|object} error
 * @param {object} policy
 * @returns {{ shouldRetry: boolean, nextRetryAt: Date|null, backoffMs: number, reason: string }}
 */
export function evaluateRetryEligibility(currentAttempts, error, policy = {}) {
  const maxRetries = policy.maxRetries !== undefined ? policy.maxRetries : 3;
  const errorType = classifyError(error);

  if (errorType === ERROR_TYPES.BUSINESS_REJECTION) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      backoffMs: 0,
      reason: 'Business rejections are deterministic and not eligible for infrastructure retries.'
    };
  }

  if (errorType !== ERROR_TYPES.RETRYABLE_INFRASTRUCTURE) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      backoffMs: 0,
      reason: `Error is classified as permanent infrastructure failure (${error.message || error.name}).`
    };
  }

  if (currentAttempts >= maxRetries) {
    return {
      shouldRetry: false,
      nextRetryAt: null,
      backoffMs: 0,
      reason: `Maximum retry attempts exhausted (${currentAttempts}/${maxRetries}).`
    };
  }

  const backoffMs = calculateBackoffMs(currentAttempts + 1, policy);
  const nextRetryAt = new Date(Date.now() + backoffMs);

  return {
    shouldRetry: true,
    nextRetryAt,
    backoffMs,
    reason: `Retry scheduled (attempt ${currentAttempts + 1} of ${maxRetries}) after ${backoffMs}ms backoff.`
  };
}

