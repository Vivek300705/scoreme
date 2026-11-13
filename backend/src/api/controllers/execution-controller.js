import { workflowOrchestrator } from '../../domain/engine/workflow-orchestrator.js';
import { db } from '../../infrastructure/database/store.js';
import { buildDecisionExplanation } from '../../domain/engine/explanation-builder.js';

export async function executeWorkflow(req, res, next) {
  try {
    const workflowKey = req.params.id;
    const idempotencyKey = req.headers['idempotency-key'] || req.body._idempotencyKey;
    const correlationId = req.headers['x-correlation-id'] || `corr-${Date.now()}`;
    const versionNumber = req.query.version ? parseInt(req.query.version, 10) : undefined;

    const result = await workflowOrchestrator.execute(workflowKey, req.body, {
      idempotencyKey,
      correlationId,
      versionNumber
    });

    const statusCode = result.isReplay ? 200 : 201;

    res.status(statusCode).json({
      executionId: result.execution.id,
      workflowKey,
      status: result.execution.currentState,
      finalDecision: result.execution.finalDecision,
      decisionReason: result.execution.decisionReason,
      isReplay: result.isReplay,
      correlationId: result.execution.correlationId,
      createdAt: result.execution.createdAt,
      execution: result.execution
    });
  } catch (err) {
    next(err);
  }
}

export async function listExecutions(req, res, next) {
  try {
    const { workflowId, status, limit } = req.query;
    const executions = await db.listExecutions({
      workflowId,
      status,
      limit: limit ? parseInt(limit, 10) : 50
    });
    res.json({ data: executions });
  } catch (err) {
    next(err);
  }
}

export async function getExecution(req, res, next) {
  try {
    const { id } = req.params;
    const execution = await db.getExecutionById(id);
    if (!execution) {
      return res.status(404).json({ error: `Execution "${id}" not found` });
    }
    res.json({ data: execution });
  } catch (err) {
    next(err);
  }
}

export async function getExecutionHistory(req, res, next) {
  try {
    const { id } = req.params;
    const execution = await db.getExecutionById(id);
    if (!execution) {
      return res.status(404).json({ error: `Execution "${id}" not found` });
    }

    res.json({
      executionId: execution.id,
      currentState: execution.currentState,
      stateTimeline: execution.stateHistory || [],
      auditTrail: execution.auditLogs || [],
      dependencyAttempts: execution.dependencyAttempts || [],
      ruleEvaluations: execution.ruleEvaluations || []
    });
  } catch (err) {
    next(err);
  }
}

export async function getExecutionExplanation(req, res, next) {
  try {
    const { id } = req.params;
    const execution = await db.getExecutionById(id);
    if (!execution) {
      return res.status(404).json({ error: `Execution "${id}" not found` });
    }

    const explanation = buildDecisionExplanation(execution);
    res.json({ data: explanation });
  } catch (err) {
    next(err);
  }
}

