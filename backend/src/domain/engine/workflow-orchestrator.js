import { stageRegistry } from '../stages/stage-registry.js';
import { db } from '../../infrastructure/database/store.js';
import { logger } from '../../config/logger.js';
import { WORKFLOW_STATES } from '../state-machine/states.js';
import {
  acquireIdempotencyLock,
  finalizeIdempotencyRecord
} from '../../infrastructure/idempotency/idempotency-manager.js';
import { buildDecisionExplanation } from './explanation-builder.js';

export class WorkflowOrchestrator {
  /**
   * Executes a workflow end-to-end.
   * @param {string} workflowKey
   * @param {object} inputData
   * @param {object} [options] { idempotencyKey, correlationId, version }
   */
  async execute(workflowKey, inputData, options = {}) {
    const { idempotencyKey, correlationId, versionNumber } = options;

    logger.info(`Orchestrator: initiating execution for workflow "${workflowKey}"`, {
      workflowKey,
      idempotencyKey,
      correlationId
    });

    // 1. Idempotency Check & Lock
    const idempotencyLock = await acquireIdempotencyLock(idempotencyKey, workflowKey, inputData);
    if (idempotencyLock.isExisting && idempotencyLock.execution) {
      logger.info(`Orchestrator: returning existing idempotent execution ${idempotencyLock.execution.id}`);
      return {
        isReplay: true,
        execution: idempotencyLock.execution
      };
    }

    // 2. Load Workflow Definition
    const workflow = await db.getWorkflowByKey(workflowKey);
    if (!workflow) {
      const err = new Error(`Workflow definition "${workflowKey}" not found`);
      err.statusCode = 404;
      throw err;
    }

    // 3. Load Workflow Version (Active by default, or specific version)
    let version;
    if (versionNumber) {
      version = await db.getWorkflowVersion(workflow.id, versionNumber);
      if (!version) {
        const err = new Error(`Workflow version ${versionNumber} for "${workflowKey}" not found`);
        err.statusCode = 404;
        throw err;
      }
    } else {
      // Find active version
      const versions = await db.getWorkflowVersions(workflow.id);
      version = versions.find(v => v.status === 'ACTIVE') || versions[0];
      if (!version) {
        const err = new Error(`No active version found for workflow "${workflowKey}"`);
        err.statusCode = 400;
        throw err;
      }
    }

    // 4. Create Execution in RECEIVED state
    const execution = await db.createExecution({
      workflowId: workflow.id,
      workflowVersionId: version.id,
      idempotencyKey: idempotencyKey || null,
      inputData,
      correlationId: correlationId || `corr-${Date.now()}`
    });

    // Link idempotency record if key was provided
    if (idempotencyKey) {
      await db.updateIdempotencyRecord(idempotencyKey, {
        executionId: execution.id
      });
    }

    // Audit log: workflow and version selected
    await db.appendAuditLog({
      executionId: execution.id,
      correlationId: execution.correlationId,
      eventType: 'WORKFLOW_SELECTED',
      previousState: WORKFLOW_STATES.RECEIVED,
      newState: WORKFLOW_STATES.RECEIVED,
      details: {
        workflowKey,
        workflowId: workflow.id,
        versionId: version.id,
        versionNumber: version.version
      }
    });

    // 5. State Transition: RECEIVED -> VALIDATED
    await db.transitionState(
      execution.id,
      WORKFLOW_STATES.VALIDATED,
      'Input schema and payload successfully validated'
    );

    // 6. State Transition: VALIDATED -> PROCESSING
    await db.transitionState(
      execution.id,
      WORKFLOW_STATES.PROCESSING,
      'Executing configured workflow stages'
    );

    // 7. Execute Stages in deterministic order
    const stageDefinitions = Array.isArray(version.stages)
      ? [...version.stages].sort((a, b) => (a.order || 0) - (b.order || 0))
      : [];

    const accumulatedData = { ...inputData };
    let reviewRequired = false;
    let reviewReason = null;

    const stageContext = {
      execution,
      accumulatedData,
      get reviewRequired() { return reviewRequired; },
      get reviewReason() { return reviewReason; }
    };

    for (const stageDef of stageDefinitions) {
      const stage = stageRegistry.createStage(stageDef);
      const stageResult = await stage.execute(stageContext);

      // Handle stage outcome
      if (stageResult.action === 'reject') {
        logger.info(`Orchestrator: Stage "${stage.name}" rejected execution`, {
          executionId: execution.id,
          reason: stageResult.reason
        });

        await db.transitionState(
          execution.id,
          WORKFLOW_STATES.REJECTED,
          stageResult.reason,
          { stageId: stage.id }
        );

        await db.updateExecutionDecision(
          execution.id,
          WORKFLOW_STATES.REJECTED,
          stageResult.reason
        );

        await db.appendAuditLog({
          executionId: execution.id,
          correlationId: execution.correlationId,
          eventType: 'FINAL_DECISION',
          previousState: WORKFLOW_STATES.PROCESSING,
          newState: WORKFLOW_STATES.REJECTED,
          stageId: stage.id,
          details: {
            decision: WORKFLOW_STATES.REJECTED,
            reason: stageResult.reason
          }
        });

        break; // Stop execution on rejection
      }

      if (stageResult.action === 'manual_review') {
        reviewRequired = true;
        reviewReason = stageResult.reason;
        // Continue loop so ManualReviewStage handles routing
      }

      if (stageResult.action === 'halt') {
        logger.info(`Orchestrator: Stage "${stage.name}" halted execution for manual intervention`, {
          executionId: execution.id
        });
        break;
      }

      if (stageResult.action === 'fail') {
        logger.error(`Orchestrator: Stage "${stage.name}" encountered unrecoverable failure`, {
          executionId: execution.id,
          reason: stageResult.reason
        });

        await db.transitionState(
          execution.id,
          WORKFLOW_STATES.FAILED,
          stageResult.reason,
          { stageId: stage.id }
        );

        await db.updateExecutionDecision(
          execution.id,
          WORKFLOW_STATES.FAILED,
          stageResult.reason
        );
        break;
      }
    }

    // 8. Fetch updated execution with all relations
    const finalExecution = await db.getExecutionById(execution.id);

    // 9. Finalize Idempotency Record
    if (idempotencyKey) {
      await finalizeIdempotencyRecord(
        idempotencyKey,
        execution.id,
        200,
        { executionId: execution.id, status: finalExecution.currentState }
      );
    }

    return {
      isReplay: false,
      execution: finalExecution
    };
  }

