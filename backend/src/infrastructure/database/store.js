import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../config/logger.js';
import { config } from '../../config/env.js';
import { WORKFLOW_STATES } from '../../domain/state-machine/states.js';
import { validateStateTransition } from '../../domain/state-machine/validator.js';

export class DbStore {
  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl
        }
      }
    });

    this.isPostgresConnected = false;

    // In-memory relational tables (synchronized transactional fallback for offline/test environments)
    this.workflows = new Map();
    this.versions = new Map();
    this.executions = new Map();
    this.stateHistories = [];
    this.ruleEvaluations = [];
    this.auditLogs = [];
    this.idempotencyRecords = new Map();
    this.dependencyAttempts = [];
    this.manualReviews = new Map();
  }

  async init() {
    try {
      // Test Prisma connection to PostgreSQL with 1.5s timeout
      const connectPromise = this.prisma.$connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PostgreSQL connection timeout')), 1500)
      );

      await Promise.race([connectPromise, timeoutPromise]);
      this.isPostgresConnected = true;
      logger.info('Connected to PostgreSQL database via Prisma ORM');
    } catch (err) {
      this.isPostgresConnected = false;
      logger.info('PostgreSQL not connected; using in-memory transactional store for local development', {
        error: err.message
      });
    }
  }

  // ==========================================
  // WORKFLOW DEFINITIONS & VERSIONS
  // ==========================================

  async createWorkflow(definition) {
    const id = definition.id || uuidv4();
    const now = new Date();
    const record = {
      id,
      workflowKey: definition.workflowKey,
      name: definition.name,
      description: definition.description || '',
      activeVersionId: definition.activeVersionId || null,
      createdAt: now,
      updatedAt: now,
      versions: []
    };

    if (this.isPostgresConnected) {
      try {
        const created = await this.prisma.workflowDefinition.create({
          data: {
            id,
            workflowKey: definition.workflowKey,
            name: definition.name,
            description: definition.description,
            activeVersionId: definition.activeVersionId
          }
        });
        return created;
      } catch (e) {
        logger.warn('Prisma createWorkflow failed, falling back to local store', { error: e.message });
      }
    }

    this.workflows.set(record.workflowKey, record);
    return record;
  }

  async getWorkflowByKey(workflowKey) {
    if (this.isPostgresConnected) {
      try {
        const found = await this.prisma.workflowDefinition.findUnique({
          where: { workflowKey },
          include: { versions: true }
        });
        if (found) return found;
      } catch (e) {
        logger.warn('Prisma getWorkflowByKey failed, falling back to local store', { error: e.message });
      }
    }

    const workflow = this.workflows.get(workflowKey);
    if (!workflow) return null;

    // Attach versions
    const versions = Array.from(this.versions.values()).filter(v => v.workflowId === workflow.id);
    return { ...workflow, versions };
  }

  async getWorkflowById(id) {
    if (this.isPostgresConnected) {
      try {
        const found = await this.prisma.workflowDefinition.findUnique({
          where: { id },
          include: { versions: true }
        });
        if (found) return found;
      } catch (e) {
        logger.warn('Prisma getWorkflowById failed, falling back to local store', { error: e.message });
      }
    }

    const workflow = Array.from(this.workflows.values()).find(w => w.id === id);
    if (!workflow) return null;
    const versions = Array.from(this.versions.values()).filter(v => v.workflowId === workflow.id);
    return { ...workflow, versions };
  }

  async listWorkflows() {
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.workflowDefinition.findMany({
          include: { versions: true }
        });
      } catch (e) {
        logger.warn('Prisma listWorkflows failed, falling back to local store', { error: e.message });
      }
    }

    return Array.from(this.workflows.values()).map(w => {
      const versions = Array.from(this.versions.values()).filter(v => v.workflowId === w.id);
      return { ...w, versions };
    });
  }

  async createWorkflowVersion(versionData) {
    const id = versionData.id || uuidv4();
    const now = new Date();
    const record = {
      id,
      workflowId: versionData.workflowId,
      version: versionData.version,
      status: versionData.status || 'ACTIVE',
      inputSchema: versionData.inputSchema,
      stages: versionData.stages,
      metadata: versionData.metadata || {},
      createdAt: now
    };

    if (this.isPostgresConnected) {
      try {
        return await this.prisma.workflowVersion.create({
          data: record
        });
      } catch (e) {
        logger.warn('Prisma createWorkflowVersion failed, falling back to local store', { error: e.message });
      }
    }

    this.versions.set(id, record);
    return record;
  }

  async getWorkflowVersions(workflowId) {
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.workflowVersion.findMany({
          where: { workflowId },
          orderBy: { version: 'desc' }
        });
      } catch (e) {
        logger.warn('Prisma getWorkflowVersions failed, falling back to local store', { error: e.message });
      }
    }

    return Array.from(this.versions.values())
      .filter(v => v.workflowId === workflowId)
      .sort((a, b) => b.version - a.version);
  }

  async getWorkflowVersion(workflowId, versionNumber) {
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.workflowVersion.findUnique({
          where: {
            workflowId_version: {
              workflowId,
              version: versionNumber
            }
          }
        });
      } catch (e) {
        logger.warn('Prisma getWorkflowVersion failed, falling back to local store', { error: e.message });
      }
    }

    return Array.from(this.versions.values()).find(
      v => v.workflowId === workflowId && v.version === versionNumber
    ) || null;
  }

  async activateWorkflowVersion(workflowId, versionNumber) {
    const version = await this.getWorkflowVersion(workflowId, versionNumber);
    if (!version) {
      throw new Error(`Version ${versionNumber} does not exist for workflow ${workflowId}`);
    }

    if (this.isPostgresConnected) {
      try {
        await this.prisma.$transaction([
          this.prisma.workflowVersion.updateMany({
            where: { workflowId },
            data: { status: 'ARCHIVED' }
          }),
          this.prisma.workflowVersion.update({
            where: { id: version.id },
            data: { status: 'ACTIVE' }
          }),
          this.prisma.workflowDefinition.update({
            where: { id: workflowId },
            data: { activeVersionId: version.id }
          })
        ]);
        return version;
      } catch (e) {
        logger.warn('Prisma activateWorkflowVersion failed, falling back to local store', { error: e.message });
      }
    }

    // Local transaction
    for (const v of this.versions.values()) {
      if (v.workflowId === workflowId) {
        v.status = v.id === version.id ? 'ACTIVE' : 'ARCHIVED';
      }
    }

    const workflow = Array.from(this.workflows.values()).find(w => w.id === workflowId);
    if (workflow) {
      workflow.activeVersionId = version.id;
    }

    return version;
  }

  // ==========================================
  // EXECUTIONS & STATE MANAGEMENT
  // ==========================================

  async createExecution(executionData) {
    const id = executionData.id || uuidv4();
    const now = new Date();
    const record = {
      id,
      workflowId: executionData.workflowId,
      workflowVersionId: executionData.workflowVersionId,
      idempotencyKey: executionData.idempotencyKey || null,
      currentState: WORKFLOW_STATES.RECEIVED,
      inputData: executionData.inputData,
      contextData: executionData.contextData || {},
      finalDecision: null,
      decisionReason: null,
      retryCount: 0,
      maxRetries: executionData.maxRetries || 3,
      nextRetryAt: null,
      correlationId: executionData.correlationId || uuidv4(),
      createdAt: now,
      updatedAt: now
    };

    const initialHistory = {
      id: uuidv4(),
      executionId: id,
      fromState: 'NONE',
      toState: WORKFLOW_STATES.RECEIVED,
      transitionReason: 'Initial workflow request received',
      metadata: {},
      createdAt: now
    };

    const initialAudit = {
      id: uuidv4(),
      executionId: id,
      correlationId: record.correlationId,
      eventType: 'REQUEST_RECEIVED',
      previousState: null,
      newState: WORKFLOW_STATES.RECEIVED,
      details: { input: executionData.inputData },
      stageId: null,
      ruleId: null,
      createdAt: now
    };

    if (this.isPostgresConnected) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const exec = await tx.workflowExecution.create({ data: record });
          await tx.workflowStateHistory.create({ data: initialHistory });
          await tx.auditLog.create({ data: initialAudit });
          return exec;
        });
        return created;
      } catch (e) {
        logger.warn('Prisma createExecution failed, falling back to local store', { error: e.message });
      }
    }

    // In-memory transactional write
    this.executions.set(id, record);
    this.stateHistories.push(initialHistory);
    this.auditLogs.push(initialAudit);

    return record;
  }

  async getExecutionById(id) {
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.workflowExecution.findUnique({
          where: { id },
          include: {
            workflow: true,
            version: true,
            stateHistory: { orderBy: { createdAt: 'asc' } },
            ruleEvaluations: { orderBy: { evaluatedAt: 'asc' } },
            auditLogs: { orderBy: { createdAt: 'asc' } },
            dependencyAttempts: { orderBy: { createdAt: 'asc' } },
            manualReview: true
          }
        });
      } catch (e) {
        logger.warn('Prisma getExecutionById failed, falling back to local store', { error: e.message });
      }
    }

    const execution = this.executions.get(id);
    if (!execution) return null;

    const workflow = Array.from(this.workflows.values()).find(w => w.id === execution.workflowId);
    const version = this.versions.get(execution.workflowVersionId);
    const stateHistory = this.stateHistories.filter(h => h.executionId === id);
    const ruleEvaluations = this.ruleEvaluations.filter(r => r.executionId === id);
    const auditLogs = this.auditLogs.filter(a => a.executionId === id);
    const dependencyAttempts = this.dependencyAttempts.filter(d => d.executionId === id);
    const manualReview = this.manualReviews.get(id) || null;

    return {
      ...execution,
      workflow,
      version,
      stateHistory,
      ruleEvaluations,
      auditLogs,
      dependencyAttempts,
      manualReview
    };
  }

  async listExecutions(filters = {}) {
    if (this.isPostgresConnected) {
      try {
        const where = {};
        if (filters.workflowId) where.workflowId = filters.workflowId;
        if (filters.status) where.currentState = filters.status;
        return await this.prisma.workflowExecution.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: filters.limit || 50,
          include: {
            workflow: true,
            version: true
          }
        });
      } catch (e) {
        logger.warn('Prisma listExecutions failed, falling back to local store', { error: e.message });
      }
    }

    let results = Array.from(this.executions.values());
    if (filters.workflowId) {
      results = results.filter(e => e.workflowId === filters.workflowId);
    }
    if (filters.status) {
      results = results.filter(e => e.currentState === filters.status);
    }
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results.map(e => ({
      ...e,
      workflow: Array.from(this.workflows.values()).find(w => w.id === e.workflowId),
      version: this.versions.get(e.workflowVersionId)
    }));
  }

  /**
   * Atomic state transition with mandatory state history and audit logging.
   */
  async transitionState(executionId, targetState, reason, metadata = {}, auditDetails = {}) {
    const execution = await this.getExecutionById(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const fromState = execution.currentState;

    // Validate state transition rule
    validateStateTransition(fromState, targetState, reason);

    const now = new Date();
    const historyRecord = {
      id: uuidv4(),
      executionId,
      fromState,
      toState: targetState,
      transitionReason: reason,
      metadata,
      createdAt: now
    };

    const auditRecord = {
      id: uuidv4(),
      executionId,
      correlationId: execution.correlationId,
      eventType: 'STATE_TRANSITION',
      previousState: fromState,
      newState: targetState,
      details: { reason, ...metadata, ...auditDetails },
      stageId: metadata.stageId || null,
      ruleId: metadata.ruleId || null,
      createdAt: now
    };

    if (this.isPostgresConnected) {
      try {
        await this.prisma.$transaction([
          this.prisma.workflowExecution.update({
            where: { id: executionId },
            data: {
              currentState: targetState,
              updatedAt: now
            }
          }),
          this.prisma.workflowStateHistory.create({ data: historyRecord }),
          this.prisma.auditLog.create({ data: auditRecord })
        ]);
        return { fromState, toState: targetState };
      } catch (e) {
        logger.warn('Prisma transitionState failed, falling back to local store', { error: e.message });
      }
    }

    // Local transaction
    const targetExecution = this.executions.get(executionId);
    targetExecution.currentState = targetState;
    targetExecution.updatedAt = now;
    this.stateHistories.push(historyRecord);
    this.auditLogs.push(auditRecord);

    return { fromState, toState: targetState };
  }

  async updateExecutionDecision(executionId, decision, reason, contextUpdates = {}) {
    const now = new Date();
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            finalDecision: decision,
            decisionReason: reason,
            contextData: contextUpdates,
            updatedAt: now
          }
        });
      } catch (e) {
        logger.warn('Prisma updateExecutionDecision failed, falling back to local store', { error: e.message });
      }
    }

    const execution = this.executions.get(executionId);
    if (execution) {
      execution.finalDecision = decision;
      execution.decisionReason = reason;
      execution.contextData = { ...(execution.contextData || {}), ...contextUpdates };
      execution.updatedAt = now;
    }
    return execution;
  }

  async updateRetryState(executionId, retryCount, nextRetryAt) {
    const now = new Date();
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            retryCount,
            nextRetryAt,
            updatedAt: now
          }
        });
      } catch (e) {
        logger.warn('Prisma updateRetryState failed, falling back to local store', { error: e.message });
      }
    }

    const execution = this.executions.get(executionId);
    if (execution) {
      execution.retryCount = retryCount;
      execution.nextRetryAt = nextRetryAt;
      execution.updatedAt = now;
    }
    return execution;
  }

  // ==========================================
  // RULE EVALUATIONS & AUDIT RECORDS
  // ==========================================

  async saveRuleEvaluations(evaluations) {
    if (!evaluations || evaluations.length === 0) return [];

    const records = evaluations.map(e => ({
      id: uuidv4(),
      executionId: e.executionId,
      stageId: e.stageId,
      ruleId: e.ruleId,
      ruleName: e.ruleName,
      field: e.field,
      operator: e.operator,
      expectedValue: e.expectedValue,
      actualValue: e.actualValue !== undefined ? e.actualValue : null,
      passed: e.passed,
      failureAction: e.failureAction,
      explanation: e.explanation,
      evaluatedAt: new Date(e.evaluatedAt || Date.now())
    }));

    if (this.isPostgresConnected) {
      try {
        await this.prisma.ruleEvaluation.createMany({ data: records });
        return records;
      } catch (e) {
        logger.warn('Prisma saveRuleEvaluations failed, falling back to local store', { error: e.message });
      }
    }

    this.ruleEvaluations.push(...records);
    return records;
  }

  async appendAuditLog(auditData) {
    const record = {
      id: uuidv4(),
      executionId: auditData.executionId,
      correlationId: auditData.correlationId || uuidv4(),
      eventType: auditData.eventType,
      previousState: auditData.previousState || null,
      newState: auditData.newState || null,
      details: auditData.details || {},
      stageId: auditData.stageId || null,
      ruleId: auditData.ruleId || null,
      createdAt: new Date()
    };

    if (this.isPostgresConnected) {
      try {
        return await this.prisma.auditLog.create({ data: record });
      } catch (e) {
        logger.warn('Prisma appendAuditLog failed, falling back to local store', { error: e.message });
      }
    }

    this.auditLogs.push(record);
    return record;
  }

  async saveExternalDependencyAttempt(attemptData) {
    const record = {
      id: uuidv4(),
      executionId: attemptData.executionId,
      dependencyName: attemptData.dependencyName,
      attemptNumber: attemptData.attemptNumber,
      status: attemptData.status,
      errorMessage: attemptData.errorMessage || null,
      requestPayload: attemptData.requestPayload || {},
      responsePayload: attemptData.responsePayload || null,
      latencyMs: attemptData.latencyMs || 0,
      createdAt: new Date()
    };

    if (this.isPostgresConnected) {
      try {
        return await this.prisma.externalDependencyAttempt.create({ data: record });
      } catch (e) {
        logger.warn('Prisma saveExternalDependencyAttempt failed, falling back to local store', { error: e.message });
      }
    }

    this.dependencyAttempts.push(record);
    return record;
  }

  // ==========================================
  // IDEMPOTENCY
  // ==========================================

  async findIdempotencyRecord(key) {
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.idempotencyRecord.findUnique({
          where: { idempotencyKey: key },
          include: { execution: true }
        });
      } catch (e) {
        logger.warn('Prisma findIdempotencyRecord failed, falling back to local store', { error: e.message });
      }
    }

    const record = this.idempotencyRecords.get(key);
    if (!record) return null;

    const execution = record.executionId ? await this.getExecutionById(record.executionId) : null;
    return { ...record, execution };
  }

  async createIdempotencyRecord(data) {
    const record = {
      id: uuidv4(),
      idempotencyKey: data.idempotencyKey,
      requestHash: data.requestHash,
      workflowKey: data.workflowKey,
      executionId: data.executionId || null,
      status: data.status || 'PENDING',
      responseCode: null,
      responseBody: null,
      expiresAt: data.expiresAt || new Date(Date.now() + 86400 * 1000),
      createdAt: new Date()
    };

    if (this.isPostgresConnected) {
      try {
        return await this.prisma.idempotencyRecord.create({ data: record });
      } catch (e) {
        // If unique constraint violation
        if (e.code === 'P2002') {
          throw new Error(`Duplicate idempotency key detected: ${data.idempotencyKey}`);
        }
        logger.warn('Prisma createIdempotencyRecord failed, falling back to local store', { error: e.message });
      }
    }

    if (this.idempotencyRecords.has(data.idempotencyKey)) {
      throw new Error(`Duplicate idempotency key detected: ${data.idempotencyKey}`);
    }

    this.idempotencyRecords.set(data.idempotencyKey, record);
    return record;
  }

  async updateIdempotencyRecord(key, updates) {
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.idempotencyRecord.update({
          where: { idempotencyKey: key },
          data: updates
        });
      } catch (e) {
        logger.warn('Prisma updateIdempotencyRecord failed, falling back to local store', { error: e.message });
      }
    }

    const record = this.idempotencyRecords.get(key);
    if (record) {
      Object.assign(record, updates);
    }
    return record;
  }

  // ==========================================
  // MANUAL REVIEW
  // ==========================================

  async createManualReview(data) {
    const record = {
      id: uuidv4(),
      executionId: data.executionId,
      status: 'PENDING',
      reviewerId: null,
      reviewerNotes: null,
      assignedAt: new Date(),
      decidedAt: null
    };

    if (this.isPostgresConnected) {
      try {
        return await this.prisma.manualReview.create({ data: record });
      } catch (e) {
        logger.warn('Prisma createManualReview failed, falling back to local store', { error: e.message });
      }
    }

    this.manualReviews.set(data.executionId, record);
    return record;
  }

  async getPendingReviews() {
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.manualReview.findMany({
          where: { status: 'PENDING' },
          include: {
            execution: {
              include: {
                workflow: true,
                ruleEvaluations: true
              }
            }
          },
          orderBy: { assignedAt: 'asc' }
        });
      } catch (e) {
        logger.warn('Prisma getPendingReviews failed, falling back to local store', { error: e.message });
      }
    }

    const pending = [];
    for (const review of this.manualReviews.values()) {
      if (review.status === 'PENDING') {
        const execution = await this.getExecutionById(review.executionId);
        pending.push({ ...review, execution });
      }
    }
    return pending.sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime());
  }

  async resolveManualReview(executionId, status, reviewerId, reviewerNotes) {
    const now = new Date();
    if (this.isPostgresConnected) {
      try {
        return await this.prisma.manualReview.update({
          where: { executionId },
          data: {
            status,
            reviewerId,
            reviewerNotes,
            decidedAt: now
          }
        });
      } catch (e) {
        logger.warn('Prisma resolveManualReview failed, falling back to local store', { error: e.message });
      }
    }

    const review = this.manualReviews.get(executionId);
    if (review) {
      review.status = status;
      review.reviewerId = reviewerId;
      review.reviewerNotes = reviewerNotes;
      review.decidedAt = now;
    }
    return review;
  }

  // ==========================================
  // METRICS & ANALYTICS
  // ==========================================

  async getMetrics() {
    const allExecutions = await this.listExecutions({ limit: 1000 });
    const total = allExecutions.length;
    const approved = allExecutions.filter(e => e.finalDecision === 'APPROVED' || e.currentState === 'APPROVED').length;
    const rejected = allExecutions.filter(e => e.finalDecision === 'REJECTED' || e.currentState === 'REJECTED').length;
    const pendingReview = allExecutions.filter(e => e.currentState === 'MANUAL_REVIEW').length;
    const failed = allExecutions.filter(e => e.currentState === 'FAILED').length;
    const retrying = allExecutions.filter(e => e.currentState === 'RETRY_PENDING').length;

    const completed = approved + rejected;
    const successRate = completed > 0 ? Number(((approved / completed) * 100).toFixed(1)) : 0;

    return {
      totalExecutions: total,
      approved,
      rejected,
      pendingReview,
      failed,
      retrying,
      successRate,
      storageEngine: this.isPostgresConnected ? 'PostgreSQL' : 'Transactional Memory Store'
    };
  }

  // Helper for test cleanup
  clearInMemory() {
    this.workflows.clear();
    this.versions.clear();
    this.executions.clear();
    this.stateHistories = [];
    this.ruleEvaluations = [];
    this.auditLogs = [];
    this.idempotencyRecords.clear();
    this.dependencyAttempts = [];
    this.manualReviews.clear();
  }
}

export const db = new DbStore();

