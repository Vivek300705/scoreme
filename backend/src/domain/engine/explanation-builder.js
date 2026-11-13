/**
 * Decision Explanation Builder.
 * Reconstructs a full explainable audit trace of why an execution reached its final state.
 */
export function buildDecisionExplanation(execution) {
  if (!execution) return null;

  const ruleEvaluations = execution.ruleEvaluations || [];
  const stateHistory = execution.stateHistory || [];
  const dependencyAttempts = execution.dependencyAttempts || [];
  const auditLogs = execution.auditLogs || [];
  const manualReview = execution.manualReview || null;

  const passedRules = ruleEvaluations.filter(r => r.passed);
  const failedRules = ruleEvaluations.filter(r => !r.passed);

  // Determine primary factor based on final state
  let primaryReason = execution.decisionReason;
  if (!primaryReason) {
    if (execution.currentState === 'APPROVED') {
      primaryReason = 'All mandatory business rules and external verifications passed successfully.';
    } else if (execution.currentState === 'REJECTED') {
      primaryReason = failedRules.length > 0
        ? `Rejected due to rule violations: ${failedRules.map(r => r.ruleName).join(', ')}`
        : 'Request rejected based on policy requirements.';
    } else if (execution.currentState === 'MANUAL_REVIEW') {
      primaryReason = 'Referred to manual review due to borderline risk factors.';
    } else if (execution.currentState === 'FAILED') {
      primaryReason = 'System failure encountered during processing.';
    } else {
      primaryReason = `Execution currently in ${execution.currentState} state.`;
    }
  }

  return {
    executionId: execution.id,
    workflowKey: execution.workflow ? execution.workflow.workflowKey : 'unknown',
    workflowName: execution.workflow ? execution.workflow.name : 'Unknown Workflow',
    versionNumber: execution.version ? execution.version.version : 1,
    currentState: execution.currentState,
    finalDecision: execution.finalDecision || execution.currentState,
    primaryReason,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    summary: {
      totalRulesEvaluated: ruleEvaluations.length,
      passedRulesCount: passedRules.length,
      failedRulesCount: failedRules.length,
      externalDependencyAttemptsCount: dependencyAttempts.length,
      stateTransitionsCount: stateHistory.length
    },
    ruleBreakdown: {
      passed: passedRules.map(r => ({
        stageId: r.stageId,
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        field: r.field,
        operator: r.operator,
        expectedValue: r.expectedValue,
        actualValue: r.actualValue,
        explanation: r.explanation,
        evaluatedAt: r.evaluatedAt
      })),
      failed: failedRules.map(r => ({
        stageId: r.stageId,
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        field: r.field,
        operator: r.operator,
        expectedValue: r.expectedValue,
        actualValue: r.actualValue,
        failureAction: r.failureAction,
        explanation: r.explanation,
        evaluatedAt: r.evaluatedAt
      }))
    },
    externalDependencies: dependencyAttempts.map(d => ({
      dependencyName: d.dependencyName,
      attemptNumber: d.attemptNumber,
      status: d.status,
      latencyMs: d.latencyMs,
      errorMessage: d.errorMessage,
      createdAt: d.createdAt
    })),
    stateTimeline: stateHistory.map(s => ({
      fromState: s.fromState,
      toState: s.toState,
      transitionReason: s.transitionReason,
      timestamp: s.createdAt
    })),
    manualReviewDecision: manualReview ? {
      status: manualReview.status,
      reviewerId: manualReview.reviewerId,
      reviewerNotes: manualReview.reviewerNotes,
      assignedAt: manualReview.assignedAt,
      decidedAt: manualReview.decidedAt
    } : null
  };
}

