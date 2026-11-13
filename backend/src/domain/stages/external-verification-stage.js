import { simulationService } from '../../infrastructure/external/simulation-service.js';
import { evaluateRetryEligibility } from '../engine/retry-policy.js';
import { evaluateRuleSet } from '../rules/evaluator.js';
import { db } from '../../infrastructure/database/store.js';
import { logger } from '../../config/logger.js';
import { WORKFLOW_STATES } from '../state-machine/states.js';

export class ExternalVerificationStage {
  constructor(stageConfig) {
    this.id = stageConfig.id;
    this.name = stageConfig.name;
    this.type = 'external_verification';
    this.dependencyName = stageConfig.dependencyName;
    this.retryPolicy = stageConfig.retryPolicy || {
      maxRetries: 3,
      initialBackoffMs: 300,
      backoffMultiplier: 2
    };
    this.postVerificationRules = stageConfig.postVerificationRules || [];
  }

  async execute(context) {
    const { execution, accumulatedData } = context;
    let attempt = 0;
    let successResponse = null;

    logger.info(`Executing ExternalVerificationStage: ${this.name} (${this.dependencyName})`, {
      executionId: execution.id,
      stageId: this.id
    });

    while (true) {
      attempt++;
      const startTime = Date.now();

      // Audit log: external dependency invoked
      await db.appendAuditLog({
        executionId: execution.id,
        correlationId: execution.correlationId,
        eventType: 'EXTERNAL_DEPENDENCY_INVOKED',
        previousState: execution.currentState,
        newState: execution.currentState,
        stageId: this.id,
        details: {
          dependencyName: this.dependencyName,
          attemptNumber: attempt,
          payload: accumulatedData
        }
      });

      try {
        let result;
        if (this.dependencyName === 'credit-bureau-service') {
          result = await simulationService.verifyCreditBureau(accumulatedData, attempt, execution.id);
        } else if (this.dependencyName === 'fraud-detection-service') {
          result = await simulationService.evaluateFraudRisk(accumulatedData, attempt, execution.id);
        } else {
          result = {
            status: 'SUCCESS',
            latencyMs: 10,
            data: { verified: true }
          };
        }

        // Record successful attempt in database
        await db.saveExternalDependencyAttempt({
          executionId: execution.id,
          dependencyName: this.dependencyName,
          attemptNumber: attempt,
          status: 'SUCCESS',
          latencyMs: result.latencyMs,
          requestPayload: accumulatedData,
          responsePayload: result.data
        });

        // Audit log: external dependency response received
        await db.appendAuditLog({
          executionId: execution.id,
          correlationId: execution.correlationId,
          eventType: 'EXTERNAL_DEPENDENCY_RESPONSE',
          previousState: execution.currentState,
          newState: execution.currentState,
          stageId: this.id,
          details: {
            dependencyName: this.dependencyName,
            attemptNumber: attempt,
            status: 'SUCCESS',
            response: result.data
          }
        });

        successResponse = result.data;
        break; // Break retry loop on success
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        const attemptStatus = err.status || 'TEMPORARY_FAILURE';

        // Persist failed attempt record
        await db.saveExternalDependencyAttempt({
          executionId: execution.id,
          dependencyName: this.dependencyName,
          attemptNumber: attempt,
          status: attemptStatus,
          errorMessage: err.message,
          latencyMs,
          requestPayload: accumulatedData,
          responsePayload: null
        });

        // Evaluate retry eligibility using exponential backoff policy
        const retryDecision = evaluateRetryEligibility(attempt, err, this.retryPolicy);

        if (retryDecision.shouldRetry) {
          // Transition state to RETRY_PENDING while waiting
          await db.transitionState(
            execution.id,
            WORKFLOW_STATES.RETRY_PENDING,
            retryDecision.reason,
            { stageId: this.id, attemptNumber: attempt }
          );

          await db.updateRetryState(execution.id, attempt, retryDecision.nextRetryAt);

          // Audit log: retry scheduled
          await db.appendAuditLog({
            executionId: execution.id,
            correlationId: execution.correlationId,
            eventType: 'RETRY_SCHEDULED',
            previousState: execution.currentState,
            newState: WORKFLOW_STATES.RETRY_PENDING,
            stageId: this.id,
            details: {
              attemptNumber: attempt,
              nextRetryAt: retryDecision.nextRetryAt,
              backoffMs: retryDecision.backoffMs,
              reason: retryDecision.reason
            }
          });

          // Wait backoff duration
          await new Promise(resolve => setTimeout(resolve, retryDecision.backoffMs));

          // Transition back to PROCESSING
          await db.transitionState(
            execution.id,
            WORKFLOW_STATES.PROCESSING,
            `Resuming execution after retry backoff for attempt ${attempt + 1}`,
            { stageId: this.id }
          );

          continue; // Loop for next retry attempt
        } else {
          // Retry exhausted or non-retryable error
          logger.error(`External dependency ${this.dependencyName} failed permanently`, {
            executionId: execution.id,
            attempts: attempt,
            reason: retryDecision.reason
          });

          return {
            status: 'FAILED',
            action: 'fail',
            reason: `External dependency "${this.dependencyName}" failed: ${err.message} (${retryDecision.reason})`
          };
        }
      }
    }

    // Merge external response data into accumulated context
    Object.assign(accumulatedData, successResponse);

    // Evaluate postVerificationRules if specified
    if (this.postVerificationRules.length > 0) {
      const ruleResult = evaluateRuleSet(this.postVerificationRules, accumulatedData, this.id);
      const evaluatedRecords = ruleResult.evaluations.map(e => ({
        ...e,
        executionId: execution.id
      }));

      await db.saveRuleEvaluations(evaluatedRecords);

      for (const item of evaluatedRecords) {
        await db.appendAuditLog({
          executionId: execution.id,
          correlationId: execution.correlationId,
          eventType: item.passed ? 'RULE_PASSED' : 'RULE_FAILED',
          previousState: execution.currentState,
          newState: execution.currentState,
          stageId: this.id,
          ruleId: item.ruleId,
          details: {
            ruleName: item.ruleName,
            field: item.field,
            expected: item.expectedValue,
            actual: item.actualValue,
            passed: item.passed,
            explanation: item.explanation
          }
        });
      }

      if (!ruleResult.stagePassed) {
        if (ruleResult.decisiveAction === 'reject') {
          const failedRules = ruleResult.evaluations.filter(e => !e.passed);
          return {
            status: 'REJECTED',
            action: 'reject',
            reason: failedRules.map(r => r.explanation).join(' | '),
            outputData: successResponse
          };
        }

        if (ruleResult.decisiveAction === 'manual_review') {
          const reviewRules = ruleResult.evaluations.filter(e => !e.passed);
          return {
            status: 'MANUAL_REVIEW_REQUIRED',
            action: 'manual_review',
            reason: reviewRules.map(r => r.explanation).join(' | '),
            outputData: successResponse
          };
        }
      }
    }

    return {
      status: 'PASSED',
      action: 'continue',
      outputData: successResponse
    };
  }
}

