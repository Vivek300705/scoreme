import { db } from '../../infrastructure/database/store.js';
import { logger } from '../../config/logger.js';
import { WORKFLOW_STATES } from '../state-machine/states.js';

export class FinalDecisionStage {
  constructor(stageConfig) {
    this.id = stageConfig.id;
    this.name = stageConfig.name;
    this.type = 'final_decision';
  }

  async execute(context) {
    const { execution, accumulatedData } = context;

    logger.info(`FinalDecisionStage: consolidating approval for ${execution.id}`);

    const reason = 'All policy eligibility checks and external verifications succeeded.';

    // Transition execution to APPROVED state
    await db.transitionState(
      execution.id,
      WORKFLOW_STATES.APPROVED,
      reason,
      { stageId: this.id }
    );

    await db.updateExecutionDecision(
      execution.id,
      WORKFLOW_STATES.APPROVED,
      reason,
      accumulatedData
    );

    // Audit log: final decision reached
    await db.appendAuditLog({
      executionId: execution.id,
      correlationId: execution.correlationId,
      eventType: 'FINAL_DECISION',
      previousState: WORKFLOW_STATES.PROCESSING,
      newState: WORKFLOW_STATES.APPROVED,
      stageId: this.id,
      details: {
        decision: WORKFLOW_STATES.APPROVED,
        reason
      }
    });

    return {
      status: 'APPROVED',
      action: 'complete',
      decision: WORKFLOW_STATES.APPROVED,
      reason
    };
  }
}

