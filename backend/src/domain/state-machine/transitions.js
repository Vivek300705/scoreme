import { WORKFLOW_STATES } from './states.js';

/**
 * Deterministic Transition Matrix.
 * Maps current state to an array of valid target states.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  [WORKFLOW_STATES.RECEIVED]: [
    WORKFLOW_STATES.VALIDATED,
    WORKFLOW_STATES.FAILED
  ],
  [WORKFLOW_STATES.VALIDATED]: [
    WORKFLOW_STATES.PROCESSING,
    WORKFLOW_STATES.FAILED
  ],
  [WORKFLOW_STATES.PROCESSING]: [
    WORKFLOW_STATES.APPROVED,
    WORKFLOW_STATES.REJECTED,
    WORKFLOW_STATES.MANUAL_REVIEW,
    WORKFLOW_STATES.RETRY_PENDING,
    WORKFLOW_STATES.FAILED
  ],
  [WORKFLOW_STATES.RETRY_PENDING]: [
    WORKFLOW_STATES.PROCESSING,
    WORKFLOW_STATES.FAILED
  ],
  [WORKFLOW_STATES.MANUAL_REVIEW]: [
    WORKFLOW_STATES.APPROVED,
    WORKFLOW_STATES.REJECTED,
    WORKFLOW_STATES.FAILED
  ],
  // Terminal states have zero allowed outbound transitions
  [WORKFLOW_STATES.APPROVED]: [],
  [WORKFLOW_STATES.REJECTED]: [],
  [WORKFLOW_STATES.FAILED]: []
});

/**
 * Verifies if a transition from `fromState` to `toState` is legally permitted.
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export function canTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  if (fromState === toState) return true; // Idempotent same-state is allowed

  const allowed = ALLOWED_TRANSITIONS[fromState];
  if (!allowed) return false;

  return allowed.includes(toState);
}