  /**
   * Resumes and finalizes an execution from MANUAL_REVIEW state.
   * @param {string} executionId
   * @param {'APPROVED'|'REJECTED'} decision
   * @param {string} reviewerId
   * @param {string} reviewerNotes
   */
  async resolveReview(executionId, decision, reviewerId, reviewerNotes) {
    const execution = await db.getExecutionById(executionId);
    if (!execution) {
      const err = new Error(`Execution ${executionId} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (execution.currentState !== WORKFLOW_STATES.MANUAL_REVIEW) {
      const err = new Error(`Execution ${executionId} is in ${execution.currentState} state, not MANUAL_REVIEW.`);
      err.statusCode = 400;
      throw err;
    }

    const targetState = decision === 'APPROVED' ? WORKFLOW_STATES.APPROVED : WORKFLOW_STATES.REJECTED;
    const reason = `Manual underwriter decision: ${decision} by ${reviewerId || 'system'}. Notes: ${reviewerNotes || 'None'}`;

    // Update manual review record
    await db.resolveManualReview(executionId, decision, reviewerId, reviewerNotes);

    // Transition state: MANUAL_REVIEW -> APPROVED or REJECTED
    await db.transitionState(
      executionId,
      targetState,
      reason,
      { reviewerId, reviewerNotes }
    );

    // Update final decision
    await db.updateExecutionDecision(executionId, targetState, reason);

    // Audit log: manual review decided
    await db.appendAuditLog({
      executionId,
      correlationId: execution.correlationId,
      eventType: 'MANUAL_REVIEW_DECIDED',
      previousState: WORKFLOW_STATES.MANUAL_REVIEW,
      newState: targetState,
      details: {
        decision,
        reviewerId,
        reviewerNotes,
        decidedAt: new Date().toISOString()
      }
    });

    return await db.getExecutionById(executionId);
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();

