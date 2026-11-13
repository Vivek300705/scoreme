import {
  classifyError,
  calculateBackoffMs,
  evaluateRetryEligibility,
  ERROR_TYPES
} from '../../src/domain/engine/retry-policy.js';

describe('Domain: Retry Policy & Failure Classifier Unit Tests', () => {
  test('strictly classifies business rejection as NON-RETRYABLE', () => {
    const bizError = {
      isBusinessRejection: true,
      message: 'Applicant age below legal threshold'
    };

    expect(classifyError(bizError)).toBe(ERROR_TYPES.BUSINESS_REJECTION);

    const eligibility = evaluateRetryEligibility(1, bizError);
    expect(eligibility.shouldRetry).toBe(false);
    expect(eligibility.reason).toContain('Business rejections are deterministic');
  });

  test('classifies network timeouts and HTTP 503 as RETRYABLE', () => {
    const timeoutErr = new Error('Gateway Timeout');
    timeoutErr.statusCode = 504;

    expect(classifyError(timeoutErr)).toBe(ERROR_TYPES.RETRYABLE_INFRASTRUCTURE);

    const eligibility = evaluateRetryEligibility(1, timeoutErr, { maxRetries: 3 });
    expect(eligibility.shouldRetry).toBe(true);
    expect(eligibility.backoffMs).toBeGreaterThan(0);
    expect(eligibility.nextRetryAt).toBeInstanceOf(Date);
  });

  test('calculates exponential backoff progression with jitter', () => {
    const policy = { initialBackoffMs: 200, backoffMultiplier: 2 };

    const delay1 = calculateBackoffMs(1, policy); // ~200
    const delay2 = calculateBackoffMs(2, policy); // ~400
    const delay3 = calculateBackoffMs(3, policy); // ~800

    expect(delay1).toBeGreaterThanOrEqual(200);
    expect(delay2).toBeGreaterThanOrEqual(400);
    expect(delay3).toBeGreaterThanOrEqual(800);
    expect(delay3).toBeGreaterThan(delay2);
  });

  test('terminates retry eligibility when max retries is exhausted', () => {
    const serviceErr = new Error('Service Unavailable');
    serviceErr.statusCode = 503;

    // Attempt 3 of 3 max retries
    const decision = evaluateRetryEligibility(3, serviceErr, { maxRetries: 3 });
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toContain('Maximum retry attempts exhausted');
  });
});

