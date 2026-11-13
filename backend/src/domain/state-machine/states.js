/**
 * Canonical Workflow Execution Lifecycle States
 */
export const WORKFLOW_STATES = Object.freeze({
  RECEIVED: 'RECEIVED',
  VALIDATED: 'VALIDATED',
  PROCESSING: 'PROCESSING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  RETRY_PENDING: 'RETRY_PENDING',
  FAILED: 'FAILED'
});

export const TERMINAL_STATES = Object.freeze([
  WORKFLOW_STATES.APPROVED,
  WORKFLOW_STATES.REJECTED,
  WORKFLOW_STATES.FAILED
]);

export function isTerminalState(state) {
  return TERMINAL_STATES.includes(state);
}

