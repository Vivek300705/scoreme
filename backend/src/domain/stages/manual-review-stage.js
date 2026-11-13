import { db } from '../../infrastructure/database/store.js';
import { logger } from '../../config/logger.js';
import { WORKFLOW_STATES } from '../state-machine/states.js';

export class ManualReviewStage {
  constructor(stageConfig) {
    this.id = stageConfig.id;
    this.name = stageConfig.name;
    this.type = 'manual_review';
  }

  async execute(context) {
    const { execution, reviewRequired, reviewReason } = context;

    if (!reviewRequired) {
      return {
        status: 'SKIPPED',
        action: 'continue',
        reason: 'No rules or dependencies requested manual review.'
      };
    }

    logger.info(`Entering ManualReviewStage: review required for execution ${execution.id}`, {
      executionId: execution.id,
      reason: reviewReason
    });

    // Transition execution to MANUAL_REVIEW state
    await db.transitionState(
      execution.id,
      WORKFLOW_STATES.MANUAL_REVIEW,
      `Routed to underwriter manual review: ${reviewReason}`,
      { stageId: this.id }
    );

    await db.updateExecutionDecision(
      execution.id,
      'MANUAL_REVIEW',
      reviewReason
    );

    // Register into manual review queue
    await db.createManualReview({
      executionId: execution.id
    });

    // Audit log: manual review requested
    await db.appendAuditLog({
      executionId: execution.id,
      correlationId: execution.correlationId,
      eventType: 'MANUAL_REVIEW_REQUESTED',
      previousState: WORKFLOW_STATES.PROCESSING,
      newState: WORKFLOW_STATES.MANUAL_REVIEW,
      stageId: this.id,
      details: {
        reason: reviewReason
      }
    });

    return {
      status: 'AWAITING_REVIEW',
      action: 'halt',
      reason: reviewReason
    };
  }
}

