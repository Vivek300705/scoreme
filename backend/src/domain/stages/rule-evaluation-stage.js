import { evaluateRuleSet } from '../rules/evaluator.js';
import { db } from '../../infrastructure/database/store.js';
import { logger } from '../../config/logger.js';

export class RuleEvaluationStage {
  constructor(stageConfig) {
    this.id = stageConfig.id;
    this.name = stageConfig.name;
    this.type = 'rule_evaluation';
    this.rules = stageConfig.rules || [];
    this.combinator = stageConfig.combinator || 'AND';
  }

  async execute(context) {
    const { execution, accumulatedData } = context;

    logger.info(`Executing RuleEvaluationStage: ${this.name}`, {
      executionId: execution.id,
      stageId: this.id,
      ruleCount: this.rules.length
    });

    const result = evaluateRuleSet(this.rules, accumulatedData, this.id, this.combinator);

    // Persist all evaluated rule records with foreign key to execution
    const evaluatedRecords = result.evaluations.map(e => ({
      ...e,
      executionId: execution.id
    }));

    await db.saveRuleEvaluations(evaluatedRecords);

    // Audit log for each evaluated rule
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

    if (!result.stagePassed) {
      if (result.decisiveAction === 'reject') {
        const failedRules = result.evaluations.filter(e => !e.passed);
        const reason = failedRules.map(r => r.explanation).join(' | ');

        return {
          status: 'REJECTED',
          action: 'reject',
          reason,
          evaluations: result.evaluations
        };
      }

      if (result.decisiveAction === 'manual_review') {
        const reviewRules = result.evaluations.filter(e => !e.passed);
        const reason = reviewRules.map(r => r.explanation).join(' | ');

        return {
          status: 'MANUAL_REVIEW_REQUIRED',
          action: 'manual_review',
          reason,
          evaluations: result.evaluations
        };
      }
    }

    return {
      status: 'PASSED',
      action: 'continue',
      evaluations: result.evaluations
    };
  }
}

